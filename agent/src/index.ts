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

function hookOkHttp3() {
  try {
    const RealCall = Java.use("okhttp3.internal.connection.RealCall");
    const Response = Java.use("okhttp3.Response");

    RealCall.getResponseWithInterceptorChain$okhttp.implementation = function () {
      const request = this.getOriginalRequest();
      const id = generateId();
      const url = request.url().toString();
      const method = request.method();
      const reqHeaders = headersToObject(request.headers());

      const response = this.getResponseWithInterceptorChain$okhttp();

      try {
        const statusCode = response.code();
        const resHeaders = headersToObject(response.headers());

        send({
          type: "http",
          payload: {
            id,
            method,
            url,
            requestHeaders: reqHeaders,
            statusCode,
            responseHeaders: resHeaders,
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
  } catch (_) {}
}

function hookHttpURLConnection() {
  try {
    const URL = Java.use("java.net.URL");
    const HttpURLConnection = Java.use("java.net.HttpURLConnection");

    HttpURLConnection.getResponseCode.implementation = function (): number {
      const statusCode: number = this.getResponseCode();
      const id = generateId();

      try {
        const url = this.getURL().toString();
        const method = this.getRequestMethod();

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

      return statusCode;
    };
  } catch (_) {}
}

Java.perform(() => {
  send({ type: "ready", payload: { pid: Process.id } });

  hookOkHttp3();
  hookHttpURLConnection();
});

rpc.exports = {
  ping(): string {
    return "pong";
  },
};
