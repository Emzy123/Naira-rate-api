// Registers the Naira Rates API on the ERC-8004 Identity Registry (Celo mainnet).
// COSTS GAS (a fraction of a cent). Dry run by default; add --send to broadcast.
//   OWNER_PRIVATE_KEY=0x... ATTRIBUTION_CODE=celo_xxxx AGENT_URI=https://<your-app>/.well-known/agent-registration.json npx tsx src/register-8004.ts [--send]
// The key's address owns the identity and becomes its agentWallet. Use Emmanuel's main wallet.
import "dotenv/config";
import { createPublicClient, createWalletClient, http, encodeFunctionData, concat, parseEventLogs, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { toDataSuffix } from "@celo/attribution-tags";

const REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const abi = [
  { type: "function", name: "register", stateMutability: "nonpayable", inputs: [{ name: "agentURI", type: "string" }], outputs: [{ name: "agentId", type: "uint256" }] },
  { type: "event", name: "Registered", inputs: [{ name: "agentId", type: "uint256", indexed: true }, { name: "agentURI", type: "string" }, { name: "owner", type: "address", indexed: true }] },
] as const;

const uri = process.env.AGENT_URI;
const code = process.env.ATTRIBUTION_CODE; // the celo_... code from Loops House enrollment
if (!uri || !code || !process.env.OWNER_PRIVATE_KEY) throw new Error("Set OWNER_PRIVATE_KEY, ATTRIBUTION_CODE and AGENT_URI");

const account = privateKeyToAccount(process.env.OWNER_PRIVATE_KEY as `0x${string}`);
const pub = createPublicClient({ chain: celo, transport: http("https://forno.celo.org") });

// Check the file is reachable before paying to point at it.
const file = await (await fetch(uri)).json();
if (!file.x402Support) throw new Error("registration file missing x402Support");

const data = concat([encodeFunctionData({ abi, functionName: "register", args: [uri] }), toDataSuffix(code)]);
const gas = await pub.estimateGas({ account, to: REGISTRY, data });
const gasPrice = await pub.getGasPrice();
console.log(`owner ${account.address}\nagentURI ${uri}\ntag ${code}\nest. fee ~${formatEther(gas * gasPrice)} CELO`);
if (!process.argv.includes("--send")) { console.log("Dry run only. Re-run with --send to register."); process.exit(0); }

const wallet = createWalletClient({ account, chain: celo, transport: http("https://forno.celo.org") });
const hash = await wallet.sendTransaction({ to: REGISTRY, data, gas: (gas * 12n) / 10n });
const receipt = await pub.waitForTransactionReceipt({ hash });
const [ev] = parseEventLogs({ abi, eventName: "Registered", logs: receipt.logs });
console.log(`tx ${hash}\nRegistered as agent ${ev?.args.agentId}  ->  set ERC8004_AGENT_ID=${ev?.args.agentId} on Render`);
