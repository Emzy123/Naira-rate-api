// Test buyer: pays the API with x402 and prints the result.
import "dotenv/config";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { ASSET, NETWORK, IS_MAINNET } from "./config.js";

const account = privateKeyToAccount(process.env.BUYER_PRIVATE_KEY as `0x${string}`);
const client = new x402Client();
client.setSpendControls({ allowedAssets: [{ network: NETWORK, asset: ASSET.address, maxAmountPerPayment: "20000" }] });
client.register("eip155:*", new ExactEvmScheme(account, { rpcUrl: IS_MAINNET ? "https://forno.celo.org" : "https://forno.celo-sepolia.celo-testnet.org" }));
const payFetch = wrapFetchWithPayment(fetch, client);

const url = `${process.env.API_URL ?? "http://localhost:3000"}/v1/rates`;
const res = await payFetch(url, { headers: { "X-Idempotency-Key": crypto.randomUUID() } });
console.log(res.status, JSON.stringify(await res.json(), null, 2));
const receipt = res.headers.get("payment-response");
if (receipt) console.log("settlement:", JSON.parse(Buffer.from(receipt, "base64").toString()));
