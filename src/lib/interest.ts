import type { Abi } from "viem";
import type { PublicClient } from "viem";

import LendingPoolAbi from "../../abi/LendingPool.json" assert { type: "json" };
import { interestModelLookup, lendingConfig, type InterestModelConfig } from "./config";

const onchainInterestModels = new Map<number, InterestModelConfig>();
const attemptedChains = new Set<number>();

const FUNCTION_MAP: Array<[keyof InterestModelConfig, string]> = [
  ["baseRateBps", "baseRate"],
  ["optimalUtilizationBps", "optimalUtilization"],
  ["rateAtOptimalBps", "rateAtOptimal"],
  ["maxRateBps", "maxRate"],
  ["reserveFactorBps", "reserveFactor"],
];

const normalizeBps = (value: bigint): number => {
  if (value === 0n) return 0;
  if (value <= 100_000n) return Number(value);
  // Many contracts scale percentages by 1e2; fallback to dividing by 100.
  return Number(value / 100n);
};

const fetchInterestModelFromChain = async (
  chainId: number,
  publicClient: PublicClient,
): Promise<InterestModelConfig | undefined> => {
  const chainMeta = lendingConfig.chains.find((chain) => chain.chainId === chainId);
  if (!chainMeta) return undefined;

  const lendingPoolAddress = chainMeta.contracts.lendingPool.address as `0x${string}`;
  const abi = LendingPoolAbi as Abi;

  const partial: Partial<InterestModelConfig> = {};
  let success = false;

  for (const [key, functionName] of FUNCTION_MAP) {
    try {
      const result = await publicClient.readContract({
        abi,
        address: lendingPoolAddress,
        functionName: functionName as never,
      });
      if (typeof result === "bigint") {
        partial[key] = normalizeBps(result);
        success = true;
      }
    } catch (error) {
      // ignore missing function errors; we'll fall back to config values
    }
  }

  if (!success) {
    return undefined;
  }

  const fallback = interestModelLookup.get(chainId);
  const resolved: InterestModelConfig = {
    baseRateBps: partial.baseRateBps ?? fallback?.baseRateBps ?? 0,
    optimalUtilizationBps: partial.optimalUtilizationBps ?? fallback?.optimalUtilizationBps ?? 0,
    rateAtOptimalBps: partial.rateAtOptimalBps ?? fallback?.rateAtOptimalBps ?? 0,
    maxRateBps: partial.maxRateBps ?? fallback?.maxRateBps ?? 0,
    reserveFactorBps: partial.reserveFactorBps ?? fallback?.reserveFactorBps ?? 0,
    compoundsPerYear: fallback?.compoundsPerYear ?? 365,
  };

  interestModelLookup.set(chainId, resolved);
  onchainInterestModels.set(chainId, resolved);
  return resolved;
};

export const ensureInterestModel = async (
  chainId: number,
  publicClient?: PublicClient,
): Promise<InterestModelConfig | undefined> => {
  if (publicClient && !onchainInterestModels.has(chainId)) {
    if (!attemptedChains.has(chainId)) {
      attemptedChains.add(chainId);
      try {
        await fetchInterestModelFromChain(chainId, publicClient);
      } catch (error) {
        // Swallow errors; we'll continue using the configured values.
      }
    }
  }

  return interestModelLookup.get(chainId);
};
