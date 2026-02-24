/// <reference types="npm:@types/frida-gum" />

import type { AgentModule } from "../types";
import Java from "frida-java-bridge";

interface KeystoreEntry {
  alias: string;
  keyType: string;
  keySize: number;
  creationDate: string | null;
  purposes: string[];
  blockModes: string[];
  encryptionPaddings: string[];
  signaturePaddings: string[];
  digests: string[];
  authRequired: boolean;
  authValiditySeconds: number;
  hardwareBacked: boolean;
  error: string | null;
}

function purposeFlags(purposes: number): string[] {
  const result: string[] = [];
  if (purposes & 1) result.push("encrypt");
  if (purposes & 2) result.push("decrypt");
  if (purposes & 4) result.push("sign");
  if (purposes & 8) result.push("verify");
  if (purposes & 32) result.push("agree_key");
  if (purposes & 64) result.push("attest_key");
  return result;
}

function javaStringArray(arr: any): string[] {
  if (arr === null || arr === undefined) return [];
  const result: string[] = [];
  for (let i = 0; i < arr.length; i++) {
    const s = arr[i];
    if (s !== null && s !== undefined) result.push(s.toString());
  }
  return result;
}

function extractKeyInfo(info: any): Partial<KeystoreEntry> {
  return {
    keySize: info.getKeySize(),
    purposes: purposeFlags(info.getPurposes()),
    blockModes: javaStringArray(info.getBlockModes()),
    encryptionPaddings: javaStringArray(info.getEncryptionPaddings()),
    signaturePaddings: javaStringArray(info.getSignaturePaddings()),
    digests: javaStringArray(info.getDigests()),
    authRequired: info.isUserAuthenticationRequired(),
    authValiditySeconds: info.getUserAuthenticationValidityDurationSeconds(),
    hardwareBacked: info.isInsideSecureHardware(),
  };
}

function defaults(): KeystoreEntry {
  return {
    alias: "",
    keyType: "unknown",
    keySize: 0,
    creationDate: null,
    purposes: [],
    blockModes: [],
    encryptionPaddings: [],
    signaturePaddings: [],
    digests: [],
    authRequired: false,
    authValiditySeconds: 0,
    hardwareBacked: false,
    error: null,
  };
}

function getKeyInfo(alias: string, ks: any): Partial<KeystoreEntry> {
  const result: Partial<KeystoreEntry> = {};
  const errors: string[] = [];

  const KeyInfo = Java.use("android.security.keystore.KeyInfo");
  const SecretKeyClass = Java.use("javax.crypto.SecretKey").class;
  const PrivateKeyClass = Java.use("java.security.PrivateKey").class;

  let key: any = null;
  try {
    key = ks.getKey(alias, null);
  } catch (e) {
    errors.push(`getKey: ${e}`);
  }

  if (key !== null) {
    result.keyType = key.getAlgorithm();

    if (SecretKeyClass.isInstance(key)) {
      try {
        const skf = Java.use("javax.crypto.SecretKeyFactory").getInstance(
          key.getAlgorithm(),
          "AndroidKeyStore",
        );
        const keySpec = skf.getKeySpec(key, KeyInfo.class);
        const info = Java.cast(keySpec, KeyInfo);
        Object.assign(result, extractKeyInfo(info));
      } catch (e) {
        errors.push(`SecretKeyFactory: ${e}`);
        try {
          const encoded = key.getEncoded();
          if (encoded !== null) {
            result.keySize = encoded.length * 8;
          }
        } catch (_) {}
      }
    } else if (PrivateKeyClass.isInstance(key)) {
      try {
        const kf = Java.use("java.security.KeyFactory").getInstance(
          key.getAlgorithm(),
          "AndroidKeyStore",
        );
        const keySpec = kf.getKeySpec(key, KeyInfo.class);
        const info = Java.cast(keySpec, KeyInfo);
        Object.assign(result, extractKeyInfo(info));
      } catch (e) {
        errors.push(`KeyFactory: ${e}`);
      }
    } else {
      const className = key.getClass().getName();
      errors.push(`unrecognized key class: ${className}`);
    }
  }

  if (key === null) {
    try {
      const cert = ks.getCertificate(alias);
      if (cert !== null) {
        const pubKey = cert.getPublicKey();
        result.keyType = pubKey.getAlgorithm();
        try {
          const RSAPublicKey = Java.use("java.security.interfaces.RSAPublicKey");
          if (RSAPublicKey.class.isInstance(pubKey)) {
            result.keySize = Java.cast(pubKey, RSAPublicKey).getModulus().bitLength();
          }
        } catch (_) {}
        try {
          const ECPublicKey = Java.use("java.security.interfaces.ECPublicKey");
          if (ECPublicKey.class.isInstance(pubKey)) {
            result.keySize = Java.cast(pubKey, ECPublicKey).getParams().getOrder().bitLength();
          }
        } catch (_) {}
        if (!result.keySize) {
          try {
            const encoded = pubKey.getEncoded();
            if (encoded !== null) result.keySize = encoded.length * 8;
          } catch (_) {}
        }
      } else {
        errors.push("no key or certificate found");
      }
    } catch (e) {
      errors.push(`getCertificate: ${e}`);
    }
  }

  if (errors.length > 0) {
    result.error = errors.join("; ");
  }

  return result;
}

function enumerate(): KeystoreEntry[] | Promise<KeystoreEntry[]> {
  if (!Java.available) return [];

  return new Promise<KeystoreEntry[]>((resolve) => {
    Java.perform(() => {
      const entries: KeystoreEntry[] = [];

      try {
        const KeyStore = Java.use("java.security.KeyStore");
        const ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);

        const aliases = ks.aliases();
        while (aliases.hasMoreElements()) {
          const alias = aliases.nextElement().toString();
          const entry = defaults();
          entry.alias = alias;

          try {
            const date = ks.getCreationDate(alias);
            if (date !== null) {
              entry.creationDate = date.toString();
            }
          } catch (_) {}

          const info = getKeyInfo(alias, ks);
          entry.keyType = info.keyType ?? entry.keyType;
          entry.keySize = info.keySize ?? entry.keySize;
          entry.purposes = info.purposes ?? entry.purposes;
          entry.blockModes = info.blockModes ?? entry.blockModes;
          entry.encryptionPaddings = info.encryptionPaddings ?? entry.encryptionPaddings;
          entry.signaturePaddings = info.signaturePaddings ?? entry.signaturePaddings;
          entry.digests = info.digests ?? entry.digests;
          entry.authRequired = info.authRequired ?? entry.authRequired;
          entry.authValiditySeconds = info.authValiditySeconds ?? entry.authValiditySeconds;
          entry.hardwareBacked = info.hardwareBacked ?? entry.hardwareBacked;
          entry.error = info.error ?? null;

          entries.push(entry);
        }
      } catch (_) {}

      resolve(entries);
    });
  });
}

const keystore: AgentModule = { enumerate };
export default keystore;
