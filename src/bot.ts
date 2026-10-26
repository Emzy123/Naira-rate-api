// Telegram bot: an AI-agent-style buyer. Every rate it shows is bought from the
// Naira Rates API with an x402 micropayment, so each chat command = one onchain payment.
// Runs inside the same Render service via a webhook (no extra hosting, wakes the server).
import type { Hono } from "hono";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { ASSET, NETWORK, IS_MAINNET } from "./config.js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_KEY = process.env.BOT_PRIVATE_KEY as `0x${string}` | undefined;
const PUBLIC_URL = process.env.PUBLIC_URL?.replace(/\/$/, ""); // e.g. https://naira-rate-api.onrender.com
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "naira-rates";
const EXPLORER = IS_MAINNET ? "https://celoscan.io/tx/" : "https://celo-sepolia.blockscout.com/tx/";

const tg = (method: string, body: unknown) =>
  fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const say = (chat_id: number, text: string) =>
  tg("sendMessage", { chat_id, text, parse_mode: "HTML", disable_web_page_preview: true });

const ngn = (n: number) => "₦" + n.toLocaleString("en-NG", { maximumFractionDigits: 2 });

function makePayFetch() {
  const account = privateKeyToAccount(BOT_KEY!);
  const client = new x402Client();
  // Hard cap: never pay more than $0.02 per call.
  client.setSpendControls({ allowedAssets: [{ network: NETWORK, asset: ASSET.address, maxAmountPerPayment: "20000" }] });
  client.register(
    "eip155:*",
    new ExactEvmScheme(account, { rpcUrl: IS_MAINNET ? "https://forno.celo.org" : "https://forno.celo-sepolia.celo-testnet.org" }),
  );
  return wrapFetchWithPayment(fetch, client);
}

async function buy(path: string) {
  const payFetch = makePayFetch();
  const res = await payFetch(`${PUBLIC_URL}${path}`, { headers: { "X-Idempotency-Key": crypto.randomUUID() } });
  const data: any = await res.json();
  const receipt = res.headers.get("payment-response");
  const tx = receipt ? JSON.parse(Buffer.from(receipt, "base64").toString()).transaction : undefined;
  if (!res.ok) throw new Error(data?.error ?? `API returned ${res.status}`);
  return { data, tx };
}

const paidLine = (price: string, tx?: string) =>
  tx ? `\n\n<i>Paid ${price} ${ASSET.symbol} via x402 on Celo · <a href="${EXPLORER}${tx}">receipt</a></i>` : "";

const HELP = `🇳🇬 <b>Naira Rates</b>
Live USD/NGN rates: official vs street (crypto P2P).

/rate – official and street rate now
/convert 100 usd – convert at street rate
/convert 50000 ngn official – convert at official rate
/about – how it works

Every answer is bought from a pay-per-call API with a tiny stablecoin payment on Celo (x402). No accounts, no API keys.`;

async function handle(chatId: number, text: string) {
  const [cmd, ...args] = text.trim().split(/\s+/);
  const c = cmd.toLowerCase().replace(/@.*$/, "");

  if (c === "/start" || c === "/help") return say(chatId, HELP);

  if (c === "/about")
    return say(
      chatId,
      `This bot is an agent that buys data. Each /rate pays $0.01 to the Naira Rates API (${PUBLIC_URL}) using the x402 protocol, settled on Celo ${IS_MAINNET ? "mainnet in USA₮" : "testnet"}.\n\nDevelopers and agents can call the same API directly: ${PUBLIC_URL}`,
    );

  if (c === "/rate" || c === "/rates") {
    const { data: s, tx } = await buy("/v1/rates");
    const street = s.street.map((q: any) => `• ${q.source}: ${ngn(q.mid)}`).join("\n");
    return say(
      chatId,
      `💵 <b>USD/NGN now</b>\nOfficial: <b>${ngn(s.official.mid)}</b>\nStreet: <b>${ngn(s.streetMid)}</b> (+${s.spreadPct}%)\n${street}\n\n${s.summary}${paidLine("$0.01", tx)}`,
    );
  }

  if (c === "/convert") {
    const amount = Number((args[0] ?? "").replace(/,/g, ""));
    const from = (args[1] ?? "usd").toUpperCase();
    const basis = (args[2] ?? "street").toLowerCase();
    if (!(amount > 0) || !["USD", "NGN"].includes(from) || !["street", "official"].includes(basis))
      return say(chatId, "Try: /convert 100 usd   or   /convert 50000 ngn official");
    const { data, tx } = await buy(`/v1/convert?amount=${amount}&from=${from}&basis=${basis}`);
    return say(chatId, `🔁 <code>${JSON.stringify(data, null, 1)}</code>${paidLine("$0.003", tx)}`);
  }

  return say(chatId, HELP);
}

export function registerBot(app: Hono) {
  if (!TOKEN || !BOT_KEY || !PUBLIC_URL) {
    console.log("Telegram bot off (set TELEGRAM_BOT_TOKEN, BOT_PRIVATE_KEY, PUBLIC_URL to enable)");
    return;
  }

  app.post("/telegram/webhook", async (c) => {
    if (c.req.header("x-telegram-bot-api-secret-token") !== SECRET) return c.text("forbidden", 403);
    const update: any = await c.req.json();
    const msg = update.message;
    if (msg?.text && msg.chat?.id) {
      // Answer Telegram right away; do the paid work in the background.
      handle(msg.chat.id, msg.text).catch((e) => say(msg.chat.id, `⚠️ Couldn't fetch rates: ${e.message}`));
    }
    return c.text("ok");
  });

  tg("setWebhook", { url: `${PUBLIC_URL}/telegram/webhook`, secret_token: SECRET, allowed_updates: ["message"] })
    .then((r) => r.json())
    .then((r) => console.log("Telegram webhook:", r))
    .catch((e) => console.error("setWebhook failed", e));
  tg("setMyCommands", {
    commands: [
      { command: "rate", description: "Official vs street USD/NGN" },
      { command: "convert", description: "Convert USD/NGN, e.g. /convert 100 usd" },
      { command: "about", description: "How it works" },
    ],
  }).catch(() => {});
  console.log("Telegram bot on (webhook mode)");
}
