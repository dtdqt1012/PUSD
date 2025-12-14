// Utility to suppress RPC errors in console
// This prevents spam from rate limiting and internal RPC errors
// Intercepts errors from MetaMask's inpage.js as early as possible

// Helper function to check if an error should be suppressed
function shouldSuppressRPCError(arg: any): boolean {
  try {
    if (!arg) return false;
    
    // Never suppress user denial errors (code 4001 or ACTION_REJECTED)
    if (typeof arg === 'object' && arg !== null) {
      const code = arg.code || arg?.error?.code;
      if (code === 4001 || code === 'ACTION_REJECTED') {
        return false;
      }
      // Check for user rejection in message
      try {
        const message = arg.message || arg?.error?.message || '';
        const messageStr = typeof message === 'string' ? message : String(message);
        if (messageStr.includes('user rejected') || 
            messageStr.includes('User denied') ||
            messageStr.includes('ACTION_REJECTED')) {
          return false;
        }
      } catch (e) {
        // Ignore conversion errors
      }
    }
    
    // Check for RPC error codes
    if (typeof arg === 'object' && arg !== null) {
      // Check if it's a TypeError about ethereum property (wallet extension conflict)
      if (arg.name === 'TypeError') {
        try {
          const message = arg.message || '';
          const messageStr = typeof message === 'string' ? message : String(message);
          if (messageStr.includes('Cannot redefine property: ethereum') ||
              messageStr.includes('Cannot set property ethereum')) {
            return true;
          }
        } catch (e) {
          // Ignore conversion errors
        }
      }
      
      const code = arg.code || arg?.error?.code;
      if (code === -32601 || code === -32603 || code === -32005 || code === -32080 || code === 429) {
        return true;
      }
      
      // Check for CALL_EXCEPTION with missing revert data (non-critical contract reverts)
      if (code === 'CALL_EXCEPTION' || arg.code === 'CALL_EXCEPTION') {
        try {
          const message = arg.message || arg?.error?.message || '';
          const messageStr = typeof message === 'string' ? message : String(message);
          // Suppress missing revert data errors (common when contract reverts without reason)
          if (messageStr.includes('missing revert data')) {
            return true;
          }
        } catch (e) {
          // Ignore conversion errors
        }
      }
      
      // Check message (safely convert to string)
      try {
        const message = arg.message || arg?.error?.message || '';
        const messageStr = typeof message === 'string' ? message : String(message);
        if (messageStr.includes('RPC Error') || 
            messageStr.includes('MetaMask - RPC Error') ||
            messageStr.includes('RPC endpoint returned HTTP client error') ||
            messageStr.includes('Internal JSON-RPC') ||
            messageStr.includes('rate limited') ||
            messageStr.includes('Request is being rate limited') ||
            messageStr.includes('eth_maxPriorityFeePerGas') ||
            messageStr.includes('does not exist') ||
            messageStr.includes('is not available') ||
            messageStr.includes('JsonRpcProvider failed to detect network') ||
            messageStr.includes('failed to detect network') ||
            messageStr.includes('cannot start up') ||
            messageStr.includes('retry in') ||
            messageStr.includes('perhaps the URL is wrong') ||
            messageStr.includes('the node is not started') ||
            messageStr.includes('wallet must has at least one account') ||
            messageStr.includes('Cannot redefine property: ethereum') ||
            messageStr.includes('Cannot set property ethereum') ||
            messageStr.includes('MetaMask encountered an error setting the global Ethereum provider') ||
            messageStr.includes('another Ethereum wallet extension') ||
            messageStr.includes('missing revert data')) {
          return true;
        }
      } catch (e) {
        // Ignore conversion errors
      }
      
      // Check stack trace for MetaMask/inpage.js (safely convert to string)
      try {
        const stack = arg.stack || '';
        const stackStr = typeof stack === 'string' ? stack : String(stack);
        // If error comes from inpage.js or MetaMask scripts, check if it's an RPC error
        if (stackStr.includes('inpage.js') ||
            stackStr.includes('common-2.js') ||
            stackStr.includes('common-3.js') ||
            stackStr.includes('evmAsk.js') ||
            stackStr.includes('contentScript.js') ||
            stackStr.includes('MetaMask')) {
          // Check if it's an RPC error (code -32603, -32601, etc.) or has RPC error message
          const code = arg.code || arg?.error?.code;
          if (code === -32601 || code === -32603 || code === -32005 || code === -32080 || code === 429) {
            return true;
          }
          const message = arg.message || arg?.error?.message || '';
          const messageStr = typeof message === 'string' ? message : String(message);
          if (messageStr.includes('RPC Error') || 
              messageStr.includes('Internal JSON-RPC') ||
              messageStr.includes('MetaMask - RPC Error')) {
            return true;
          }
        }
        // Also check for wallet extension conflicts in stack
        if (stackStr.includes('Cannot redefine property') ||
            stackStr.includes('Cannot set property ethereum')) {
          return true;
        }
      } catch (e) {
        // Ignore conversion errors
      }
      
      // Check data property
      try {
        const data = arg.data || arg?.error?.data;
        if (data && typeof data === 'string' && data.includes('RPC')) {
          return true;
        }
      } catch (e) {
        // Ignore conversion errors
      }
    }
    
    // Check string arguments
    if (typeof arg === 'string') {
      // Never suppress user rejection messages
      if (arg.includes('user rejected') || 
          arg.includes('User denied') ||
          arg.includes('ACTION_REJECTED')) {
        return false;
      }
      
      if (arg.includes('RPC Error') || 
          arg.includes('Internal JSON-RPC') ||
          arg.includes('RPC endpoint returned HTTP client error') ||
          arg.includes('rate limited') ||
          arg.includes('Request is being rate limited') ||
          arg.includes('MetaMask - RPC Error') ||
          arg.includes('eth_maxPriorityFeePerGas') ||
          arg.includes('does not exist') ||
          arg.includes('is not available') ||
          arg.includes('inpage.js') ||
          arg.includes('JsonRpcProvider failed to detect network') ||
          arg.includes('failed to detect network') ||
          arg.includes('cannot start up') ||
          arg.includes('retry in') ||
          arg.includes('perhaps the URL is wrong') ||
          arg.includes('the node is not started') ||
          arg.includes('wallet must has at least one account') ||
          arg.includes('Cannot redefine property: ethereum') ||
          arg.includes('Cannot set property ethereum') ||
          arg.includes('MetaMask encountered an error setting the global Ethereum provider') ||
          arg.includes('another Ethereum wallet extension')) {
        return true;
      }
    }
    
    return false;
  } catch (e) {
    // If any error occurs during checking, don't suppress (fail open)
    return false;
  }
}

