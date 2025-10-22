import { oraclePrices } from "ponder:schema";
import type { InferInsertModel } from "drizzle-orm";
import type { Context } from "ponder:registry";
import type { Address, PublicClient } from "viem";

import TokenDataStream from "../../abi/TokenDataStream.json" assert { type: "json" };
import {
  tokenDataStreamLookup,
  tokenLookup,
  type ChainConfig,
  type TokenConfig,
} from "./config";
import { oraclePriceId, tokenId as makeTokenId } from "./ids";
import { RAY, bigintToText, textToBigint } from "./math";

type Database = Context["db"];
type OraclePricesTable = typeof oraclePrices;
export type OraclePriceRow = InferInsertModel<OraclePricesTable>;

type TokenMeta = { chain: ChainConfig; token: TokenConfig };

export const USD_FALLBACK_RAY = RAY;
const MAX_RAY_DECIMALS = 27n;

export const upsertOraclePrice = async (
  db: Database,
  values: Omit<OraclePriceRow, "priceRay"> & { priceRay: bigint | string },
) => {
  const priceRay = typeof values.priceRay === "bigint" ? bigintToText(values.priceRay) : values.priceRay;
  await db
    .insert(oraclePrices)
    .values({
      ...values,
      priceRay,
    })
    .onConflictDoUpdate({
      blockNumber: values.blockNumber,
      blockTimestamp: values.blockTimestamp,
      priceRay,
      source: values.source,
    });
};

const scaleToRay = (price: bigint, decimals: bigint) => {
  if (decimals === MAX_RAY_DECIMALS) return price;
  if (decimals > MAX_RAY_DECIMALS) {
    const shift = decimals - MAX_RAY_DECIMALS;
    if (shift === 0n) return price;
    return price / 10n ** shift;
  }
  return price * 10n ** (MAX_RAY_DECIMALS - decimals);
};

const fetchPriceFromOracle = async (
  tokenMeta: TokenMeta,
  tokenAddress: `0x${string}`,
  publicClient?: PublicClient,
): Promise<{ priceRay: bigint; source: string } | null> => {
  if (!tokenMeta.token.oracle) return null;

  const dataStream = tokenDataStreamLookup.get(tokenMeta.chain.chainId);
  if (!dataStream) return null;

  if (!publicClient) return null;

  try {
    const [, answer] = (await publicClient.readContract({
      abi: TokenDataStream,
      address: dataStream.address as Address,
      functionName: "latestRoundData",
      args: [tokenAddress],
    })) as [bigint, bigint, bigint, bigint, bigint];

    const decimals = (await publicClient.readContract({
      abi: TokenDataStream,
      address: dataStream.address as Address,
      functionName: "decimals",
      args: [tokenAddress],
    })) as bigint;

    const priceRay = scaleToRay(answer, decimals);
    return { priceRay, source: "oracle" };
  } catch (error) {
    console.warn("Failed to fetch oracle price", {
      chainId: tokenMeta.chain.chainId,
      tokenAddress,
      error,
    });
    return null;
  }
};

export const ensureOraclePrice = async (
  db: Database,
  params: {
    chainId: number;
    tokenAddress: `0x${string}`;
    blockNumber: bigint;
    blockTimestamp: bigint;
  },
  publicClient?: PublicClient,
): Promise<bigint> => {
  const id = oraclePriceId(params.chainId, params.tokenAddress);
  const existing = await db.find(oraclePrices, { id });

  if (existing && existing.blockNumber >= params.blockNumber) {
    return textToBigint(existing.priceRay);
  }

  const tokenMeta = tokenLookup.get(params.tokenAddress.toLowerCase());
  if (!tokenMeta) {
    return existing ? textToBigint(existing.priceRay) : USD_FALLBACK_RAY;
  }

  if (tokenMeta.chain.chainId !== params.chainId) {
    return existing ? textToBigint(existing.priceRay) : USD_FALLBACK_RAY;
  }

  const oracleStart = tokenMeta.token.oracleStartBlock ?? 0;
  if (oracleStart > 0 && params.blockNumber < BigInt(oracleStart)) {
    return existing ? textToBigint(existing.priceRay) : USD_FALLBACK_RAY;
  }

  const fetched = await fetchPriceFromOracle(tokenMeta, params.tokenAddress, publicClient);

  if (!fetched) {
    return existing ? textToBigint(existing.priceRay) : USD_FALLBACK_RAY;
  }

  await upsertOraclePrice(db, {
    id,
    chainId: `${params.chainId}`,
    tokenId: makeTokenId(params.chainId, params.tokenAddress),
    priceRay: fetched.priceRay,
    source: fetched.source,
    blockNumber: params.blockNumber,
    blockTimestamp: params.blockTimestamp,
  });

  return fetched.priceRay;
};
