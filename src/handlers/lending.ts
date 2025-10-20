import { ponder } from "ponder:registry";
import { markets } from "ponder:schema";

import { lendingConfig } from "../lib/config";
import {
  ensureChain,
  ensureMarket,
  ensureToken,
  recalcMarketMetrics,
  refreshPositionMetrics,
  updateDailyProtocolStats,
  upsertPositionCollateral,
  upsertPositionDebt,
} from "../lib/storage";
import { clampToZero, toUsdRay } from "../lib/math";
import { tokenId } from "../lib/ids";
import { ensureOraclePrice } from "../lib/price";
import { createLoanRecord, recordLoanRepayment } from "../lib/loans";

type HandlerArgs = {
  event: any;
  context: any;
};

const logBlockProgress = (
  context: HandlerArgs["context"],
  message: string,
  chainId: number,
  blockNumber: bigint,
) => {
  const payload = {
    msg: message,
    chainId,
    blockNumber: Number(blockNumber),
  } as const;

  if (context?.logger?.info) {
    context.logger.info(payload);
  } else {
    console.info(payload);
  }
};

const handleSupplyCollateral = async ({ event, context }: HandlerArgs) => {
  const { db, chain } = context;
  const chainId = chain.id as number;
  const blockNumber = event.block.number as bigint;
  const blockTimestamp = event.block.timestamp as bigint;
  logBlockProgress(context, "SupplyCollateral event", chainId, blockNumber);
  const { user, token, amount } = event.args as {
    user: `0x${string}`;
    token: `0x${string}`;
    amount: bigint;
  };

  await ensureChain(db, { chainId, blockNumber });
  const tokenInfo = await ensureToken(db, {
    chainId,
    tokenAddress: token,
    blockNumber,
  });
  const marketId = await ensureMarket(db, {
    chainId,
    tokenAddress: token,
    blockNumber,
    blockTimestamp,
  });

  const marketRow = await db.find(markets, { id: marketId });
  const nextSupply = clampToZero((marketRow?.totalSupplyAssets ?? 0n) + amount);
  const nextLiquidity = clampToZero(
    (marketRow?.availableLiquidity ?? 0n) + amount,
  );

  await db.update(markets, { id: marketId }).set({
    totalSupplyAssets: nextSupply,
    availableLiquidity: nextLiquidity,
    updatedAtBlock: blockNumber,
    updatedAtTimestamp: blockTimestamp,
  });

  const priceRay = await ensureOraclePrice(
    db,
    {
      chainId,
      tokenAddress: token,
      blockNumber,
      blockTimestamp,
    },
    context.publicClient,
  );

  const { positionId } = await upsertPositionCollateral(db, {
    chainId,
    account: user,
    tokenAddress: token,
    amountDelta: amount,
    priceRay,
    decimals: tokenInfo.decimals,
    blockNumber,
    blockTimestamp,
  });

  await refreshPositionMetrics(db, { positionId, blockNumber, blockTimestamp });
  await recalcMarketMetrics(db, {
    chainId,
    tokenAddress: token,
    blockNumber,
    blockTimestamp,
    priceRay,
  });

  await updateDailyProtocolStats(db, {
    chainId,
    blockTimestamp,
    blockNumber,
  });
};

