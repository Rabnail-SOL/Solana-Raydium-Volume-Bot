# Solana Raydium Volume Bot V2

TypeScript volume bot that distributes SOL to sub-wallets, runs double-buy + sell cycles via **Jupiter Lite API**, then sweeps SOL back to the main wallet.

## Features

- Automated SOL distribution to fresh wallets each round
- Double buy (random % of wallet SOL) + single sell per wallet
- Jupiter swap via `lite-api.jup.ag/swap/v1` (stable HTTP API)
- Optional Jito bundle mode
- Full `gather` script: sell tokens, close ATAs (SPL + Token-2022), sweep SOL
- Main wallet pays gather fees; staggered wallet processing to reduce RPC rate limits

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your RPC, private key, and token mint
```

## Usage

```bash
npm start          # Run volume bot
npm run gather     # Recover funds from data.json wallets
npm run bal        # Check main + sub-wallet balances
npm run typecheck  # TypeScript check
npm run build      # Compile to dist/
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PRIVATE_KEY` | Main wallet base58 secret key |
| `RPC_ENDPOINT` | Solana HTTP RPC |
| `RPC_WEBSOCKET_ENDPOINT` | Solana WebSocket RPC |
| `BUY_UPPER_PERCENT` / `BUY_LOWER_PERCENT` | Random buy sizing (% of wallet SOL) |
| `BUY_INTERVAL_MIN` / `BUY_INTERVAL_MAX` | Seconds between first and second buy |
| `SELL_INTERVAL_MIN` / `SELL_INTERVAL_MAX` | Seconds before sell |
| `DISTRIBUTE_WALLET_NUM` | Parallel wallets per round (max 20) |
| `SOL_AMOUNT_TO_DISTRIBUTE` | Total SOL split across wallets per round |
| `DISTRIBUTE_INTERVAL_MIN` / `DISTRIBUTE_INTERVAL_MAX` | Seconds between rounds |
| `SLIPPAGE` | Jupiter slippage in bps (50 = 0.5%) |
| `FEE_LEVEL` | Priority fee multiplier |
| `TOKEN_MINT` | Target token mint |
| `JITO_MODE` | `true` to use Jito bundles |
| `JITO_FEE` | Jito tip in SOL |
| `GATHER_TO_OTHER_ADDRESS` | Send gathered funds elsewhere |
| `GATHER_ADDRESS` | Alternate gather destination |

## Project Structure

```
├── index.ts              # Volume bot main loop
├── gather.ts             # Fund recovery
├── bal.ts                # Balance checker
├── constants/            # Env configuration
├── executor/             # legacy + Jito tx execution
└── utils/                # Jupiter swap + file helpers
```

## License

MIT
