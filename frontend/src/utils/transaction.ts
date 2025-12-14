import { Contract, Signer } from 'ethers';

interface TransactionOptions {
  gasPrice?: bigint;
  value?: bigint;
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Check if network connection is healthy
 */
async function checkNetworkHealth(provider: any): Promise<boolean> {
  try {
    const startTime = Date.now();
    await provider.getBlockNumber();
    const latency = Date.now() - startTime;
    // Consider network healthy if response time < 5 seconds
    return latency < 5000;
  } catch (error) {
    return false;
  }
}

/**
 * Execute a contract transaction with retry logic and improved gas handling
 * Can be called with either:
 * 1. (contract, methodName, args, signer, options) - for contract method calls
 * 2. (transaction, signer, options) - for already-sent transactions (just wait for confirmation)
 */
export async function executeTransaction(
  contractOrTx: Contract | any,
  methodNameOrSigner: string | Signer,
  argsOrOptions?: any[] | TransactionOptions,
  signerOrOptions?: Signer | TransactionOptions,
  options?: TransactionOptions
): Promise<any> {
  // Check if first argument is a transaction (has wait method) or a contract
  const isTransaction = contractOrTx && typeof contractOrTx.wait === 'function';
  
  if (isTransaction) {
    // Overload: executeTransaction(transaction, signer, options)
    const tx = contractOrTx;
    const signer = methodNameOrSigner as Signer;
    const txOptions = (argsOrOptions || {}) as TransactionOptions;
    const { maxRetries = 5, retryDelay = 3000 } = txOptions;
    
    // For already-sent transactions, just wait with retry logic
    let lastError: any = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check network health before waiting for confirmation
        if (signer?.provider) {
          try {
            const isHealthy = await checkNetworkHealth(signer.provider);
            if (!isHealthy && attempt < maxRetries) {
              const delay = retryDelay * attempt * 2;
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
          } catch (networkError: any) {
            // Network check failed, but continue with transaction wait
            if (attempt < maxRetries) {
              const delay = retryDelay * attempt * 3;
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
          }
        }
        
        await tx.wait();
        return tx;
      } catch (error: any) {
        lastError = error;
        
        // Check if it's a user rejection (don't retry)
        if (error?.code === 4001 || error?.message?.includes('User denied') || error?.message?.includes('user rejected')) {
          throw error;
        }
        
        // Check if it's an execution reverted error (don't retry)
        const isExecutionReverted = error?.data?.message?.includes('execution reverted') ||
                                    error?.message?.includes('execution reverted');
        if (isExecutionReverted) {
          throw error;
        }
        
        // Retry for network/RPC errors
        const isRpcError = error?.code === -32603 || 
                          error?.code === -32005 ||
                          error?.message?.includes('network') ||
                          error?.message?.includes('timeout');
        
        if (isRpcError && attempt < maxRetries) {
          const delay = retryDelay * attempt;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw error;
      }
    }
    
    throw lastError;
  }
  
  // Original overload: executeTransaction(contract, methodName, args, signer, options)
  const contract = contractOrTx as Contract;
  const methodName = methodNameOrSigner as string;
  const args = argsOrOptions as any[];
  const signer = signerOrOptions as Signer;
  const finalOptions = (options || {}) as TransactionOptions;
  const { gasPrice, value, maxRetries = 5, retryDelay = 3000 } = finalOptions; // Increased retries and delay

  // Get fee data and increase gas price to avoid underpriced errors
  // For buyTickets, increase by 30% for faster processing
  // For other transactions, increase by 20%
  const gasPriceMultiplier = methodName === 'buyTickets' || methodName === 'claimFreeTicket' ? 130n : 120n;
  let finalGasPrice = gasPrice;
  if (!finalGasPrice) {
    // For Polygon networks (including Amoy), getFeeData may not support eth_maxPriorityFeePerGas
    // Try block-based gas price first, then fallback to getFeeData
    try {
      const block = await signer.provider!.getBlock('latest');
      const blockWithGasPrice = block as any;
      if (block && blockWithGasPrice.gasPrice) {
        finalGasPrice = BigInt(blockWithGasPrice.gasPrice.toString()) * gasPriceMultiplier / 100n;
      }
    } catch (blockError) {
      // Block fetch failed, try getFeeData as fallback
      try {
        const feeData = await signer.provider!.getFeeData();
        if (feeData.gasPrice) {
          finalGasPrice = feeData.gasPrice * gasPriceMultiplier / 100n;
        }
      } catch (feeError: any) {
        // Silently ignore eth_maxPriorityFeePerGas errors - let MetaMask handle gas estimation
        // Suppress fee data errors
        // Let MetaMask handle gas estimation by not setting gasPrice
        finalGasPrice = undefined;
      }
    }
  }

  const txOptions: any = {};
  if (finalGasPrice) {
    txOptions.gasPrice = finalGasPrice;
  }
  if (value) {
    txOptions.value = value;
  }

  // Retry logic for RPC errors
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Add delay before first attempt to avoid immediate RPC errors
      if (attempt === 1) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay before first attempt to reduce rate limiting
      } else {
        // For retries, add a small delay before attempting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // For approve transactions, add a small delay to allow MetaMask to show warning properly
      if (methodName === 'approve') {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Check network connection before attempting transaction
      try {
        const isHealthy = await checkNetworkHealth(signer.provider!);
        if (!isHealthy && attempt < maxRetries) {
          // Network is slow, wait before retry
          const delay = retryDelay * attempt * 2;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      } catch (networkError: any) {
        // Network error, wait longer before retry
        if (attempt < maxRetries) {
          const delay = retryDelay * attempt * 3; // Longer delay for network errors
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw networkError;
      }
      
      // Try to estimate gas first to catch errors early (optional, don't fail if estimation fails)
      try {
        await contract[methodName].estimateGas(...args, txOptions);
      } catch (estimateError: any) {
        // If estimation fails with execution reverted, don't retry
        const hasErrorData = estimateError?.data?.data && typeof estimateError.data.data === 'string' && estimateError.data.data.length > 10;
        const isExecutionReverted = estimateError?.data?.message?.includes('execution reverted') ||
                                    estimateError?.message?.includes('execution reverted') ||
                                    (estimateError?.code === -32603 && hasErrorData);
        
        if (isExecutionReverted) {
          // Contract error, don't retry
          throw estimateError;
        }
        // If estimation fails for other reasons, continue with transaction (MetaMask will handle it)
      }
      
      const tx = await contract[methodName](...args, txOptions);
      await tx.wait();
      return tx;
    } catch (error: any) {
      lastError = error;

      // Check if it's a user rejection (don't retry)
      if (error?.code === 4001 || error?.message?.includes('User denied') || error?.message?.includes('user rejected')) {
        throw error; // Don't retry user rejections
      }

      // Check if it's an execution reverted error (contract error, don't retry)
      // -32603 with data.data starting with 0x08c379a0 (Error(string) selector) = execution reverted
      // -32603 with data.data starting with other selectors = custom error (execution reverted)
      // -32603 without data.data or with empty data = RPC error (should retry)
      const hasErrorData = error?.data?.data && typeof error.data.data === 'string' && error.data.data.length > 10;
      const isExecutionReverted = error?.data?.message?.includes('execution reverted') ||
                                  error?.message?.includes('execution reverted') ||
                                  (error?.code === -32603 && hasErrorData && (
                                    error.data.data.startsWith('0x08c379a0') || // Error(string)
                                    error.data.data.startsWith('0x4e487b71') || // Panic(uint256)
                                    error.data.data.length > 10 // Any custom error selector
                                  ));
      
      if (isExecutionReverted) {
        // Don't retry contract errors
        throw error;
      }
      
      // If it's an RPC error (not execution reverted), rate limit error, or HTTP client error, retry after delay
      // -32603 without error data = RPC error (should retry)
      const isRpcError = (error?.code === -32603 && !hasErrorData) || // RPC error without contract error data
                        error?.code === -32005 || // Rate limit error
                        error?.code === -32080 ||
                        error?.code === -32601 || // Method not found (sometimes transient)
                        error?.message?.includes('Internal JSON-RPC error') ||
                        error?.message?.includes('Request is being rate limited') ||
                        error?.message?.includes('RPC endpoint returned HTTP client error') ||
                        error?.message?.includes('network error') ||
                        error?.message?.includes('network is congested');
      
      if (isRpcError) {
        if (attempt < maxRetries) {
          // Exponential backoff with longer delays for RPC errors
          // Base delay increases: 3s, 6s, 12s, 24s for attempts 1-4
          const baseDelay = retryDelay * Math.pow(2, attempt - 1);
          // Rate limit errors get even longer delays: 6s, 12s, 24s, 48s
          const delay = error?.code === -32005 ? baseDelay * 2 : baseDelay;
          
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      } else {
        // Non-RPC error, don't retry (except for some specific cases)
        // Check if it's a transaction that might succeed on retry
        const isRetryableError = error?.message?.includes('timeout') ||
                                error?.message?.includes('network') ||
                                error?.code === 'NETWORK_ERROR' ||
                                error?.code === 'TIMEOUT';
        
        if (isRetryableError && attempt < maxRetries) {
          const delay = retryDelay * attempt;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw error;
      }
    }
  }

  // All retries failed
  throw lastError;
}

/**
 * Decode error message from Solidity Error(string) selector (0x08c379a0)
 */
function decodeErrorString(data: string): string | null {
  try {
    if (!data || typeof data !== 'string') {
      return null;
    }
    
    // Remove 0x prefix if present
    const hexData = data.startsWith('0x') ? data.slice(2) : data;
    
    // Error(string) selector is 0x08c379a0 (without 0x prefix: 08c379a0)
    if (!hexData.startsWith('08c379a0')) {
      return null;
    }
    
    // Remove selector (first 8 hex chars = 4 bytes)
    const encodedData = hexData.slice(8);
    
    // First 64 chars (32 bytes) is offset to string data (usually 0x20 = 32)
    // This offset is relative to the start of the encoded data (after selector)
    const offsetHex = encodedData.slice(0, 64);
    const offset = parseInt(offsetHex, 16);
    
    // String data starts at offset position (offset is in bytes)
    // At offset position, we have: length (32 bytes) + string data
    const lengthStart = offset * 2; // Convert bytes to hex chars
    const lengthHex = encodedData.slice(lengthStart, lengthStart + 64);
    const length = parseInt(lengthHex, 16);
    
    if (length === 0 || length > 1000) {
      return null; // Invalid length
    }
    
    // String data is right after length (32 bytes = 64 hex chars)
    const stringStart = lengthStart + 64;
    const stringEnd = stringStart + (length * 2);
    const stringHex = encodedData.slice(stringStart, stringEnd);
    
    // Convert hex to string
    let decodedString = '';
    for (let i = 0; i < stringHex.length; i += 2) {
      const hex = stringHex.substr(i, 2);
      const charCode = parseInt(hex, 16);
      if (charCode > 0) {
        decodedString += String.fromCharCode(charCode);
      }
    }
    
    return decodedString.trim() || null;
  } catch (err) {
    return null;
  }
}

/**
 * Get user-friendly error message from transaction error
 */
export function getTransactionErrorMessage(error: any): string {
  // Rate limiting errors
  if (error?.code === -32005 || 
      error?.message?.includes('Request is being rate limited')) {
    return 'Network is busy. Please wait a moment and try again.';
  }
  
  // RPC errors with execution reverted data
  if (error?.code === -32603) {
    // First check if error.data.message exists (most direct)
    if (error?.data?.message) {
      // Extract message after "execution reverted: " if present
      const message = error.data.message;
      const match = message.match(/execution reverted[:\s]+(.+)/i);
      if (match && match[1]) {
        return match[1].trim();
      }
      return message;
    }
    
    // Check if error has data with execution reverted message (contract error)
    const errorData = error?.data?.data || error?.data;
    if (errorData && typeof errorData === 'string' && errorData.length > 10) {
      const decodedMessage = decodeErrorString(errorData);
      if (decodedMessage) {
        return decodedMessage;
      }
      // If we have error data but can't decode it, it's likely a contract error
      return 'Transaction failed. Please check your balance, allowance, and try again with a smaller quantity.';
    }
    
    // Check error message directly
    if (error?.message?.includes('execution reverted')) {
      const match = error.message.match(/execution reverted[:\s]+(.+)/i);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    // If no error data, it's likely an RPC error
    return 'Network error. The transaction was retried multiple times but failed. Please try again with a smaller quantity or wait a moment.';
  }
  
  // RPC errors
  if (error?.code === -32080 ||
      error?.message?.includes('RPC endpoint returned HTTP client error')) {
    return 'Network error. The transaction was retried multiple times but failed. Please check your network connection and try again.';
  }
  
  // Network/timeout errors
  if (error?.message?.includes('timeout') || 
      error?.message?.includes('network') ||
      error?.code === 'NETWORK_ERROR' ||
      error?.code === 'TIMEOUT') {
    return 'Network timeout. Please check your connection and try again.';
  }
  
  // Handle execution reverted errors
  if (error?.code === 'CALL_EXCEPTION' || error?.code === -32000) {
    const reason = error?.reason || error?.message || '';
    const data = error?.data || '';
    
    // Try to decode error message from data
    if (data && typeof data === 'string' && data.length > 10) {
      const decodedMessage = decodeErrorString(data);
      if (decodedMessage) {
        return decodedMessage;
      }
    }
    
    // Check for specific error messages
    if (reason.includes('Cannot burn') || reason.includes('burn') || data.includes('0xe450d38c')) {
      return 'SwapPool is not authorized to burn PUSD. Please contact admin or approve PUSD.';
    }
    if (reason.includes('Insufficient') || reason.includes('allowance') || data.includes('0xfb8f41b2')) {
      // Check if it's allowance error
      if (data.includes('0xfb8f41b2')) {
        return 'Insufficient allowance. Please approve PUSD first.';
      }
      if (reason.includes('POL')) {
        return 'Insufficient POL in pool. Please swap POL to PUSD first to add liquidity.';
      }
      return 'Insufficient balance or allowance. Please check and try again.';
    }
    if (reason.includes('Slippage')) {
      return 'Slippage too high. Please try again with a smaller amount or adjust slippage tolerance.';
    }
    if (reason.includes('Insufficient POL')) {
      return 'Insufficient POL in pool. Please swap POL to PUSD first to add liquidity.';
    }
    if (reason.includes('execution reverted') || data) {
      // Try to decode custom error if possible
      if (data && data.length > 10) {
        // Check for known error selectors
        if (data.startsWith('0xfb8f41b2')) {
          return 'Insufficient allowance. Please approve PUSD first.';
        }
        if (data.startsWith('0xe450d38c')) {
          return 'Cannot burn PUSD. Please approve SwapPool or contact admin.';
        }
        
        // Try to decode Error(string)
        const decodedMessage = decodeErrorString(data);
        if (decodedMessage) {
          return decodedMessage;
        }
        
        return `Transaction failed. Error code: ${data.substring(0, 10)}. Please check console for details.`;
      }
      return 'Transaction failed. Please check your balance, allowance, and pool reserves.';
    }
    
    return reason || 'Transaction failed. Please try again.';
  }
  
  // Check if error has data with message
  if (error?.data?.message) {
    return error.data.message;
  }
  
  // Check if error message contains execution reverted
  if (error?.message?.includes('execution reverted')) {
    const match = error.message.match(/execution reverted[:\s]+(.+)/i);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return error?.reason || error?.message || 'Transaction failed';
}

