import PUSDTokenABI from '../abis/PUSDToken.json';
import MintingVaultABI from '../abis/MintingVault.json';
import StakingPoolABI from '../abis/StakingPool.json';
import OraclePriceFeedABI from '../abis/OraclePriceFeed.json';
import SwapPoolABI from '../abis/SwapPool.json';
import RewardDistributorABI from '../abis/RewardDistributor.json';
import PGOLDTokenABI from '../abis/PGOLDToken.json';
import PGOLDVaultABI from '../abis/PGOLDVault.json';
import GoldOracleABI from '../abis/GoldOracle.json';

export const CONTRACT_ADDRESSES = {
  oracle: '0x2af4468A497Faed609be0e0c56b76d364a158A75',
  pusdToken: '0x182cD2Ea5FA4951C05bC8De8d76FC0977AB75187',
  stakingPool: '0xc3C649382df3518d87b6Dec9F9CD8AfD75a2Bd51',
  mintingVault: '0x088C71041BA47a5A5cf450C55f5E9e53F78d7724',
  rewardDistributor: '0x523fF773a1c45a8A66eB75021dD90DeB7220aAFB',
  swapPool: '0xFcaC7F8B1008a69e25345ECC7EaeFc7E891d9b1F',
  // PGOLD Contracts
  goldOracle: '0x099aC141F32460a194Dc0b613DA23c9b95A19Cc9',
  pgoldToken: '0xf24418259AbA83D59a86343bfAd50dd5De71F850',
  pgoldVault: '0xA2d090dE61bAa666430E2C197C06e5139226B2D2',
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
  // PGOLD Contracts
  PGOLDToken: {
    address: CONTRACT_ADDRESSES.pgoldToken,
    abi: PGOLDTokenABI,
  },
  PGOLDVault: {
    address: CONTRACT_ADDRESSES.pgoldVault,
    abi: PGOLDVaultABI,
  },
  GoldOracle: {
    address: CONTRACT_ADDRESSES.goldOracle,
    abi: GoldOracleABI,
  },
};

