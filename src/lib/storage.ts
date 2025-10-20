import { asc, eq } from "ponder";
import {
  chains,
  markets,
  positionCollaterals,
  positionDebts,
  positions,
  protocolStatsDaily,
  tokens,
} from "ponder:schema";
import type { Context } from "ponder:registry";

import { interestModelLookup, lendingConfig, tokenLookup } from "./config";
import {
  chainKey,
  marketId,
  positionCollateralId,
  positionDebtId,
  positionId,
  protocolStatsDailyId,
  splitTokenId,
  tokenId,
} from "./ids";
import {
  RAY,
  clampToZero,
  dayBucket,
  ratioRay,
  sumBigInt,
  toUsdRay,
} from "./math";
import { MAX_HEALTH_FACTOR, computeHealthFactor } from "./hf";
type Database = Context["db"];

type MarketMetrics = {
  tvlUsd: bigint;
  borrowUsd: bigint;
  borrowAprRay: bigint;
  supplyAprRay: bigint;
  borrowApyRay: bigint;
  supplyApyRay: bigint;
};

const BPS = 10_000n;

const bpsToRay = (bps: number | bigint) => (BigInt(bps) * RAY) / BPS;

const powRay = (base: bigint, exp: bigint) => {
  let result = RAY;
  let b = base;
  let e = exp;

  while (e > 0n) {
    if (e & 1n) {
      result = (result * b + RAY / 2n) / RAY;
    }
    b = (b * b + RAY / 2n) / RAY;
    e >>= 1n;
  }

  return result;
};

const aprToApyRay = (aprRay: bigint, compoundsPerYear: number | bigint) => {
  const periods = BigInt(compoundsPerYear || 0);
  if (aprRay === 0n || periods <= 0n) return aprRay;

  const ratePerPeriod = aprRay / periods;
  if (ratePerPeriod === 0n) return aprRay;

  const base = RAY + ratePerPeriod;
  const compounded = powRay(base, periods);
  return compounded - RAY;
};

export const ensurePosition = async (
  db: Database,
  params: {
    chainId: number;
    account: `0x${string}`;
    blockNumber: bigint;
    blockTimestamp: bigint;
  },
) => {
  const positionKey = positionId(params.chainId, params.account);

  const inserted = await db
    .insert(positions)
    .values({
      id: positionKey,
      chainId: chainKey(params.chainId),
      account: params.account.toLowerCase() as `0x${string}`,
      status: "active",
      healthFactorRay: MAX_HEALTH_FACTOR,
      collateralUsdRay: 0n,
      debtUsdRay: 0n,
      updatedAtBlock: params.blockNumber,
      updatedAtTimestamp: params.blockTimestamp,
    })
    .onConflictDoNothing();

  return inserted?.id ?? positionKey;
};

export const ensureChain = async (
  db: Database,
  params: {
    chainId: number;
    blockNumber: bigint;
  },
) => {
  const chainCfg = lendingConfig.chains.find(
    (chain) => chain.chainId === params.chainId,
  );

  if (!chainCfg) return;

  const nowBlock = params.blockNumber;
  await db
    .insert(chains)
    .values({
      id: chainCfg.name,
      chainId: chainCfg.chainId,
      name: chainCfg.name,
      rpcUrlEnvVar: chainCfg.rpcUrlEnvVar,
      createdAt: nowBlock,
      updatedAtBlock: nowBlock,
    })
    .onConflictDoUpdate({
      name: chainCfg.name,
      rpcUrlEnvVar: chainCfg.rpcUrlEnvVar,
      updatedAtBlock: nowBlock,
    });
};

export const ensureToken = async (
  db: Database,
  params: {
    chainId: number;
    tokenAddress: `0x${string}`;
    blockNumber: bigint;
  },
) => {
  const tokenMeta = tokenLookup.get(params.tokenAddress.toLowerCase());

  const symbol = tokenMeta?.token.symbol ?? "UNKNOWN";
  const decimals = tokenMeta?.token.decimals ?? 18;
  const collateralFactorBps = tokenMeta?.token.collateralFactorBps ?? 0;

  const tokenKey = tokenId(params.chainId, params.tokenAddress);

  await db
    .insert(tokens)
    .values({
      id: tokenKey,
      chainId: chainKey(params.chainId),
      address: params.tokenAddress,
      symbol,
      name: symbol,
      decimals,
      collateralFactorBps,
      createdAtBlock: params.blockNumber,
    })
    .onConflictDoUpdate({
      symbol,
      name: symbol,
      decimals,
      collateralFactorBps,
    });

  return {
    decimals,
    collateralFactorBps,
    tokenKey,
  };
};

