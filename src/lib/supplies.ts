import { positionSupplyEvents } from "ponder:schema";
import type { Context } from "ponder:registry";

import { bigintToText } from "./math";

type Database = Context["db"];

export type SupplyEntryType = "liquidity" | "collateral";
export type SupplyActionType = "supply" | "withdraw";

export const recordSupplyEvent = async (
  db: Database,
  params: {
    id: string;
    positionId: string;
    chainId: number;
    account: `0x${string}`;
    marketId: string;
    tokenId: string;
    entryType: SupplyEntryType;
    action: SupplyActionType;
    amount: bigint;
    usdValueRay: bigint;
    supplyAprRay: bigint;
    supplyApyRay: bigint;
    borrowAprRay: bigint;
    borrowApyRay: bigint;
    blockNumber: bigint;
    blockTimestamp: bigint;
    txHash: `0x${string}`;
    logIndex: number;
  },
) => {
  await db
    .insert(positionSupplyEvents)
    .values({
      id: params.id,
      positionId: params.positionId,
      chainId: String(params.chainId),
      account: params.account,
      marketId: params.marketId,
      tokenId: params.tokenId,
      entryType: params.entryType,
      action: params.action,
      amount: params.amount,
      usdValueRay: bigintToText(params.usdValueRay),
      supplyAprRay: bigintToText(params.supplyAprRay),
      supplyApyRay: bigintToText(params.supplyApyRay),
      borrowAprRay: bigintToText(params.borrowAprRay),
      borrowApyRay: bigintToText(params.borrowApyRay),
      blockNumber: params.blockNumber,
      blockTimestamp: params.blockTimestamp,
      txHash: params.txHash,
      logIndex: params.logIndex,
      createdAt: params.blockTimestamp,
    })
    .onConflictDoNothing();
};
