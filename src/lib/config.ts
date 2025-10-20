import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type TokenConfig = {
  symbol: string;
  address: `0x${string}`;
  startBlock?: number;
  decimals: number;
  collateralFactorBps: number;
  oracle?: `0x${string}`;
  oracleStartBlock?: number;
};

export type ChainContractsConfig = {
  lendingPool: { address: `0x${string}`; startBlock?: number };
  oAppBorrow: { address: `0x${string}`; startBlock?: number };
  tokenDataStream?: { address: `0x${string}`; startBlock?: number };
  router?: { address: `0x${string}`; startBlock?: number };
  isHealthy?: { address: `0x${string}`; startBlock?: number };
  proxy?: { address: `0x${string}`; startBlock?: number };
  tokens: TokenConfig[];
};

export type InterestModelConfig = {
  borrowBaseRateBps: number;
  borrowSlopeRateBps: number;
  reserveFactorBps?: number;
  compoundsPerYear?: number;
};

export type ChainConfig = {
  name: string;
  chainId: number;
  rpcUrlEnvVar: string;
  contracts: ChainContractsConfig;
  interestModel?: InterestModelConfig;
};

export type LendingConfig = {
  startBlockOffset?: number;
  chains: ChainConfig[];
};

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const configPath = resolve(projectRoot, "config.lending.json");

export const lendingConfig: LendingConfig = JSON.parse(
  readFileSync(configPath, "utf-8"),
);

export const tokenLookup = new Map<string, { chain: ChainConfig; token: TokenConfig }>();
export const lendingPoolLookup = new Map<string, { chain: ChainConfig }>();
export const oAppLookup = new Map<string, { chain: ChainConfig }>();
export const interestModelLookup = new Map<number, InterestModelConfig>();
export const tokenDataStreamLookup = new Map<number, { chain: ChainConfig; address: `0x${string}` }>();
export const routerLookup = new Map<number, { chain: ChainConfig; address: `0x${string}` }>();
export const isHealthyLookup = new Map<number, { chain: ChainConfig; address: `0x${string}` }>();
export const proxyLookup = new Map<number, { chain: ChainConfig; address: `0x${string}` }>();

for (const chain of lendingConfig.chains) {
  lendingPoolLookup.set(chain.contracts.lendingPool.address.toLowerCase(), { chain });
  oAppLookup.set(chain.contracts.oAppBorrow.address.toLowerCase(), { chain });

  if (chain.contracts.tokenDataStream) {
    tokenDataStreamLookup.set(chain.chainId, {
      chain,
      address: chain.contracts.tokenDataStream.address,
    });
  }

  if (chain.contracts.router) {
    routerLookup.set(chain.chainId, {
      chain,
      address: chain.contracts.router.address,
    });
  }

  if (chain.contracts.isHealthy) {
    isHealthyLookup.set(chain.chainId, {
      chain,
      address: chain.contracts.isHealthy.address,
    });
  }

  if (chain.contracts.proxy) {
    proxyLookup.set(chain.chainId, {
      chain,
      address: chain.contracts.proxy.address,
    });
  }

  if (chain.interestModel) {
    interestModelLookup.set(chain.chainId, chain.interestModel);
  }

  for (const token of chain.contracts.tokens) {
    tokenLookup.set(token.address.toLowerCase(), { chain, token });
  }
}

export const findTokenConfig = (address: string) => {
  return tokenLookup.get(address.toLowerCase());
};

export const findChainById = (chainId: number) => {
  return lendingConfig.chains.find((chain) => chain.chainId === chainId);
};

export const findChainByName = (name: string) => {
  return lendingConfig.chains.find((chain) => chain.name === name);
};
