import { RAY, rayDiv } from "./math";

export const MAX_HEALTH_FACTOR = 10_000n * RAY;

export type CollateralSnapshot = {
  usdRay: bigint;
};

export type DebtSnapshot = {
  usdRay: bigint;
};

export const computeHealthFactor = (
  collaterals: CollateralSnapshot[],
  debts: DebtSnapshot[],
): bigint => {
  const numerator = collaterals.reduce((acc, collateral) => acc + collateral.usdRay, 0n);

  const denominator = debts.reduce((acc, debt) => acc + debt.usdRay, 0n);

  if (denominator === 0n) {
    return MAX_HEALTH_FACTOR;
  }

  return rayDiv(numerator, denominator);
};
