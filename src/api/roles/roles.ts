import type { ReadonlyDrizzle } from "ponder";
import schema from "ponder:schema";

import { textToBigint } from "../../lib/math";

type Database = ReadonlyDrizzle<typeof schema>;

type PositionSnapshot = {
  chainId: string;
  account: `0x${string}`;
  status: string;
  collateralUsdRay: string;
  debtUsdRay: string;
  updatedAtTimestamp: bigint;
};

type RoleEntry = Omit<PositionSnapshot, "chainId">;

export type RoleSummary = {
  chainId: string;
  totals: {
    lenders: number;
    borrowers: number;
  };
  lenders: RoleEntry[];
  borrowers: RoleEntry[];
};

type RoleAccumulator = {
  chainId: string;
  totals: RoleSummary["totals"];
  lenders: RoleEntry[];
  borrowers: RoleEntry[];
};

const MAX_ROLE_ENTRIES = 25;

const sortBigIntDesc = (left: string, right: string) => {
  const leftBig = textToBigint(left);
  const rightBig = textToBigint(right);
  if (leftBig === rightBig) return 0;
  return leftBig > rightBig ? -1 : 1;
};

const finalize = ({ chainId, totals, lenders, borrowers }: RoleAccumulator): RoleSummary => ({
  chainId,
  totals,
  lenders: [...lenders]
    .sort((a, b) => sortBigIntDesc(a.collateralUsdRay, b.collateralUsdRay))
    .slice(0, MAX_ROLE_ENTRIES),
  borrowers: [...borrowers]
    .sort((a, b) => sortBigIntDesc(a.debtUsdRay, b.debtUsdRay))
    .slice(0, MAX_ROLE_ENTRIES),
});

const isActiveLender = (position: PositionSnapshot) => textToBigint(position.collateralUsdRay) > 0n;
const isActiveBorrower = (position: PositionSnapshot) => textToBigint(position.debtUsdRay) > 0n;

export const roles = async (database: Database, chain?: string) => {
  const queryResult = await database.query.positions.findMany({
    columns: {
      chainId: true,
      account: true,
      status: true,
      collateralUsdRay: true,
      debtUsdRay: true,
      updatedAtTimestamp: true,
    },
    where: chain ? (table, { eq }) => eq(table.chainId, chain) : undefined,
    orderBy: (table, { desc }) => desc(table.updatedAtTimestamp),
    limit: chain ? 250 : 500,
  });
  const rows: PositionSnapshot[] = queryResult.map((row) => ({
    chainId: row.chainId,
    account: row.account,
    status: row.status,
    collateralUsdRay: row.collateralUsdRay,
    debtUsdRay: row.debtUsdRay,
    updatedAtTimestamp: row.updatedAtTimestamp,
  }));

  const buckets = new Map<string, RoleAccumulator>();

  for (const row of rows) {
    let bucket = buckets.get(row.chainId);
    if (bucket === undefined) {
      bucket = {
        chainId: row.chainId,
        totals: { lenders: 0, borrowers: 0 },
        lenders: [],
        borrowers: [],
      };
      buckets.set(row.chainId, bucket);
    }

    if (isActiveLender(row)) {
      bucket.lenders.push({
        account: row.account,
        status: row.status,
        collateralUsdRay: row.collateralUsdRay,
        debtUsdRay: row.debtUsdRay,
        updatedAtTimestamp: row.updatedAtTimestamp,
      });
      bucket.totals.lenders += 1;
    }

    if (isActiveBorrower(row)) {
      bucket.borrowers.push({
        account: row.account,
        status: row.status,
        collateralUsdRay: row.collateralUsdRay,
        debtUsdRay: row.debtUsdRay,
        updatedAtTimestamp: row.updatedAtTimestamp,
      });
      bucket.totals.borrowers += 1;
    }

  }

  if (chain) {
    const summary = buckets.get(chain);
    return summary
      ? finalize(summary)
      : {
          chainId: chain,
          totals: { lenders: 0, borrowers: 0 },
          lenders: [],
          borrowers: [],
        };
  }

  return Array.from(buckets.values(), finalize).sort((a, b) =>
    a.chainId.localeCompare(b.chainId),
  );
};
