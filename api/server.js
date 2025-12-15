import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { ethers } from 'ethers';
import NodeCache from 'node-cache';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Initialize __dirname first (before any functions that use it)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// Cache for API responses (90 minutes - longer cache to significantly reduce RPC calls)
// This is safe for read-only stats that don't need real-time updates
const cache = new NodeCache({ stdTTL: 5400, checkperiod: 600 });

// RPC endpoints - Official Polygon RPC endpoints
// Primary: polygon-rpc.com (Ankr - official partner, free tier: 1M requests/day)
// Fallbacks: Other official Polygon RPC endpoints
// Reference: https://docs.polygon.technology/pos/reference/rpc-endpoints/#mainnet
const RPC_ENDPOINTS = [
  'https://polygon-rpc.com', // Ankr (official partner) - Primary endpoint
  'https://rpc.ankr.com/polygon', // Ankr alternative endpoint
  'https://polygon.publicnode.com', // PublicNode (free, privacy-focused)
  'https://sparkling-alpha-aura.matic.quiknode.pro/0c230da08864fa623360b9833d2355f5c4dcccbe/', // QuickNode (paid, high performance)
];

// Load contract addresses from deployment file or env
function loadContractAddresses() {
  try {
    // Try to load from deployment file first
    const deploymentPath = join(__dirname, '..', 'deployments', 'polygon-mainnet-deployment.json');
    const deploymentInfo = JSON.parse(readFileSync(deploymentPath, 'utf8'));
    
    return {
      PUSDToken: process.env.PUSD_TOKEN_ADDRESS || deploymentInfo.contracts?.pusdToken || '0xCDaAf6f8c59962c7807c62175E21487CB640d3b8',
      PUSDLottery: process.env.PUSDLOTTERY_ADDRESS || deploymentInfo.contracts?.pusdLottery || '0xCCc95e7279813Ee1e4073e39280171C44C12431B',
      OraclePriceFeed: process.env.ORACLE_ADDRESS || deploymentInfo.contracts?.oracle || '0x89c3a9E796dDdB0880bd1d0AC2293340D761AFA0',
      MintingVault: process.env.MINTING_VAULT_ADDRESS || deploymentInfo.contracts?.mintingVault || '0x0c164be11d68F766207735BbCE7B02878b04d21E',
      StakingPool: process.env.STAKING_POOL_ADDRESS || deploymentInfo.contracts?.lockToEarnPool || '0x62097798b95748d315adb423ff58dae11b3c5E52',
      SwapPool: process.env.SWAP_POOL_ADDRESS || deploymentInfo.contracts?.swapPool || '0xb73e3b7D286f53b5b73A1f44794Ee39Bfb9cb123',
    };
  } catch (error) {
    console.warn('Could not load deployment file, using default addresses:', error.message);
    // Fallback to default addresses
    return {
      PUSDToken: process.env.PUSD_TOKEN_ADDRESS || '0xCDaAf6f8c59962c7807c62175E21487CB640d3b8',
      PUSDLottery: process.env.PUSDLOTTERY_ADDRESS || '0xCCc95e7279813Ee1e4073e39280171C44C12431B',
      OraclePriceFeed: process.env.ORACLE_ADDRESS || '0x89c3a9E796dDdB0880bd1d0AC2293340D761AFA0',
      MintingVault: process.env.MINTING_VAULT_ADDRESS || '0x0c164be11d68F766207735BbCE7B02878b04d21E',
      StakingPool: process.env.STAKING_POOL_ADDRESS || '0x62097798b95748d315adb423ff58dae11b3c5E52',
      SwapPool: process.env.SWAP_POOL_ADDRESS || '0xb73e3b7D286f53b5b73A1f44794Ee39Bfb9cb123',
    };
  }
}

const CONTRACTS = loadContractAddresses();

// Log contract addresses on startup
console.log('📋 Using contract addresses:');
console.log('  PUSDToken:', CONTRACTS.PUSDToken);
console.log('  PUSDLottery:', CONTRACTS.PUSDLottery);
console.log('  OraclePriceFeed:', CONTRACTS.OraclePriceFeed);
console.log('  MintingVault:', CONTRACTS.MintingVault);
console.log('  StakingPool:', CONTRACTS.StakingPool);
console.log('  SwapPool:', CONTRACTS.SwapPool);

// Verify PUSDLottery contract address
const EXPECTED_LOTTERY_ADDRESS = '0xCCc95e7279813Ee1e4073e39280171C44C12431B';
if (CONTRACTS.PUSDLottery.toLowerCase() !== EXPECTED_LOTTERY_ADDRESS.toLowerCase()) {
  console.warn(`⚠️  WARNING: PUSDLottery address mismatch!`);
  console.warn(`    Expected: ${EXPECTED_LOTTERY_ADDRESS}`);
  console.warn(`    Using:    ${CONTRACTS.PUSDLottery}`);
} else {
  console.log(`✅ PUSDLottery address verified: ${CONTRACTS.PUSDLottery}`);
}

