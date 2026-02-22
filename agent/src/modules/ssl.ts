/// <reference types="npm:@types/frida-gum" />

import type { AgentModule } from "../types";

declare const Java: {
  perform(fn: () => void): void;
  use(className: string): any;
  registerClass(spec: {
    name: string;
    implements: any[];
    methods: Record<string, (...args: any[]) => any>;
  }): any;
};

const nopVerifyCallback = new NativeCallback(
  (_ssl: NativePointer, _out_alert: NativePointer): number => 0,
  "int",
  ["pointer", "pointer"],
);

const nopCertVerifyCallback = new NativeCallback(
  (_x509_ctx: NativePointer, _arg: NativePointer): number => 1,
  "int",
  ["pointer", "pointer"],
);

const SSL_LIB_PATTERN = /ssl|crypto|boring|flutter|cronet|conscrypt|curl/i;
const hookedModules = new Set<string>();

let _nativeApplied = false;
let _javaApplied = false;

function hookNativeVerification(mod: Module): void {
  const setVerify = mod.findExportByName("SSL_CTX_set_verify");
  if (setVerify) {
    Interceptor.attach(setVerify, {
      onEnter(args) {
        args[1] = ptr(0);
        args[2] = ptr(0);
      },
    });
  }

  const setCustomVerify = mod.findExportByName("SSL_CTX_set_custom_verify");
  if (setCustomVerify) {
    Interceptor.attach(setCustomVerify, {
      onEnter(args) {
        args[1] = ptr(0);
        args[2] = nopVerifyCallback;
      },
    });
  }

  const sslSetCustomVerify = mod.findExportByName("SSL_set_custom_verify");
  if (sslSetCustomVerify) {
    Interceptor.attach(sslSetCustomVerify, {
      onEnter(args) {
        args[1] = ptr(0);
        args[2] = nopVerifyCallback;
      },
    });
  }

  const setCertVerifyCb = mod.findExportByName(
    "SSL_CTX_set_cert_verify_callback",
  );
  if (setCertVerifyCb) {
    Interceptor.attach(setCertVerifyCb, {
      onEnter(args) {
        args[1] = nopCertVerifyCallback;
        args[2] = ptr(0);
      },
    });
  }

  const x509VerifyCert = mod.findExportByName("X509_verify_cert");
  if (x509VerifyCert) {
    Interceptor.replace(
      x509VerifyCert,
      new NativeCallback(
        (_ctx: NativePointer): number => 1,
        "int",
        ["pointer"],
      ),
    );
  }
}

interface BypassNativeResult {
  alreadyApplied: boolean;
  hookedCount: number;
}

function bypassNative(): BypassNativeResult {
  if (_nativeApplied) return { alreadyApplied: true, hookedCount: hookedModules.size };

  for (const mod of Process.enumerateModules()) {
    if (!SSL_LIB_PATTERN.test(mod.name)) continue;
    if (hookedModules.has(mod.path)) continue;
    hookedModules.add(mod.path);
    try {
      hookNativeVerification(mod);
    } catch (_) {}
  }

  Process.attachModuleObserver({
    onAdded(mod) {
      if (!SSL_LIB_PATTERN.test(mod.name)) return;
      if (hookedModules.has(mod.path)) return;
      hookedModules.add(mod.path);
      try {
        hookNativeVerification(mod);
      } catch (_) {}
    },
  });

  _nativeApplied = true;
  return { alreadyApplied: false, hookedCount: hookedModules.size };
}

interface JavaHookResult {
  ok: boolean;
  error?: string;
}

interface BypassJavaResult {
  alreadyApplied: boolean;
  certificatePinner?: JavaHookResult;
  okHostnameVerifier?: JavaHookResult;
  trustManager?: JavaHookResult;
  conscrypt?: JavaHookResult;
  classLoader?: JavaHookResult;
}

