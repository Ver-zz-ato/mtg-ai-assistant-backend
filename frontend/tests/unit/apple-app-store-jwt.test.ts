/**
 * Unit tests: App Store Connect JWT ES256 signing (IEEE P1363).
 * Run: npx tsx tests/unit/apple-app-store-jwt.test.ts
 */
import assert from "node:assert";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { createAppStoreConnectJwt } from "@/lib/apple-app-store/createAppStoreConnectJwt";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;

const jwt = createAppStoreConnectJwt({
  issuerId: "00000000-0000-0000-0000-000000000000",
  keyId: "TESTKEY123",
  privateKey: privatePem,
});

const parts = jwt.split(".");
assert.strictEqual(parts.length, 3, "JWT should have header.payload.signature");

const signingInput = `${parts[0]}.${parts[1]}`;
const signature = Buffer.from(parts[2], "base64url");

const verifier = createVerify("SHA256");
verifier.update(signingInput);
verifier.end();

assert.strictEqual(
  verifier.verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, signature),
  true,
  "JWT signature should verify with IEEE P1363 encoding",
);

const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
assert.strictEqual(payload.aud, "appstoreconnect-v1");
assert.strictEqual(payload.iss, "00000000-0000-0000-0000-000000000000");

console.log("apple-app-store-jwt.test.ts: all assertions passed.");

export {};
