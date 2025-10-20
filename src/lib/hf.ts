import { RAY, rayDiv } from "./math";

const HUNDRED_PERCENT_BPS = 10_000n;
export const MAX_HEALTH_FACTOR = 10_000n * RAY;

export type CollateralSnapshot = {
  usdRay: bigint;
  collateralFactorBps: number;
};

export type DebtSnapshot = {
  usdRay: bigint;
};

export const computeHealthFactor = (
  collaterals: CollateralSnapshot[],
  debts: DebtSnapshot[],
): bigint => {
  const numerator = collaterals.reduce((acc, collateral) => {
    const factor = BigInt(collateral.collateralFactorBps);
    return acc + (collateral.usdRay * factor) / HUNDRED_PERCENT_BPS;
  }, 0n);

  const denominator = debts.reduce((acc, debt) => acc + debt.usdRay, 0n);

  if (denominator === 0n) {
    return MAX_HEALTH_FACTOR;
  }

  return rayDiv(numerator, denominator);
};
