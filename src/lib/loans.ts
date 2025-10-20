import { and, desc, eq } from "ponder";
import { positionLoans } from "ponder:schema";
import type { Context } from "ponder:registry";

type Database = Context["db"];

export const createLoanRecord = async (
  db: Database,
  params: {
    id: string;
    positionId: string;
    chainId: number;
    account: `0x${string}`;
    borrowTokenId: string;
    borrowAmount: bigint;
    borrowUsdRay: bigint;
    borrowAprRay: bigint;
    borrowApyRay: bigint;
    collateralUsdRay: bigint;
    debtUsdRay: bigint;
    blockNumber: bigint;
    blockTimestamp: bigint;
    txHash: `0x${string}`;
  },
) => {
  await db
    .insert(positionLoans)
    .values({
      id: params.id,
      positionId: params.positionId,
      chainId: String(params.chainId),
      account: params.account,
      borrowTokenId: params.borrowTokenId,
      borrowAmount: params.borrowAmount,
      borrowUsdRay: params.borrowUsdRay,
      borrowAprRay: params.borrowAprRay,
      borrowApyRay: params.borrowApyRay,
      collateralUsdRay: params.collateralUsdRay,
      debtUsdRay: params.debtUsdRay,
      startBlock: params.blockNumber,
      startTimestamp: params.blockTimestamp,
      startTxHash: params.txHash,
      createdAt: params.blockTimestamp,
      updatedAt: params.blockTimestamp,
    })
    .onConflictDoNothing();
};

export const recordLoanRepayment = async (
  db: Database,
  params: {
    positionId: string;
    borrowTokenId: string;
    blockNumber: bigint;
    blockTimestamp: bigint;
    txHash: `0x${string}`;
    repayAmount: bigint;
    repayUsdRay: bigint;
    collateralUsdRay: bigint;
    debtUsdRay: bigint;
  },
) => {
  const openLoans = await db.sql
    .select()
    .from(positionLoans)
    .where(
      and(
        eq(positionLoans.positionId, params.positionId),
        eq(positionLoans.borrowTokenId, params.borrowTokenId),
        eq(positionLoans.status, "open"),
      ),
    )
    .orderBy(desc(positionLoans.startBlock))
    .limit(1);

  const openLoan = openLoans[0];
  if (!openLoan) return;

  const nextRepaidAmount = openLoan.repaidAmount + params.repayAmount;
  const nextRepaidUsdRay = openLoan.repaidUsdRay + params.repayUsdRay;

  const updateData: {
    repaidAmount: bigint;
    repaidUsdRay: bigint;
    collateralUsdRay: bigint;
    debtUsdRay: bigint;
    updatedAt: bigint;
    status?: string;
    endBlock?: bigint;
    endTimestamp?: bigint;
    endTxHash?: `0x${string}`;
  } = {
    repaidAmount: nextRepaidAmount,
    repaidUsdRay: nextRepaidUsdRay,
    collateralUsdRay: params.collateralUsdRay,
    debtUsdRay: params.debtUsdRay,
    updatedAt: params.blockTimestamp,
  };

  if (params.debtUsdRay <= 0n) {
    updateData.status = "closed";
    updateData.endBlock = params.blockNumber;
    updateData.endTimestamp = params.blockTimestamp;
    updateData.endTxHash = params.txHash;
  }

  await db.update(positionLoans, { id: openLoan.id }).set(updateData);
};
