/// <reference types="npm:@types/frida-gum" />

import type { AgentModule } from "../types";
import Java from "frida-java-bridge";

let _enabled = false;
let _counter = 0;

function generateId(): string {
  return `crypto-${Date.now()}-${++_counter}`;
}

function toHex(arr: number[] | null | undefined): string | null {
  if (!arr || arr.length === 0) return null;
  return arr.map((b) => (b & 0xff).toString(16).padStart(2, "0")).join("");
}

function byteArrayToHex(javaArray: any): string | null {
  if (javaArray === null || javaArray === undefined) return null;
  try {
    const len = javaArray.length;
    if (len === 0) return null;
    const bytes: number[] = [];
    for (let i = 0; i < len; i++) {
      bytes.push(javaArray[i] & 0xff);
    }
    return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (_) {
    return null;
  }
}

function extractKeyBytes(keyObj: any): string | null {
  if (keyObj === null || keyObj === undefined) return null;
  try {
    const encoded = keyObj.getEncoded();
    if (encoded === null) return null;
    return byteArrayToHex(encoded);
  } catch (_) {
    return null;
  }
}

function extractIvBytes(paramsObj: any): string | null {
  if (paramsObj === null || paramsObj === undefined) return null;
  try {
    const IvParameterSpec = Java.use("javax.crypto.spec.IvParameterSpec");
    const GCMParameterSpec = Java.use("javax.crypto.spec.GCMParameterSpec");
    if (IvParameterSpec.class.isInstance(paramsObj)) {
      return byteArrayToHex(Java.cast(paramsObj, IvParameterSpec).getIV());
    }
    if (GCMParameterSpec.class.isInstance(paramsObj)) {
      return byteArrayToHex(Java.cast(paramsObj, GCMParameterSpec).getIV());
    }
  } catch (_) {}
  return null;
}

function opModeToString(mode: number): string {
  switch (mode) {
    case 1:
      return "encrypt";
    case 2:
      return "decrypt";
    case 3:
      return "wrap";
    case 4:
      return "unwrap";
    default:
      return `mode_${mode}`;
  }
}

interface CipherState {
  algorithm: string;
  operation: string;
  key: string | null;
  iv: string | null;
}

const cipherStates = new WeakMap<any, CipherState>();

function hookCipher(): void {
  const Cipher = Java.use("javax.crypto.Cipher");

  Cipher.init.overload("int", "java.security.Key").implementation = function (
    mode: number,
    key: any,
  ) {
    const state: CipherState = {
      algorithm: this.getAlgorithm(),
      operation: opModeToString(mode),
      key: extractKeyBytes(key),
      iv: null,
    };
    cipherStates.set(this, state);
    return this.init(mode, key);
  };

  Cipher.init.overload(
    "int",
    "java.security.Key",
    "java.security.spec.AlgorithmParameterSpec",
  ).implementation = function (
    mode: number,
    key: any,
    params: any,
  ) {
    const state: CipherState = {
      algorithm: this.getAlgorithm(),
      operation: opModeToString(mode),
      key: extractKeyBytes(key),
      iv: extractIvBytes(params),
    };
    cipherStates.set(this, state);
    return this.init(mode, key, params);
  };

  Cipher.init.overload(
    "int",
    "java.security.Key",
    "java.security.AlgorithmParameters",
  ).implementation = function (
    mode: number,
    key: any,
    params: any,
  ) {
    let iv: string | null = null;
    try {
      const IvParameterSpec = Java.use("javax.crypto.spec.IvParameterSpec");
      const ivSpec = params.getParameterSpec(IvParameterSpec.class);
      iv = byteArrayToHex(ivSpec.getIV());
    } catch (_) {}
    const state: CipherState = {
      algorithm: this.getAlgorithm(),
      operation: opModeToString(mode),
      key: extractKeyBytes(key),
      iv,
    };
    cipherStates.set(this, state);
    return this.init(mode, key, params);
  };

  Cipher.doFinal.overload("[B").implementation = function (input: any) {
    const output = this.doFinal(input);
    const state = cipherStates.get(this);
    send({
      type: "crypto",
      payload: {
        id: generateId(),
        operation: state?.operation ?? "unknown",
        algorithm: state?.algorithm ?? this.getAlgorithm(),
        input: byteArrayToHex(input),
        output: byteArrayToHex(output),
        key: state?.key ?? null,
        iv: state?.iv ?? null,
        timestamp: Date.now(),
      },
    });
    return output;
  };

  Cipher.doFinal.overload().implementation = function () {
    const output = this.doFinal();
    const state = cipherStates.get(this);
    send({
      type: "crypto",
      payload: {
        id: generateId(),
        operation: state?.operation ?? "unknown",
        algorithm: state?.algorithm ?? this.getAlgorithm(),
        input: null,
        output: byteArrayToHex(output),
        key: state?.key ?? null,
        iv: state?.iv ?? null,
        timestamp: Date.now(),
      },
    });
    return output;
  };

  Cipher.update.overload("[B").implementation = function (input: any) {
    const output = this.update(input);
    const state = cipherStates.get(this);
    send({
      type: "crypto",
      payload: {
        id: generateId(),
        operation: state?.operation ?? "unknown",
        algorithm: state?.algorithm ?? this.getAlgorithm(),
        input: byteArrayToHex(input),
        output: byteArrayToHex(output),
        key: state?.key ?? null,
        iv: state?.iv ?? null,
        timestamp: Date.now(),
      },
    });
    return output;
  };
}

function hookMac(): void {
  const Mac = Java.use("javax.crypto.Mac");

  Mac.init.overload("java.security.Key").implementation = function (key: any) {
    (this as any).__jb_key = extractKeyBytes(key);
    return this.init(key);
  };

  Mac.init.overload(
    "java.security.Key",
    "java.security.spec.AlgorithmParameterSpec",
  ).implementation = function (key: any, params: any) {
    (this as any).__jb_key = extractKeyBytes(key);
    return this.init(key, params);
  };

  Mac.doFinal.overload("[B").implementation = function (input: any) {
    const output = this.doFinal(input);
    send({
      type: "crypto",
      payload: {
        id: generateId(),
        operation: "mac",
        algorithm: this.getAlgorithm(),
        input: byteArrayToHex(input),
        output: byteArrayToHex(output),
        key: (this as any).__jb_key ?? null,
        iv: null,
        timestamp: Date.now(),
      },
    });
    return output;
  };

  Mac.doFinal.overload().implementation = function () {
    const output = this.doFinal();
    send({
      type: "crypto",
      payload: {
        id: generateId(),
        operation: "mac",
        algorithm: this.getAlgorithm(),
        input: null,
        output: byteArrayToHex(output),
        key: (this as any).__jb_key ?? null,
        iv: null,
        timestamp: Date.now(),
      },
    });
    return output;
  };
}

function hookMessageDigest(): void {
  const MessageDigest = Java.use("java.security.MessageDigest");

  MessageDigest.digest.overload("[B").implementation = function (input: any) {
    const output = this.digest(input);
    send({
      type: "crypto",
      payload: {
        id: generateId(),
        operation: "digest",
        algorithm: this.getAlgorithm(),
        input: byteArrayToHex(input),
        output: byteArrayToHex(output),
        key: null,
        iv: null,
        timestamp: Date.now(),
      },
    });
    return output;
  };

  MessageDigest.digest.overload().implementation = function () {
    const output = this.digest();
    send({
      type: "crypto",
      payload: {
        id: generateId(),
        operation: "digest",
        algorithm: this.getAlgorithm(),
        input: null,
        output: byteArrayToHex(output),
        key: null,
        iv: null,
        timestamp: Date.now(),
      },
    });
    return output;
  };
}

function hookSecretKeyFactory(): void {
  try {
    const SecretKeyFactory = Java.use("javax.crypto.SecretKeyFactory");
    SecretKeyFactory.generateSecret.overload("java.security.spec.KeySpec")
      .implementation = function (spec: any) {
        const key = this.generateSecret(spec);
        send({
          type: "crypto",
          payload: {
            id: generateId(),
            operation: "key_derivation",
            algorithm: this.getAlgorithm(),
            input: null,
            output: null,
            key: extractKeyBytes(key),
            iv: null,
            timestamp: Date.now(),
          },
        });
        return key;
      };
  } catch (_) {}
}

function hookKeyGenerator(): void {
  try {
    const KeyGenerator = Java.use("javax.crypto.KeyGenerator");
    KeyGenerator.generateKey.implementation = function () {
      const key = this.generateKey();
      send({
        type: "crypto",
        payload: {
          id: generateId(),
          operation: "key_generation",
          algorithm: this.getAlgorithm(),
          input: null,
          output: null,
          key: extractKeyBytes(key),
          iv: null,
          timestamp: Date.now(),
        },
      });
      return key;
    };
  } catch (_) {}
}

function enable(): { enabled: boolean } {
  if (_enabled) return { enabled: true };

  if (!Java.available) return { enabled: false };

  Java.perform(() => {
    try {
      hookCipher();
    } catch (_) {}
    try {
      hookMac();
    } catch (_) {}
    try {
      hookMessageDigest();
    } catch (_) {}
    try {
      hookSecretKeyFactory();
    } catch (_) {}
    try {
      hookKeyGenerator();
    } catch (_) {}
  });

  _enabled = true;
  return { enabled: true };
}

const crypto: AgentModule = { enable };
export default crypto;
