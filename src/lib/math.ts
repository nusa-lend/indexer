const WAD = 10n ** 18n;
export const RAY = 10n ** 27n;

export const ZERO = 0n;

export const pow10 = (decimals: number): bigint => {
  if (decimals < 0) {
    throw new Error(`Invalid decimals: ${decimals}`);
  }
  return 10n ** BigInt(decimals);
};

export const toRay = (value: bigint | number): bigint => {
  return BigInt(value);
};

export const rayMul = (a: bigint, b: bigint): bigint => {
  return (a * b + RAY / 2n) / RAY;
};

export const rayDiv = (a: bigint, b: bigint): bigint => {
  if (b === ZERO) {
    return ZERO;
  }
  return (a * RAY + b / 2n) / b;
};

export const toUsdRay = (amount: bigint, priceRay: bigint, decimals: number): bigint => {
  if (amount === ZERO || priceRay === ZERO) {
    return ZERO;
  }
  const scale = pow10(decimals);
  return (amount * priceRay + scale / 2n) / scale;
};

export const wadToRay = (wad: bigint): bigint => {
  return (wad * RAY + WAD / 2n) / WAD;
};

export const ratioRay = (numerator: bigint, denominator: bigint): bigint => {
  if (denominator === ZERO) {
    return ZERO;
  }
  return (numerator * RAY + denominator / 2n) / denominator;
};

export const bigintAbs = (value: bigint): bigint => {
  return value < ZERO ? -value : value;
};

/**
 * Returns an ISO date string (yyyy-mm-dd) bucket for the provided timestamp in seconds.
 */
export const dayBucket = (timestampSeconds: number | bigint): string => {
  const seconds = Number(timestampSeconds);
  const millis = seconds * 1000;
  return new Date(millis).toISOString().slice(0, 10);
};

export const sumBigInt = (values: Iterable<bigint>): bigint => {
  let acc = ZERO;
  for (const value of values) {
    acc += value;
  }
  return acc;
};

export const clampToZero = (value: bigint): bigint => {
  return value < ZERO ? ZERO : value;
};
