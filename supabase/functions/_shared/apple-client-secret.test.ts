import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildAppleClientSecret } from "./apple-client-secret.ts";

// Wrap raw DER bytes in a PKCS#8 PEM (same shape as an Apple .p8 file).
function toPem(der: Uint8Array): string {
  let bin = "";
  for (const b of der) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/(.{64})/g, "$1\n");
  return `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`;
}

function decodePart(part: string): Record<string, unknown> {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "===".slice((b64.length + 3) % 4);
  return JSON.parse(atob(padded));
}

Deno.test("builds a well-formed ES256 client secret JWT", async () => {
  const kp = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", kp.privateKey),
  );

  const jwt = await buildAppleClientSecret({
    teamId: "TEAM123456",
    keyId: "KEY1234567",
    clientId: "com.addtocalendar.rn",
    privateKey: toPem(pkcs8),
  });

  const [h, p, s] = jwt.split(".");
  const header = decodePart(h);
  const payload = decodePart(p);
  assertEquals(header.alg, "ES256");
  assertEquals(header.kid, "KEY1234567");
  assertEquals(header.typ, "JWT");
  assertEquals(payload.iss, "TEAM123456");
  assertEquals(payload.sub, "com.addtocalendar.rn");
  assertEquals(payload.aud, "https://appleid.apple.com");
  if (!s || s.length < 10) throw new Error("signature missing");
  if ((payload.exp as number) - (payload.iat as number) > 3605) {
    throw new Error("exp must be short-lived");
  }
});

Deno.test("rejects when config is missing", async () => {
  await assertRejects(
    () =>
      buildAppleClientSecret({
        teamId: "",
        keyId: "",
        clientId: "",
        privateKey: "",
      }),
    Error,
    "not configured",
  );
});