function bypassJava(): BypassJavaResult {
  if (_javaApplied) return { alreadyApplied: true };

  const results: BypassJavaResult = { alreadyApplied: false };

  Java.perform(() => {
    try {
      const CertificatePinner = Java.use("okhttp3.CertificatePinner");
      CertificatePinner.check.overload(
        "java.lang.String",
        "java.util.List",
      ).implementation = function () {};

      try {
        CertificatePinner["check$okhttp"].overload(
          "java.lang.String",
          "java.util.List",
        ).implementation = function () {};
      } catch (_) {}

      results.certificatePinner = { ok: true };
    } catch (e) {
      results.certificatePinner = { ok: false, error: String(e) };
    }

    try {
      const OkHostnameVerifier = Java.use(
        "okhttp3.internal.tls.OkHostnameVerifier",
      );
      OkHostnameVerifier.verify.overload(
        "java.lang.String",
        "javax.net.ssl.SSLSession",
      ).implementation = function (): boolean {
        return true;
      };

      results.okHostnameVerifier = { ok: true };
    } catch (e) {
      results.okHostnameVerifier = { ok: false, error: String(e) };
    }

    try {
      const X509TrustManager = Java.use("javax.net.ssl.X509TrustManager");
      const SSLContext = Java.use("javax.net.ssl.SSLContext");

      const TrustAll = Java.registerClass({
        name: "com.juicebox.TrustAll",
        implements: [X509TrustManager],
        methods: {
          checkClientTrusted() {},
          checkServerTrusted() {},
          getAcceptedIssuers() {
            return [];
          },
        },
      });
      const trustAll = TrustAll.$new();

      SSLContext.init.implementation = function (
        km: any,
        _tm: any,
        sr: any,
      ) {
        this.init(km, [trustAll], sr);
      };

      results.trustManager = { ok: true };
    } catch (e) {
      results.trustManager = { ok: false, error: String(e) };
    }

    try {
      const TrustManagerImpl = Java.use(
        "com.android.org.conscrypt.TrustManagerImpl",
      );

      TrustManagerImpl.verifyChain.overload(
        "[Ljava.security.cert.X509Certificate;",
        "[[B",
        "[B",
        "java.lang.String",
        "java.lang.String",
        "boolean",
      ).implementation = function (
        untrustedChain: any,
        _ocspResponses: any,
        _tlsSctData: any,
        _authType: any,
        _host: any,
        _clientAuth: any,
      ): any {
        return Java.use("java.util.Arrays").asList(untrustedChain);
      };

      results.conscrypt = { ok: true };
    } catch (e) {
      results.conscrypt = { ok: false, error: String(e) };
    }

    try {
      const TrustManagerImpl = Java.use(
        "com.android.org.conscrypt.TrustManagerImpl",
      );

      TrustManagerImpl.checkServerTrusted.overload(
        "[Ljava.security.cert.X509Certificate;",
        "java.lang.String",
      ).implementation = function () {};

      try {
        TrustManagerImpl.checkServerTrusted.overload(
          "[Ljava.security.cert.X509Certificate;",
          "java.lang.String",
          "java.lang.String",
        ).implementation = function () {
          return Java.use("java.util.ArrayList").$new();
        };
      } catch (_) {}
    } catch (_) {}

    try {
      const ClassLoader = Java.use("java.lang.ClassLoader");
      ClassLoader.loadClass.overload("java.lang.String").implementation =
        function (name: string): any {
          const klass = this.loadClass(name);
          if (name === "okhttp3.CertificatePinner") {
            try {
              const CP = Java.use("okhttp3.CertificatePinner");
              CP.check.overload(
                "java.lang.String",
                "java.util.List",
              ).implementation = function () {};
            } catch (_) {}
          }
          return klass;
        };

      results.classLoader = { ok: true };
    } catch (e) {
      results.classLoader = { ok: false, error: String(e) };
    }
  });

  _javaApplied = true;
  return results;
}

interface BypassResult {
  native: BypassNativeResult;
  java: BypassJavaResult;
}

function bypass(): BypassResult {
  return {
    native: bypassNative(),
    java: bypassJava(),
  };
}

const ssl: AgentModule = { bypass, bypassNative, bypassJava };
export default ssl;