const handleWithdrawCollateral = async ({ event, context }: HandlerArgs) => {
  const { db, chain } = context;
  const chainId = chain.id as number;
  const blockNumber = event.block.number as bigint;
  const blockTimestamp = event.block.timestamp as bigint;
  logBlockProgress(context, "WithdrawCollateral event", chainId, blockNumber);
  const { user, token, amount } = event.args as {
    user: `0x${string}`;
    token: `0x${string}`;
    amount: bigint;
  };

  await ensureChain(db, { chainId, blockNumber });
  const tokenInfo = await ensureToken(db, {
    chainId,
    tokenAddress: token,
    blockNumber,
  });
  const marketId = await ensureMarket(db, {
    chainId,
    tokenAddress: token,
    blockNumber,
    blockTimestamp,
  });

  const marketRow = await db.find(markets, { id: marketId });
  const nextSupply = clampToZero((marketRow?.totalSupplyAssets ?? 0n) - amount);
  const nextLiquidity = clampToZero(
    (marketRow?.availableLiquidity ?? 0n) - amount,
  );

  await db.update(markets, { id: marketId }).set({
    totalSupplyAssets: nextSupply,
    availableLiquidity: nextLiquidity,
    updatedAtBlock: blockNumber,
    updatedAtTimestamp: blockTimestamp,
  });

  const priceRay = await ensureOraclePrice(
    db,
    {
      chainId,
      tokenAddress: token,
      blockNumber,
      blockTimestamp,
    },
    context.publicClient,
  );

  const { positionId } = await upsertPositionCollateral(db, {
    chainId,
    account: user,
    tokenAddress: token,
    amountDelta: -amount,
    priceRay,
    decimals: tokenInfo.decimals,
    blockNumber,
    blockTimestamp,
  });

  await refreshPositionMetrics(db, { positionId, blockNumber, blockTimestamp });
  await recalcMarketMetrics(db, {
    chainId,
    tokenAddress: token,
    blockNumber,
    blockTimestamp,
    priceRay,
  });

  await updateDailyProtocolStats(db, {
    chainId,
    blockTimestamp,
    blockNumber,
  });
};

const handleBorrow = async ({ event, context }: HandlerArgs) => {
  const { db, chain } = context;
  const chainId = chain.id as number;
  const blockNumber = event.block.number as bigint;
  const blockTimestamp = event.block.timestamp as bigint;
  logBlockProgress(context, "Borrow event", chainId, blockNumber);
  const { user, token, amount, chainDst } = event.args as {
    user: `0x${string}`;
    token: `0x${string}`;
    amount: bigint;
    chainDst?: bigint;
  };

  await ensureChain(db, { chainId, blockNumber });
  const tokenInfo = await ensureToken(db, {
    chainId,
    tokenAddress: token,
    blockNumber,
  });
  const marketId = await ensureMarket(db, {
    chainId,
    tokenAddress: token,
    blockNumber,
    blockTimestamp,
  });

  const marketRow = await db.find(markets, { id: marketId });
  const nextBorrow = clampToZero((marketRow?.totalBorrowAssets ?? 0n) + amount);
  const nextLiquidity = clampToZero(
    (marketRow?.availableLiquidity ?? 0n) - amount,
  );

  await db.update(markets, { id: marketId }).set({
    totalBorrowAssets: nextBorrow,
    availableLiquidity: nextLiquidity,
    updatedAtBlock: blockNumber,
    updatedAtTimestamp: blockTimestamp,
  });

  const priceRay = await ensureOraclePrice(
    db,
    {
      chainId,
      tokenAddress: token,
      blockNumber,
      blockTimestamp,
    },
    context.publicClient,
  );

  const { positionId } = await upsertPositionDebt(db, {
    chainId,
    account: user,
    tokenAddress: token,
    amountDelta: amount,
    priceRay,
    decimals: tokenInfo.decimals,
    blockNumber,
    blockTimestamp,
    dstChainId: chainDst ? Number(chainDst) : undefined,
  });

  const positionMetrics = await refreshPositionMetrics(db, {
    positionId,
    blockNumber,
    blockTimestamp,
  });
  const marketMetrics = await recalcMarketMetrics(db, {
    chainId,
    tokenAddress: token,
    blockNumber,
    blockTimestamp,
    priceRay,
  });

  await updateDailyProtocolStats(db, {
    chainId,
    blockTimestamp,
    blockNumber,
  });

  const borrowTokenId = tokenId(chainId, token);
  const loanId = `${positionId}:${borrowTokenId}:${event.transaction.hash}:${event.log.logIndex}`;
  const borrowUsdRay = toUsdRay(amount, priceRay, tokenInfo.decimals);

  await createLoanRecord(db, {
    id: loanId,
    positionId,
    chainId,
    account: user,
    borrowTokenId,
    borrowAmount: amount,
    borrowUsdRay,
    borrowAprRay: marketMetrics.borrowAprRay,
    borrowApyRay: marketMetrics.borrowApyRay,
    collateralUsdRay: positionMetrics.collateralUsdRay,
    debtUsdRay: positionMetrics.debtUsdRay,
    blockNumber,
    blockTimestamp,
    txHash: event.transaction.hash as `0x${string}`,
  });
};