// Intercept errors as early as possible (before MetaMask injects its code)

// Override console.error to filter RPC errors (must be done immediately)
// Check if already overridden by inline script to avoid infinite recursion
let originalConsoleError: typeof console.error;
let isOverriding = false;

// Get the actual original console.error (might be overridden by inline script)
if (typeof (console.error as any).__original === 'function') {
  originalConsoleError = (console.error as any).__original;
} else {
  originalConsoleError = console.error.bind(console);
  // Mark as original to avoid recursion
  try {
    (originalConsoleError as any).__original = originalConsoleError;
  } catch (e) {
    // Ignore if can't set property
  }
}

// Only override if console.error is still writable (inline script might have made it read-only)
try {
  const descriptor = Object.getOwnPropertyDescriptor(console, 'error');
  if (descriptor && !descriptor.writable && !descriptor.configurable) {
    // console.error is read-only, inline script already handled it
    // Don't try to override
  } else {
    console.error = function(...args: any[]) {
      // Guard against infinite recursion
      if (isOverriding) {
        return;
      }
      
      try {
        isOverriding = true;
        
        // Check if any argument is an RPC error that should be suppressed
        const hasRPCError = args.some(arg => shouldSuppressRPCError(arg));
        
        // Only log if it's not an RPC error
        if (!hasRPCError) {
          originalConsoleError.apply(console, args);
        }
      } finally {
        isOverriding = false;
      }
    } as typeof console.error;

    // Mark this override so inline script can detect it
    try {
      (console.error as any).__overridden = true;
    } catch (e) {
      // Ignore if can't set property
    }
  }
} catch (e) {
  // If we can't override, that's fine - inline script is handling it
}

