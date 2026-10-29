import "dotenv/config";
import { getAddress, isAddress, isHex } from "viem";

export const IS_MAINNET = process.env.X402_NETWORK === "mainnet";
// Demo mode: start the API without real secrets (no facilitator key, no pay-to).
// Paid routes are served free and /health is flagged demo: true.
export const IS_DEMO = process.env.X402_DEMO === "1" || (!process.env.X402_API_KEY && !process.env.SELLER_PAY_TO);

export const NETWORK = (IS_MAINNET ? "eip155:42220" : "eip155:11142220") as `${string}:${string}`;
export const FACILITATOR_URL = IS_MAINNET
  ? "https://api.x402.celo.org"
  : "https://api.x402.sepolia.celo.org";

// Mainnet settles in USA\u2126 (Tether America USD). Testnet only supports USDC.
export const ASSET = IS_MAINNET
  ? {
      symbol: "USA\u2126",
      address: getAddress("0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771"),
      decimals: 6,
      extra: { name: "Tether America USD", version: "1" },
    }
  : {
      symbol: "USDC (testnet)",
      address: getAddress("0x01C5C0122039549AD1493B8220cABEdD739BC44E"),
      decimals: 6,
      extra: { name: "USDC", version: "2" },
    };

/** Convert a USD amount like 0.01 to base units ("10000") for a 6-decimal token. */
export function usd(amount: number): string {
  return Math.round(amount * 10 ** ASSET.decimals).toString();
}

export const PAY_TO = addressFromEnv("SELLER_PAY_TO");
export const PORT = Number(process.env.PORT ?? 3000);

/** Read and validate a hex private key from env, failing with a clear message. */
export function privateKeyFromEnv(name: string): `0x${string}` {
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} is not set. Add it to your .env (a 64-hex-digit Celo/EVM private key, with or without the 0x prefix).`);
  const key = (raw.trim().startsWith("0x") ? raw.trim() : `0x${raw.trim()}`) as `0x${string}`;
  if (!isHex(key) || key.length !== 66)
    throw new Error(
      `${name} is not a valid private key. Expected 64 hex digits (0x optional, 32 bytes), got ${raw.trim().length} characters. Check .env for quotes, spaces or a truncated value.`,
    );
  return key;
}

/** Validate a pay-to/wallet address from env, failing with a clear message. */
export function addressFromEnv(name: string): `0x${string}` | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const v = raw.trim();
  if (!isAddress(v)) throw new Error(`${name} is not a valid Celo/EVM address: "${v}". Expected a 0x-prefixed 20-byte hex address.`);
  return getAddress(v);
}
