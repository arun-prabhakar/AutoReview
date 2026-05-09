import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt } from "../services/encryption-service.js";

describe("encryption-service", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = "test-encryption-key-for-testing-32chars";
  });

  it("should encrypt and decrypt roundtrip", () => {
    const original = "my-secret-password";
    const encrypted = encrypt(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted.split(":").length).toBe(3);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it("should produce different ciphertexts for same plaintext", () => {
    const original = "same-input";
    const enc1 = encrypt(original);
    const enc2 = encrypt(original);
    expect(enc1).not.toBe(enc2);
    expect(decrypt(enc1)).toBe(original);
    expect(decrypt(enc2)).toBe(original);
  });

  it("should throw on invalid ciphertext format", () => {
    expect(() => decrypt("not-valid")).toThrow("Invalid encrypted format");
    expect(() => decrypt("only:two:parts:extra")).toThrow();
  });

  it("should throw on tampered ciphertext", () => {
    const encrypted = encrypt("test-data");
    const parts = encrypted.split(":");
    parts[2] = parts[2].replace(/./g, "0");
    expect(() => decrypt(parts.join(":"))).toThrow();
  });

  it("should throw when ENCRYPTION_KEY is missing", () => {
    const originalKey = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY environment variable is required");
    process.env.ENCRYPTION_KEY = originalKey;
  });

  it("should handle unicode characters", () => {
    const original = "パスワード 🔐 ñoño";
    const encrypted = encrypt(original);
    expect(decrypt(encrypted)).toBe(original);
  });
});
