import "dotenv/config";
import { getAddress } from "viem";

export const IS_MAINNET = process.env.X402_NETWORK === "mainnet";

export const NETWORK = (IS_MAINNET ? "eip155:42220" : "eip155:11142220") as `${string}:${string}`;
export const FACILITATOR_URL = IS_MAINNET
  ? "https://api.x402.celo.org"
  : "https://api.x402.sepolia.celo.org";

// Mainnet settles in USA₮ (Tether America USD). Testnet only supports USDC.
export const ASSET = IS_MAINNET
  ? {
      symbol: "USA₮",
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

export const PAY_TO = process.env.SELLER_PAY_TO ? getAddress(process.env.SELLER_PAY_TO) : undefined;
export const PORT = Number(process.env.PORT ?? 3000);
