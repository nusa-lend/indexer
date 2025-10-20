import type { Context } from "hono";
import { Hono } from "hono";
import { client, graphql } from "ponder";
import { db } from "ponder:api";
import schema from "ponder:schema";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { roles } from "./roles/roles.js";

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

    const [collaterals, debts] = await Promise.all([
      db.query.positionCollaterals.findMany({
        where: (table, { inArray }) => inArray(table.positionId, positionIds),
      }),
      db.query.positionDebts.findMany({
        where: (table, { inArray }) => inArray(table.positionId, positionIds),
      }),
    ]);

    const collateralsByPosition = new Map<string, typeof collaterals>();
    for (const collateral of collaterals) {
      const existing = collateralsByPosition.get(collateral.positionId);
      if (existing) {
        existing.push(collateral);
      } else {
        collateralsByPosition.set(collateral.positionId, [collateral]);
      }
    }

    const debtsByPosition = new Map<string, typeof debts>();
    for (const debt of debts) {
      const existing = debtsByPosition.get(debt.positionId);
      if (existing) {
        existing.push(debt);
      } else {
        debtsByPosition.set(debt.positionId, [debt]);
      }
    }

    const response = positions.map((position) => ({
      ...position,
      collaterals: collateralsByPosition.get(position.id) ?? [],
      debts: debtsByPosition.get(position.id) ?? [],
    }));

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
