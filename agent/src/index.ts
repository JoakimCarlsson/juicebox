import Java from "frida-java-bridge";

let requestCounter = 0;

function generateId(): string {
  return `${Date.now()}-${++requestCounter}`;
}

function headersToObject(headers: any): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    const size = headers.size();
    for (let i = 0; i < size; i++) {
      const name = headers.name(i).toString();
      const value = headers.value(i).toString();
      result[name] = value;
    }
  } catch (_) {}
  return result;
}

function tryUse(className: string): any | null {
  // Try default classloader first
  try {
    return Java.use(className);
  } catch (_) {}

  // Search all classloaders
  let found: any = null;
  Java.enumerateClassLoaders({
    onMatch(loader) {
      if (found) return;
      try {
        const factory = Java.classFactory;
        const prev = factory.loader;
        (factory as any).loader = loader;
        found = Java.use(className);
        (factory as any).loader = prev;
      } catch (_) {}
    },
    onComplete() {},
  });
  return found;
}

function hookOkHttp3(): void {
  const classNames = [
    "okhttp3.internal.connection.RealCall",
    "okhttp3.RealCall",
  ];

  for (const className of classNames) {
    const RealCall = tryUse(className);
    if (!RealCall) continue;

    const methodNames = [
      "getResponseWithInterceptorChain$okhttp",
      "getResponseWithInterceptorChain",
    ];

    for (const methodName of methodNames) {
      try {
        if (!(methodName in RealCall)) continue;

        RealCall[methodName].implementation = function (this: any) {
          const id = generateId();
          let url = "unknown";
          let method = "UNKNOWN";
          let reqHeaders: Record<string, string> = {};

          try {
            const request = this.getOriginalRequest
              ? this.getOriginalRequest()
              : this.request();
            url = request.url().toString();
            method = request.method();
            reqHeaders = headersToObject(request.headers());
          } catch (_) {}

          const response = (this as any)[methodName]();

          try {
            send({
              type: "http",
              payload: {
                id,
                method,
                url,
                requestHeaders: reqHeaders,
                statusCode: response.code(),
                responseHeaders: headersToObject(response.headers()),
                timestamp: Date.now(),
              },
            });
          } catch (_) {
            send({
              type: "http",
              payload: {
                id,
                method,
                url,
                requestHeaders: reqHeaders,
                statusCode: 0,
                responseHeaders: {},
                timestamp: Date.now(),
              },
            });
          }

          return response;
        };

        send({ type: "log", payload: { message: "hooked " + className + "." + methodName } });
        return;
      } catch (_) {}
    }
  }

  send({ type: "log", payload: { message: "OkHttp3 not found" } });
}

function hookHttpURLConnection(): void {
  try {
    const HttpURLConnection =
      tryUse("com.android.okhttp.internal.huc.HttpURLConnectionImpl") ??
      tryUse("sun.net.www.protocol.http.HttpURLConnection") ??
      tryUse("java.net.HttpURLConnection");

    if (!HttpURLConnection) {
      send({ type: "log", payload: { message: "HttpURLConnection class not found" } });
      return;
    }

    HttpURLConnection.getInputStream.implementation = function (this: any) {
      const stream = this.getInputStream();
      const id = generateId();

      try {
        const url = this.getURL().toString();
        const method = this.getRequestMethod();
        let statusCode = 0;
        try { statusCode = this.getResponseCode(); } catch (_) {}

        send({
          type: "http",
          payload: {
            id,
            method,
            url,
            requestHeaders: {},
            statusCode,
            responseHeaders: {},
            timestamp: Date.now(),
          },
        });
      } catch (_) {}

      return stream;
    };

    send({ type: "log", payload: { message: "hooked HttpURLConnection.getInputStream" } });
  } catch (e) {
    send({ type: "log", payload: { message: "HttpURLConnection hook failed: " + e } });
  }
}

function hookCronet(): void {
  const CronetUrlRequest = tryUse("org.chromium.net.impl.CronetUrlRequest");
  if (!CronetUrlRequest) {
    send({ type: "log", payload: { message: "Cronet not found" } });
    return;
  }

  try {
    CronetUrlRequest.start.implementation = function (this: any) {
      const id = generateId();
      try {
        const url = this.mCurrentUrl?.value ?? "unknown";
        const method = this.mMethod?.value ?? "GET";

        send({
          type: "http",
          payload: {
            id,
            method: method.toString(),
            url: url.toString(),
            requestHeaders: {},
            statusCode: 0,
            responseHeaders: {},
            timestamp: Date.now(),
          },
        });
      } catch (_) {}

      return this.start();
    };

    send({ type: "log", payload: { message: "hooked Cronet" } });
  } catch (e) {
    send({ type: "log", payload: { message: "Cronet hook failed: " + e } });
  }
}

Java.perform(function () {
  send({ type: "ready", payload: { pid: Process.id } });

  // Enumerate loaded classes to understand what HTTP lib the app uses
  var loaded = Java.enumerateLoadedClassesSync();
  var httpClasses: string[] = [];
  for (var i = 0; i < loaded.length; i++) {
    var c = loaded[i];
    if (
      c.indexOf("okhttp3.") !== -1 ||
      c.indexOf("com.android.okhttp") !== -1 ||
      c.indexOf("Cronet") !== -1 ||
      c.indexOf("cronet") !== -1 ||
      c.indexOf("Volley") !== -1 ||
      c.indexOf("volley") !== -1 ||
      c.indexOf("HttpURLConnection") !== -1 ||
      c.indexOf("retrofit") !== -1
    ) {
      httpClasses.push(c);
    }
  }

  send({
    type: "log",
    payload: {
      message: "HTTP classes (" + httpClasses.length + "): " + httpClasses.slice(0, 30).join(", "),
    },
  });

  hookOkHttp3();
  hookHttpURLConnection();
  hookCronet();
});

rpc.exports = {
  ping(): string {
    return "pong";
  },
};