// Also handle MetaMask's inpage.js errors and unhandled promise rejections
if (typeof window !== 'undefined') {
  // Handle window.onerror - must be set up early to catch extension errors
  const originalError = window.onerror;
  window.onerror = (message, source, lineno, colno, error) => {
    try {
      // Never suppress user denial errors (code 4001)
      if (error && typeof error === 'object' && 'code' in error && (error as any).code === 4001) {
        if (originalError) return originalError(message, source, lineno, colno, error);
        return false;
      }
      
      // Check if message contains user denial
      if (typeof message === 'string' && (message.includes('User denied') || message.includes('user denied'))) {
        if (originalError) return originalError(message, source, lineno, colno, error);
        return false;
      }
      
      // Check message for wallet extension conflicts (check first, most common)
      const messageStr = typeof message === 'string' ? message : String(message || '');
      if (messageStr.includes('Cannot redefine property: ethereum') ||
          messageStr.includes('Cannot set property ethereum') ||
          messageStr.includes('MetaMask encountered an error setting the global Ethereum provider') ||
          messageStr.includes('another Ethereum wallet extension') ||
          messageStr.includes('TypeError: Cannot redefine property') ||
          messageStr.includes('TypeError: Cannot set property')) {
        return true; // Suppress wallet extension conflicts
      }
      
      // Check source for MetaMask scripts and wallet extensions
      const sourceStr = typeof source === 'string' ? source : String(source || '');
      if (sourceStr.includes('inpage.js') || 
          sourceStr.includes('common-') ||
          sourceStr.includes('evmAsk.js') ||
          sourceStr.includes('contentScript.js') ||
          sourceStr.includes('evmAsk') ||
          sourceStr.includes('MetaMask')) {
        // Only suppress if it's a wallet extension conflict error
        if (messageStr.includes('ethereum') || messageStr.includes('Ethereum provider')) {
          return true; // Suppress wallet extension conflicts
        }
      }
      
      // Suppress RPC errors
      if (error && shouldSuppressRPCError(error)) {
        return true; // Suppress the error
      }
      if (shouldSuppressRPCError(messageStr)) {
        return true; // Suppress the error
      }
      
      if (originalError) {
        return originalError(message, source, lineno, colno, error);
      }
      return false;
    } catch (e) {
      // If error occurs in handler, don't suppress (fail open)
      if (originalError) {
        return originalError(message, source, lineno, colno, error);
      }
      return false;
    }
  };

  // Handle unhandled promise rejections (MetaMask often throws these)
  const originalUnhandledRejection = window.onunhandledrejection;
  window.onunhandledrejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    
    // Never suppress user denial errors (code 4001)
    if (reason && typeof reason === 'object' && reason !== null && 'code' in reason && reason.code === 4001) {
      if (originalUnhandledRejection) {
        return originalUnhandledRejection.call(window, event);
      }
      return;
    }
    
    // Suppress RPC errors and wallet extension conflicts
    if (reason && shouldSuppressRPCError(reason)) {
      event.preventDefault(); // Suppress the error
      return;
    }
    
    // Also check for wallet extension conflicts in unhandled rejections
    if (reason && typeof reason === 'object' && reason !== null) {
      try {
        const message = reason.message || '';
        const messageStr = typeof message === 'string' ? message : String(message);
        if (messageStr.includes('Cannot redefine property: ethereum') ||
            messageStr.includes('Cannot set property ethereum') ||
            messageStr.includes('MetaMask encountered an error setting the global Ethereum provider')) {
          event.preventDefault();
          return;
        }
      } catch (e) {
        // Ignore conversion errors
      }
    }
    
    if (originalUnhandledRejection) {
      return originalUnhandledRejection.call(window, event);
    }
  };

  // Intercept console.warn for MetaMask warnings
  let originalConsoleWarn: typeof console.warn;
  let isOverridingWarn = false;
  
  // Get the actual original console.warn (might be overridden by inline script)
  if (typeof (console.warn as any).__original === 'function') {
    originalConsoleWarn = (console.warn as any).__original;
  } else {
    originalConsoleWarn = console.warn.bind(console);
    try {
      (originalConsoleWarn as any).__original = originalConsoleWarn;
    } catch (e) {
      // Ignore if can't set property
    }
  }
  
  // Only override if console.warn is still writable (inline script might have made it read-only)
  try {
    const descriptor = Object.getOwnPropertyDescriptor(console, 'warn');
    if (descriptor && !descriptor.writable && !descriptor.configurable) {
      // console.warn is read-only, inline script already handled it
      // Don't try to override
    } else {
      console.warn = function(...args: any[]) {
        // Guard against infinite recursion
        if (isOverridingWarn) {
          return;
        }
        
        try {
          isOverridingWarn = true;
          
          // Check if any argument is an RPC error that should be suppressed
          const hasRPCError = args.some(arg => shouldSuppressRPCError(arg));
          
          if (!hasRPCError) {
            originalConsoleWarn.apply(console, args);
          }
        } finally {
          isOverridingWarn = false;
        }
      } as typeof console.warn;
      
      // Mark this override so inline script can detect it
      try {
        (console.warn as any).__overridden = true;
      } catch (e) {
        // Ignore if can't set property
      }
    }
  } catch (e) {
    // If we can't override, that's fine - inline script is handling it
  }
  
  // Also override console.log to catch ethers.js network detection logs
  let originalConsoleLog: typeof console.log;
  let isOverridingLog = false;
  
  if (typeof (console.log as any).__original === 'function') {
    originalConsoleLog = (console.log as any).__original;
  } else {
    originalConsoleLog = console.log.bind(console);
    (originalConsoleLog as any).__original = originalConsoleLog;
  }
  
  console.log = function(...args: any[]) {
    // Guard against infinite recursion
    if (isOverridingLog) {
      return;
    }
    
    try {
      isOverridingLog = true;
      
      // Only suppress specific network detection errors, wallet extension conflicts, and RPC errors
      const shouldSuppress = args.some(arg => {
        if (typeof arg === 'string') {
          return arg.includes('JsonRpcProvider failed to detect network') ||
                 arg.includes('failed to detect network') ||
                 arg.includes('cannot start up') ||
                 arg.includes('retry in') ||
                 arg.includes('perhaps the URL is wrong') ||
                 arg.includes('the node is not started') ||
                 arg.includes('Cannot redefine property: ethereum') ||
                 arg.includes('Cannot set property ethereum') ||
                 arg.includes('MetaMask encountered an error setting the global Ethereum provider') ||
                 arg.includes('another Ethereum wallet extension') ||
                 arg.includes('MetaMask - RPC Error') ||
                 arg.includes('RPC endpoint returned HTTP client error') ||
                 arg.includes('Internal JSON-RPC error') ||
                 arg.includes('Request is being rate limited');
        }
        if (typeof arg === 'object' && arg !== null) {
          const message = arg.message || '';
          const messageStr = typeof message === 'string' ? message : String(message);
          return messageStr.includes('Cannot redefine property: ethereum') ||
                 messageStr.includes('Cannot set property ethereum') ||
                 messageStr.includes('MetaMask encountered an error setting the global Ethereum provider') ||
                 messageStr.includes('MetaMask - RPC Error') ||
                 messageStr.includes('Internal JSON-RPC error') ||
                 messageStr.includes('Request is being rate limited') ||
                 shouldSuppressRPCError(arg); // Use the main suppression function
        }
        return false;
      });
      
      if (!shouldSuppress) {
        originalConsoleLog.apply(console, args);
      }
    } finally {
      isOverridingLog = false;
    }
  } as typeof console.log;
  
  (console.log as any).__overridden = true;
}

export {};

