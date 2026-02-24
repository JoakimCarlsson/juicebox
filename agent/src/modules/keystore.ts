/// <reference types="npm:@types/frida-gum" />

import type { AgentModule } from "../types";
import Java from "frida-java-bridge";

interface KeystoreEntry {
  alias: string;
  entryClass: string;
  keyType: string;
  keySize: number;
  keyFormat: string | null;
  encodedKey: string | null;
  publicKey: string | null;
  certificate: CertInfo | null;
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

interface CertInfo {
  subject: string;
  issuer: string;
  serial: string;
  notBefore: string;
  notAfter: string;
  sigAlgorithm: string;
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

function byteArrayToHex(arr: any): string | null {
  if (arr === null || arr === undefined) return null;
  const len = arr.length;
  if (len === 0) return null;
  const bytes: string[] = [];
  for (let i = 0; i < len; i++) {
    bytes.push((arr[i] & 0xff).toString(16).padStart(2, "0"));
  }
  return bytes.join("");
}

function extractCertInfo(cert: any): CertInfo | null {
  try {
    const X509 = Java.use("java.security.cert.X509Certificate");
    if (!X509.class.isInstance(cert)) return null;
    const x509 = Java.cast(cert, X509);
    return {
      subject: x509.getSubjectDN().toString(),
      issuer: x509.getIssuerDN().toString(),
      serial: x509.getSerialNumber().toString(),
      notBefore: x509.getNotBefore().toString(),
      notAfter: x509.getNotAfter().toString(),
      sigAlgorithm: x509.getSigAlgName(),
    };
  } catch (_) {
    return null;
  }
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
    entryClass: "unknown",
    keyType: "unknown",
    keySize: 0,
    keyFormat: null,
    encodedKey: null,
    publicKey: null,
    certificate: null,
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

function extractPublicKeyInfo(pubKey: any, result: Partial<KeystoreEntry>): void {
  try {
    result.publicKey = byteArrayToHex(pubKey.getEncoded());
  } catch (_) {}

  try {
    const RSAPublicKey = Java.use("java.security.interfaces.RSAPublicKey");
    if (RSAPublicKey.class.isInstance(pubKey)) {
      result.keySize = Java.cast(pubKey, RSAPublicKey).getModulus().bitLength();
      return;
    }
  } catch (_) {}

  try {
    const ECPublicKey = Java.use("java.security.interfaces.ECPublicKey");
    if (ECPublicKey.class.isInstance(pubKey)) {
      result.keySize = Java.cast(pubKey, ECPublicKey).getParams().getOrder().bitLength();
      return;
    }
  } catch (_) {}
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

    try {
      const fmt = key.getFormat();
      if (fmt !== null) result.keyFormat = fmt.toString();
    } catch (_) {}

    try {
      const encoded = key.getEncoded();
      if (encoded !== null) {
        result.encodedKey = byteArrayToHex(encoded);
        if (!result.keySize) result.keySize = encoded.length * 8;
      }
    } catch (_) {}

    if (SecretKeyClass.isInstance(key)) {
      result.entryClass = "SecretKey";
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
      }
    } else if (PrivateKeyClass.isInstance(key)) {
      result.entryClass = "PrivateKey";
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

      try {
        const cert = ks.getCertificate(alias);
        if (cert !== null) {
          result.certificate = extractCertInfo(cert);
          extractPublicKeyInfo(cert.getPublicKey(), result);
        }
      } catch (_) {}
    } else {
      result.entryClass = key.getClass().getName();
      errors.push(`unrecognized key class: ${result.entryClass}`);
    }
  }

  if (key === null) {
    try {
      const cert = ks.getCertificate(alias);
      if (cert !== null) {
        result.entryClass = "Certificate";
        result.certificate = extractCertInfo(cert);
        const pubKey = cert.getPublicKey();
        result.keyType = pubKey.getAlgorithm();
        extractPublicKeyInfo(pubKey, result);
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
          entry.entryClass = info.entryClass ?? entry.entryClass;
          entry.keyType = info.keyType ?? entry.keyType;
          entry.keySize = info.keySize ?? entry.keySize;
          entry.keyFormat = info.keyFormat ?? entry.keyFormat;
          entry.encodedKey = info.encodedKey ?? entry.encodedKey;
          entry.publicKey = info.publicKey ?? entry.publicKey;
          entry.certificate = info.certificate ?? entry.certificate;
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
