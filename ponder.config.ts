import { createConfig, loadBalance } from "ponder";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Abi } from "abitype";
import type { Transport } from "viem";
import { http } from "viem";

import ERC20 from "./abi/ERC20.json" assert { type: "json" };
import LendingPool from "./abi/LendingPool.json" assert { type: "json" };
import OAppBorrow from "./abi/OAppBorrow.json" assert { type: "json" };

type LendingConfig = {
  startBlockOffset?: number;
  chains: Array<{
    name: string;
    chainId: number;
    rpcUrlEnvVar: string;
    contracts: {
      tokenDataStream?: { address: string; startBlock?: number };
      router?: { address: string; startBlock?: number };
      isHealthy?: { address: string; startBlock?: number };
      proxy?: { address: string; startBlock?: number };
      lendingPool: { address: string; startBlock?: number };
      oAppBorrow: { address: string; startBlock?: number };
      tokens: Array<{
        symbol: string;
        address: string;
        startBlock?: number;
        decimals: number;
        collateralFactorBps: number;
        oracle?: string;
        oracleStartBlock?: number;
      }>;
    };
  }>;
};

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const configPath = resolve(projectRoot, "config.lending.json");
const parsed: LendingConfig = JSON.parse(readFileSync(configPath, "utf-8"));

const offset = parsed.startBlockOffset ?? 0;
const chains: Record<string, { id: number; rpc: Transport; ws?: string }> = {};
const contracts: Record<
  string,
  {
    abi: Abi;
    address: `0x${string}`;
    chain: string;
    startBlock?: number;
  }
> = {};

const toHttpUrl = (url: string) => {
  if (url.startsWith("wss://")) return `https://${url.slice("wss://".length)}`;
  if (url.startsWith("ws://")) return `http://${url.slice("ws://".length)}`;
  return url;
};

const buildRpcTransport = (envVar: string, chainName: string) => {
  const keys = [envVar, `${envVar}_2`, `${envVar}_3`];
  const urls = keys
    .map((key) => process.env[key])
    .filter((value): value is string => !!value && value.length > 0);

  if (urls.length === 0) {
    throw new Error(`Missing RPC URL for ${chainName}. Set ${envVar} in the environment.`);
  }

  const transports = urls.map((url) => http(toHttpUrl(url)));
  const rpcTransport = transports.length === 1 ? transports[0]! : loadBalance(transports);
  const wsUrl = urls.find((url) => url.startsWith("ws"));

  return { rpcTransport, wsUrl };
};

for (const chain of parsed.chains) {
  const { rpcTransport, wsUrl } = buildRpcTransport(chain.rpcUrlEnvVar, chain.name);

  chains[chain.name] = {
    id: chain.chainId,
    rpc: rpcTransport,
    ...(wsUrl ? { ws: wsUrl } : {}),
  };

  const adjustStartBlock = (startBlock?: number) => {
    if (startBlock === undefined) return undefined;
    const adjusted = startBlock - offset;
    return adjusted > 0 ? adjusted : 0;
  };

  contracts[`LendingPool_${chain.name}`] = {
    abi: LendingPool as Abi,
    address: chain.contracts.lendingPool.address as `0x${string}`,
    chain: chain.name,
    startBlock: adjustStartBlock(chain.contracts.lendingPool.startBlock),
  };

  contracts[`OAppBorrow_${chain.name}`] = {
    abi: OAppBorrow as Abi,
    address: chain.contracts.oAppBorrow.address as `0x${string}`,
    chain: chain.name,
    startBlock: adjustStartBlock(chain.contracts.oAppBorrow.startBlock),
  };

  for (const token of chain.contracts.tokens) {
    contracts[`Token_${chain.name}_${token.symbol}`] = {
      abi: ERC20 as Abi,
      address: token.address as `0x${string}`,
      chain: chain.name,
      startBlock: adjustStartBlock(token.startBlock),
    };
  }
}

const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.DATABASE_PRIVATE_URL ??
  process.env.POSTGRES_URL ??
  process.env.POSTGRES_CONNECTION_STRING;

if (!databaseUrl) {
  throw new Error(
    "Missing DATABASE_URL environment variable. Add it to your .env file to connect Ponder to PostgreSQL."
  );
}

export default createConfig({
  database: {
    kind: "postgres",
    connectionString: databaseUrl,
  },
  chains,
  contracts,
});
