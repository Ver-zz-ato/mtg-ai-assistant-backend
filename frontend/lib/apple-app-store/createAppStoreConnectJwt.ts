import { createSign } from "node:crypto";
import { normalizeAscPrivateKey } from "@/lib/apple-app-store/normalizeAscPrivateKey";

const MAX_EXPIRY_SECONDS = 20 * 60;
const AUDIENCE = "appstoreconnect-v1";

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64url");
}

export type AppStoreConnectJwtConfig = {
  issuerId: string;
  keyId: string;
  privateKey: string;
  expiresInSeconds?: number;
};

export function createAppStoreConnectJwt(config: AppStoreConnectJwtConfig): string {
  const issuerId = config.issuerId.trim();
  const keyId = config.keyId.trim();
  const privateKeyPem = normalizeAscPrivateKey(config.privateKey);

  if (!issuerId || !keyId || !privateKeyPem) {
    throw new Error("apple_asc_jwt_config_incomplete");
  }

  const now = Math.floor(Date.now() / 1000);
  const requestedExpiry = config.expiresInSeconds ?? MAX_EXPIRY_SECONDS;
  const exp = now + Math.min(Math.max(requestedExpiry, 60), MAX_EXPIRY_SECONDS);

  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = {
    iss: issuerId,
    iat: now,
    exp,
    aud: AUDIENCE,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();

  // JWT ES256 requires IEEE P1363 (r||s), not DER — default Node sign output is DER.
  const signature = signer.sign({
    key: privateKeyPem,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

export function getAppStoreConnectJwtFromEnv(): string {
  const issuerId = process.env.APPLE_ASC_ISSUER_ID;
  const keyId = process.env.APPLE_ASC_KEY_ID;
  const privateKey = process.env.APPLE_ASC_PRIVATE_KEY;

  if (!issuerId?.trim() || !keyId?.trim() || !privateKey?.trim()) {
    throw new Error("apple_asc_env_incomplete");
  }

  return createAppStoreConnectJwt({ issuerId, keyId, privateKey });
}
