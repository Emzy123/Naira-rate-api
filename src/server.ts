import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ASSET, FACILITATOR_URL, NETWORK, PAY_TO, PORT, IS_MAINNET, usd } from "./config.js";
import { convert, getSnapshot, summarize } from "./rates.js";
import { registerBot } from "./bot.js";

if (!process.env.X402_API_KEY) throw new Error("X402_API_KEY missing (get one at https://x402.celo.org)");
if (!PAY_TO) throw new Error("SELLER_PAY_TO missing");

const facilitator = new HTTPFacilitatorClient({
  url: FACILITATOR_URL,
  createAuthHeaders: async () => {
    const h = { "X-API-Key": process.env.X402_API_KEY! };
    return { verify: h, settle: h, supported: h };
  },
});

const server = new x402ResourceServer(facilitator);
server.register("eip155:*", new ExactEvmScheme());

const price = (amount: number) => ({ amount: usd(amount), asset: ASSET.address, extra: ASSET.extra });
const accepts = (amount: number) => [{ scheme: "exact", network: NETWORK, payTo: PAY_TO!, price: price(amount) }];

// Paid routes. Prices are in USD, settled in USA₮ on mainnet.
const PRICES = { rates: 0.01, convert: 0.005 };
const routes = {
  "GET /v1/rates": { accepts: accepts(PRICES.rates), description: "Live USD/NGN: official + street (crypto P2P) rates with a short summary" },
  "GET /v1/convert": { accepts: accepts(PRICES.convert), description: "Convert USD<->NGN at the official or street rate" },
};

const app = new Hono();

// Free: discovery for humans and agents.
app.get("/", (c) =>
  c.json({
    name: "Naira Rates API",
    about: "Pay-per-call naira exchange rates for people and AI agents. No accounts, no API keys: pay per request with x402.",
    network: NETWORK,
    asset: ASSET.symbol,
    payTo: PAY_TO,
    endpoints: {
      "GET /v1/rates": `$${PRICES.rates} per call`,
      "GET /v1/convert?amount=100&from=USD&basis=street": `$${PRICES.convert} per call`,
      "GET /health": "free",
    },
    howToPay: "https://x402.celo.org/skill.md (buyer flow, @x402/fetch)",
  }),
);
app.get("/health", (c) => c.json({ ok: true, mainnet: IS_MAINNET }));

registerBot(app)
app.use(paymentMiddleware(routes as any, server));

app.get("/v1/rates", async (c) => {
  const s = await getSnapshot();
  return c.json({ ...s, summary: summarize(s) });
});

app.get("/v1/convert", async (c) => {
  const amount = Number(c.req.query("amount") ?? "1");
  const from = (c.req.query("from") ?? "USD").toUpperCase() as "USD" | "NGN";
  const basis = (c.req.query("basis") ?? "official") as "official" | "street";
  if (!(amount > 0) || !["USD", "NGN"].includes(from) || !["official", "street"].includes(basis))
    return c.json({ error: "use amount>0, from=USD|NGN, basis=official|street" }, 400);
  return c.json(convert(await getSnapshot(), amount, from, basis));
});

serve({ fetch: app.fetch, port: PORT }, () =>
  console.log(`Naira Rates API on :${PORT} (${IS_MAINNET ? "MAINNET" : "testnet"}, ${ASSET.symbol} -> ${PAY_TO})`),
);
