import type { Context } from "hono";
import { Hono } from "hono";
import { client, graphql } from "ponder";
import { db } from "ponder:api";
import schema, { positions as positionsTable } from "ponder:schema";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { roles } from "./roles/roles.js";
import { positionId as makePositionId } from "../lib/ids";

const app = new Hono();

const toSerializable = (value: unknown): unknown => {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((item) => toSerializable(item));
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        toSerializable(item),
      ]),
    );
  }
  return value;
};

const sendOk = (c: Context, data: unknown, status: ContentfulStatusCode = 200) => {
  return c.json({ data: toSerializable(data) }, status);
};

const sendError = (
  c: Context,
  error: unknown,
  status: ContentfulStatusCode = 500,
) => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unexpected error";
  return c.json({ error: message }, status);
};

app.get("/healthz", (c) => sendOk(c, { status: "ok" }));

app.get("/chains", async (c) => {
  try {
    const result = await db.query.chains.findMany({
      orderBy: (table, { asc }) => asc(table.chainId),
    });
    return sendOk(c, result);
  } catch (error) {
    return sendError(c, error);
  }
});

app.get("/markets", async (c) => {
  try {
    const chain = c.req.query("chain");

    const markets = await db.query.markets.findMany({
      where: chain ? (table, { eq }) => eq(table.chainId, chain) : undefined,
      orderBy: (table, { desc }) => desc(table.updatedAtTimestamp),
      limit: 100,
    });

    if (markets.length === 0) {
      return sendOk(c, []);
    }

    const tokenIds = [...new Set(markets.map((market) => market.tokenId))];
    const tokens = await db.query.tokens.findMany({
      where: (table, { inArray }) => inArray(table.id, tokenIds),
    });
    const tokenMap = new Map(tokens.map((token) => [token.id, token]));

    const response = markets.map((market) => ({
      ...market,
      token: tokenMap.get(market.tokenId) ?? null,
    }));

    return sendOk(c, response);
  } catch (error) {
    return sendError(c, error);
  }
});

const parsePositionId = (id: string) => {
  const [prefix, chainId, account] = id.split(":");
  if (prefix !== "position" || !chainId || !account) {
    throw new Error(`Invalid position id: ${id}`);
  }
  return { chainId, account: account as `0x${string}` };
};

type PositionRow = typeof positionsTable.$inferSelect;

type PositionBucket = {
  position: PositionRow;
  entries: Array<{
    type: "supply_collateral" | "supply_liquidity" | "borrow";
    tokenId: string;
    amount: bigint;
    usdValueRay: string;
    updatedAtBlock: bigint;
    updatedAtTimestamp: bigint;
    chainDst?: number | null;
  }>;
};

const ensureBucket = (
  buckets: Map<string, PositionBucket>,
  positionId: string,
  fallback?: () => PositionRow,
) => {
  let bucket = buckets.get(positionId);
  if (!bucket) {
    const position = fallback
      ? fallback()
      : (() => {
          const { chainId, account } = parsePositionId(positionId);
          return createPositionRecord({
            id: positionId,
            chainId,
            account,
          });
        })();
    bucket = { position, entries: [] };
    buckets.set(positionId, bucket);
  }
  return bucket;
};

const updatePositionTimestamps = (
  bucket: PositionBucket,
  updatedAtBlock: bigint,
  updatedAtTimestamp: bigint,
) => {
  if (updatedAtBlock > bucket.position.updatedAtBlock) {
    bucket.position.updatedAtBlock = updatedAtBlock;
  }
  if (updatedAtTimestamp > bucket.position.updatedAtTimestamp) {
    bucket.position.updatedAtTimestamp = updatedAtTimestamp;
  }
};

const createPositionRecord = ({
  id,
  chainId,
  account,
  status,
  collateralUsdRay,
  debtUsdRay,
  healthFactorRay,
  updatedAtBlock,
  updatedAtTimestamp,
}: {
  id: string;
  chainId: string;
  account: `0x${string}`;
  status?: string;
  collateralUsdRay?: string;
  debtUsdRay?: string;
  healthFactorRay?: string;
  updatedAtBlock?: bigint;
  updatedAtTimestamp?: bigint;
}): PositionRow => ({
  id,
  chainId,
  account,
  status: status ?? "active",
  collateralUsdRay: collateralUsdRay ?? "0",
  debtUsdRay: debtUsdRay ?? "0",
  healthFactorRay: healthFactorRay ?? "0",
  updatedAtBlock: updatedAtBlock ?? 0n,
  updatedAtTimestamp: updatedAtTimestamp ?? 0n,
});

