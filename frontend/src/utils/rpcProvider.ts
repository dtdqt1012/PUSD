import { JsonRpcProvider, Contract } from 'ethers';

/**
 * RPC endpoints for Polygon Mainnet
 * Official Polygon RPC endpoints with fallback support
 * Reference: https://docs.polygon.technology/pos/reference/rpc-endpoints/#mainnet
 * 
 * Primary: polygon-rpc.com (Ankr - official partner)
 * - Free tier: 1M requests/day
 * - Fast, reliable, supports CORS
 * 
 * Fallbacks: Other official Polygon RPC endpoints
 */
const RPC_ENDPOINTS = [
  'https://polygon-rpc.com', // Ankr (official partner) - Primary endpoint
  'https://rpc.ankr.com/polygon', // Ankr alternative endpoint
  'https://polygon.publicnode.com', // PublicNode (free, privacy-focused)
  'https://sparkling-alpha-aura.matic.quiknode.pro/0c230da08864fa623360b9833d2355f5c4dcccbe/', // QuickNode (paid, high performance)
];

const RPC_ENDPOINT = RPC_ENDPOINTS[0]; // Primary endpoint

// Timeout for RPC calls (in milliseconds)
const RPC_TIMEOUT = 30000; // 30 seconds per call
const RPC_RETRY_DELAY = 1000; // 1 second between retries

/**
 * Create a single fast RPC provider
 */
export function createFallbackProvider(): JsonRpcProvider {
  return new JsonRpcProvider(RPC_ENDPOINT, 137, { 
    staticNetwork: true,
    batchMaxCount: 1, // Disable batching to avoid issues
  });
}

/**
 * Create a promise with timeout
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage?: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(errorMessage || `Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    })
  ]);
}

/**
 * Execute a contract call with RPC fallback and timeout
 * Tries each RPC endpoint in order until one succeeds
 */
export async function callWithRpcFallback<T>(
  callFn: (provider: JsonRpcProvider) => Promise<T>,
  retries = 2,
  timeout = RPC_TIMEOUT
): Promise<T> {
  let lastError: any = null;
  
  // Try each RPC endpoint
  for (let rpcIndex = 0; rpcIndex < RPC_ENDPOINTS.length; rpcIndex++) {
    const rpcUrl = RPC_ENDPOINTS[rpcIndex];
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const provider = new JsonRpcProvider(rpcUrl, 137, { 
          staticNetwork: true,
          batchMaxCount: 1, // Disable batching to avoid issues
        });
        
        // Wrap the call with timeout
        const result = await withTimeout(
          callFn(provider),
          timeout,
          `RPC call to ${rpcUrl} timed out`
        );
        
        return result;
      } catch (error: any) {
        lastError = error;
        
        // Check if it's a timeout error
        const isTimeout = 
          error?.message?.includes('timed out') ||
          error?.message?.includes('timeout') ||
          error?.code === 'TIMEOUT';
        
        // Check if it's a rate limit error (429) or CORS error
        const errorMessage = error?.message || error?.toString() || '';
        const errorCode = error?.code || error?.error?.code;
        const httpStatus = error?.status || error?.response?.status;
        const isRateLimit = 
          errorCode === -32005 || 
          errorMessage.includes('rate limited') ||
          errorMessage.includes('429') ||
          errorMessage.includes('Too Many Requests') ||
          httpStatus === 429;
        
        // Check for CORS errors
        const isCorsError = 
          errorMessage.includes('CORS') ||
          errorMessage.includes('Access-Control-Allow-Origin') ||
          errorMessage.includes('blocked by CORS policy') ||
          errorMessage.includes('ERR_FAILED') ||
          errorMessage.includes('ERR_NAME_NOT_RESOLVED') ||
          errorMessage.includes('ERR_NAME_NOT_RESOLVED');
        
        // If timeout, rate limited, or CORS error, try next RPC endpoint immediately
        if (isTimeout || isRateLimit || isCorsError) {
          // Wait a bit before trying next RPC (exponential backoff)
          const delay = RPC_RETRY_DELAY * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
          break; // Break inner loop to try next RPC
        }
        
        // For other errors, retry with same RPC if attempts left
        if (attempt < retries - 1) {
          // Exponential backoff: 1s, 2s, 4s...
          const delay = RPC_RETRY_DELAY * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // If last attempt on this RPC, try next RPC
        if (attempt === retries - 1 && rpcIndex < RPC_ENDPOINTS.length - 1) {
          await new Promise(resolve => setTimeout(resolve, RPC_RETRY_DELAY));
          break; // Break inner loop to try next RPC
        }
      }
    }
  }
  
  // If all RPCs failed, throw last error
  throw lastError || new Error('All RPC endpoints failed');
}

/**
 * Create contract instance with fallback provider
 */
export function createContractWithFallback(address: string, abi: any[]): any {
  const fallbackProvider = createFallbackProvider();
  
  // Return a proxy object that uses fallback provider for calls
  return new Proxy({}, {
    get(_target, prop) {
      if (typeof prop === 'string' && prop !== 'then' && prop !== 'constructor') {
        // Return a function that uses fallback provider
        return (...args: any[]) => {
          return callWithRpcFallback(async (provider) => {
            const contract = new Contract(address, abi, provider);
            const method = (contract as any)[prop];
            if (typeof method === 'function') {
              return await method(...args);
            }
            return method;
          });
        };
      }
      return undefined;
    }
  });
}

