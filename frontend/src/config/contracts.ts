import PUSDTokenABI from '../abis/PUSDToken.json';
import MintingVaultABI from '../abis/MintingVault.json';
import StakingPoolABI from '../abis/StakingPool.json';
import OraclePriceFeedABI from '../abis/OraclePriceFeed.json';
import SwapPoolABI from '../abis/SwapPool.json';
import RewardDistributorABI from '../abis/RewardDistributor.json';
import PGOLDTokenABI from '../abis/PGOLDToken.json';
import PGOLDVaultABI from '../abis/PGOLDVault.json';
import GoldOracleABI from '../abis/GoldOracle.json';
import TokenFactoryABI from '../abis/TokenFactory.json';
import PFUNLaunchpadABI from '../abis/PFUNLaunchpad.json';
import PFUNBondingCurveABI from '../abis/PFUNBondingCurve.json';
import PFUNCollateralLockABI from '../abis/PFUNCollateralLock.json';

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
  // PFUN Contracts (v4 - 2000 chars logo limit, data URL support)
  tokenFactory: '0x7FA374FD18F14f27Dbd389631795669Bb1b7dde6',
  pfunLaunchpad: '0xdb5f5b4d3ce38247692DbC11640Df9633E789406',
  pfunBondingCurve: '0x9441D35C5a5987622E51e6d1179FB48327Aa05a6',
  pfunCollateralLock: '0xC14Cf34dbe04D0e825EBEe34508a4938CD6b325E',
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
  // PFUN Contracts
  TokenFactory: {
    address: CONTRACT_ADDRESSES.tokenFactory,
    abi: TokenFactoryABI,
  },
  PFUNLaunchpad: {
    address: CONTRACT_ADDRESSES.pfunLaunchpad,
    abi: PFUNLaunchpadABI,
  },
  PFUNBondingCurve: {
    address: CONTRACT_ADDRESSES.pfunBondingCurve,
    abi: PFUNBondingCurveABI,
  },
  PFUNCollateralLock: {
    address: CONTRACT_ADDRESSES.pfunCollateralLock,
    abi: PFUNCollateralLockABI,
  },
};

