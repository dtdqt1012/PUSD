// Shared utility for timeout handling with retry mechanism
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
    ]).catch((error) => {
      if (remainingRetries > 0) {
        // Retry with delay
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

