import { keccak256 } from "viem";
import { ponder } from "ponder:registry";
import { crossChainMessages } from "ponder:schema";

import { lendingConfig } from "../lib/config";
import { ensureChain } from "../lib/storage";
import { crossChainMessageId } from "../lib/ids";

for (const chain of lendingConfig.chains) {
  const contractName = `OAppBorrow_${chain.name}`;

  const messageHandler = async ({ event, context }: { event: any; context: any }) => {
    const { db, chain: ctxChain } = context;
    const blockNumber = event.block.number as bigint;
    const blockTimestamp = event.block.timestamp as bigint;
    const srcEid = Number(event.args.srcEid);
    const nonce = event.args.nonce as bigint;
    const token = event.args.token as `0x${string}`;
    const payloadHash = keccak256(event.log.data as `0x${string}`);
    const id = crossChainMessageId(srcEid, nonce, payloadHash);
    const payload = {
      msg: "MessageReceived event",
      chainId: ctxChain.id,
      blockNumber: Number(blockNumber),
      srcEid,
      nonce: nonce.toString(),
    } as const;
    if (context.logger?.info) {
      context.logger.info(payload);
    } else {
      console.info(payload);
    }

    await ensureChain(db, { chainId: ctxChain.id, blockNumber });

    const existing = await db.find(crossChainMessages, { id });
    const latencySeconds =
      existing?.sentTimestamp !== null && existing?.sentTimestamp !== undefined
        ? blockTimestamp - existing.sentTimestamp
        : existing?.latencySeconds ?? null;

    await db
      .insert(crossChainMessages)
      .values({
        id,
        srcChainId: String(srcEid),
        dstChainId: String(ctxChain.id),
        nonce,
        payloadHash,
        token,
        status: "delivered",
        sentTxHash: existing?.sentTxHash ?? null,
        sentBlockNumber: existing?.sentBlockNumber ?? null,
        sentTimestamp: existing?.sentTimestamp ?? null,
        deliveredTxHash: event.transaction.hash as `0x${string}`,
        deliveredBlockNumber: blockNumber,
        deliveredTimestamp: blockTimestamp,
        latencySeconds,
      })
      .onConflictDoUpdate({
        status: "delivered",
        deliveredTxHash: event.transaction.hash as `0x${string}`,
        deliveredBlockNumber: blockNumber,
        deliveredTimestamp: blockTimestamp,
        latencySeconds,
      });
  };

  ponder.on(`${contractName}:MessageReceived` as any, messageHandler as any);
}
