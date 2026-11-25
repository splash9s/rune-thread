// Rune Thread: AdMob rewarded ad server-side verification (SSV) callback. Deploy with --no-verify-jwt
// (Google calls it, not the game). Set its URL as the SSV callback of the rewarded ad unit in AdMob.
// Google sends a GET with the reward details and a signature. A valid call records the reward in ad_rewards;
// the game claims it once with claim_ad_reward() when the player returns from the ad (js/rewarded-ad.js).
// custom_data is "<slot>:<nonce>" and user_id is the player's Supabase user ID (set by RewardedAdActivity).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const KEYS_URL = "https://www.gstatic.com/admob/reward/verifier-keys.json";
const SLOTS = new Set(["rune-refresh", "stamina-refill", "free-diamond"]);
const enc = new TextEncoder();

function fromB64(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// AdMob signs with ECDSA P-256 in DER form; WebCrypto wants the raw 64-byte r||s form
function derToRaw(der: Uint8Array): Uint8Array {
  let i = 2; // 0x30, total length
  if (der[1] & 0x80) i += der[1] & 0x7f;
  const part = (): Uint8Array => {
    if (der[i++] !== 0x02) throw new Error("bad signature");
    const len = der[i++];
    let v = der.slice(i, i + len);
    i += len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return out;
  };
  const r = part();
  const s = part();
  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

// Google's public keys, kept for an hour
let keys: Record<string, CryptoKey> = {};
let keysUntil = 0;
async function verifierKey(id: string): Promise<CryptoKey | null> {
  if (Date.now() > keysUntil || !keys[id]) {
    const r = await fetch(KEYS_URL);
    if (!r.ok) throw new Error(`key fetch ${r.status}`);
    const j = await r.json();
    const next: Record<string, CryptoKey> = {};
    for (const k of j.keys ?? []) {
      next[String(k.keyId)] = await crypto.subtle.importKey("spki", fromB64(k.base64), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    }
    keys = next;
    keysUntil = Date.now() + 3600 * 1000;
  }
  return keys[id] ?? null;
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response("method not allowed", { status: 405 });
  const url = new URL(req.url);
  const query = url.search.slice(1);
  // The signed message is every parameter before "&signature=" (signature and key_id are always last)
  const at = query.indexOf("&signature=");
  if (at < 0) return new Response("no signature", { status: 400 });
  const message = query.slice(0, at);
  const signature = url.searchParams.get("signature") ?? "";
  const keyId = url.searchParams.get("key_id") ?? "";

  try {
    const key = await verifierKey(keyId);
    if (!key) return new Response("unknown key", { status: 400 });
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, derToRaw(fromB64(signature)), enc.encode(message));
    if (!ok) return new Response("bad signature", { status: 400 });
  } catch (e) {
    return new Response(`verify error: ${e}`, { status: 400 });
  }

  const p = url.searchParams;
  const uid = p.get("user_id") ?? "";
  const [slot, nonce] = (p.get("custom_data") ?? "").split(":");
  const tx = p.get("transaction_id") ?? "";
  // AdMob's "Verify URL" test call has no player: answer OK so the console accepts the URL
  if (!/^[0-9a-f-]{36}$/i.test(uid) || !SLOTS.has(slot ?? "") || !nonce || !tx) return new Response("ok (nothing recorded)", { status: 200 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { error } = await admin.from("ad_rewards").insert({
    transaction_id: tx,
    user_id: uid,
    slot,
    nonce,
    ad_unit: p.get("ad_unit"),
  });
  // 23505 = already recorded (Google retried)
  if (error && error.code !== "23505") return new Response("database error", { status: 500 });
  return new Response("ok", { status: 200 });
});