// Load ABIs
function loadABI(contractName) {
  try {
    // Try artifacts first
    const abiPath = join(__dirname, '..', 'artifacts', 'contracts', `${contractName}.sol`, `${contractName}.json`);
    const artifact = JSON.parse(readFileSync(abiPath, 'utf8'));
    return artifact.abi;
  } catch (error) {
    // Fallback to frontend ABI
    try {
      const frontendAbiPath = join(__dirname, '..', 'frontend', 'src', 'abis', `${contractName}.json`);
      return JSON.parse(readFileSync(frontendAbiPath, 'utf8'));
    } catch (frontendError) {
      console.warn(`Could not load ABI for ${contractName}`);
      return [];
    }
  }
}

const pusdTokenABI = loadABI('PUSDToken');
const lotteryABI = loadABI('PUSDLottery');
const oracleABI = loadABI('OraclePriceFeed');
const vaultABI = loadABI('MintingVault');
const stakingABI = loadABI('LockToEarnPool'); // StakingPool uses LockToEarnPool
const swapABI = loadABI('SwapPool');

// Reuse provider instance for better performance
let providerInstance = null;

// Create provider with fallback and retry logic (reuse instance)
function createProvider() {
  if (!providerInstance) {
    providerInstance = new ethers.JsonRpcProvider(RPC_ENDPOINTS[0], 137, {
      staticNetwork: true,
    });
  }
  return providerInstance;
}

