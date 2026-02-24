/// <reference types="npm:@types/frida-gum" />

import type { AgentModule } from "../types";
import Java from "frida-java-bridge";

interface KeystoreEntry {
  alias: string;
  keyType: string;
  keySize: number;
  creationDate: string | null;
  purposes: string[];
  authRequired: boolean;
  authValiditySeconds: number;
  hardwareBacked: boolean;
}

function purposeFlags(purposes: number): string[] {
  const result: string[] = [];
  if (purposes & 1) result.push("encrypt");
  if (purposes & 2) result.push("decrypt");
  if (purposes & 4) result.push("sign");
  if (purposes & 8) result.push("verify");
  if (purposes & 16) result.push("wrap");
  return result;
}

function getKeyInfo(alias: string, ks: any): Partial<KeystoreEntry> {
  const result: Partial<KeystoreEntry> = {
    keyType: "unknown",
    keySize: 0,
    purposes: [],
    authRequired: false,
    authValiditySeconds: 0,
    hardwareBacked: false,
  };

  try {
    const entry = ks.getEntry(alias, null);
    if (entry === null) return result;

    const KeyInfo = Java.use("android.security.keystore.KeyInfo");

    const SecretKeyEntry = Java.use("java.security.KeyStore$SecretKeyEntry");
    if (SecretKeyEntry.class.isInstance(entry)) {
      const secretKey = Java.cast(entry, SecretKeyEntry).getSecretKey();
      result.keyType = secretKey.getAlgorithm();

      try {
        const skf = Java.use("javax.crypto.SecretKeyFactory").getInstance(
          secretKey.getAlgorithm(),
          "AndroidKeyStore",
        );
        const keySpec = skf.getKeySpec(secretKey, KeyInfo.class);
        const info = Java.cast(keySpec, KeyInfo);
        result.keySize = info.getKeySize();
        result.purposes = purposeFlags(info.getPurposes());
        result.authRequired = info.isUserAuthenticationRequired();
        result.authValiditySeconds = info.getUserAuthenticationValidityDurationSeconds();
        result.hardwareBacked = info.isInsideSecureHardware();
      } catch (_) {
        try {
          const encoded = secretKey.getEncoded();
          if (encoded !== null) {
            result.keySize = encoded.length * 8;
          }
        } catch (_) {}
      }
      return result;
    }

    const PrivateKeyEntry = Java.use("java.security.KeyStore$PrivateKeyEntry");
    if (PrivateKeyEntry.class.isInstance(entry)) {
      const privateKey = Java.cast(entry, PrivateKeyEntry).getPrivateKey();
      result.keyType = privateKey.getAlgorithm();

      try {
        const kf = Java.use("java.security.KeyFactory").getInstance(
          privateKey.getAlgorithm(),
          "AndroidKeyStore",
        );
        const keySpec = kf.getKeySpec(privateKey, KeyInfo.class);
        const info = Java.cast(keySpec, KeyInfo);
        result.keySize = info.getKeySize();
        result.purposes = purposeFlags(info.getPurposes());
        result.authRequired = info.isUserAuthenticationRequired();
        result.authValiditySeconds = info.getUserAuthenticationValidityDurationSeconds();
        result.hardwareBacked = info.isInsideSecureHardware();
      } catch (_) {}
      return result;
    }
  } catch (_) {}

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

          let creationDate: string | null = null;
          try {
            const date = ks.getCreationDate(alias);
            if (date !== null) {
              creationDate = date.toString();
            }
          } catch (_) {}

          const info = getKeyInfo(alias, ks);

          entries.push({
            alias,
            keyType: info.keyType ?? "unknown",
            keySize: info.keySize ?? 0,
            creationDate,
            purposes: info.purposes ?? [],
            authRequired: info.authRequired ?? false,
            authValiditySeconds: info.authValiditySeconds ?? 0,
            hardwareBacked: info.hardwareBacked ?? false,
          });
        }
      } catch (_) {}

      resolve(entries);
    });
  });
}

const keystore: AgentModule = { enumerate };
export default keystore;
