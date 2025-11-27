const { ethers } = require('ethers');
require('dotenv').config();

// Configuration
const CONFIG = {
  // Contract address
  LOTTERY_ADDRESS: '0xE575b78d369F7aa6c35E96a6382Cc7EdDD2a606B',
  
  // RPC URL (Polygon Mainnet)
  RPC_URL: process.env.RPC_URL || 'https://polygon-rpc.com',
  
  // Private key (from environment or provided)
  PRIVATE_KEY: process.env.PRIVATE_KEY || 'f93cf755e3207030225346ed2307eff11d1026e380d7640964fc94e6daf49c86',
  
  // Draw time (20:00 UTC)
  DRAW_HOUR: 20, // UTC hour
  DRAW_MINUTE: 0, // UTC minute
  
  // Check interval (in milliseconds)
  CHECK_INTERVAL: 60000, // 1 minute
  
  // Gas settings
  GAS_LIMIT: 500000,
  MAX_FEE_PER_GAS: ethers.parseUnits('50', 'gwei'),
  MAX_PRIORITY_FEE_PER_GAS: ethers.parseUnits('30', 'gwei'),
};

// ABI for executeDraw function
const LOTTERY_ABI = [
  'function executeDraw() external',
  'function checkDrawTime() public view returns (bool isDailyTime, bool isWeeklyTime)',
  'function paused() public view returns (bool)',
  'function currentDrawId() public view returns (uint256)',
];

