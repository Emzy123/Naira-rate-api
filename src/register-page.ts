// One-tap ERC-8004 registration page. Open /register inside MetaMask's in-app browser.
// Sends register(agentURI) + Loops attribution tag to the Celo mainnet Identity Registry.
import type { Hono } from "hono";

const REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const OWNER = "0x703a739590b2eb0fd41f725c872a81e0ca799e06";
const DATA = "0xf2c298be0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000004768747470733a2f2f6e616972612d726174652d6170692e6f6e72656e6465722e636f6d2f2e77656c6c2d6b6e6f776e2f6167656e742d726567697374726174696f6e2e6a736f6e0000000000000000000000000000000000000000000000000063656c6f5f386161323636356564333737110080218021802180218021802180218021";
const REGISTERED_TOPIC = "0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a";

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Register Naira Rates API</title>
<style>body{font-family:system-ui;background:#111;color:#eee;padding:24px;max-width:520px;margin:auto}
button{width:100%;padding:18px;font-size:18px;border:0;border-radius:12px;background:#fcff52;color:#000;font-weight:700}
pre{white-space:pre-wrap;word-break:break-all;background:#222;padding:12px;border-radius:8px}</style></head>
<body><h2>Register on ERC-8004 (Celo)</h2>
<p>Sends 0 CELO to the Identity Registry with the registration data. Gas about 0.04 CELO.</p>
<button id="go">Register</button><pre id="log"></pre>
<script>
const log = (m) => (document.getElementById("log").textContent += m + "\\n");
document.getElementById("go").onclick = async () => {
  try {
    if (!window.ethereum) return log("Open this page in MetaMask's browser.");
    const [from] = await ethereum.request({ method: "eth_requestAccounts" });
    if (from.toLowerCase() !== "${OWNER}") return log("Switch MetaMask to 0x703a...9e06 (connected: " + from + ")");
    try { await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xa4ec" }] }); }
    catch (e) { return log("Switch MetaMask to the Celo network, then tap again."); }
    log("Confirm in MetaMask...");
    const hash = await ethereum.request({ method: "eth_sendTransaction",
      params: [{ from, to: "${REGISTRY}", value: "0x0", data: "${DATA}" }] });
    log("Sent: " + hash + "\\nWaiting for confirmation...");
    for (let i = 0; i < 60; i++) {
      const r = await ethereum.request({ method: "eth_getTransactionReceipt", params: [hash] });
      if (r) {
        if (r.status !== "0x1") return log("Transaction failed.");
        const ev = r.logs.find((l) => l.topics[0] === "${REGISTERED_TOPIC}");
        return log("Registered! Agent ID: " + (ev ? BigInt(ev.topics[1]).toString() : "check explorer") + "\\nSend this tx hash to Hark.");
      }
      await new Promise((s) => setTimeout(s, 2000));
    }
    log("Still pending. Send the tx hash to Hark.");
  } catch (e) { log("Error: " + (e.message || e)); }
};
</script></body></html>`;

export function registerPage(app: Hono) {
  app.get("/register", (c) => c.html(html));
}
