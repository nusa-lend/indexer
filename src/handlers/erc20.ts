import { ponder } from "ponder:registry";

import { lendingConfig } from "../lib/config";
import { ensureChain, ensureToken } from "../lib/storage";

const registerErc20Handlers = () => {
  for (const chain of lendingConfig.chains) {
    for (const token of chain.contracts.tokens) {
      const contractName = `Token_${chain.name}_${token.symbol}`;

      const transferHandler = async ({ event, context }: { event: any; context: any }) => {
        const { db, chain: ctxChain } = context;
        const blockNumber = event.block.number as bigint;
        const tokenAddress = event.log.address as `0x${string}`;
        const payload = {
          msg: "ERC20 Transfer event",
          chainId: ctxChain.id,
          blockNumber: Number(blockNumber),
          token: tokenAddress,
        } as const;
        if (context.logger?.info) {
          context.logger.info(payload);
        } else {
          console.info(payload);
        }

        await ensureChain(db, { chainId: ctxChain.id, blockNumber });
        await ensureToken(db, {
          chainId: ctxChain.id,
          tokenAddress,
          blockNumber,
        });
      };

      ponder.on(`${contractName}:Transfer` as any, transferHandler as any);
    }
  }
};

registerErc20Handlers();
