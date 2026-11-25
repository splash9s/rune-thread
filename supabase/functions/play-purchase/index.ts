// Rune Thread: Google Play purchase check (Android app top-ups). The game calls it with the player's Supabase JWT
// (deploy normally, JWT check on) and { productId, purchaseToken } from Google Play's purchase sheet.
// It asks Google whether the purchase is paid, records it in diamond_topups (once per purchase), then consumes it
// so the same pack can be bought again. The game then claims it with claim_diamond_topups(), like a Stripe top-up.
// Secrets: PLAY_SERVICE_ACCOUNT_JSON (a Google Cloud service account with access to the app in Play Console),
// PLAY_PACKAGE_NAME (optional, default below). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set by Supabase.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const PACKAGE = Deno.env.get("PLAY_PACKAGE_NAME") ?? "com.runethread.game";

// Play product ID -> what it gives. Must match the in-app products in Play Console and playSku in js/ui.js.
const PRODUCTS: Record<string, { diamonds: number; gold: number }> = {
  diamonds_500: { diamonds: 500, gold: 0 },
  diamonds_4000: { diamonds: 4000, gold: 0 },
  diamonds_8000: { diamonds: 8000, gold: 0 },
  diamonds_18000: { diamonds: 18000, gold: 0 },
  diamonds_30000: { diamonds: 30000, gold: 0 },
  gold_30000: { diamonds: 0, gold: 30000 },
  gold_100000: { diamonds: 0, gold: 100000 },
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const enc = new TextEncoder();

function reply(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

function b64url(data: ArrayBuffer | string): string {
  const bytes = typeof data === "string" ? enc.encode(data) : new Uint8Array(data);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

async function sha256Hex(text: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Google OAuth access token for the Play Developer API, signed with the service account key (kept until it expires)
let cachedToken = "";
let cachedUntil = 0;
async function googleAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedUntil) return cachedToken;
  const sa = JSON.parse(Deno.env.get("PLAY_SERVICE_ACCOUNT_JSON") ?? "{}");
  if (!sa.client_email || !sa.private_key) throw new Error("PLAY_SERVICE_ACCOUNT_JSON not set");
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(`${head}.${claim}`));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${b64url(sig)}` }),
  });
  if (!r.ok) throw new Error(`Google token error ${r.status}`);
  const j = await r.json();
  cachedToken = j.access_token;
  cachedUntil = Date.now() + (Number(j.expires_in || 3600) - 120) * 1000;
  return cachedToken;
}

function purchaseUrl(productId: string, token: string): string {
  return `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(PACKAGE)}` +
    `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ ok: false, error: "method not allowed" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (userErr || !uid) return reply({ ok: false, error: "not signed in" }, 401);

  let productId = "", purchaseToken = "";
  try {
    const body = await req.json();
    productId = String(body.productId ?? "");
    purchaseToken = String(body.purchaseToken ?? "");
  } catch { /* checked below */ }
  const pack = PRODUCTS[productId];
  if (!pack || !purchaseToken) return reply({ ok: false, error: "unknown product" }, 400);

  let access: string;
  try { access = await googleAccessToken(); } catch (e) { return reply({ ok: false, error: String(e) }, 500); }

  const g = await fetch(purchaseUrl(productId, purchaseToken), { headers: { authorization: `Bearer ${access}` } });
  if (g.status === 400 || g.status === 404 || g.status === 410) return reply({ ok: false, error: "purchase not found" }, 400);
  if (!g.ok) return reply({ ok: false, error: `Google error ${g.status}` }, 502);
  const p = await g.json();
  // purchaseState: 0 = paid, 1 = cancelled, 2 = pending (not paid yet)
  if (p.purchaseState === 2) return reply({ ok: false, error: "payment pending" }, 409);
  if (p.purchaseState !== 0) return reply({ ok: false, error: "purchase cancelled" }, 400);

  // One row per purchase token, so a repeated call (retry, recovery on the next start) cannot credit twice
  const { error } = await admin.from("diamond_topups").insert({
    payment_id: `gp_${await sha256Hex(purchaseToken)}`,
    user_id: uid,
    diamonds: pack.diamonds,
    gold: pack.gold,
    amount_total: null,
    currency: "google_play",
    payment_intent: p.orderId ?? null, // Play order ID, for refunds (voided purchases)
  });
  if (error && error.code !== "23505") return reply({ ok: false, error: "database error" }, 500);

  // Consume, so Google does not refund it after 3 days and the pack can be bought again
  if (p.consumptionState !== 1) {
    const c = await fetch(`${purchaseUrl(productId, purchaseToken)}:consume`, { method: "POST", headers: { authorization: `Bearer ${access}` } });
    if (!c.ok) console.warn(`consume failed ${c.status}`); // credited already; the next recovery call consumes it again
  }
  return reply({ ok: true });
});
