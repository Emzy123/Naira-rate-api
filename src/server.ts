import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { ASSET, FACILITATOR_URL, NETWORK, PAY_TO, PORT, IS_MAINNET, usd } from "./config.js";
import { convert, getSnapshot, summarize } from "./rates.js";
import { registerBot } from "./bot.js";
import { registerPage } from "./register-page.js";

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
server.registerExtension(bazaarResourceServerExtension); // x402 bazaar: self-describing 402 for agent discovery

const price = (amount: number) => ({ amount: usd(amount), asset: ASSET.address, extra: ASSET.extra });
const accepts = (amount: number) => [{ scheme: "exact", network: NETWORK, payTo: PAY_TO!, price: price(amount) }];

// Paid routes. Prices are in USD, settled in USA₮ on mainnet.
const PRICES = { rates: 0.01, convert: 0.005 };
const routes = {
  "GET /v1/rates": {
    accepts: accepts(PRICES.rates),
    description:
      "Live US dollar to Nigerian naira (USD/NGN) exchange rates. Returns the official rate and the street/parallel-market rate from crypto P2P markets (Quidax, Luno USDT/NGN), the gap between them in percent, and a one-line summary. Use it before quoting, pricing or converting anything in naira. Cached 60s. No input needed.",
    mimeType: "application/json",
    extensions: declareDiscoveryExtension({
      input: {},
      inputSchema: { properties: {} },
      output: {
        example: {
          pair: "USD/NGN",
          official: { source: "open.er-api.com", mid: 1325.72 },
          street: [
            { source: "Quidax USDT/NGN", bid: 1374.62, ask: 1384.27, mid: 1379.45 },
            { source: "Luno USDT/NGN", bid: 1380, ask: 1380, mid: 1380 },
          ],
          streetMid: 1379.72,
          spreadPct: 4.07,
          summary: "Official USD/NGN is ₦1,325.72. Crypto/P2P dollars trade around ₦1,379.72. The street rate is 4.07% above official.",
        },
      },
    }),
  },
  "GET /v1/convert": {
    accepts: accepts(PRICES.convert),
    description:
      "Convert an amount between US dollars and Nigerian naira at either the official rate or the street (crypto P2P) rate. Query: amount (number > 0), from (USD or NGN), basis (official or street, default official). Returns the converted amount and the rate used. Use it to price goods, invoices or remittances in naira.",
    mimeType: "application/json",
    extensions: declareDiscoveryExtension({
      input: { amount: "100", from: "USD", basis: "street" },
      inputSchema: {
        properties: {
          amount: { type: "string", description: "Amount to convert, a number greater than 0" },
          from: { type: "string", enum: ["USD", "NGN"], description: "Currency of the amount" },
          basis: { type: "string", enum: ["official", "street"], description: "Which rate to use" },
        },
        required: ["amount"],
      },
      output: {
        example: { amount: 100, from: "USD", to: "NGN", basis: "street", rate: 1379.72, result: 137972 },
      },
    }),
  },
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

// Free: machine-readable discovery for crawlers (agent402.tools reads /.well-known/x402, then /openapi.json).
const originOf = (c: any) => {
  const u = new URL(c.req.url);
  const proto = c.req.header("x-forwarded-proto") ?? u.protocol.replace(":", "");
  return process.env.PUBLIC_URL?.replace(/\/$/, "") ?? `${proto}://${c.req.header("host") ?? u.host}`;
};
app.get("/.well-known/x402", (c) => {
  const o = originOf(c);
  return c.json({ version: 1, resources: [`${o}/v1/rates`, `${o}/v1/convert`], agentRegistration: `${o}/.well-known/agent-registration.json` });
});
// Free: ERC-8004 registration file (agentURI points here). Set ERC8004_AGENT_ID after registering.
app.get("/.well-known/agent-registration.json", (c) => {
  const o = originOf(c);
  const id = process.env.ERC8004_AGENT_ID;
  return c.json({
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Naira Rates API",
    description:
      "Live USD/NGN exchange rates for AI agents: the official rate and the street (crypto P2P) rate, the gap between them, and USD<->NGN conversion. Pay per call with x402 on Celo, no accounts or API keys.",
    services: [
      { name: "web", endpoint: o },
      { name: "x402", endpoint: `${o}/v1/rates` },
      { name: "x402", endpoint: `${o}/v1/convert` },
      { name: "openapi", endpoint: `${o}/openapi.json` },
      { name: "wallet", endpoint: `eip155:42220:${PAY_TO}` },
    ],
    x402Support: true,
    active: true,
    supportedTrust: ["reputation"],
    ...(id ? { registrations: [{ agentId: Number(id), agentRegistry: "eip155:42220:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" }] } : {}),
  });
});
app.get("/openapi.json", (c) => {
  const o = originOf(c);
  const op = (key: keyof typeof routes, params: any[] = []) => ({
    get: {
      summary: routes[key].description,
      parameters: params,
      responses: { "200": { description: "OK" }, "402": { description: `Payment required: $${key.includes("rates") ? PRICES.rates : PRICES.convert} in ${ASSET.symbol} on ${NETWORK} via x402` } },
    },
  });
  const q = (name: string, schema: any, required = false) => ({ name, in: "query", required, schema });
  return c.json({
    openapi: "3.1.0",
    info: { title: "Naira Rates API", version: "0.1.0", description: "Pay-per-call USD/NGN official and street rates for AI agents, settled via x402 on Celo." },
    servers: [{ url: o }],
    paths: {
      "/v1/rates": op("GET /v1/rates"),
      "/v1/convert": op("GET /v1/convert", [
        q("amount", { type: "number", exclusiveMinimum: 0 }, true),
        q("from", { type: "string", enum: ["USD", "NGN"] }),
        q("basis", { type: "string", enum: ["official", "street"] }),
      ]),
    },
  });
});

registerBot(app);
registerPage(app);

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
