/**
 * Example configuration file for PGOLD integration
 * Copy this file and update with your contract addresses
 */

import PGOLDTokenABI from '../abis/PGOLDToken.json';
import PGOLDVaultABI from '../abis/PGOLDVault.json';
import GoldOracleABI from '../abis/GoldOracle.json';
import PUSDTokenABI from '../abis/PUSDToken.json';

// Update these addresses for your deployment
export const PGOLD_CONFIG = {
  network: {
    chainId: 137, // Polygon Mainnet
    name: 'Polygon',
  },
  contracts: {
    PGOLDToken: {
      address: '0xf24418259AbA83D59a86343bfAd50dd5De71F850', // Update this
      abi: PGOLDTokenABI,
    },
    PGOLDVault: {
      address: '0xA2d090dE61bAa666430E2C197C06e5139226B2D2', // Update this
      abi: PGOLDVaultABI,
    },
    GoldOracle: {
      address: '0x099aC141F32460a194Dc0b613DA23c9b95A19Cc9', // Update this
      abi: GoldOracleABI,
    },
    PUSDToken: {
      address: '0x182cD2Ea5FA4951C05bC8De8d76FC0977AB75187', // Update this
      abi: PUSDTokenABI,
    },
  },
  rpc: {
    urls: [
      'https://polygon-rpc.com',
      'https://rpc.ankr.com/polygon',
      'https://polygon.llamarpc.com',
    ],
  },
};

