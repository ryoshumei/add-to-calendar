// Builds the ES256 "client secret" JWT required by Apple's /auth/token and
// /auth/revoke endpoints, signed with the Sign in with Apple .p8 private key.

const APPLE_AUD = "https://appleid.apple.com";

export interface AppleSecretConfig {
  teamId: string;
  keyId: string;
  clientId: string;
  privateKey: string; // contents of the .p8 (PKCS#8 PEM)
}

function configFromEnv(): AppleSecretConfig {
  return {
    teamId: Deno.env.get("APPLE_TEAM_ID") ?? "",
    keyId: Deno.env.get("APPLE_KEY_ID") ?? "",
    clientId: Deno.env.get("APPLE_CLIENT_ID") ?? "",
    privateKey: Deno.env.get("APPLE_PRIVATE_KEY") ?? "",
  };
}

function base64Url(input: Uint8Array | string): string {
  const bytes = typeof input === "string"
    ? new TextEncoder().encode(input)
    : input;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/\\n/g, "\n") // tolerate escaped newlines from env vars
    .replace(/-----[^-]+-----/g, "") // strip BEGIN/END lines
    .replace(/\s+/g, ""); // strip remaining whitespace
  const bin = atob(body);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return der.buffer as ArrayBuffer;
}

export async function buildAppleClientSecret(
  config: AppleSecretConfig = configFromEnv(),
): Promise<string> {
  const { teamId, keyId, clientId, privateKey } = config;
  if (!teamId || !keyId || !clientId || !privateKey) {
    throw new Error(
      "Apple client secret not configured (APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_CLIENT_ID / APPLE_PRIVATE_KEY)",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + 3600, // short-lived; well under Apple's 6-month max
    aud: APPLE_AUD,
    sub: clientId,
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${
    base64Url(JSON.stringify(payload))
  }`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}