app.get("/positions", async (c) => {
  try {
    const chain = c.req.query("chain");
    const accountParam = c.req.query("account");

    if (accountParam && !accountParam.startsWith("0x")) {
      return sendError(c, "Query parameter \"account\" must be a hex address.", 400);
    }

    const account = accountParam
      ? (accountParam.toLowerCase() as `0x${string}`)
      : undefined;

    const positions = await db.query.positions.findMany({
      where:
        chain || account
          ? (table, { and, eq }) => {
              let predicate;
              if (chain) {
                predicate = eq(table.chainId, chain);
              }
              if (account) {
                const accountPredicate = eq(table.account, account);
                predicate = predicate ? and(predicate, accountPredicate) : accountPredicate;
              }
              return predicate!;
            }
          : undefined,
      orderBy: (table, { desc }) => desc(table.updatedAtTimestamp),
      limit: 100,
    });

    if (positions.length === 0) {
      return sendOk(c, []);
    }

    const positionIds = positions.map((position) => position.id);

    const [collaterals, debts, liquidity] = await Promise.all([
      db.query.positionCollaterals.findMany({
        where: (table, { inArray }) => inArray(table.positionId, positionIds),
      }),
      db.query.positionDebts.findMany({
        where: (table, { inArray }) => inArray(table.positionId, positionIds),
      }),
      db.query.liquidityPositions.findMany({
        where:
          chain || account
            ? (table, { and, eq }) => {
                let predicate;
                if (chain) {
                  predicate = eq(table.chainId, chain);
                }
                if (account) {
                  const accountPredicate = eq(table.account, account);
                  predicate = predicate ? and(predicate, accountPredicate) : accountPredicate;
                }
                return predicate!;
              }
            : undefined,
      }),
    ]);

    const buckets = new Map<string, PositionBucket>();
    const orderedPositionIds: string[] = [];

    for (const position of positions) {
      const positionCopy: PositionRow = { ...position };
      buckets.set(position.id, { position: positionCopy, entries: [] });
      orderedPositionIds.push(position.id);
    }

    for (const collateral of collaterals) {
      const bucket = ensureBucket(buckets, collateral.positionId);
      bucket.entries.push({
        type: "supply_collateral",
        tokenId: collateral.tokenId,
        amount: collateral.amount,
        usdValueRay: collateral.usdValueRay,
        updatedAtBlock: collateral.updatedAtBlock,
        updatedAtTimestamp: collateral.updatedAtTimestamp,
      });
      updatePositionTimestamps(bucket, collateral.updatedAtBlock, collateral.updatedAtTimestamp);
    }

    for (const debt of debts) {
      const bucket = ensureBucket(buckets, debt.positionId);
      bucket.entries.push({
        type: "borrow",
        tokenId: debt.tokenId,
        amount: debt.amount,
        usdValueRay: debt.usdValueRay,
        updatedAtBlock: debt.updatedAtBlock,
        updatedAtTimestamp: debt.updatedAtTimestamp,
        chainDst: debt.chainDst ?? null,
      });
      updatePositionTimestamps(bucket, debt.updatedAtBlock, debt.updatedAtTimestamp);
    }

    for (const entry of liquidity) {
      const positionId = makePositionId(entry.chainId, entry.account);
      const bucket = ensureBucket(buckets, positionId, () =>
        createPositionRecord({
          id: positionId,
          chainId: entry.chainId,
          account: entry.account,
          updatedAtBlock: entry.updatedAtBlock,
          updatedAtTimestamp: entry.updatedAtTimestamp,
        }),
      );
      bucket.entries.push({
        type: "supply_liquidity",
        tokenId: entry.tokenId,
        amount: entry.amount,
        usdValueRay: entry.usdValueRay,
        updatedAtBlock: entry.updatedAtBlock,
        updatedAtTimestamp: entry.updatedAtTimestamp,
      });
      updatePositionTimestamps(bucket, entry.updatedAtBlock, entry.updatedAtTimestamp);
      if (!orderedPositionIds.includes(positionId)) {
        orderedPositionIds.push(positionId);
      }
    }

    const seen = new Set<string>();
    const response = [];

    for (const id of orderedPositionIds) {
      const bucket = buckets.get(id);
      if (!bucket) continue;
      seen.add(id);
      response.push({
        ...bucket.position,
        entries: bucket.entries,
      });
    }

    for (const [id, bucket] of buckets.entries()) {
      if (seen.has(id)) continue;
      response.push({
        ...bucket.position,
        entries: bucket.entries,
      });
    }

    return sendOk(c, response);
  } catch (error) {
    return sendError(c, error);
  }
});

app.get("/roles", async (c) => {
  try {
    const summary = await roles(db);
    return sendOk(c, summary);
  } catch (error) {
    return sendError(c, error);
  }
});

app.get("/roles/:chain", async (c) => {
  try {
    const { chain } = c.req.param();
    const summary = await roles(db, chain);
    return sendOk(c, summary);
  } catch (error) {
    return sendError(c, error);
  }
});

app.use("/sql/*", client({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

export default app;
