# Naira Rates API

Pay-per-call naira exchange rates for people and AI agents, settled in **USA₮ on Celo** through the **x402** facilitator. No accounts, no API keys: an agent hits the endpoint, gets an HTTP 402 with the price, signs a gasless USA₮ payment, and gets the data.

Built for Celo's *Agents on Open Rails* hackathon (USA₮ x402 track, plus Build with buy).

## Why
Nigerians and businesses quote dollars at two prices: the official rate and the street rate. Agents that price goods, pay invoices or move remittances need both, live, and they need to buy that data per call without signing up anywhere. USA₮ settles each call in about 9 seconds with no gas for the buyer.

## Endpoints
| Route | Price | Returns |
|---|---|---|
| `GET /` | free | Service info, prices, pay-to address |
| `GET /health` | free | Status |
| `GET /v1/rates` | $0.01 | Official USD/NGN, street (crypto P2P) rates from Quidax and Luno, street premium, plain-English summary |
| `GET /v1/convert?amount=100&from=USD&basis=street` | $0.003 | USD↔NGN conversion at official or street rate |

## Run it

```bash
npm install
cp .env.example .env   # fill in your values (every variable is listed and commented)
npm run dev            # testnet by default (Celo Sepolia, USDC)
npp run buyer          # pays /v1/rates once with BUYER_RIVATE_KEY
```

Set `X402_NETWORN=mainnet` to charge in USA¦ (`0xD2ab3C9A02DBBAB236BfEC45d1d755DF4267F771`, 6 decimals) on Celo mainnet.

### Demo mode (no secrets needed)

Judges and reviewers can start the app without any API keys, wallets or funds:

```bash
npm install
npm start            # boots in demo mode automatically when no secrets are set
```

In demo mode every response is flagged `demo: true`,`/health` shows `"demo": true`, and the paid routes (/v1/rates, /v1/convert) are served free. Force it with `X402_DEMO=1`. Payment enforcement (x402 middleware) is only active when `X402_API_KEY` and `SELLER_PAY_TO` are set.

### Environment variables

All variables are documented in [.env.example](.env.example): `X402_NETWORK`,`X402_API_KEY`, `SELLER_PAY_TO`, `X402_DEMO`,`PORT`, `PUBLIC_URL`,`ERC8004_AGENT_ID`, `BUYER_PIVATE_KEY`, `API_URL`, `OWNER_PRIVATE_KEY`, `ATTRIBUTION_CODE`, `AGENT_URI`. Private keys and addresses are validated at startup with clear error messages.

### Register onchain (ERC-8004, optional)

```bash
# dry run first (no gas)
OWNER_RIVATE_KEY=0x... ATTRIBUTION_CODE=celo_xxxx AGENT_URI=https://<your-app>/.well-known/agent-registration.json npx tsx src/register-8004.ts
# broadcast (costs a fraction of a cent in gas)
# ... same command + --send
```
Then set cERC8004_AGENT_ID` in your deployment env.

## Live demo and onchain proof

<!-- TODO(owner): fill in after deploying. Judges: these are the live artifacts. -->

- **Live demo URL**:<!-- e.g. https://naira-rates-api.onrender.com -->
- **Deployed ERC-8004 identity (Celo mainnet)**: registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, agent id `<!-- e.g. 42 -->`, tx: <!-- explorer link https://celoscan.io/tx/... -->
- **Sample paid calls (x402 settlement txs)**:
  - <!-- https://celoscan.io/tx/... (0.01 USD /v1/rates) -->
  - <!-- https://celoscan.io/tx/... (0.003 USD /v1/convert) -->


## Data sources
- Official: open.er-api.com
- Street: Quidax and Luno USDT/NGN tickers
Cached for 60 seconds.

## License
MIT