const handleRepay = async ({ event, context }: HandlerArgs) => {
  const { db, chain } = context;
  const chainId = chain.id as number;
  const blockNumber = event.block.number as bigint;
  const blockTimestamp = event.block.timestamp as bigint;
  logBlockProgress(context, "Repay event", chainId, blockNumber);
  const { user, token, amount } = event.args as {
    user: `0x${string}`;
    token: `0x${string}`;
    amount: bigint;
  };

  await ensureChain(db, { chainId, blockNumber });
  const tokenInfo = await ensureToken(db, {
    chainId,
    tokenAddress: token,
    blockNumber,
  });
  const marketId = await ensureMarket(db, {
    chainId,
    tokenAddress: token,
    blockNumber,
    blockTimestamp,
  });

  const marketRow = await db.find(markets, { id: marketId });
  const nextBorrow = clampToZero((marketRow?.totalBorrowAssets ?? 0n) - amount);
  const nextLiquidity = clampToZero(
    (marketRow?.availableLiquidity ?? 0n) + amount,
  );

  await db.update(markets, { id: marketId }).set({
    totalBorrowAssets: nextBorrow,
    availableLiquidity: nextLiquidity,
    updatedAtBlock: blockNumber,
    updatedAtTimestamp: blockTimestamp,
  });

  const priceRay = await ensureOraclePrice(
    db,
    {
      chainId,
      tokenAddress: token,
      blockNumber,
      blockTimestamp,
    },
    context.publicClient,
  );

  const { positionId } = await upsertPositionDebt(db, {
    chainId,
    account: user,
    tokenAddress: token,
    amountDelta: -amount,
    priceRay,
    decimals: tokenInfo.decimals,
    blockNumber,
    blockTimestamp,
  });

  const positionMetrics = await refreshPositionMetrics(db, {
    positionId,
    blockNumber,
    blockTimestamp,
  });
  await recalcMarketMetrics(db, {
    chainId,
    tokenAddress: token,
    blockNumber,
    blockTimestamp,
    priceRay,
  });

  await updateDailyProtocolStats(db, {
    chainId,
    blockTimestamp,
    blockNumber,
  });

  const borrowTokenId = tokenId(chainId, token);
  const repayUsdRay = toUsdRay(amount, priceRay, tokenInfo.decimals);

  await recordLoanRepayment(db, {
    positionId,
    borrowTokenId,
    blockNumber,
    blockTimestamp,
    txHash: event.transaction.hash as `0x${string}`,
    repayAmount: amount,
    repayUsdRay,
    collateralUsdRay: positionMetrics.collateralUsdRay,
    debtUsdRay: positionMetrics.debtUsdRay,
  });
};

for (const chain of lendingConfig.chains) {
  const lendingPoolContract = `LendingPool_${chain.name}`;

  ponder.on(`${lendingPoolContract}:SupplyCollateral` as any, handleSupplyCollateral as any);
  ponder.on(`${lendingPoolContract}:WithdrawCollateral` as any, handleWithdrawCollateral as any);
  ponder.on(`${lendingPoolContract}:Borrow` as any, handleBorrow as any);
  ponder.on(`${lendingPoolContract}:Repay` as any, handleRepay as any);
}
