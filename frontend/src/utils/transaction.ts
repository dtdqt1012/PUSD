import { Contract, Signer } from 'ethers';

interface TransactionOptions {
  gasPrice?: bigint;
  value?: bigint;
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Execute a contract transaction with retry logic and improved gas handling
 */
export async function executeTransaction(
  contract: Contract,
  methodName: string,
  args: any[],
  signer: Signer,
  options: TransactionOptions = {}
): Promise<any> {
  const { gasPrice, value, maxRetries = 3, retryDelay = 2000 } = options;

  // Get fee data and increase gas price by 20% to avoid underpriced errors
  let finalGasPrice = gasPrice;
  if (!finalGasPrice) {
    try {
      // Try to get fee data, but catch errors silently for unsupported RPC methods
      const feeData = await signer.provider!.getFeeData();
      finalGasPrice = feeData.gasPrice ? (feeData.gasPrice * 120n / 100n) : undefined;
    } catch (error: any) {
      // Silently handle eth_maxPriorityFeePerGas errors - this is expected for some RPCs
      const isMaxPriorityFeeError = error?.code === -32601 || 
                                    error?.message?.includes('eth_maxPriorityFeePerGas') || 
                                    error?.message?.includes('does not exist') ||
                                    error?.message?.includes('is not available');
      
      if (isMaxPriorityFeeError) {
        // Silently fallback to block-based estimation
        try {
          const block = await signer.provider!.getBlock('latest');
          // In ethers v6, Block type may not have gasPrice, use type assertion
          const blockWithGasPrice = block as any;
          if (block && blockWithGasPrice.gasPrice) {
            finalGasPrice = BigInt(blockWithGasPrice.gasPrice.toString()) * 120n / 100n;
          } else {
            // If block doesn't have gasPrice, let MetaMask handle it
            finalGasPrice = undefined;
          }
        } catch (blockError) {
          // Silently let MetaMask handle it - don't set gasPrice
          finalGasPrice = undefined;
        }
      } else {
        // Other errors: try block-based estimation as fallback
        try {
          const block = await signer.provider!.getBlock('latest');
          // In ethers v6, Block type may not have gasPrice, use type assertion
          const blockWithGasPrice = block as any;
          if (block && blockWithGasPrice.gasPrice) {
            finalGasPrice = BigInt(blockWithGasPrice.gasPrice.toString()) * 120n / 100n;
          } else {
            finalGasPrice = undefined;
          }
        } catch (blockError) {
          // If all else fails, let MetaMask handle it (don't set gasPrice)
          finalGasPrice = undefined;
        }
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
      const tx = await contract[methodName](...args, txOptions);
      await tx.wait();
      return tx;
    } catch (error: any) {
      lastError = error;

      // If it's an RPC error or HTTP client error, retry after delay
      const isRpcError = error?.code === -32603 || 
                        error?.code === -32080 ||
                        error?.message?.includes('Internal JSON-RPC error') ||
                        error?.message?.includes('RPC endpoint returned HTTP client error');
      
      if (isRpcError) {
        if (attempt < maxRetries) {
          console.warn(`${methodName} attempt ${attempt} failed, retrying...`, error);
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt)); // Exponential backoff
          continue;
        }
      } else {
        // Non-RPC error, don't retry
        throw error;
      }
    }
  }

  // All retries failed
  throw lastError;
}

/**
 * Get user-friendly error message from transaction error
 */
export function getTransactionErrorMessage(error: any): string {
  // RPC errors
  if (error?.code === -32603 || 
      error?.code === -32080 ||
      error?.message?.includes('Internal JSON-RPC error') ||
      error?.message?.includes('RPC endpoint returned HTTP client error')) {
    return 'Network error. Please try again in a moment.';
  }
  
  // Handle execution reverted errors
  if (error?.code === 'CALL_EXCEPTION' || error?.code === -32000) {
    const reason = error?.reason || error?.message || '';
    const data = error?.data || '';
    
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
        return `Transaction failed. Error code: ${data.substring(0, 10)}. Please check console for details.`;
      }
      return 'Transaction failed. Please check your balance, allowance, and pool reserves.';
    }
    
    return reason || 'Transaction failed. Please try again.';
  }
  
  return error?.reason || error?.message || 'Transaction failed';
}

