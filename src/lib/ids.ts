export const normalizeAddress = (address: string): string => address.toLowerCase();

export const chainKey = (chainId: number | string): string => String(chainId);

export const tokenId = (chainId: number | string, address: string): string => {
  return `${chainKey(chainId)}:${normalizeAddress(address)}`;
};

export const marketId = (chainId: number | string, tokenAddress: string): string => {
  return `market:${tokenId(chainId, tokenAddress)}`;
};

export const positionId = (chainId: number | string, account: string): string => {
  return `position:${chainKey(chainId)}:${normalizeAddress(account)}`;
};

export const positionCollateralId = (position: string, token: string): string => {
  return `collateral:${position}:${token}`;
};

export const positionDebtId = (
  position: string,
  token: string,
  dstChainId?: number | string
): string => {
  return dstChainId === undefined
    ? `debt:${position}:${token}`
    : `debt:${position}:${token}:${chainKey(dstChainId)}`;
};

export const liquidityPositionId = (
  chainId: number | string,
  account: string,
  tokenAddress: string
): string => {
  return `liquidity:${chainKey(chainId)}:${normalizeAddress(account)}:${normalizeAddress(tokenAddress)}`;
};

export const oraclePriceId = (chainId: number | string, token: string): string => {
  return `price:${tokenId(chainId, token)}`;
};

export const liquidationId = (
  chainId: number | string,
  txHash: string,
  logIndex: number
): string => {
  return `liq:${chainKey(chainId)}:${txHash.toLowerCase()}:${logIndex}`;
};

export const crossChainMessageId = (
  srcChainId: number | string,
  nonce: bigint,
  payloadHash: string
): string => {
  return `msg:${chainKey(srcChainId)}:${nonce.toString()}:${payloadHash.toLowerCase()}`;
};

export const protocolStatsDailyId = (
  chainId: number | string,
  day: string
): string => {
  return `daily:${chainKey(chainId)}:${day}`;
};

export const splitTokenId = (id: string) => {
  const [chain, address] = id.split(":");
  if (!chain || !address) {
    throw new Error(`Invalid token id: ${id}`);
  }
  return { chain, address };
};
