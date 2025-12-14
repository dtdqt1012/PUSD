import { useState, useEffect } from 'react';
import { useWeb3 } from '../../hooks/useWeb3';
import { CONTRACTS } from '../../config/contracts';
import { ethers } from 'ethers';
import { useNotification } from '../../contexts/NotificationContext';
import { callWithRpcFallback } from '../../utils/rpcProvider';

interface Ticket {
  ticketId: string;
  number: string;
  drawId: string;
  claimed: boolean;
  prizeAmount: string;
  prizeTier: number;
  winningNumber?: string;
  drawResolved?: boolean;
}

interface MyTicketsProps {
  isActive?: boolean;
}

export default function MyTickets({ isActive = false }: MyTicketsProps) {
  const { provider, account, signer } = useWeb3();
  const { showNotification } = useNotification();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [drawInfo, setDrawInfo] = useState<Record<string, any>>({});
  const [displayedTickets, setDisplayedTickets] = useState<Ticket[]>([]);
  const [ticketsPerPage] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [targetDrawId, setTargetDrawId] = useState<number | null>(null);

  // Helper function to convert BigInt to string for JSON serialization
  const serializeForStorage = (obj: any): any => {
    if (obj === null || obj === undefined) {
      return obj;
    }
    if (typeof obj === 'bigint') {
      return obj.toString();
    }
    if (Array.isArray(obj)) {
      return obj.map(item => serializeForStorage(item));
    }
    if (typeof obj === 'object') {
      const result: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          result[key] = serializeForStorage(obj[key]);
        }
      }
      return result;
    }
    return obj;
  };

  // Helper functions for localStorage
  const getTicketsFromStorage = (): Ticket[] | null => {
    if (!account) return null;
    try {
      const key = `lottery-tickets-${account.toLowerCase()}`;
        const stored = localStorage.getItem(key);
        if (stored) {
          const data = JSON.parse(stored);
          // Check if data is not too old (7 days - increased to reduce RPC calls significantly)
          const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
          if (Date.now() - data.timestamp < maxAge) {
            return data.tickets as Ticket[];
          }
        }
    } catch (error) {
      // Error reading tickets from localStorage
    }
    return null;
  };

  const saveTicketsToStorage = (tickets: Ticket[]) => {
    if (!account) return;
    try {
      const key = `lottery-tickets-${account.toLowerCase()}`;
      // Convert any BigInt to string before storing
      const serializedTickets = serializeForStorage(tickets);
      localStorage.setItem(key, JSON.stringify({
        tickets: serializedTickets,
        timestamp: Date.now()
      }));
    } catch (error) {
      // Error saving tickets to localStorage
    }
  };

  const clearTicketsFromStorage = () => {
    if (!account) return;
    try {
      const key = `lottery-tickets-${account.toLowerCase()}`;
      localStorage.removeItem(key);
    } catch (error) {
      // Error clearing tickets from localStorage
    }
  };

  // Reset hasLoaded when account changes
  useEffect(() => {
    setHasLoaded(false);
    setTickets([]);
    setDisplayedTickets([]);
    setCurrentPage(1);
    // Clear localStorage when account changes
    if (account) {
      clearTicketsFromStorage();
      // Also clear draw info cache
      try {
        const drawInfoKey = `lottery-draw-info-${account.toLowerCase()}`;
        localStorage.removeItem(drawInfoKey);
      } catch (error) {
        // Ignore
      }
    }
  }, [account]);

  // Auto-detect target draw ID if not set
  useEffect(() => {
    if (isActive && targetDrawId === null && provider && account && CONTRACTS.PUSDLottery) {
      setLoading(true);
      // Try to get current draw ID and use previous draw (most recent resolved draw)
      const autoDetectDraw = async () => {
        try {
          const currentDrawId = await callWithRpcFallback(async (rpcProvider) => {
            const contract = new ethers.Contract(
              CONTRACTS.PUSDLottery.address,
              CONTRACTS.PUSDLottery.abi,
              rpcProvider
            );
            return await contract.currentDrawId();
          });
          // Use previous draw (currentDrawId - 1) as target, or current if no previous
          const targetId = Number(currentDrawId) > 1 ? Number(currentDrawId) - 1 : Number(currentDrawId);
          setTargetDrawId(targetId);
        } catch (error) {
          // If can't get draw ID, try to load from localStorage or set to current draw
          // Failed to auto-detect draw ID
          // Try to get from localStorage or use draw ID 1 as fallback
          const cachedTickets = getTicketsFromStorage();
          if (cachedTickets && cachedTickets.length > 0) {
            // Use the most recent draw ID from cached tickets
            const drawIds = [...new Set(cachedTickets.map(t => Number(t.drawId)))];
            if (drawIds.length > 0) {
              const maxDrawId = Math.max(...drawIds);
              setTargetDrawId(maxDrawId);
            } else {
              setTargetDrawId(1); // Fallback to draw 1
            }
          } else {
            setTargetDrawId(1); // Fallback to draw 1
          }
        }
      };
      autoDetectDraw();
    }
  }, [isActive, targetDrawId, provider, account]);

  // Only load tickets when tab is active AND there's a target draw ID
  useEffect(() => {
    if (isActive && provider && account && CONTRACTS.PUSDLottery && targetDrawId !== null) {
      // Check if tickets match current targetDrawId
      const ticketsMatchDraw = tickets.length > 0 && tickets.every(t => t.drawId === targetDrawId.toString());
      
      // If no tickets loaded or tickets don't match current draw, reload
      if (!hasLoaded || !ticketsMatchDraw) {
        // Try to load from localStorage first (only if not forced refresh)
        const cachedTickets = getTicketsFromStorage();
        if (cachedTickets && cachedTickets.length > 0 && !ticketsMatchDraw) {
          // Filter cached tickets by target draw ID
          const filteredCached = cachedTickets.filter(t => t.drawId === targetDrawId.toString());
          if (filteredCached.length > 0) {
            setTickets(filteredCached);
            setLoading(false);
            setHasLoaded(true);
            // Load from RPC in background to update
            loadTickets(true, false);
          } else {
            loadTickets(false, false);
          }
        } else {
          loadTickets(false, false);
        }
        setHasLoaded(true);
      }
    } else if (isActive && targetDrawId === null) {
      // If active but no target draw ID yet, keep loading
      setLoading(true);
    }
  }, [isActive, hasLoaded, provider, account, targetDrawId]);

  // Update displayed tickets when page changes
  useEffect(() => {
    const startIndex = (currentPage - 1) * ticketsPerPage;
    const endIndex = startIndex + ticketsPerPage;
    setDisplayedTickets(tickets.slice(startIndex, endIndex));
  }, [currentPage, tickets, ticketsPerPage]);

  // Listen for draw triggered event to refresh tickets (only if tab is active)
  useEffect(() => {
    const handleDrawTriggered = async (event: any) => {
      if (provider && account && CONTRACTS.PUSDLottery) {
        // After draw is triggered, new draw is created
        // New tickets will be in the NEW draw (currentDrawId), not the resolved draw
        // So we should update targetDrawId to current draw to show new tickets
        try {
          const currentDrawId = await callWithRpcFallback(async (rpcProvider) => {
            const contract = new ethers.Contract(
              CONTRACTS.PUSDLottery.address,
              CONTRACTS.PUSDLottery.abi,
              rpcProvider
            );
            return await contract.currentDrawId();
          });
          
          // Set target to current draw (where new tickets will be added)
          // This ensures new tickets purchased after draw trigger will be visible
          setTargetDrawId(Number(currentDrawId));
        } catch (error) {
            // Error getting current draw ID
          // Fallback: use resolved draw ID from event if available
          if (event.detail && event.detail.drawId) {
            // But add 1 to get the new draw (resolved draw + 1 = new draw)
            setTargetDrawId(event.detail.drawId + 1);
          } else {
            // If can't get draw ID, try to get from contract one more time
            try {
              const lotteryContract = new ethers.Contract(
                CONTRACTS.PUSDLottery.address,
                CONTRACTS.PUSDLottery.abi,
                provider
              );
              const currentDrawId = await lotteryContract.currentDrawId();
              setTargetDrawId(Number(currentDrawId));
            } catch (error2) {
              // Error getting draw ID
              return;
            }
          }
        }
        
        // Reset state to clear old tickets from UI
        setHasLoaded(false);
        setTickets([]);
        setDisplayedTickets([]);
        setCurrentPage(1);
        setDrawInfo({});
        
        // Clear localStorage to force fresh load
        clearTicketsFromStorage();
        
        // If tab is active, reload tickets after a delay (force refresh from RPC)
        if (isActive) {
          // Wait a bit for blockchain to update, then force refresh from RPC
          setTimeout(() => {
            loadTickets(false, true); // forceRefresh = true to always fetch from RPC
          }, 3000);
        }
      }
    };

    const handleTicketPurchased = async () => {
      if (provider && account && CONTRACTS.PUSDLottery) {
        // Clear localStorage to force fresh load and avoid RPC limit
        clearTicketsFromStorage();
        // Also clear draw info cache
        try {
          const drawInfoKey = `lottery-draw-info-${account.toLowerCase()}`;
          localStorage.removeItem(drawInfoKey);
        } catch (error) {
          // Ignore
        }
        // Reset state to clear old tickets from UI
        setTickets([]);
        setDisplayedTickets([]);
        setDrawInfo({});
        setHasLoaded(false);
        setCurrentPage(1);
        
        // Update targetDrawId to current draw (where new tickets are added)
        try {
          const currentDrawId = await callWithRpcFallback(async (rpcProvider) => {
            const contract = new ethers.Contract(
              CONTRACTS.PUSDLottery.address,
              CONTRACTS.PUSDLottery.abi,
              rpcProvider
            );
            return await contract.currentDrawId();
          });
          // Set target to current draw (where new tickets are)
          setTargetDrawId(Number(currentDrawId));
        } catch (error) {
          // If can't get current draw, keep existing targetDrawId
          // Failed to get current draw ID
        }
        
        // If tab is active, reload tickets after a delay (force refresh from RPC)
        if (isActive) {
          // Wait a bit for blockchain to update, then force refresh from RPC
          setTimeout(() => {
            loadTickets(false, true); // forceRefresh = true to always fetch from RPC
          }, 2000);
        }
      }
    };

    window.addEventListener('lottery-draw-triggered', handleDrawTriggered);
    window.addEventListener('lottery-ticket-purchased', handleTicketPurchased);
    return () => {
      window.removeEventListener('lottery-draw-triggered', handleDrawTriggered);
      window.removeEventListener('lottery-ticket-purchased', handleTicketPurchased);
    };
  }, [isActive, provider, account]);

  const loadTickets = async (silent = false, forceRefresh = false) => {
    if (!provider || !account || !CONTRACTS.PUSDLottery) return;
    
    // If targetDrawId is set, only load tickets from that draw
    if (targetDrawId === null) {
      // No target draw, don't load anything
      if (!silent) {
        setLoading(false);
      }
      return;
    }
    
    if (!silent) {
      setLoading(true);
    }
    try {
      // Use single provider with fallback (avoid FallbackProvider network mismatch issues)
      const lotteryContract = new ethers.Contract(
        CONTRACTS.PUSDLottery.address,
        CONTRACTS.PUSDLottery.abi,
        provider
      );

      // Always fetch ticket IDs from RPC (never cache this)
      const ticketIds = await callWithRpcFallback(async (rpcProvider) => {
        const contract = new ethers.Contract(
          CONTRACTS.PUSDLottery.address,
          CONTRACTS.PUSDLottery.abi,
          rpcProvider
        );
        return await contract.getUserTickets(account);
      }).catch((error: any) => {
        // Handle case where user has no tickets or contract call fails
        if (error?.code === 'CALL_EXCEPTION' || error?.message?.includes('missing revert data')) {
          return []; // Return empty array if call fails (user might have no tickets)
        }
        if (error?.code === -32005 || error?.message?.includes('rate limited')) {
          return [];
        }
        throw error; // Re-throw other errors
      });
      
      if (!ticketIds || ticketIds.length === 0) {
        setTickets([]);
        // Save empty array to localStorage
        saveTicketsToStorage([]);
        if (!silent) {
          setLoading(false);
        }
        return;
      }
      
      // Filter tickets by target draw ID - we'll filter during loading for efficiency
      
      // Optimize: If user has few tickets, load all at once without batching
      const ticketsData: Array<{id: bigint, ticket: any, drawId: string}> = [];
      const targetDrawIdStr = targetDrawId.toString();
      const SMALL_BATCH_THRESHOLD = 50; // If user has < 50 tickets, load all at once
      
      if (ticketIds.length <= SMALL_BATCH_THRESHOLD) {
        // Load all tickets in parallel for small amounts
        const allPromises = ticketIds.map(async (id) => {
          try {
            // Use callWithRpcFallback for each ticket to handle RPC errors
            const ticket = await callWithRpcFallback(async (rpcProvider) => {
              const contract = new ethers.Contract(
                CONTRACTS.PUSDLottery.address,
                CONTRACTS.PUSDLottery.abi,
                rpcProvider
              );
              return await contract.getTicket(id);
            });
            if (ticket) {
              const drawId = ticket.drawId.toString();
              // Early filter: only keep tickets from target draw
              if (drawId === targetDrawIdStr) {
                return {
                  id,
                  ticket,
                  drawId
                };
              }
            }
            return null;
          } catch (error: any) {
            if (error?.code === 'CALL_EXCEPTION' || error?.message?.includes('missing revert data')) {
              return null;
            }
            if (error?.code === -32005 || error?.message?.includes('rate limited')) {
              return null;
            }
            if (error?.code === 'NETWORK_ERROR' || error?.message?.includes('network changed')) {
              return null; // Skip network errors
            }
            return null; // Return null for any other errors to continue
          }
        });
        
        const allResults = await Promise.all(allPromises);
        const validTickets = allResults.filter((t): t is NonNullable<typeof t> => t !== null);
        ticketsData.push(...validTickets);
      } else {
        // For large amounts, use batching
        const batchSize = 20;
        const maxTicketsToLoad = 1000;
        
        for (let i = 0; i < Math.min(ticketIds.length, maxTicketsToLoad); i += batchSize) {
          const batch = ticketIds.slice(i, i + batchSize);
          const batchPromises = batch.map(async (id: string) => {
            try {
              // Use callWithRpcFallback for each ticket to handle RPC errors
              const ticket = await callWithRpcFallback(async (rpcProvider) => {
                const contract = new ethers.Contract(
                  CONTRACTS.PUSDLottery.address,
                  CONTRACTS.PUSDLottery.abi,
                  rpcProvider
                );
                return await contract.getTicket(id);
              });
              if (ticket) {
                const drawId = ticket.drawId.toString();
                if (drawId === targetDrawIdStr) {
                  return {
                    id,
                    ticket,
                    drawId
                  };
                }
              }
              return null;
            } catch (error: any) {
              if (error?.code === 'CALL_EXCEPTION' || error?.message?.includes('missing revert data')) {
                return null;
              }
              if (error?.code === -32005 || error?.message?.includes('rate limited')) {
                return null;
              }
              if (error?.code === 'NETWORK_ERROR' || error?.message?.includes('network changed')) {
                return null; // Skip network errors
              }
              return null; // Return null for any other errors to continue
            }
          });
          
          const batchResults = await Promise.all(batchPromises);
          const validTickets = batchResults.filter((t): t is NonNullable<typeof t> => t !== null);
          ticketsData.push(...validTickets);
          
          // Only delay if we have more batches
          if (i + batchSize < Math.min(ticketIds.length, maxTicketsToLoad)) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }
      
      // Only load draw info for target draw ID (optimization)
      let currentDrawId: bigint;
      try {
        currentDrawId = await lotteryContract.currentDrawId();
      } catch (error: any) {
        currentDrawId = BigInt(0);
      }
      
      const drawDataCache: Record<string, any> = {};
      const drawInfoCache: Record<string, any> = {};
      
      // Try to load draw info from localStorage first (only if not force refresh)
      if (!forceRefresh) {
        try {
          const drawInfoKey = `lottery-draw-info-${account?.toLowerCase()}`;
          const storedDrawInfo = localStorage.getItem(drawInfoKey);
          if (storedDrawInfo) {
            const parsed = JSON.parse(storedDrawInfo);
            if (Date.now() - parsed.timestamp < 7 * 24 * 60 * 60 * 1000) {
              // Only get target draw from cache
              if (parsed.data[targetDrawIdStr]) {
                drawInfoCache[targetDrawIdStr] = parsed.data[targetDrawIdStr];
                try {
                  const cachedDraw = parsed.data[targetDrawIdStr];
                  drawDataCache[targetDrawIdStr] = {
                    resolved: cachedDraw.resolved,
                    winningNumber: BigInt(cachedDraw.winningNumber || '0'),
                    ticketsSold: BigInt(cachedDraw.ticketsSold || '0'),
                    jackpot: BigInt(cachedDraw.jackpot || '0'),
                  };
                } catch (error) {
                  // If conversion fails, will fetch from RPC
                }
              }
            }
          }
        } catch (error) {
          // Ignore localStorage errors
        }
      }
      
      // Only fetch target draw if not in cache or force refresh
      if (!drawDataCache[targetDrawIdStr] || forceRefresh) {
        try {
          const draw = await callWithRpcFallback(async (rpcProvider) => {
            const contract = new ethers.Contract(
              CONTRACTS.PUSDLottery.address,
              CONTRACTS.PUSDLottery.abi,
              rpcProvider
            );
            return await contract.getDraw(targetDrawIdStr);
          });
          
          if (draw) {
            // Store draw data with all fields needed for prize calculation
            drawDataCache[targetDrawIdStr] = {
              resolved: draw.resolved,
              winningNumber: draw.winningNumber,
              ticketsSold: draw.ticketsSold,
              jackpot: draw.jackpot, // Ensure jackpot is included
            };
            
            const drawIdNum = Number(targetDrawIdStr);
            const currentDrawIdNum = Number(currentDrawId);
            
            const drawInfo = {
              resolved: draw.resolved,
              winningNumber: draw.winningNumber.toString(),
              ticketsSold: draw.ticketsSold.toString(),
              jackpot: draw.jackpot.toString(),
              currentDrawId: currentDrawId.toString(),
              isPreviousDraw: drawIdNum === currentDrawIdNum - 1,
              isOldDraw: drawIdNum < currentDrawIdNum - 1,
              isCurrentDraw: drawIdNum === currentDrawIdNum,
            };
            
            drawInfoCache[targetDrawIdStr] = drawInfo;
            setDrawInfo(prev => ({
              ...prev,
              [targetDrawIdStr]: drawInfo
            }));
            
            // Save to localStorage (merge with existing)
            try {
              const drawInfoKey = `lottery-draw-info-${account?.toLowerCase()}`;
              const storedDrawInfo = localStorage.getItem(drawInfoKey);
              let existingData: Record<string, any> = {};
              if (storedDrawInfo) {
                const parsed = JSON.parse(storedDrawInfo);
                if (Date.now() - parsed.timestamp < 7 * 24 * 60 * 60 * 1000) {
                  existingData = parsed.data || {};
                }
              }
              existingData[targetDrawIdStr] = drawInfo;
              localStorage.setItem(drawInfoKey, JSON.stringify({
                data: existingData,
                timestamp: Date.now()
              }));
            } catch (error) {
              // Ignore localStorage errors
            }
          }
        } catch (error: any) {
          // If draw fetch fails, continue without draw info
          // Failed to load draw info
        }
      } else {
        // Restore drawInfo from cache
        setDrawInfo(drawInfoCache);
      }
      
      // Process tickets using cached draw data (synchronous, no async needed)
      const processedTickets = ticketsData.map(({ id, ticket, drawId }) => {
        // Get draw info to check if resolved and get winning number
        let winningNumber = '';
        let drawResolved = false;
        let calculatedPrizeAmount = '0';
        let calculatedPrizeTier = 0;
        
        const draw = drawDataCache[drawId];
        if (draw) {
          drawResolved = draw.resolved;
          
          // Also check if draw was resolved but winningNumber is 0 (edge case)
          if (drawResolved && draw.winningNumber === 0) {
            drawResolved = false; // Treat as not resolved
          }
          
          if (drawResolved && draw.winningNumber > 0) {
            winningNumber = draw.winningNumber.toString().padStart(6, '0');
            
            // Calculate prize if draw is resolved (even if not claimed yet)
            // Extract last N digits for matching
            const ticketNum = BigInt(ticket.number);
            const winningNum = BigInt(draw.winningNumber);
            const ticketLast6 = ticketNum % BigInt(1000000);
            const ticketLast5 = ticketNum % BigInt(100000);
            const ticketLast4 = ticketNum % BigInt(10000);
            const ticketLast3 = ticketNum % BigInt(1000);
            const ticketLast2 = ticketNum % BigInt(100);
            
            const winningLast6 = winningNum % BigInt(1000000);
            const winningLast5 = winningNum % BigInt(100000);
            const winningLast4 = winningNum % BigInt(10000);
            const winningLast3 = winningNum % BigInt(1000);
            const winningLast2 = winningNum % BigInt(100);
            
            let prizeAmount = BigInt(0);
            let prizeTier = 0;
            
            // Get jackpot from draw (handle both BigInt and object formats)
            const jackpot = draw.jackpot ? (typeof draw.jackpot === 'bigint' ? draw.jackpot : BigInt(draw.jackpot.toString())) : BigInt(0);
            
            if (ticketLast6 === winningLast6) {
              // 1st Prize: 50% of jackpot
              prizeAmount = (jackpot * BigInt(5000)) / BigInt(10000);
              prizeTier = 1;
            } else if (ticketLast5 === winningLast5) {
              // 2nd Prize: 20% of jackpot
              prizeAmount = (jackpot * BigInt(2000)) / BigInt(10000);
              prizeTier = 2;
            } else if (ticketLast4 === winningLast4) {
              // 3rd Prize: 10% of jackpot
              prizeAmount = (jackpot * BigInt(1000)) / BigInt(10000);
              prizeTier = 3;
            } else if (ticketLast3 === winningLast3) {
              // 4th Prize: 5% of jackpot
              prizeAmount = (jackpot * BigInt(500)) / BigInt(10000);
              prizeTier = 4;
            } else if (ticketLast2 === winningLast2) {
              // Consolation: 1 PUSD
              prizeAmount = BigInt('1000000000000000000'); // 1 PUSD
              prizeTier = 5;
            }
            
            calculatedPrizeAmount = ethers.formatEther(prizeAmount.toString());
            calculatedPrizeTier = prizeTier;
          }
        }
        
        // Use calculated prize if draw is resolved, otherwise use ticket's prize (if already claimed)
        const finalPrizeAmount = drawResolved && calculatedPrizeTier > 0 
          ? calculatedPrizeAmount 
          : ethers.formatEther(ticket.prizeAmount || 0);
        const finalPrizeTier = drawResolved && calculatedPrizeTier > 0 
          ? calculatedPrizeTier 
          : ticket.prizeTier;
        
        return {
          ticketId: id.toString(),
          number: ticket.number.toString().padStart(6, '0'),
          drawId: drawId,
          claimed: ticket.claimed,
          prizeAmount: finalPrizeAmount,
          prizeTier: finalPrizeTier,
          winningNumber: winningNumber,
          drawResolved: drawResolved,
        };
      });
      
      // Filter out null tickets and ensure they match target draw
      const validTickets = processedTickets.filter((ticket): ticket is NonNullable<typeof ticket> => 
        ticket !== null && ticket.drawId === targetDrawId.toString()
      );
      const sortedTickets = validTickets.reverse(); // Newest first
      setTickets(sortedTickets);
      
      // Save to localStorage
      saveTicketsToStorage(sortedTickets);
      
      // Update displayed tickets for pagination
      const startIndex = (currentPage - 1) * ticketsPerPage;
      const endIndex = startIndex + ticketsPerPage;
      setDisplayedTickets(sortedTickets.slice(startIndex, endIndex));
    } catch (error: any) {
      // Only log non-CALL_EXCEPTION errors (CALL_EXCEPTION with missing revert data is handled above)
      if (error?.code !== 'CALL_EXCEPTION' || !error?.message?.includes('missing revert data')) {
        // Error loading tickets
      }
      // Set empty tickets on error (user might have no tickets)
      setTickets([]);
      // Clear localStorage on error
      clearTicketsFromStorage();
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async (ticketId: string) => {
    if (!signer || !CONTRACTS.PUSDLottery) return;
    
    setClaiming(ticketId);
    try {
      const lotteryContract = new ethers.Contract(
        CONTRACTS.PUSDLottery.address,
        CONTRACTS.PUSDLottery.abi,
        signer
      );
      const tx = await lotteryContract.claimReward(ticketId);
      showNotification('Claiming reward...', 'info');
      await tx.wait();
      showNotification('Reward claimed successfully!', 'success');
      // Clear localStorage to force fresh load
      clearTicketsFromStorage();
      loadTickets(false, true); // forceRefresh = true to always fetch from RPC
    } catch (error: any) {
      showNotification(error.message || 'Claim failed', 'error');
    } finally {
      setClaiming(null);
    }
  };

  const getPrizeTierName = (tier: number) => {
    switch (tier) {
      case 1: return '1st Prize';
      case 2: return '2nd Prize';
      case 3: return '3rd Prize';
      case 4: return '4th Prize';
      case 5: return 'Consolation';
      default: return 'No Prize';
    }
  };

  if (loading) {
    return (
      <div className="my-tickets-container">
        <div className="loading-state">
          <span className="terminal-prompt">&gt;</span> Loading your tickets...
          <div className="loading-dots">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </div>
        </div>
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="my-tickets-container">
        <div className="empty-state">
          <span className="terminal-prompt">&gt;</span> No tickets found. Buy some tickets to get started!
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(tickets.length / ticketsPerPage);

  return (
    <div className="my-tickets-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2>
          <span className="terminal-prompt">&gt;</span> My Tickets ({tickets.length})
          {tickets.length > ticketsPerPage && (
            <span style={{ fontSize: '0.9rem', color: '#888', marginLeft: '0.5rem' }}>
              (Showing {((currentPage - 1) * ticketsPerPage) + 1}-{Math.min(currentPage * ticketsPerPage, tickets.length)})
            </span>
          )}
        </h2>
        <button
          className="btn-primary btn-small"
          onClick={() => loadTickets(false, true)} // forceRefresh = true to always fetch from RPC
          disabled={loading}
          style={{ minWidth: '120px' }}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      
      {targetDrawId === null && !loading && (
        <div className="no-tickets-message" style={{ 
          padding: '40px', 
          textAlign: 'center', 
          color: '#888',
          background: '#1a1a1a',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <div style={{ fontSize: '18px', marginBottom: '10px' }}>
            <span className="terminal-prompt">&gt;</span> Detecting draw...
          </div>
          <div style={{ fontSize: '14px' }}>
            Please wait while we detect the current draw.
          </div>
        </div>
      )}

      {targetDrawId !== null && displayedTickets.length === 0 && !loading && (
        <div className="no-tickets-message" style={{ 
          padding: '40px', 
          textAlign: 'center', 
          color: '#888',
          background: '#1a1a1a',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <div style={{ fontSize: '18px', marginBottom: '10px' }}>
            <span className="terminal-prompt">&gt;</span> No tickets found for Draw #{targetDrawId}
          </div>
          <div style={{ fontSize: '14px' }}>
            You don't have any tickets in this draw.
          </div>
        </div>
      )}

      {targetDrawId !== null && (
        <div style={{ marginBottom: '15px', padding: '10px', background: '#1a1a1a', borderRadius: '4px', fontSize: '14px' }}>
          <span className="terminal-prompt">&gt;</span> Showing tickets from Draw #{targetDrawId}
          {tickets.length > 0 && (
            <span style={{ marginLeft: '10px', color: '#888' }}>
              ({tickets.length} total ticket{tickets.length !== 1 ? 's' : ''})
            </span>
          )}
        </div>
      )}

      <div className="tickets-grid">
        {displayedTickets.map((ticket) => {
          const isWinner = ticket.prizeTier > 0;
          const showResult = ticket.drawResolved;
          
          return (
            <div key={ticket.ticketId} className={`ticket-card ${isWinner ? 'winner' : showResult ? 'no-prize' : 'pending'}`}>
              <div className="ticket-header">
                <div className="ticket-number">#{ticket.number}</div>
                <div className="ticket-draw">Draw #{ticket.drawId}</div>
              </div>
              
              {showResult && ticket.winningNumber && (
                <div className="ticket-winning-info">
                  <div className="winning-number-display">
                    <span className="winning-label">Winning Number:</span>
                    <span className="winning-number-value">{ticket.winningNumber}</span>
                  </div>
                  <div className="ticket-comparison">
                    <span className="your-number">Your Number: {ticket.number}</span>
                    <span className={`match-status ${isWinner ? 'match' : 'no-match'}`}>
                      {isWinner ? '✓ MATCH!' : '✗ No Match'}
                    </span>
                  </div>
                </div>
              )}
              
              {!showResult && (
                <div className="ticket-status pending-status">
                  <span className="terminal-prompt">&gt;</span> Waiting for draw resolution
                  {ticket.drawId && drawInfo[ticket.drawId] ? (
                    <div className="pending-draw-info">
                      <div className="pending-draw-status">
                        {drawInfo[ticket.drawId].isPreviousDraw ? (
                          <span className="status-warning">⚠️ Previous draw - should be resolved</span>
                        ) : drawInfo[ticket.drawId].isCurrentDraw ? (
                          <span className="status-info">⏳ Current draw - will resolve on next trigger</span>
                        ) : (
                          <span className="status-warning">⚠️ Old draw - may need manual resolution</span>
                        )}
                      </div>
                      {drawInfo[ticket.drawId].ticketsSold !== '0' && (
                        <div className="pending-draw-details">
                          <span>Tickets Sold: <strong>{drawInfo[ticket.drawId].ticketsSold}</strong></span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="loading-draw-info">
                      <span className="terminal-prompt">&gt;</span> Loading draw info...
                    </div>
                  )}
                </div>
              )}
              
              {isWinner && (
                <div className="ticket-prize">
                  <div className="prize-tier">{getPrizeTierName(ticket.prizeTier)}</div>
                  <div className="prize-amount">
                    {parseFloat(ticket.prizeAmount).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })} PUSD
                  </div>
                  {!ticket.claimed && (
                    <button
                      className="btn-primary btn-small"
                      onClick={() => handleClaim(ticket.ticketId)}
                      disabled={claiming === ticket.ticketId}
                    >
                      {claiming === ticket.ticketId ? 'Claiming...' : 'Claim Reward'}
                    </button>
                  )}
                  {ticket.claimed && (
                    <div className="claimed-badge">✓ Claimed</div>
                  )}
                </div>
              )}
              
              {showResult && ticket.prizeTier === 0 && (
                <div className="ticket-status no-prize-status">
                  <span className="terminal-prompt">&gt;</span> No prize - Better luck next time!
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {tickets.length > ticketsPerPage && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '2rem' }}>
          <button
            className="btn-primary btn-small"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1 || loading}
          >
            <span className="terminal-prompt">&lt;</span> PREVIOUS
          </button>
          <span style={{ color: '#888' }}>
            Page {currentPage} of {totalPages}
          </span>
          <button
            className="btn-primary btn-small"
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages || loading}
          >
            <span className="terminal-prompt">&gt;</span> NEXT
          </button>
        </div>
      )}
    </div>
  );
}

