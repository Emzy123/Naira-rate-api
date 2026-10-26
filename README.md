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
cp .env.example .env   # add X402_API_KEY (https://x402.celo.org) and SELLER_PAY_TO
npm run dev            # testnet by default (Celo Sepolia, USDC)
npm run buyer          # pays /v1/rates once with BUYER_PRIVATE_KEY
```
Set `X402_NETWORK=mainnet` to charge in USA₮ (`0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771`, 6 decimals) on Celo mainnet.

## Data sources
- Official: open.er-api.com
- Street: Quidax and Luno USDT/NGN tickers
Cached for 60 seconds.

## License
MIT
