const { ethers } = require('ethers');

// Vercel Serverless Function for executing lottery draws
// This function is triggered by Vercel Cron Jobs

module.exports = async (req, res) => {
  // Only allow GET requests (Vercel Cron triggers GET)
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret (optional but recommended)
  const cronSecret = req.headers['x-cron-secret'] || req.query.secret;
  const expectedSecret = process.env.CRON_SECRET;
  
  if (expectedSecret && cronSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startTime = Date.now();
  const log = (message, type = 'info') => {
    const timestamp = new Date().toISOString();
    const prefix = {
      info: 'ℹ️',
      success: '✅',
      error: '❌',
      warning: '⚠️',
    }[type] || 'ℹ️';
    console.log(`[${timestamp}] ${prefix} ${message}`);
  };

  try {
    log('Starting executeDraw check...', 'info');

    // Configuration
    const CONFIG = {
      LOTTERY_ADDRESS: process.env.LOTTERY_ADDRESS || '0xE575b78d369F7aa6c35E96a6382Cc7EdDD2a606B',
      RPC_URL: process.env.RPC_URL || 'https://polygon-rpc.com',
      PRIVATE_KEY: process.env.PRIVATE_KEY,
    };

    if (!CONFIG.PRIVATE_KEY) {
      throw new Error('PRIVATE_KEY environment variable is required');
    }

    // Connect to network
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
    
    // Contract ABI
    const LOTTERY_ABI = [
      'function executeDraw() external',
      'function checkDrawTime() public view returns (bool isDailyTime, bool isWeeklyTime)',
      'function paused() public view returns (bool)',
      'function currentDrawId() public view returns (uint256)',
    ];

    const contract = new ethers.Contract(CONFIG.LOTTERY_ADDRESS, LOTTERY_ABI, wallet);

    log(`Connected to contract: ${CONFIG.LOTTERY_ADDRESS}`, 'info');
    log(`Wallet: ${wallet.address}`, 'info');

    // Check contract status
    const isPaused = await contract.paused();
    if (isPaused) {
      log('Contract is paused, cannot execute draw', 'warning');
      return res.status(200).json({
        success: false,
        message: 'Contract is paused',
        timestamp: new Date().toISOString(),
      });
    }

    // Check draw time
    const [isDailyTime, isWeeklyTime] = await contract.checkDrawTime();
    if (!isDailyTime && !isWeeklyTime) {
      log('Not time for draw yet', 'info');
      return res.status(200).json({
        success: false,
        message: 'Not time for draw yet',
        isDailyTime,
        isWeeklyTime,
        timestamp: new Date().toISOString(),
      });
    }

    log(`Draw time detected! Daily: ${isDailyTime}, Weekly: ${isWeeklyTime}`, 'info');

    // Get current draw ID before execution
    const currentDrawIdBefore = await contract.currentDrawId();
    log(`Current Draw ID: ${currentDrawIdBefore.toString()}`, 'info');

    // Estimate gas
    let gasLimit = 500000;
    try {
      const estimatedGas = await contract.executeDraw.estimateGas();
      gasLimit = Number(estimatedGas) * 1.2; // Add 20% buffer
      log(`Estimated gas: ${estimatedGas.toString()} | Using: ${gasLimit}`, 'info');
    } catch (error) {
      log(`Gas estimation failed, using default: ${gasLimit}`, 'warning');
    }

    // Get gas price
    const feeData = await provider.getFeeData();
    const maxFeePerGas = feeData.maxFeePerGas || ethers.parseUnits('50', 'gwei');
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || ethers.parseUnits('30', 'gwei');

    // Execute draw
    log('Sending transaction...', 'info');
    const tx = await contract.executeDraw({
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
    });

    log(`Transaction sent: ${tx.hash}`, 'info');
    log(`Waiting for confirmation...`, 'info');

    // Wait for confirmation (with timeout for Vercel's 10s limit)
    const receipt = await Promise.race([
      tx.wait(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Transaction confirmation timeout')), 8000)
      ),
    ]);

    const duration = Date.now() - startTime;

    if (receipt && receipt.status === 1) {
      log(`✅ Draw executed successfully!`, 'success');
      
      return res.status(200).json({
        success: true,
        message: 'Draw executed successfully',
        transactionHash: tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        currentDrawId: currentDrawIdBefore.toString(),
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
        polygonScanUrl: `https://polygonscan.com/tx/${tx.hash}`,
      });
    } else {
      log(`❌ Transaction failed`, 'error');
      return res.status(500).json({
        success: false,
        message: 'Transaction failed',
        transactionHash: tx.hash,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    log(`Error: ${error.message}`, 'error');
    
    return res.status(500).json({
      success: false,
      error: error.message,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    });
  }
};

