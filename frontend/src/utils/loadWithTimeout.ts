import { isRateLimitError } from './rpcHandler';

// Shared utility for timeout handling with retry mechanism and rate limit handling
export const loadWithTimeout = <T,>(
  promiseFactory: () => Promise<T>, 
  timeout: number,
  retries: number = 0
): Promise<T> => {
  const attempt = (remainingRetries: number): Promise<T> => {
    return Promise.race([
      promiseFactory(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      )
    ]).catch(async (error) => {
      // Handle rate limit errors with exponential backoff
      if (isRateLimitError(error) && remainingRetries > 0) {
        const delay = Math.min(1000 * Math.pow(2, retries - remainingRetries), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
        return attempt(remainingRetries - 1);
      }
      
      if (remainingRetries > 0) {
        // Retry with delay for other errors
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(attempt(remainingRetries - 1));
          }, 1000);
        });
      }
      throw error;
    });
  };
  
  return attempt(retries);
};

