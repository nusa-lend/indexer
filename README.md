# Lending Indexer

Indexer for the cross-chain lending protocol using [Ponder](https://ponder.sh/).

## Prerequisites

- Node.js 18+
- PostgreSQL instance accessible via `DATABASE_URL`

## Setup

```bash
npm install
cp .env.example .env
# set DATABASE_URL, ARBITRUM_RPC_URL, BASE_RPC_URL in .env
npm run db:setup   # optional; dev/start will run this automatically
npm run codegen
npm run dev
```

The development server will run the indexer in watch mode. Use `npm run start` to run in production.

## Project structure

- `ponder.config.ts` — loads `config.lending.json`, wires networks/contracts, and configures Postgres.
- `ponder.schema.ts` — database schema (markets, positions, daily stats, cross-chain messages, etc.).
- `src/handlers/*` — event handlers grouped by contract.
- `src/lib/*` — shared helpers for math, IDs, price management, and persistence.
- `abi/` — contract ABIs.
- `config.lending.json` — chain-specific addresses and metadata.

## Indexed & Exposed Data

Ponder writes every entity to Postgres (`ponder.schema.ts`) and serves them via REST/GraphQL at `http://localhost:42069`. The Next.js frontend consumes `/api/markets`, which maps the same payload into UI-friendly fields.

- **Markets (`markets` table / `/markets` endpoint)**
  - `totalSupplyAssets`, `totalBorrowAssets` (raw token units)
  - `tvlUsd`, `totalBorrowUsd` (Ray-scaled USD values)
  - `utilizationRay`
  - `supplyRateRay`, `borrowRateRay` (APY in ray)
  - `updatedAtBlock`, `updatedAtTimestamp`
- **Tokens (`tokens` table)**
  - symbol, name, decimals
  - `liquidationThresholdBps`
  - oracle feed metadata (`oracle`, `oracleStartBlock`)
- **Oracle prices (`oracle_prices` table)** — latest price ray, source, block/timestamp
- **Positions (`positions`, `position_collaterals`, `position_debts`)** — per-account collateral/debt values (ray) and health factor
- **Loan history (`position_loans`)** — borrow events with APR/APY snapshot, USD values, start/end block timestamps, and running repayment totals
- **Daily stats (`protocol_stats_daily`)** — TVL, borrows, fees, revenue per chain/day
- **Cross-chain messages (`cross_chain_messages`)** — OApp message status and latency

GraphQL (`/graphql`) exposes the same schema for ad-hoc queries.

## Available scripts

- `npm run dev` — index with hot reload + UI.
- `npm run start` — start indexer (no hot reload).
- `npm run codegen` — regenerate TypeScript types after changing config/schema.
- `npm run typecheck` — static type checking.
- `npm run db:setup` — ensure the target Postgres database exists before indexing.
