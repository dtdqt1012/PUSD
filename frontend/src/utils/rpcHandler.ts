// RPC Error Handler with rate limiting detection and retry logic

export const isRateLimitError = (error: any): boolean => {
  if (!error) return false;
  
  const errorCode = error.code || error?.error?.code;
  const errorMessage = error.message || error?.error?.message || '';
  
  // Check for rate limit error codes
  if (errorCode === -32005) return true; // Rate limited
  if (errorCode === 429) return true; // Too many requests
  if (errorMessage.toLowerCase().includes('rate limit')) return true;
  if (errorMessage.toLowerCase().includes('too many requests')) return true;
  
  return false;
};

export const isRPCError = (error: any): boolean => {
  if (!error) return false;
  
  const errorCode = error.code || error?.error?.code;
  const errorMessage = error.message || error?.error?.message || '';
  
  // Common RPC error codes
  if (errorCode === -32603) return true; // Internal JSON-RPC error
  if (errorCode === -32005) return true; // Rate limited
  if (errorCode === 429) return true; // Too many requests
  if (errorCode === -32602) return true; // Invalid params
  if (errorCode === -32601) return true; // Method not found
  if (errorMessage.toLowerCase().includes('rpc')) return true;
  if (errorMessage.toLowerCase().includes('network')) return true;
  if (errorMessage.toLowerCase().includes('internal json-rpc')) return true;
  
  return false;
};

export const shouldSuppressError = (error: any): boolean => {
  if (!error) return false;
  
  // Suppress common RPC errors that are not actionable
  if (isRateLimitError(error)) return true;
  if (isRPCError(error)) return true;
  
  // Suppress specific error messages
  const errorMessage = error.message || error?.error?.message || '';
  if (errorMessage.includes('Internal JSON-RPC error')) return true;
  if (errorMessage.includes('Request is being rate limited')) return true;
  if (errorMessage.includes('eth_maxPriorityFeePerGas')) return true;
  if (errorMessage.includes('does not exist') && errorMessage.includes('is not available')) return true;
  
  return false;
};

// Exponential backoff delay calculator
export const getRetryDelay = (attempt: number, baseDelay: number = 1000): number => {
  // Exponential backoff: baseDelay * 2^attempt, max 30 seconds
  const delay = Math.min(baseDelay * Math.pow(2, attempt), 30000);
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 1000;
  return delay + jitter;
};

// RPC request with automatic retry and rate limit handling
export const rpcRequestWithRetry = async <T>(
  requestFn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    onRetry?: (attempt: number, error: any) => void;
  } = {}
): Promise<T> => {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    onRetry,
  } = options;

  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on non-RPC errors or user rejection
      if (error?.code === 4001) {
        throw error; // User rejected
      }
      
      // Check if it's a rate limit or RPC error
      const shouldRetry = isRateLimitError(error) || isRPCError(error);
      
      if (!shouldRetry || attempt >= maxRetries) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = getRetryDelay(attempt, baseDelay);
      
      if (onRetry) {
        onRetry(attempt + 1, error);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
};

// Batch request handler with rate limiting protection
export class RPCBatchHandler {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private delayBetweenBatches = 500; // 500ms delay between batches
  
  async add<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await rpcRequestWithRetry(requestFn, {
            maxRetries: 2,
            baseDelay: 1000,
          });
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      this.processQueue();
    });
  }
  
  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, 5); // Process 5 at a time
      
      await Promise.allSettled(
        batch.map(fn => fn())
      );
      
      // Delay between batches to avoid rate limiting
      if (this.queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.delayBetweenBatches));
      }
    }
    
    this.processing = false;
  }
}

// Global batch handler instance
export const rpcBatchHandler = new RPCBatchHandler();