class LotteryBot {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    this.wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, this.provider);
    this.contract = new ethers.Contract(CONFIG.LOTTERY_ADDRESS, LOTTERY_ABI, this.wallet);
    this.lastDrawDay = null;
    this.isRunning = false;
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = {
      info: 'ℹ️',
      success: '✅',
      error: '❌',
      warning: '⚠️',
    }[type] || 'ℹ️';
    
    console.log(`[${timestamp}] ${prefix} ${message}`);
  }

  async checkContractStatus() {
    try {
      const isPaused = await this.contract.paused();
      const currentDrawId = await this.contract.currentDrawId();
      
      this.log(`Contract Status: ${isPaused ? 'PAUSED' : 'ACTIVE'} | Current Draw ID: ${currentDrawId}`, 'info');
      
      return !isPaused;
    } catch (error) {
      this.log(`Error checking contract status: ${error.message}`, 'error');
      return false;
    }
  }

  async checkDrawTime() {
    try {
      const [isDailyTime, isWeeklyTime] = await this.contract.checkDrawTime();
      return { isDailyTime, isWeeklyTime };
    } catch (error) {
      this.log(`Error checking draw time: ${error.message}`, 'error');
      return { isDailyTime: false, isWeeklyTime: false };
    }
  }

  isDrawTimeUTC() {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();
    const utcDay = now.getUTCDay(); // 0 = Sunday
    
    // Check if it's 20:00 UTC
    const isDrawHour = utcHour === CONFIG.DRAW_HOUR && utcMinute === CONFIG.DRAW_MINUTE;
    
    // Check if it's Sunday (weekly draw)
    const isSunday = utcDay === 0;
    
    // Check if we already drew today
    const today = Math.floor(now.getTime() / (1000 * 60 * 60 * 24));
    const alreadyDrewToday = this.lastDrawDay === today;
    
    return {
      isDrawHour,
      isSunday,
      isDrawTime: isDrawHour && !alreadyDrewToday,
      today,
    };
  }

  async executeDraw() {
    try {
      this.log('Attempting to execute draw...', 'info');
      
      // Check contract status
      const isActive = await this.checkContractStatus();
      if (!isActive) {
        this.log('Contract is paused, cannot execute draw', 'warning');
        return false;
      }
      
      // Check draw time from contract
      const { isDailyTime, isWeeklyTime } = await this.checkDrawTime();
      if (!isDailyTime && !isWeeklyTime) {
        this.log('Not time for draw yet (contract check)', 'warning');
        return false;
      }
      
      // Get gas price
      const feeData = await this.provider.getFeeData();
      const maxFeePerGas = feeData.maxFeePerGas || CONFIG.MAX_FEE_PER_GAS;
      const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || CONFIG.MAX_PRIORITY_FEE_PER_GAS;
      
      // Estimate gas
      let gasLimit = CONFIG.GAS_LIMIT;
      try {
        const estimatedGas = await this.contract.executeDraw.estimateGas();
        gasLimit = estimatedGas * BigInt(120) / BigInt(100); // Add 20% buffer
        this.log(`Estimated gas: ${estimatedGas.toString()} | Using: ${gasLimit.toString()}`, 'info');
      } catch (error) {
        this.log(`Gas estimation failed, using default: ${gasLimit}`, 'warning');
      }
      
      // Execute draw
      this.log('Sending transaction...', 'info');
      const tx = await this.contract.executeDraw({
        gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
      
      this.log(`Transaction sent: ${tx.hash}`, 'info');
      this.log(`Waiting for confirmation...`, 'info');
      
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        this.log(`✅ Draw executed successfully!`, 'success');
        this.log(`Transaction: https://polygonscan.com/tx/${tx.hash}`, 'success');
        
        // Update last draw day
        const now = new Date();
        this.lastDrawDay = Math.floor(now.getTime() / (1000 * 60 * 60 * 24));
        
        return true;
      } else {
        this.log(`❌ Transaction failed`, 'error');
        return false;
      }
    } catch (error) {
      if (error.reason) {
        this.log(`Error: ${error.reason}`, 'error');
      } else if (error.message) {
        this.log(`Error: ${error.message}`, 'error');
      } else {
        this.log(`Unknown error: ${JSON.stringify(error)}`, 'error');
      }
      return false;
    }
  }

  async checkAndExecute() {
    if (this.isRunning) {
      return;
    }
    
    this.isRunning = true;
    
    try {
      // Check UTC time
      const { isDrawTime, today } = this.isDrawTimeUTC();
      
      if (isDrawTime) {
        this.log('Draw time detected!', 'info');
        await this.executeDraw();
      } else {
        // Log status every 10 minutes
        const now = new Date();
        if (now.getUTCMinutes() % 10 === 0 && now.getUTCSeconds() < 10) {
          const { isDrawHour, isSunday } = this.isDrawTimeUTC();
          this.log(`Status: Waiting for draw time (20:00 UTC) | Current: ${now.getUTCHours()}:${String(now.getUTCMinutes()).padStart(2, '0')} UTC | Sunday: ${isSunday}`, 'info');
        }
      }
    } catch (error) {
      this.log(`Error in checkAndExecute: ${error.message}`, 'error');
    } finally {
      this.isRunning = false;
    }
  }

  async start() {
    this.log('🚀 Starting PUSD Lottery Bot...', 'info');
    this.log(`Wallet Address: ${this.wallet.address}`, 'info');
    this.log(`Contract Address: ${CONFIG.LOTTERY_ADDRESS}`, 'info');
    this.log(`Draw Time: ${CONFIG.DRAW_HOUR}:${String(CONFIG.DRAW_MINUTE).padStart(2, '0')} UTC (Daily)`, 'info');
    this.log(`Draw Time: Sunday ${CONFIG.DRAW_HOUR}:${String(CONFIG.DRAW_MINUTE).padStart(2, '0')} UTC (Weekly)`, 'info');
    this.log(`Check Interval: ${CONFIG.CHECK_INTERVAL / 1000} seconds`, 'info');
    
    // Check initial status
    await this.checkContractStatus();
    
    // Check immediately
    await this.checkAndExecute();
    
    // Set up interval
    setInterval(() => {
      this.checkAndExecute();
    }, CONFIG.CHECK_INTERVAL);
    
    this.log('Bot is running. Press Ctrl+C to stop.', 'info');
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down bot...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down bot...');
  process.exit(0);
});

// Start bot
const bot = new LotteryBot();
bot.start().catch((error) => {
  console.error('❌ Failed to start bot:', error);
  process.exit(1);
});

