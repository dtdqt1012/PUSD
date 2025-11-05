import PUSDTokenABI from '../abis/PUSDToken.json';
import MintingVaultABI from '../abis/MintingVault.json';
import StakingPoolABI from '../abis/StakingPool.json';
import OraclePriceFeedABI from '../abis/OraclePriceFeed.json';
import SwapPoolABI from '../abis/SwapPool.json';
import RewardDistributorABI from '../abis/RewardDistributor.json';

export const CONTRACT_ADDRESSES = {
  oracle: '0x2af4468A497Faed609be0e0c56b76d364a158A75',
  pusdToken: '0x182cD2Ea5FA4951C05bC8De8d76FC0977AB75187',
  stakingPool: '0xc3C649382df3518d87b6Dec9F9CD8AfD75a2Bd51',
  mintingVault: '0x088C71041BA47a5A5cf450C55f5E9e53F78d7724',
  rewardDistributor: '0x523fF773a1c45a8A66eB75021dD90DeB7220aAFB',
  swapPool: '0xFcaC7F8B1008a69e25345ECC7EaeFc7E891d9b1F',
};

export const NETWORK_CONFIG = {
  chainId: 137, // Polygon
  rpcUrl: 'https://polygon-rpc.com',
};

export const CONTRACTS = {
  PUSDToken: {
    address: CONTRACT_ADDRESSES.pusdToken,
    abi: PUSDTokenABI,
  },
  MintingVault: {
    address: CONTRACT_ADDRESSES.mintingVault,
    abi: MintingVaultABI,
  },
  StakingPool: {
    address: CONTRACT_ADDRESSES.stakingPool,
    abi: StakingPoolABI,
  },
  OraclePriceFeed: {
    address: CONTRACT_ADDRESSES.oracle,
    abi: OraclePriceFeedABI,
  },
  SwapPool: {
    address: CONTRACT_ADDRESSES.swapPool,
    abi: SwapPoolABI,
  },
  RewardDistributor: {
    address: CONTRACT_ADDRESSES.rewardDistributor,
    abi: RewardDistributorABI,
  },
};

