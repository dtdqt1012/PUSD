import PUSDTokenABI from '../abis/PUSDToken.json';
import MintingVaultABI from '../abis/MintingVault.json';
import StakingPoolABI from '../abis/StakingPool.json';
import LockToEarnPoolABI from '../abis/LockToEarnPool.json';
import OraclePriceFeedABI from '../abis/OraclePriceFeed.json';
import SwapPoolABI from '../abis/SwapPool.json';
import RewardDistributorABI from '../abis/RewardDistributor.json';
import EcosystemTrackerABI from '../abis/EcosystemTracker.json';
import PGOLDTokenABI from '../abis/PGOLDToken.json';
import PGOLDVaultABI from '../abis/PGOLDVault.json';
import GoldOracleABI from '../abis/GoldOracle.json';
import TokenFactoryABI from '../abis/TokenFactory.json';
import PFUNLaunchpadABI from '../abis/PFUNLaunchpad.json';
import PFUNBondingCurveABI from '../abis/PFUNBondingCurve.json';
import PFUNCollateralLockABI from '../abis/PFUNCollateralLock.json';
import PUSDLotteryABI from '../abis/PUSDLottery.json';
import POGNFTABI from '../abis/POGNFT.json';
import DailyCheckInABI from '../abis/DailyCheckIn.json';
import ExtensionRegistryABI from '../abis/ExtensionRegistry.json';

// Mainnet contract addresses (to be filled after deployment)
export const CONTRACT_ADDRESSES_MAINNET = {
  oracle: '0x89c3a9E796dDdB0880bd1d0AC2293340D761AFA0', // TODO: Deploy and update
  pusdToken: '0xCDaAf6f8c59962c7807c62175E21487CB640d3b8', // TODO: Deploy and update
  stakingPool: '0x62097798b95748d315adb423ff58dae11b3c5E52',
  lockToEarnPool: '0x62097798b95748d315adb423ff58dae11b3c5E52',
  mintingVault: '0x0c164be11d68F766207735BbCE7B02878b04d21E',
  rewardDistributor: '0xFeAE0806312D665e92EdA94577EfD4F8C6658b11',
  swapPool: '0xb73e3b7D286f53b5b73A1f44794Ee39Bfb9cb123',
  ecosystemTracker: '0x0Cf5663b5081f3285de2D290BF320e9Fdcf3E02a',
  goldOracle: '0xda4dA4ADfb68f056088025Abb10e8581403e9FC8',
  pgoldToken: '0x4E32c82639182637628274fe9Ba0f9a4eA8c21B0',
  pgoldVault: '0x3a826fbc0BeBf7A91a49A69c771063291681C54D',
  tokenFactory: '0x3eeFC8b531D88c362e9aeeaC59075115eD53a147',
  pfunLaunchpad: '0xe90DE9869191089bb5314eF81170685A01908fB5',
  pfunBondingCurve: '0xa59FE7dE82c874CAaB64bA71b606070Ddd9BfCAF',
  pfunCollateralLock: '0x06AB7Aa8ACec2eF026FEdd244C0aBB415C134a37',
  pusdLottery: '0xCCc95e7279813Ee1e4073e39280171C44C12431B',
  pogNFT: '0x21C0114F2264909380d1f9aE5De9F34bcA7a8CbB',
  dailyCheckIn: '0xC151069A5E43095b166DD15fa0F09E9a720FFe61',
  extensionRegistry: '0x31d69fCBE90B5B3F3A13167c97A878E5097Cd6f0',
};

export const NETWORK_CONFIG_MAINNET = {
  chainId: 137, // Polygon Mainnet
  rpcUrl: 'https://polygon-rpc.com', // Official Polygon RPC
};

export const CONTRACTS_MAINNET = {
  PUSDToken: {
    address: CONTRACT_ADDRESSES_MAINNET.pusdToken,
    abi: PUSDTokenABI,
  },
  MintingVault: {
    address: CONTRACT_ADDRESSES_MAINNET.mintingVault,
    abi: MintingVaultABI,
  },
  StakingPool: {
    address: CONTRACT_ADDRESSES_MAINNET.stakingPool,
    abi: StakingPoolABI,
  },
  LockToEarnPool: {
    address: CONTRACT_ADDRESSES_MAINNET.lockToEarnPool,
    abi: LockToEarnPoolABI,
  },
  OraclePriceFeed: {
    address: CONTRACT_ADDRESSES_MAINNET.oracle,
    abi: OraclePriceFeedABI,
  },
  SwapPool: {
    address: CONTRACT_ADDRESSES_MAINNET.swapPool,
    abi: SwapPoolABI,
  },
  RewardDistributor: {
    address: CONTRACT_ADDRESSES_MAINNET.rewardDistributor,
    abi: RewardDistributorABI,
  },
  EcosystemTracker: {
    address: CONTRACT_ADDRESSES_MAINNET.ecosystemTracker,
    abi: EcosystemTrackerABI,
  },
  PGOLDToken: {
    address: CONTRACT_ADDRESSES_MAINNET.pgoldToken,
    abi: PGOLDTokenABI,
  },
  PGOLDVault: {
    address: CONTRACT_ADDRESSES_MAINNET.pgoldVault,
    abi: PGOLDVaultABI,
  },
  GoldOracle: {
    address: CONTRACT_ADDRESSES_MAINNET.goldOracle,
    abi: GoldOracleABI,
  },
  TokenFactory: {
    address: CONTRACT_ADDRESSES_MAINNET.tokenFactory,
    abi: TokenFactoryABI,
  },
  PFUNLaunchpad: {
    address: CONTRACT_ADDRESSES_MAINNET.pfunLaunchpad,
    abi: PFUNLaunchpadABI,
  },
  PFUNBondingCurve: {
    address: CONTRACT_ADDRESSES_MAINNET.pfunBondingCurve,
    abi: PFUNBondingCurveABI,
  },
  PFUNCollateralLock: {
    address: CONTRACT_ADDRESSES_MAINNET.pfunCollateralLock,
    abi: PFUNCollateralLockABI,
  },
  PUSDLottery: {
    address: CONTRACT_ADDRESSES_MAINNET.pusdLottery,
    abi: PUSDLotteryABI,
  },
  POGNFT: {
    address: CONTRACT_ADDRESSES_MAINNET.pogNFT,
    abi: POGNFTABI,
  },
  DailyCheckIn: {
    address: CONTRACT_ADDRESSES_MAINNET.dailyCheckIn,
    abi: DailyCheckInABI,
  },
  ExtensionRegistry: {
    address: CONTRACT_ADDRESSES_MAINNET.extensionRegistry,
    abi: ExtensionRegistryABI,
  },
};

