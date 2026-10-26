/**
 * Minimal Web Push sender (RFC 8030 + VAPID RFC 8292 + aes128gcm RFC 8291)
 * implemented on the Web Crypto API only — safe for the workerd runtime,
 * no Node-only dependencies, no paid push service.
 */

const b64u = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};
const fromB64u = (s: string): Uint8Array => {
  const b64 = s.replaceAll("-", "+").replaceAll("_", "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const te = new TextEncoder();

export type PushSubscriptionKeys = { p256dh: string; auth: string };
export type PushTarget = { endpoint: string; keys: PushSubscriptionKeys };

function vapidJwk(publicB64u: string, privateB64u: string): JsonWebKey {
  const pub = fromB64u(publicB64u); // 65-byte uncompressed point
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("bad VAPID public key");
  return {
    kty: "EC",
    crv: "P-256",
    x: b64u(pub.subarray(1, 33)),
    y: b64u(pub.subarray(33, 65)),
    d: privateB64u,
  };
}

async function vapidJwt(endpoint: string, publicB64u: string, privateB64u: string): Promise<string> {
  const key = await crypto.subtle.importKey("jwk", vapidJwk(publicB64u, privateB64u), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const aud = new URL(endpoint).origin;
  const header = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:chats@lovable.app" })));
  const data = te.encode(`${header}.${body}`);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, data);
  return `${header}.${body}.${b64u(sig)}`;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource }, key, length * 8);
  return new Uint8Array(bits);
}

/** Encrypt a payload for one subscription (aes128gcm content encoding). */
export async function encryptPayload(payload: string, keys: PushSubscriptionKeys): Promise<Uint8Array> {
  const uaPub = fromB64u(keys.p256dh);
  const auth = fromB64u(keys.auth);
  const uaKey = await crypto.subtle.importKey("raw", uaPub as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, ephemeral.privateKey, 256));
  const ephemeralPub = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));

  // RFC 8291 §3.3: ikm = HKDF(auth, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const ikm = await hkdf(auth, shared, concat(te.encode("WebPush: info\0"), uaPub, ephemeralPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);

  // Single-record plaintext: content || 0x02 (last-record delimiter)
  const plain = concat(te.encode(payload), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek as BufferSource, { name: "AES-GCM" }, false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, aesKey, plain as BufferSource));

  // aes128gcm header: salt(16) || rs(4, big-endian 4096) || idlen(1) || ephemeral public key
  const rs = new Uint8Array([0, 0, 16, 0]);
  return concat(salt, rs, new Uint8Array([ephemeralPub.length]), ephemeralPub, cipher);
}

export type PushResult = { ok: boolean; status: number; gone: boolean };

/** Send one push message. `gone` means the subscription expired and should be deleted. */
export async function sendWebPush(target: PushTarget, payload: string, vapidPublic: string, vapidPrivate: string, options?: { ttlSeconds?: number; urgent?: boolean }): Promise<PushResult> {
  const jwt = await vapidJwt(target.endpoint, vapidPublic, vapidPrivate);
  const body = await encryptPayload(payload, target.keys);
  const res = await fetch(target.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt},k=${vapidPublic}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(Math.max(0, Math.min(86400, options?.ttlSeconds ?? 86400))),
      Urgency: options?.urgent ? "high" : "normal",
    },
    body: body as BodyInit,
  });
  return { ok: res.status >= 200 && res.status < 300, status: res.status, gone: res.status === 404 || res.status === 410 };
}