export const ensureMarket = async (
  db: Database,
  params: {
    chainId: number;
    tokenAddress: `0x${string}`;
    blockNumber: bigint;
    blockTimestamp: bigint;
  },
) => {
  const tokenMeta = tokenLookup.get(params.tokenAddress.toLowerCase());
  const chainMeta = lendingConfig.chains.find(
    (chain) => chain.chainId === params.chainId,
  );

  if (!chainMeta) {
    throw new Error(`Missing chain configuration for ${params.chainId}`);
  }

  const marketKey = marketId(params.chainId, params.tokenAddress);

  await db
    .insert(markets)
    .values({
      id: marketKey,
      chainId: chainKey(params.chainId),
      marketType: "lending",
      lendingPool: chainMeta.contracts.lendingPool.address,
      tokenId: tokenId(params.chainId, params.tokenAddress),
      updatedAtBlock: params.blockNumber,
      updatedAtTimestamp: params.blockTimestamp,
    })
    .onConflictDoUpdate({
      lendingPool: chainMeta.contracts.lendingPool.address,
      updatedAtBlock: params.blockNumber,
      updatedAtTimestamp: params.blockTimestamp,
    });

  return marketKey;
};

export const recalcMarketMetrics = async (
  db: Database,
  params: {
    chainId: number;
    tokenAddress: `0x${string}`;
    blockNumber: bigint;
    blockTimestamp: bigint;
    priceRay: bigint;
  },
): Promise<MarketMetrics> => {
  const marketKey = marketId(params.chainId, params.tokenAddress);
  const market = await db.find(markets, { id: marketKey });
  const tokenKey = tokenId(params.chainId, params.tokenAddress);
  if (!market) {
    return {
      tvlUsd: 0n,
      borrowUsd: 0n,
      borrowAprRay: 0n,
      supplyAprRay: 0n,
      borrowApyRay: 0n,
      supplyApyRay: 0n,
    };
  }

  const tokenMeta = tokenLookup.get(params.tokenAddress.toLowerCase());
  const decimals = tokenMeta?.token.decimals ?? 18;

  const totalSupplyAssets = clampToZero(market.totalSupplyAssets);
  const totalBorrowAssets = clampToZero(market.totalBorrowAssets);
  const totalBorrowUsd = toUsdRay(totalBorrowAssets, params.priceRay, decimals);
  const tvlUsd = toUsdRay(totalSupplyAssets, params.priceRay, decimals);
  const utilizationRay = ratioRay(totalBorrowAssets, totalSupplyAssets || 1n);

  const interestModel = interestModelLookup.get(params.chainId);

  let borrowAprRay = 0n;
  let supplyAprRay = 0n;
  let borrowApyRay = 0n;
  let supplyApyRay = 0n;

  if (interestModel) {
    const baseRay = bpsToRay(interestModel.borrowBaseRateBps ?? 0);
    const slopeRay = bpsToRay(interestModel.borrowSlopeRateBps ?? 0);
    const reserveRay = bpsToRay(interestModel.reserveFactorBps ?? 0);

    borrowAprRay = baseRay + (slopeRay * utilizationRay) / RAY;

    supplyAprRay = (borrowAprRay * utilizationRay) / RAY;
    supplyAprRay = (supplyAprRay * (RAY - reserveRay)) / RAY;

    const compounds = interestModel.compoundsPerYear ?? 365;
    borrowApyRay = aprToApyRay(borrowAprRay, compounds);
    supplyApyRay = aprToApyRay(supplyAprRay, compounds);
  }

  await db.update(markets, { id: marketKey }).set({
    totalSupplyAssets,
    totalBorrowAssets,
    totalBorrowUsd,
    tvlUsd,
    utilizationRay,
    borrowRateRay: borrowApyRay,
    supplyRateRay: supplyApyRay,
    updatedAtBlock: params.blockNumber,
    updatedAtTimestamp: params.blockTimestamp,
  });

  return {
    tvlUsd,
    borrowUsd: totalBorrowUsd,
    borrowAprRay,
    supplyAprRay,
    borrowApyRay,
    supplyApyRay,
  };
};

export const upsertPositionCollateral = async (
  db: Database,
  params: {
    chainId: number;
    account: `0x${string}`;
    tokenAddress: `0x${string}`;
    amountDelta: bigint;
    priceRay: bigint;
    decimals: number;
    blockNumber: bigint;
    blockTimestamp: bigint;
  },
) => {
  const positionKey = await ensurePosition(db, {
    chainId: params.chainId,
    account: params.account,
    blockNumber: params.blockNumber,
    blockTimestamp: params.blockTimestamp,
  });

  const tokenKey = tokenId(params.chainId, params.tokenAddress);
  const rowId = positionCollateralId(positionKey, tokenKey);

  const existing = await db.find(positionCollaterals, { id: rowId });
  const nextAmount = clampToZero(
    (existing?.amount ?? 0n) + params.amountDelta,
  );
  const usdValueRay = toUsdRay(nextAmount, params.priceRay, params.decimals);

  await db
    .insert(positionCollaterals)
    .values({
      id: rowId,
      positionId: positionKey,
      tokenId: tokenKey,
      amount: nextAmount,
      usdValueRay,
      updatedAtBlock: params.blockNumber,
      updatedAtTimestamp: params.blockTimestamp,
    })
    .onConflictDoUpdate({
      amount: nextAmount,
      usdValueRay,
      updatedAtBlock: params.blockNumber,
      updatedAtTimestamp: params.blockTimestamp,
    });

  return { positionId: positionKey };
};

