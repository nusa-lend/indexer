import { onchainTable, primaryKey } from "ponder";

export const chains = onchainTable("chains", (t) => ({
  id: t.text().primaryKey(),
  chainId: t.integer().notNull(),
  name: t.text().notNull(),
  rpcUrlEnvVar: t.text().notNull(),
  createdAt: t.bigint().notNull(),
  updatedAtBlock: t.bigint(),
}));

export const tokens = onchainTable("tokens", (t) => ({
  id: t.text().primaryKey(),
  chainId: t.text().notNull(),
  address: t.hex().notNull(),
  symbol: t.text().notNull(),
  name: t.text(),
  decimals: t.integer().notNull(),
  collateralFactorBps: t.integer().notNull(),
  liquidationThresholdBps: t.integer(),
  createdAtBlock: t.bigint().notNull(),
}));

export const markets = onchainTable("markets", (t) => ({
  id: t.text().primaryKey(),
  chainId: t.text().notNull(),
  marketType: t.text().notNull(),
  lendingPool: t.hex().notNull(),
  tokenId: t.text().notNull(),
  totalSupplyAssets: t.bigint().notNull().default(0n),
  totalSupplyShares: t.bigint().notNull().default(0n),
  totalBorrowAssets: t.bigint().notNull().default(0n),
  totalBorrowShares: t.bigint().notNull().default(0n),
  availableLiquidity: t.bigint().notNull().default(0n),
  utilizationRay: t.bigint().notNull().default(0n),
  supplyRateRay: t.bigint().notNull().default(0n),
  borrowRateRay: t.bigint().notNull().default(0n),
  reserveFactorBps: t.integer().notNull().default(0),
  totalBorrowUsd: t.bigint().notNull().default(0n),
  tvlUsd: t.bigint().notNull().default(0n),
  updatedAtBlock: t.bigint().notNull().default(0n),
  updatedAtTimestamp: t.bigint().notNull().default(0n),
}));

export const positions = onchainTable("positions", (t) => ({
  id: t.text().primaryKey(),
  chainId: t.text().notNull(),
  account: t.hex().notNull(),
  status: t.text().notNull().default("active"),
  healthFactorRay: t.bigint().notNull().default(0n),
  collateralUsdRay: t.bigint().notNull().default(0n),
  debtUsdRay: t.bigint().notNull().default(0n),
  updatedAtBlock: t.bigint().notNull().default(0n),
  updatedAtTimestamp: t.bigint().notNull().default(0n),
}));

export const positionCollaterals = onchainTable("position_collaterals", (t) => ({
  id: t.text().primaryKey(),
  positionId: t.text().notNull(),
  tokenId: t.text().notNull(),
  amount: t.bigint().notNull().default(0n),
  usdValueRay: t.bigint().notNull().default(0n),
  updatedAtBlock: t.bigint().notNull().default(0n),
  updatedAtTimestamp: t.bigint().notNull().default(0n),
}));

export const positionDebts = onchainTable("position_debts", (t) => ({
  id: t.text().primaryKey(),
  positionId: t.text().notNull(),
  tokenId: t.text().notNull(),
  amount: t.bigint().notNull().default(0n),
  usdValueRay: t.bigint().notNull().default(0n),
  chainDst: t.integer(),
  updatedAtBlock: t.bigint().notNull().default(0n),
  updatedAtTimestamp: t.bigint().notNull().default(0n),
}));

export const positionLoans = onchainTable("position_loans", (t) => ({
  id: t.text().primaryKey(),
  positionId: t.text().notNull(),
  chainId: t.text().notNull(),
  account: t.hex().notNull(),
  borrowTokenId: t.text().notNull(),
  borrowAmount: t.bigint().notNull(),
  borrowUsdRay: t.bigint().notNull(),
  borrowAprRay: t.bigint().notNull(),
  borrowApyRay: t.bigint().notNull(),
  collateralUsdRay: t.bigint().notNull(),
  debtUsdRay: t.bigint().notNull(),
  startBlock: t.bigint().notNull(),
  startTimestamp: t.bigint().notNull(),
  startTxHash: t.hex().notNull(),
  endBlock: t.bigint(),
  endTimestamp: t.bigint(),
  endTxHash: t.hex(),
  repaidAmount: t.bigint().notNull().default(0n),
  repaidUsdRay: t.bigint().notNull().default(0n),
  status: t.text().notNull().default("open"),
  createdAt: t.bigint().notNull(),
  updatedAt: t.bigint().notNull(),
}));

export const oraclePrices = onchainTable("oracle_prices", (t) => ({
  id: t.text().primaryKey(),
  chainId: t.text().notNull(),
  tokenId: t.text().notNull(),
  priceRay: t.bigint().notNull(),
  source: t.text().notNull().default("oracle"),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}));

export const liquidations = onchainTable("liquidations", (t) => ({
  id: t.text().primaryKey(),
  chainId: t.text().notNull(),
  positionId: t.text().notNull(),
  liquidator: t.hex().notNull(),
  debtTokenId: t.text().notNull(),
  collateralTokenId: t.text().notNull(),
  debtRepaid: t.bigint().notNull(),
  collateralSeized: t.bigint().notNull(),
  penaltyUsdRay: t.bigint().notNull(),
  txHash: t.hex().notNull(),
  logIndex: t.integer().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
}));

export const crossChainMessages = onchainTable("cross_chain_messages", (t) => ({
  id: t.text().primaryKey(),
  srcChainId: t.text().notNull(),
  dstChainId: t.text().notNull(),
  nonce: t.bigint().notNull(),
  payloadHash: t.hex().notNull(),
  token: t.hex(),
  status: t.text().notNull().default("sent"),
  sentTxHash: t.hex(),
  sentBlockNumber: t.bigint(),
  sentTimestamp: t.bigint(),
  deliveredTxHash: t.hex(),
  deliveredBlockNumber: t.bigint(),
  deliveredTimestamp: t.bigint(),
  latencySeconds: t.bigint(),
}));

export const protocolStatsDaily = onchainTable(
  "protocol_stats_daily",
  (t) => ({
    chainId: t.text().notNull(),
    day: t.text().notNull(),
    tvlUsd: t.bigint().notNull().default(0n),
    totalBorrowsUsd: t.bigint().notNull().default(0n),
    feesUsd: t.bigint().notNull().default(0n),
    revenueUsd: t.bigint().notNull().default(0n),
    blockNumber: t.bigint().notNull().default(0n),
    blockTimestamp: t.bigint().notNull().default(0n),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.chainId, table.day] }),
  })
);
