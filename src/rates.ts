// Naira rate sources. All free, public, no keys.
//  - official: open.er-api.com (interbank/official-style mid rate, daily)
//  - street (crypto P2P proxy): Quidax and Luno USDT/NGN order books, live
// Results are cached so paid calls are fast and we stay polite to sources.

export type Quote = { source: string; bid?: number; ask?: number; mid: number; asOf: string; url: string };

export type Snapshot = {
  pair: "USD/NGN";
  official: Quote | null;
  street: Quote[];
  streetMid: number | null;
  spreadPct: number | null; // street premium over official
  fetchedAt: string;
};

const TTL_MS = 60_000;
let cache: { at: number; data: Snapshot } | null = null;

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "user-agent": "naira-rates-api" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function official(): Promise<Quote> {
  const url = "https://open.er-api.com/v6/latest/USD";
  const d = await getJson(url);
  return { source: "open.er-api.com", mid: d.rates.NGN, asOf: new Date(d.time_last_update_unix * 1000).toISOString(), url };
}

async function quidax(): Promise<Quote> {
  const url = "https://app.quidax.io/api/v1/markets/tickers/usdtngn";
  const d = await getJson(url);
  const t = d.data.ticker;
  const bid = Number(t.buy), ask = Number(t.sell);
  return { source: "Quidax USDT/NGN", bid, ask, mid: (bid + ask) / 2, asOf: new Date(d.data.at * 1000).toISOString(), url };
}

async function luno(): Promise<Quote> {
  const url = "https://api.luno.com/api/1/ticker?pair=USDTNGN";
  const d = await getJson(url);
  const bid = Number(d.bid), ask = Number(d.ask);
  return { source: "Luno USDT/NGN", bid, ask, mid: (bid + ask) / 2, asOf: new Date(d.timestamp).toISOString(), url };
}

const round = (n: number) => Math.round(n * 100) / 100;

export async function getSnapshot(): Promise<Snapshot> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const [o, ...s] = await Promise.allSettled([official(), quidax(), luno()]);
  const off = o.status === "fulfilled" ? o.value : null;
  const street = s.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const streetMid = street.length ? round(street.reduce((a, q) => a + q.mid, 0) / street.length) : null;
  const spreadPct = off && streetMid ? round(((streetMid - off.mid) / off.mid) * 100) : null;
  const data: Snapshot = {
    pair: "USD/NGN",
    official: off && { ...off, mid: round(off.mid) },
    street,
    streetMid,
    spreadPct,
    fetchedAt: new Date().toISOString(),
  };
  if (!off && !street.length) throw new Error("all rate sources failed");
  cache = { at: Date.now(), data };
  return data;
}

/** Short plain-English read of the snapshot. (An LLM summary bought via buy can replace this.) */
export function summarize(s: Snapshot): string {
  const parts: string[] = [];
  if (s.official) parts.push(`Official USD/NGN is ₦${s.official.mid.toLocaleString("en-NG")}.`);
  if (s.streetMid) parts.push(`Crypto/P2P dollars trade around ₦${s.streetMid.toLocaleString("en-NG")}.`);
  if (s.spreadPct !== null) {
    const gap = Math.abs(s.spreadPct);
    parts.push(
      gap < 1
        ? "The two markets are nearly level, so the official rate is a fair guide."
        : `The street rate is ${gap}% ${s.spreadPct > 0 ? "above" : "below"} official.`,
    );
  }
  return parts.join(" ");
}

export function convert(s: Snapshot, amount: number, from: "USD" | "NGN", basis: "official" | "street") {
  const rate = basis === "official" ? s.official?.mid : s.streetMid;
  if (!rate) throw new Error(`no ${basis} rate available`);
  const result = from === "USD" ? amount * rate : amount / rate;
  return { amount, from, to: from === "USD" ? "NGN" : "USD", basis, rate, result: round(result) };
}