export const upsertPositionDebt = async (
  db: Database,
  params: {
    chainId: number;
    account: `0x${string}`;
    tokenAddress: `0x${string}`;
    amountDelta: bigint;
    priceRay: bigint;
    decimals: number;
    blockNumber: bigint;
    blockTimestamp: bigint;
    dstChainId?: number;
  },
) => {
  const positionKey = await ensurePosition(db, {
    chainId: params.chainId,
    account: params.account,
    blockNumber: params.blockNumber,
    blockTimestamp: params.blockTimestamp,
  });

  const tokenKey = tokenId(params.chainId, params.tokenAddress);
  const rowId = positionDebtId(positionKey, tokenKey, params.dstChainId);

  const existing = await db.find(positionDebts, { id: rowId });
  const nextAmount = clampToZero((existing?.amount ?? 0n) + params.amountDelta);
  const usdValueRay = toUsdRay(nextAmount, params.priceRay, params.decimals);

  await db
    .insert(positionDebts)
    .values({
      id: rowId,
      positionId: positionKey,
      tokenId: tokenKey,
      amount: nextAmount,
      usdValueRay,
      chainDst: params.dstChainId,
      updatedAtBlock: params.blockNumber,
      updatedAtTimestamp: params.blockTimestamp,
    })
    .onConflictDoUpdate({
      amount: nextAmount,
      usdValueRay,
      chainDst: params.dstChainId,
      updatedAtBlock: params.blockNumber,
      updatedAtTimestamp: params.blockTimestamp,
    });

  return { positionId: positionKey };
};

export const updateDailyProtocolStats = async (
  db: Database,
  params: {
    chainId: number;
    blockTimestamp: bigint;
    blockNumber: bigint;
  },
) => {
  const day = dayBucket(params.blockTimestamp);
  const chainIdKey = chainKey(params.chainId);
  const id = protocolStatsDailyId(params.chainId, day);

  const marketRows = await db.sql
    .select({
      tvlUsd: markets.tvlUsd,
      borrowUsd: markets.totalBorrowUsd,
    })
    .from(markets)
    .where(eq(markets.chainId, chainIdKey));

  const totalTvlUsd = sumBigInt(
    marketRows.map((row: { tvlUsd: bigint }) => row.tvlUsd),
  );
  const totalBorrowUsd = sumBigInt(
    marketRows.map((row: { borrowUsd: bigint }) => row.borrowUsd),
  );

  await db
    .insert(protocolStatsDaily)
    .values({
      chainId: chainIdKey,
      day,
      tvlUsd: totalTvlUsd,
      totalBorrowsUsd: totalBorrowUsd,
      feesUsd: 0n,
      revenueUsd: 0n,
      blockNumber: params.blockNumber,
      blockTimestamp: params.blockTimestamp,
    })
    .onConflictDoUpdate({
      tvlUsd: totalTvlUsd,
      totalBorrowsUsd: totalBorrowUsd,
      blockTimestamp: params.blockTimestamp,
      blockNumber: params.blockNumber,
    });
};

export const refreshPositionMetrics = async (
  db: Database,
  params: {
    positionId: string;
    blockNumber: bigint;
    blockTimestamp: bigint;
  },
): Promise<{
  collateralUsdRay: bigint;
  debtUsdRay: bigint;
  healthFactorRay: bigint;
}> => {
  const [collaterals, debts] = await Promise.all([
    db.sql
      .select()
      .from(positionCollaterals)
      .where(eq(positionCollaterals.positionId, params.positionId))
      .orderBy(asc(positionCollaterals.id)),
    db.sql
      .select()
      .from(positionDebts)
      .where(eq(positionDebts.positionId, params.positionId))
      .orderBy(asc(positionDebts.id)),
  ]);

  const collateralSnapshots = collaterals.map((collateral) => {
    const { address } = splitTokenId(collateral.tokenId);
    const tokenMeta = tokenLookup.get(address.toLowerCase());
    const collateralFactorBps = tokenMeta?.token.collateralFactorBps ?? 0;
    return {
      usdRay: collateral.usdValueRay,
      collateralFactorBps,
    };
  });

  const debtSnapshots = debts.map((debt) => ({
    usdRay: debt.usdValueRay,
  }));

  const collateralUsdRay = sumBigInt(
    collaterals.map((row) => row.usdValueRay),
  );
  const debtUsdRay = sumBigInt(debts.map((row) => row.usdValueRay));
  const healthFactorRay = computeHealthFactor(
    collateralSnapshots,
    debtSnapshots,
  );

  await db.update(positions, { id: params.positionId }).set({
    collateralUsdRay,
    debtUsdRay,
    healthFactorRay,
    updatedAtBlock: params.blockNumber,
    updatedAtTimestamp: params.blockTimestamp,
  });

  return { collateralUsdRay, debtUsdRay, healthFactorRay };
};