// Helper to call RPC with retry and rate limit handling
async function callWithRetry(fn, maxRetries = 3, delay = 1000) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const errorMsg = error?.message || error?.toString() || '';
      const isRateLimit = errorMsg.includes('rate limit') || errorMsg.includes('Too many requests') || errorMsg.includes('-32090') || errorMsg.includes('retry in');
      
      if (isRateLimit) {
        // Extract retry time from error message if available
        const retryMatch = errorMsg.match(/retry in (\d+)([ms])/i);
        let waitTime = delay * Math.pow(2, i); // Exponential backoff
        
        if (retryMatch) {
          const time = parseInt(retryMatch[1]);
          const unit = retryMatch[2].toLowerCase();
          waitTime = unit === 'm' ? time * 60000 : time * 1000; // Convert to ms
          waitTime = Math.min(waitTime, 600000); // Max 10 minutes
        }
        
        if (i < maxRetries - 1) {
          console.warn(`Rate limit detected, waiting ${waitTime/1000}s before retry ${i+1}/${maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      }
      
      // For non-rate-limit errors or last retry, throw
      if (i === maxRetries - 1) {
        throw error;
      }
      
      // Wait before retry for other errors
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
  throw lastError;
}

// Query events with pagination and rate limit handling
async function queryEventsWithPagination(contract, filter, fromBlock, toBlock, maxRange = 2000) {
  const totalRange = toBlock - fromBlock;
  
  // Helper to detect rate limit errors
  const isRateLimitError = (error) => {
    const errorMsg = error?.message || error?.toString() || '';
    return errorMsg.includes('rate limit') || 
           errorMsg.includes('Too many requests') || 
           errorMsg.includes('-32090') || 
           errorMsg.includes('retry in') ||
           errorMsg.includes('call rate limit exhausted');
  };
  
  // Helper to extract retry time from error
  const getRetryTime = (error) => {
    const errorMsg = error?.message || error?.toString() || '';
    const retryMatch = errorMsg.match(/retry in (\d+)([ms])/i);
    if (retryMatch) {
      const time = parseInt(retryMatch[1]);
      const unit = retryMatch[2].toLowerCase();
      return unit === 'm' ? time * 60000 : time * 1000; // Convert to ms
    }
    return null;
  };
  
  // Query single range with retry
  const queryRange = async (from, to, retries = 2) => {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await contract.queryFilter(filter, from, to);
      } catch (error) {
        if (isRateLimitError(error)) {
          const retryTime = getRetryTime(error);
          if (retryTime && retryTime > 60000) {
            // If retry time is > 1 minute, skip this range to avoid long waits
            console.warn(`⚠️  Rate limit: retry in ${retryTime/1000}s, skipping range ${from}-${to}`);
            return [];
          }
          
          // Wait before retry
          const waitTime = retryTime || (2000 * Math.pow(2, attempt));
          if (attempt < retries - 1) {
            console.warn(`⚠️  Rate limit detected, waiting ${waitTime/1000}s before retry...`);
            await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, 30000))); // Max 30s wait
            continue;
          } else {
            // Last attempt failed, return empty array
            console.warn(`⚠️  Rate limit: giving up on range ${from}-${to} after ${retries} attempts`);
            return [];
          }
        }
        
        if (error?.message?.includes('413') || error?.message?.includes('Content Too Large')) {
          // Split if too large
          const mid = Math.floor((from + to) / 2);
          const [left, right] = await Promise.all([
            queryRange(from, mid, retries),
            queryRange(mid + 1, to, retries)
          ]);
          return [...left, ...right];
        }
        
        // For other errors, throw if last attempt
        if (attempt === retries - 1) {
          throw error;
        }
        
        // Wait before retry for other errors
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
    return [];
  };
  
  if (totalRange <= maxRange) {
    return await queryRange(fromBlock, toBlock);
  }
  
  // Paginate with longer delays
  const allEvents = [];
  let batchFrom = fromBlock;
  let consecutiveRateLimits = 0;
  const maxConsecutiveRateLimits = 3;
  
  while (batchFrom < toBlock) {
    const batchTo = Math.min(batchFrom + maxRange, toBlock);
    
    try {
      const batchEvents = await queryRange(batchFrom, batchTo);
      allEvents.push(...batchEvents);
      batchFrom = batchTo + 1;
      consecutiveRateLimits = 0; // Reset on success
      
      // Longer delay between batches to avoid rate limits
      if (batchFrom < toBlock) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds between batches
      }
    } catch (error) {
      if (isRateLimitError(error)) {
        consecutiveRateLimits++;
        if (consecutiveRateLimits >= maxConsecutiveRateLimits) {
          console.warn(`⚠️  Too many consecutive rate limits (${consecutiveRateLimits}), stopping event query`);
          break;
        }
        
        const retryTime = getRetryTime(error);
        if (retryTime && retryTime > 60000) {
          console.warn(`⚠️  Rate limit: retry in ${retryTime/1000}s, stopping event query`);
          break;
        }
        
        // Wait before continuing
        const waitTime = retryTime || 5000;
        console.warn(`⚠️  Rate limit, waiting ${waitTime/1000}s before continuing...`);
        await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, 30000)));
      }
      
      batchFrom = batchTo + 1;
    }
  }
  
  return allEvents;
}

// Get TVL Chart Data
async function getTVLChart() {
  const cacheKey = 'tvl-chart';
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    const provider = createProvider();
    const oracleContract = new ethers.Contract(CONTRACTS.OraclePriceFeed, oracleABI, provider);
    const vaultContract = new ethers.Contract(CONTRACTS.MintingVault, vaultABI, provider);
    const stakingContract = new ethers.Contract(CONTRACTS.StakingPool, stakingABI, provider);
    const swapContract = new ethers.Contract(CONTRACTS.SwapPool, swapABI, provider);
    
    const currentBlock = await callWithRetry(() => provider.getBlockNumber());
    const currentBlockData = await callWithRetry(() => provider.getBlock(currentBlock));
    const now = Number(currentBlockData.timestamp);
    
    // Find deployment block (start from last 200k blocks)
    let deploymentBlock = Math.max(0, currentBlock - 200000);
    
    try {
      const lockEvents = await queryEventsWithPagination(
        stakingContract,
        stakingContract.filters.Locked(),
        0,
        currentBlock,
        10000
      ).catch(() => []);
      if (lockEvents.length > 0) {
        const earliestBlock = Math.min(...lockEvents.map(e => Number(e.blockNumber)));
        deploymentBlock = Math.max(0, earliestBlock - 50);
      }
    } catch (error) {
      console.warn('Could not find deployment block, using default:', error.message);
    }
    
    const deploymentBlockData = await callWithRetry(() => provider.getBlock(deploymentBlock));
    const deploymentTimestamp = Number(deploymentBlockData.timestamp);
    
    // Get current TVL (sequentially to avoid rate limits)
    const polPrice = await callWithRetry(() => oracleContract.getPOLPrice(), 2, 2000).catch(() => null);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const vaultPol = await callWithRetry(() => vaultContract.getBalance(), 2, 2000).catch(() => null);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const totalStaked = await callWithRetry(() => stakingContract.totalLocked(), 2, 2000).catch(() => null);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const swapPoolReserves = await callWithRetry(() => swapContract.getBalance(), 2, 2000).catch(() => null);
    
    // Calculate current TVL
    // POL price uses 8 decimals (Chainlink format), balances use 18 decimals
    let currentTVL = '0';
    if (polPrice && vaultPol !== null && totalStaked !== null && swapPoolReserves !== null) {
      const polPriceNum = parseFloat(ethers.formatUnits(polPrice, 8)); // POL price has 8 decimals
      const vaultPolNum = parseFloat(ethers.formatEther(vaultPol)); // Balance has 18 decimals
      const stakedNum = parseFloat(ethers.formatEther(totalStaked)); // Balance has 18 decimals
      const swapNum = parseFloat(ethers.formatEther(swapPoolReserves)); // Balance has 18 decimals
      const totalPol = vaultPolNum + stakedNum + swapNum;
      const tvl = totalPol * polPriceNum;
      currentTVL = tvl.toFixed(2); // Format to 2 decimal places
      
      // Debug logging
      console.log(`📊 TVL Calculation:`);
      console.log(`  POL Price: $${polPriceNum.toFixed(8)}`);
      console.log(`  Vault POL: ${vaultPolNum.toFixed(6)}`);
      console.log(`  Staked POL: ${stakedNum.toFixed(6)}`);
      console.log(`  Swap POL: ${swapNum.toFixed(6)}`);
      console.log(`  Total POL: ${totalPol.toFixed(6)}`);
      console.log(`  TVL: $${currentTVL}`);
    } else {
      console.warn('⚠️  Missing data for TVL calculation:', {
        polPrice: !!polPrice,
        vaultPol: vaultPol !== null,
        totalStaked: totalStaked !== null,
        swapPoolReserves: swapPoolReserves !== null,
      });
    }
    
    // Get historical data points
    const oneDayInSeconds = 86400;
    const blocksPerDay = Math.floor(oneDayInSeconds / 2); // ~2s per block
    const totalSeconds = now - deploymentTimestamp;
    const totalDays = Math.max(1, Math.ceil(totalSeconds / oneDayInSeconds));
    
    // Sample up to 5 points (minimal for fastest loading)
    const maxDataPoints = Math.min(totalDays + 1, 5);
    const step = Math.max(1, Math.floor((totalDays + 1) / maxDataPoints));
    
    const tvlDataPoints = [];
    const blocksToQuery = new Set();
    
    // Add deployment block and current block
    blocksToQuery.add(deploymentBlock);
    blocksToQuery.add(currentBlock);
    
    // Add daily samples (reduced frequency)
    for (let i = 1; i < maxDataPoints; i++) {
      const targetBlock = deploymentBlock + (i * step * blocksPerDay);
      if (targetBlock <= currentBlock) {
        blocksToQuery.add(targetBlock);
      }
    }
    
    // SKIP event queries entirely for fastest loading
    // Only use daily samples and current block
    // Events can be queried later via refresh endpoint if needed
    
    // Query TVL for each block with rate limiting (reduced queries)
    const sortedBlocks = Array.from(blocksToQuery).sort((a, b) => a - b);
    const tvlPoints = [];
    let rateLimitCount = 0;
    const maxRateLimitRetries = 2; // Reduced retries
    let consecutiveRateLimits = 0;
    const maxConsecutiveRateLimits = 3; // Stop after 3 consecutive rate limits
    
    console.log(`📊 Querying TVL for ${sortedBlocks.length} blocks...`);
    
    for (const blockNumber of sortedBlocks) {
      // Stop if too many consecutive rate limits
      if (consecutiveRateLimits >= maxConsecutiveRateLimits) {
        console.warn(`⚠️  Too many consecutive rate limits (${consecutiveRateLimits}), stopping TVL query`);
        break;
      }
      
      let retries = 0;
      let success = false;
      
      while (retries < maxRateLimitRetries && !success) {
        try {
          // Add delay if we've hit rate limits
          if (rateLimitCount > 0) {
            const backoffDelay = Math.min(30000, 5000 * Math.pow(2, rateLimitCount - 1)); // 5s, 10s, 20s... max 30s
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
          }
          
          const block = await callWithRetry(() => provider.getBlock(blockNumber), 2, 2000);
          
          // Query sequentially to avoid overwhelming RPC
          const historicalPolPrice = await callWithRetry(() => oracleContract.getPOLPrice({ blockTag: blockNumber }), 2, 2000).catch(() => null);
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2s delay between calls
          
          const historicalVaultPol = await callWithRetry(() => vaultContract.getBalance({ blockTag: blockNumber }), 2, 2000).catch(() => null);
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const historicalStaked = await callWithRetry(() => stakingContract.totalLocked({ blockTag: blockNumber }), 2, 2000).catch(() => null);
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const historicalSwap = await callWithRetry(() => swapContract.getBalance({ blockTag: blockNumber }), 2, 2000).catch(() => null);
          
          if (historicalPolPrice && historicalVaultPol !== null && historicalStaked !== null && historicalSwap !== null) {
            // POL price uses 8 decimals, balances use 18 decimals
            const polPriceNum = parseFloat(ethers.formatUnits(historicalPolPrice, 8)); // POL price has 8 decimals
            const vaultPolNum = parseFloat(ethers.formatEther(historicalVaultPol)); // Balance has 18 decimals
            const stakedNum = parseFloat(ethers.formatEther(historicalStaked)); // Balance has 18 decimals
            const swapNum = parseFloat(ethers.formatEther(historicalSwap)); // Balance has 18 decimals
            const totalPol = vaultPolNum + stakedNum + swapNum;
            const tvl = totalPol * polPriceNum;
            
            // Only add point if TVL is meaningful (>= 0.01)
            if (tvl >= 0.01 || totalPol > 0) {
              const date = new Date(Number(block.timestamp) * 1000);
              const dayLabel = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
              
              tvlPoints.push({
                day: dayLabel,
                tvl: Math.max(0, tvl), // Ensure non-negative
                timestamp: Number(block.timestamp) * 1000,
              });
            }
          }
          
          success = true;
          rateLimitCount = 0; // Reset on success
          consecutiveRateLimits = 0; // Reset on success
          
          // Reduced delay between blocks (2 seconds for faster loading)
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          const errorMsg = error?.message || error?.toString() || '';
          const isRateLimit = errorMsg.includes('rate limit') || errorMsg.includes('Too many requests') || errorMsg.includes('-32090') || errorMsg.includes('retry in');
          
          if (isRateLimit) {
            rateLimitCount++;
            consecutiveRateLimits++;
            retries++;
            const backoffDelay = Math.min(60000, 10000 * retries); // 10s, 20s... max 60s
            console.warn(`Rate limit for block ${blockNumber}, retry ${retries}/${maxRateLimitRetries}, waiting ${backoffDelay/1000}s...`);
            
            if (retries >= maxRateLimitRetries) {
              console.warn(`Skipping block ${blockNumber} after ${maxRateLimitRetries} retries`);
              break;
            }
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
          } else {
            console.warn(`Error querying TVL for block ${blockNumber}:`, error.message);
            consecutiveRateLimits = 0; // Reset for non-rate-limit errors
            break; // Don't retry for non-rate-limit errors
          }
        }
      }
    }
    
    // Add current TVL point (always add current point)
    const currentDate = new Date(now * 1000);
    const currentDayLabel = `${String(currentDate.getMonth() + 1).padStart(2, '0')}/${String(currentDate.getDate()).padStart(2, '0')}`;
    const currentTVLNum = parseFloat(currentTVL) || 0;
    
    // Remove any existing point for today and add current one
    const filteredPoints = tvlPoints.filter(p => p.day !== currentDayLabel);
    filteredPoints.push({
      day: currentDayLabel,
      tvl: Math.max(0, currentTVLNum),
      timestamp: now * 1000,
    });
    
    // Sort by timestamp and update tvlPoints
    filteredPoints.sort((a, b) => a.timestamp - b.timestamp);
    tvlPoints.length = 0;
    tvlPoints.push(...filteredPoints);
    
    // Sort and remove duplicates (simplified for faster processing)
    tvlPoints.sort((a, b) => a.timestamp - b.timestamp);
    
    // Use Map for faster deduplication by day
    const uniqueMap = new Map();
    for (const point of tvlPoints) {
      if (!uniqueMap.has(point.day) || uniqueMap.get(point.day).timestamp < point.timestamp) {
        uniqueMap.set(point.day, point);
      }
    }
    
    const uniqueData = Array.from(uniqueMap.values());
    
    const result = {
      data: uniqueData,
      currentTVL,
      lastUpdated: Date.now(),
    };
    
    // Cache for 60 minutes (longer cache = fewer RPC calls)
    cache.set(cacheKey, result, 3600);
    
    // Broadcast to WebSocket clients
    broadcastTVL(result);
    
    return result;
  } catch (error) {
    console.error('Error fetching TVL chart:', error);
    throw error;
  }
}

// Get lottery statistics
async function getLotteryStats() {
  const cacheKey = 'lottery-stats';
  const cached = cache.get(cacheKey);
  // Only use cache if it's less than 2 minutes old (to ensure fresh data)
  if (cached && cached.lastUpdated) {
    const cacheAge = Date.now() - cached.lastUpdated;
    if (cacheAge < 120000) { // 2 minutes - shorter cache for fresh data
      console.log(`📊 Using cached lottery stats (age: ${Math.floor(cacheAge/1000)}s)`);
      return cached;
    }
  }
  
  try {
    const provider = createProvider();
    const contract = new ethers.Contract(CONTRACTS.PUSDLottery, lotteryABI, provider);
    
    // Verify contract exists and address matches
    const EXPECTED_ADDRESS = '0xCCc95e7279813Ee1e4073e39280171C44C12431B';
    const actualAddress = CONTRACTS.PUSDLottery;
    
    console.log(`🔍 Verifying PUSDLottery contract...`);
    console.log(`   Expected address: ${EXPECTED_ADDRESS}`);
    console.log(`   Using address:    ${actualAddress}`);
    
    if (actualAddress.toLowerCase() !== EXPECTED_ADDRESS.toLowerCase()) {
      console.error(`❌ ERROR: Contract address mismatch!`);
      console.error(`   Expected: ${EXPECTED_ADDRESS}`);
      console.error(`   Got:      ${actualAddress}`);
      throw new Error(`Contract address mismatch: expected ${EXPECTED_ADDRESS}, got ${actualAddress}`);
    }
    
    // Verify contract exists on-chain
    try {
      const code = await callWithRetry(() => provider.getCode(CONTRACTS.PUSDLottery));
      if (code === '0x' || !code || code.length <= 2) {
        throw new Error(`Contract not found at address ${CONTRACTS.PUSDLottery} (no code)`);
      }
      console.log(`✅ Contract verified: PUSDLottery exists at ${CONTRACTS.PUSDLottery}`);
      console.log(`   Contract code length: ${code.length} characters`);
    } catch (error) {
      console.error('❌ Error verifying contract on-chain:', error.message);
      throw error;
    }
    
    const currentBlock = await callWithRetry(() => provider.getBlockNumber());
    console.log(`📊 Current block: ${currentBlock}`);
    
    // Try to find contract deployment block by querying for first event
    // Start from recent blocks (last 50k = ~1 week) for faster query and to avoid rate limits
    let fromBlock = Math.max(0, currentBlock - 50000); // Default: last 50k blocks
    
    try {
      // Try to find first event to optimize query range
      console.log(`🔍 Searching for contract deployment block...`);
      // Search from last 200k blocks first (faster, less likely to hit rate limits)
      const searchFromBlock = Math.max(0, currentBlock - 200000); // Search last 200k blocks
      
      try {
        const testEvents = await queryEventsWithPagination(
          contract,
          contract.filters.TicketsPurchased(),
          searchFromBlock,
          currentBlock,
          10000
        );
        
        if (testEvents.length > 0) {
          const earliestBlock = Math.min(...testEvents.map(e => Number(e.blockNumber)));
          fromBlock = Math.max(0, earliestBlock - 100); // Start a bit before first event
          console.log(`✅ Found first event at block ${earliestBlock}, querying from block ${fromBlock}`);
        } else {
          // No events found in search range, use recent blocks (last 50k)
          console.log(`⚠️  No events found in search range, querying from recent blocks (${fromBlock})`);
        }
      } catch (searchError) {
        // If search fails, use recent blocks
        console.log(`⚠️  Search failed, using recent blocks (${fromBlock}):`, searchError.message);
      }
    } catch (error) {
      console.warn(`⚠️  Could not find deployment block, using recent blocks (${fromBlock}):`, error.message);
    }
    
    console.log(`📊 Will query events from block ${fromBlock} to ${currentBlock} (range: ${currentBlock - fromBlock} blocks)`);
    
    console.log(`📊 Querying lottery events from block ${fromBlock} to ${currentBlock}...`);
    console.log(`   📍 Contract address: ${CONTRACTS.PUSDLottery}`);
    console.log(`   ✅ Expected address: 0xCCc95e7279813Ee1e4073e39280171C44C12431B`);
    console.log(`   ${CONTRACTS.PUSDLottery.toLowerCase() === '0xccc95e7279813ee1e4073e39280171c44c12431b' ? '✅' : '❌'} Address match: ${CONTRACTS.PUSDLottery.toLowerCase() === '0xccc95e7279813ee1e4073e39280171c44c12431b' ? 'YES' : 'NO'}`);
    
    // Query events sequentially to avoid rate limits
    console.log(`📊 Querying TicketsPurchased events from contract ${CONTRACTS.PUSDLottery}...`);
    let ticketsEvents = [];
    try {
      ticketsEvents = await queryEventsWithPagination(contract, contract.filters.TicketsPurchased(), fromBlock, currentBlock);
      console.log(`✅ Found ${ticketsEvents.length} TicketsPurchased events`);
    } catch (error) {
      const errorMsg = error?.message || error?.toString() || '';
      if (errorMsg.includes('rate limit') || errorMsg.includes('Too many requests') || errorMsg.includes('-32090')) {
        console.warn(`⚠️  Rate limit when querying TicketsPurchased events, using empty array`);
      } else {
        console.error(`❌ Error querying TicketsPurchased events:`, error.message);
      }
      ticketsEvents = [];
    }
    
    // Longer delay between queries to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds delay
    
    console.log(`📊 Querying RewardClaimed events...`);
    let rewardEvents = [];
    try {
      rewardEvents = await queryEventsWithPagination(contract, contract.filters.RewardClaimed(), fromBlock, currentBlock);
      console.log(`✅ Found ${rewardEvents.length} RewardClaimed events`);
    } catch (error) {
      const errorMsg = error?.message || error?.toString() || '';
      if (errorMsg.includes('rate limit') || errorMsg.includes('Too many requests') || errorMsg.includes('-32090')) {
        console.warn(`⚠️  Rate limit when querying RewardClaimed events, using empty array`);
      } else {
        console.error(`❌ Error querying RewardClaimed events:`, error.message);
      }
      rewardEvents = [];
    }
    
    console.log(`✅ Total: ${ticketsEvents.length} TicketsPurchased events and ${rewardEvents.length} RewardClaimed events`);
    
    // Calculate stats with better error handling and logging
    let totalTicketsSold = 0;
    for (const event of ticketsEvents) {
      try {
        if (event && event.args) {
          // Handle both ethers v5 and v6 event formats
          // TicketsPurchased event: (address indexed user, uint256[] ticketIds, uint256[] numbers, uint256 drawId)
          const ticketIds = event.args.ticketIds || event.args[1];
          
          if (ticketIds) {
            let count = 0;
            if (Array.isArray(ticketIds)) {
              count = ticketIds.length;
            } else if (typeof ticketIds === 'object' && 'length' in ticketIds) {
              count = ticketIds.length;
            } else {
              count = 1; // Single ticket
            }
            totalTicketsSold += count;
            console.log(`   📝 Event at block ${event.blockNumber}: ${count} ticket(s)`);
          } else {
            console.warn(`   ⚠️  Event missing ticketIds:`, event);
          }
        } else {
          console.warn(`   ⚠️  Invalid event structure:`, event);
        }
      } catch (e) {
        console.warn('Error parsing ticket event:', e, event);
      }
    }
    
    console.log(`📊 Calculated total tickets sold: ${totalTicketsSold}`);
    
    let totalPrizesDistributed = BigInt(0);
    let biggestWin = BigInt(0);
    for (const event of rewardEvents) {
      try {
        if (event && event.args) {
          // Handle both ethers v5 and v6 event formats
          // RewardClaimed event: (address indexed user, uint256 ticketId, uint256 amount, uint8 tier)
          const amount = event.args.amount || event.args[2] || event.args[1];
          if (amount) {
            const amountBigInt = typeof amount === 'bigint' 
              ? amount 
              : BigInt(amount.toString());
            totalPrizesDistributed += amountBigInt;
            if (amountBigInt > biggestWin) {
              biggestWin = amountBigInt;
            }
          }
        }
      } catch (e) {
        console.warn('Error parsing reward event:', e);
      }
    }
    
    const ticketPrice = BigInt('100000000000000000'); // 0.1 PUSD
    const burnRate = BigInt(500); // 5%
    const totalSales = BigInt(totalTicketsSold) * ticketPrice;
    const totalBurned = (totalSales * burnRate) / BigInt(10000);
    
    const stats = {
      totalTicketsSold,
      totalPrizesDistributed: ethers.formatEther(totalPrizesDistributed.toString()),
      totalBurned: ethers.formatEther(totalBurned.toString()),
      biggestWin: ethers.formatEther(biggestWin.toString()),
      lastUpdated: Date.now(),
    };
    
    // Cache for 2 minutes (shorter cache for fresh data)
    cache.set(cacheKey, stats, 120);
    
    console.log(`📊 Final lottery stats:`, {
      totalTicketsSold: stats.totalTicketsSold,
      totalPrizesDistributed: stats.totalPrizesDistributed,
      totalBurned: stats.totalBurned,
      biggestWin: stats.biggestWin
    });
    
    // Broadcast to WebSocket clients
    broadcastStats(stats);
    
    return stats;
  } catch (error) {
    console.error('Error fetching lottery stats:', error);
    throw error;
  }
}

// WebSocket clients
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`WebSocket client connected. Total clients: ${clients.size}`);
  
  // Send current cached data immediately
  const cachedStats = cache.get('lottery-stats');
  if (cachedStats) {
    ws.send(JSON.stringify({ type: 'stats', data: cachedStats }));
  }
  const cachedTVL = cache.get('tvl-chart');
  if (cachedTVL) {
    ws.send(JSON.stringify({ type: 'tvl', data: cachedTVL }));
  }
  
  ws.on('close', () => {
    clients.delete(ws);
    console.log(`WebSocket client disconnected. Total clients: ${clients.size}`);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// Broadcast to all WebSocket clients
function broadcast(type, data) {
  const message = JSON.stringify({ type, data });
  clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      try {
        client.send(message);
      } catch (error) {
        console.error('Error sending to WebSocket client:', error);
        clients.delete(client);
      }
    }
  });
}

// Broadcast stats to all WebSocket clients
function broadcastStats(stats) {
  broadcast('stats', stats);
}

// Broadcast TVL to all WebSocket clients
function broadcastTVL(tvlData) {
  broadcast('tvl', tvlData);
}

// API Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.get('/api/lottery/stats', async (req, res) => {
  try {
    const stats = await getLotteryStats();
    res.json(stats);
  } catch (error) {
    console.error('Error in /api/lottery/stats:', error);
    
    // Return default stats instead of 500 error to prevent frontend issues
    const defaultStats = {
      totalTicketsSold: 0,
      totalPrizesDistributed: '0',
      totalBurned: '0',
      biggestWin: '0',
      lastUpdated: Date.now(),
      error: error.message || 'Unknown error'
    };
    
    // Try to get cached data if available
    const cached = cache.get('lottery-stats');
    if (cached) {
      console.log('Returning cached data due to error');
      res.json(cached);
    } else {
      // Return default stats with 200 status (not 500) so frontend can still display
      res.status(200).json(defaultStats);
    }
  }
});

// Force refresh endpoint (clears cache and fetches fresh data)
app.post('/api/lottery/refresh', async (req, res) => {
  try {
    console.log('🔄 Force refreshing lottery stats (cache cleared)...');
    cache.del('lottery-stats');
    const stats = await getLotteryStats();
    res.json({ success: true, stats, message: 'Lottery stats refreshed successfully' });
  } catch (error) {
    console.error('Error refreshing stats:', error);
    res.status(500).json({ error: 'Failed to refresh stats', message: error.message });
  }
});

// TVL Chart endpoint
app.get('/api/tvl/chart', async (req, res) => {
  try {
    const tvlData = await getTVLChart();
    res.json(tvlData);
  } catch (error) {
    console.error('Error in /api/tvl/chart:', error);
    res.status(500).json({ error: 'Failed to fetch TVL chart', message: error.message });
  }
});

// Force refresh TVL endpoint
app.post('/api/tvl/refresh', async (req, res) => {
  try {
    cache.del('tvl-chart');
    const tvlData = await getTVLChart();
    res.json({ success: true, data: tvlData });
  } catch (error) {
    console.error('Error refreshing TVL:', error);
    res.status(500).json({ error: 'Failed to refresh TVL', message: error.message });
  }
});

// Total Supply endpoint for CoinMarketCap (returns ONLY numerical value)
app.get('/api/supply/total', async (req, res) => {
  const cacheKey = 'pusd-total-supply';
  const cached = cache.get(cacheKey);
  if (cached) {
    // Return as plain text (numerical value only)
    res.setHeader('Content-Type', 'text/plain');
    return res.send(cached.toString());
  }

  try {
    const provider = createProvider();
    const pusdContract = new ethers.Contract(CONTRACTS.PUSDToken, pusdTokenABI, provider);
    
    const totalSupply = await callWithRetry(() => pusdContract.totalSupply(), 2, 2000);
    
    // Cache for 5 minutes (300 seconds)
    cache.set(cacheKey, totalSupply.toString(), 300);
    
    // Return as plain text (numerical value only) - CoinMarketCap format
    res.setHeader('Content-Type', 'text/plain');
    res.send(totalSupply.toString());
  } catch (error) {
    console.error('Error fetching total supply:', error);
    res.status(500).send('0');
  }
});

// Circulating Supply endpoint for CoinMarketCap (returns ONLY numerical value)
// For PUSD, circulating supply = total supply (no treasury, no pre-mined tokens)
// Staked tokens are still considered circulating as they're in the market
app.get('/api/supply/circulating', async (req, res) => {
  const cacheKey = 'pusd-circulating-supply';
  const cached = cache.get(cacheKey);
  if (cached) {
    // Return as plain text (numerical value only)
    res.setHeader('Content-Type', 'text/plain');
    return res.send(cached.toString());
  }

  try {
    const provider = createProvider();
    const pusdContract = new ethers.Contract(CONTRACTS.PUSDToken, pusdTokenABI, provider);
    
    // For PUSD: Circulating Supply = Total Supply
    // (No treasury locks, no pre-mined tokens, burned tokens already excluded from total supply)
    const totalSupply = await callWithRetry(() => pusdContract.totalSupply(), 2, 2000);
    const circulatingSupply = totalSupply; // Same as total supply for PUSD
    
    // Cache for 5 minutes (300 seconds)
    cache.set(cacheKey, circulatingSupply.toString(), 300);
    
    // Return as plain text (numerical value only) - CoinMarketCap format
    res.setHeader('Content-Type', 'text/plain');
    res.send(circulatingSupply.toString());
  } catch (error) {
    console.error('Error fetching circulating supply:', error);
    res.status(500).send('0');
  }
});

// Auto-refresh stats every 5 minutes (shorter interval for fresh data)
setInterval(async () => {
  try {
    const cacheAge = cache.getTtl('lottery-stats') || 0;
    // Refresh if cache will expire in less than 1 minute (120s cache - 60s threshold)
    if (cacheAge < 60) {
      console.log('Auto-refreshing lottery stats...');
      await getLotteryStats();
    }
  } catch (error) {
    console.error('Error in auto-refresh:', error.message);
  }
}, 300000); // 5 minutes

// Auto-refresh TVL every 60 minutes (only if cache is about to expire)
// Longer interval = fewer RPC calls = better performance
setInterval(async () => {
  try {
    const cacheAge = cache.getTtl('tvl-chart') || 0;
    // Only refresh if cache will expire in less than 10 minutes
    if (cacheAge < 600) {
      console.log('Auto-refreshing TVL chart...');
      await getTVLChart();
    }
  } catch (error) {
    console.error('Error in TVL auto-refresh:', error.message);
  }
}, 3600000); // 60 minutes

// Don't load on startup to avoid rate limits
// Data will be loaded on first API request
console.log('⏳ Skipping initial load to avoid rate limits. Data will load on first request.');

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 PUSD API Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
  console.log(`📊 Lottery stats endpoint: http://localhost:${PORT}/api/lottery/stats`);
});

