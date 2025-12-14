import { useState, useEffect } from 'react';
import { useWeb3 } from '../../hooks/useWeb3';
import { CONTRACTS } from '../../config/contracts';
import { ethers } from 'ethers';
import { cache } from '../../utils/cache';
import { useNotification } from '../../contexts/NotificationContext';
import { executeTransaction, getTransactionErrorMessage } from '../../utils/transaction';
import { callWithRpcFallback, createFallbackProvider } from '../../utils/rpcProvider';

interface Winner {
  address: string;
  ticketId: string;
  ticketNumber: string;
  prizeAmount: string;
  prizeTier: number;
}

interface DrawResult {
  drawId: string;
  winningNumber: string;
  jackpot: string;
  timestamp: number;
  drawType: number;
  winners: Winner[];
}

interface LotteryResultsProps {
  isActive?: boolean;
}

export default function LotteryResults({ isActive = false }: LotteryResultsProps) {
  const { provider, account, signer } = useWeb3();
  const { showNotification } = useNotification();
  const [results, setResults] = useState<DrawResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [userWinningTickets, setUserWinningTickets] = useState<Record<string, { ticketId: string; prizeAmount: string; prizeTier: number; claimed: boolean }[]>>({});
  const [claiming, setClaiming] = useState<Record<string, boolean>>({});

  // Only load when tab is active
  useEffect(() => {
    if (isActive && !hasLoaded && provider && CONTRACTS.PUSDLottery) {
      loadResults();
      setHasLoaded(true);
    }
  }, [isActive, hasLoaded, provider]);

  // Load user's winning tickets when account changes or results load (only if tab is active)
  useEffect(() => {
    if (isActive && account && provider && results.length > 0 && CONTRACTS.PUSDLottery) {
      // Add delay to avoid rate limiting on initial load
      const timeoutId = setTimeout(() => {
        loadUserWinningTickets();
      }, 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [isActive, account, provider, results]);

  const loadResults = async (silent = false) => {
    if (!provider || !CONTRACTS.PUSDLottery) return;
    
    // Check cache first (cache for 2 minutes)
    const cacheKey = 'lottery-results';
    const cached = cache.get<DrawResult[]>(cacheKey);
    if (cached !== null) {
      setResults(cached);
      if (!silent) setLoading(false);
      
      // Refresh in background if cache is older than 30 seconds
      const cacheAge = cache.getAge(cacheKey) || 0;
      if (cacheAge > 30000) {
        loadResults(true).catch(() => {}); // Silent refresh
      }
      return;
    }
    
    if (!silent) setLoading(true);
    try {
      // Use fallback provider for read operations
      const fallbackProvider = createFallbackProvider();
      const lotteryContract = new ethers.Contract(
        CONTRACTS.PUSDLottery.address,
        CONTRACTS.PUSDLottery.abi,
        fallbackProvider
      );

      // Get current draw ID with RPC fallback
      const currentDrawId = await callWithRpcFallback(async (rpcProvider) => {
        const contract = new ethers.Contract(
          CONTRACTS.PUSDLottery.address,
          CONTRACTS.PUSDLottery.abi,
          rpcProvider
        );
        return await contract.currentDrawId();
      });
      
      // Load recent draws (last 10 draws)
      const drawPromises: Promise<DrawResult | null>[] = [];
      const maxDraws = 10;
      const startDrawId = Math.max(1, Number(currentDrawId) - maxDraws + 1);
      
      // Load draws in batches to avoid rate limiting
      const batchSize = 3;
      const loadedResults: (DrawResult | null)[] = [];
      
      for (let i = Number(currentDrawId); i >= startDrawId && i >= 1; i -= batchSize) {
        const batchPromises: Promise<DrawResult | null>[] = [];
        const batchEnd = Math.max(startDrawId, i - batchSize + 1);
        
        for (let j = i; j >= batchEnd && j >= 1; j--) {
          batchPromises.push(
            (async () => {
              try {
                const draw = await callWithRpcFallback(async (rpcProvider) => {
                  const contract = new ethers.Contract(
                    CONTRACTS.PUSDLottery.address,
                    CONTRACTS.PUSDLottery.abi,
                    rpcProvider
                  );
                  return await contract.getDraw(j);
                });
                if (draw.resolved && draw.winningNumber > 0) {
                  return {
                    drawId: j.toString(),
                    winningNumber: draw.winningNumber.toString().padStart(6, '0'),
                    jackpot: ethers.formatEther(draw.jackpot || 0),
                    timestamp: Number(draw.timestamp),
                    drawType: draw.drawType === 0 ? 0 : 1, // 0 = Daily, 1 = Weekly
                    winners: [], // Will be populated later
                  };
                }
                return null;
              } catch (error: any) {
                // Handle rate limiting
                if (error?.code === -32005 || error?.message?.includes('rate limited')) {
                  return null;
                }
                return null;
              }
            })()
          );
        }
        
        const batchResults = await Promise.all(batchPromises);
        loadedResults.push(...batchResults);
        
        // Delay between batches to avoid rate limiting
        if (i - batchSize >= startDrawId) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      const validResults = loadedResults.filter((r): r is DrawResult => r !== null);
      
      // Simplified: Only query RewardClaimed events for resolved draws
      // Query events from each draw's timestamp (much smaller range per draw)
      const resultsWithWinners = await Promise.all(
        validResults.map(async (result) => {
          try {
            const winners: Winner[] = [];
            
            // Get block number from draw timestamp (approximate)
            // Each block is ~2 seconds, so timestamp / 2 gives approximate block
            const drawBlock = Math.floor(result.timestamp / 2);
            const currentBlock = await provider.getBlockNumber();
            // Query events from draw block to current block (but limit to 1000 blocks per draw)
            const fromBlock = Math.max(0, drawBlock - 100);
            const toBlock = Math.min(currentBlock, drawBlock + 1000);
            
            try {
              // Query RewardClaimed events for this draw's time range (small range)
              const rewardClaimedFilter = lotteryContract.filters.RewardClaimed();
              const events = await callWithRpcFallback(async (rpcProvider) => {
                const contract = new ethers.Contract(
                  CONTRACTS.PUSDLottery.address,
                  CONTRACTS.PUSDLottery.abi,
                  rpcProvider
                );
                // Try small range first
                try {
                  return await contract.queryFilter(rewardClaimedFilter, fromBlock, toBlock);
                } catch (error: any) {
                  // If range too large, try even smaller range
                  const midBlock = Math.floor((fromBlock + toBlock) / 2);
                  try {
                    const left = await contract.queryFilter(rewardClaimedFilter, fromBlock, midBlock);
                    await new Promise(resolve => setTimeout(resolve, 300));
                    const right = await contract.queryFilter(rewardClaimedFilter, midBlock + 1, toBlock);
                    return [...left, ...right];
                  } catch {
                    return [];
                  }
                }
              });
              
              // Process events for this draw (limit to first 20 winners to avoid too many RPC calls)
              const maxWinners = 20;
              for (let i = 0; i < Math.min(events.length, maxWinners); i++) {
                try {
                  const event = events[i];
                  if ('args' in event && event.args) {
                    const ticketId = event.args.ticketId || event.args[1];
                    if (ticketId) {
                      const ticket = await callWithRpcFallback(async (rpcProvider) => {
                        const contract = new ethers.Contract(
                          CONTRACTS.PUSDLottery.address,
                          CONTRACTS.PUSDLottery.abi,
                          rpcProvider
                        );
                        return await contract.getTicket(ticketId);
                      });
                      
                      if (ticket.drawId.toString() === result.drawId && ticket.claimed) {
                        const amount = event.args.amount || event.args[2];
                        const tier = event.args.tier || event.args[3];
                        winners.push({
                          address: event.args.user || event.args[0],
                          ticketId: ticketId.toString(),
                          ticketNumber: ticket.number.toString().padStart(6, '0'),
                          prizeAmount: ethers.formatEther(amount || 0),
                          prizeTier: Number(tier || 0),
                        });
                      }
                    }
                  }
                  
                  // Small delay between ticket queries
                  if (i < Math.min(events.length, maxWinners) - 1) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                  }
                } catch (error) {
                  // Skip this event if error
                  continue;
                }
              }
            } catch (error) {
              // If can't query events for this draw, just show draw info without winners
              console.warn(`Could not load winners for draw ${result.drawId}:`, error);
            }
            
            return {
              ...result,
              winners: winners.sort((a, b) => b.prizeTier - a.prizeTier), // Sort by tier (highest first)
            };
          } catch (error) {
            return { ...result, winners: [] };
          }
        })
      );
      
      setResults(resultsWithWinners);
      // Cache for 2 minutes
      cache.set(cacheKey, resultsWithWinners, 120000);
    } catch (error) {
      // Silent errors for background refresh
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Listen for prefetch event
  useEffect(() => {
    const handlePrefetch = () => {
      if (!hasLoaded && provider && CONTRACTS.PUSDLottery) {
        loadResults(true).catch(() => {}); // Silent prefetch
      }
    };
    window.addEventListener('lottery-prefetch-results', handlePrefetch);
    return () => window.removeEventListener('lottery-prefetch-results', handlePrefetch);
  }, [hasLoaded, provider]);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getPrizeTierName = (tier: number) => {
    switch (tier) {
      case 1: return '1st Prize';
      case 2: return '2nd Prize';
      case 3: return '3rd Prize';
      case 4: return '4th Prize';
      case 5: return 'Consolation';
      default: return 'Unknown';
    }
  };

  const loadUserWinningTickets = async () => {
    if (!provider || !account || !CONTRACTS.PUSDLottery) return;

    // Check cache first
    const cacheKey = `user-winning-tickets-${account?.toLowerCase()}`;
    const cached = cache.get<Record<string, { ticketId: string; prizeAmount: string; prizeTier: number; claimed: boolean }[]>>(cacheKey);
    if (cached !== null) {
      setUserWinningTickets(cached);
      return;
    }

    try {
      // Use fallback provider for read operations
      let userTickets: bigint[] = [];
      try {
        userTickets = await callWithRpcFallback(async (rpcProvider) => {
          const contract = new ethers.Contract(
            CONTRACTS.PUSDLottery.address,
            CONTRACTS.PUSDLottery.abi,
            rpcProvider
          );
          return await contract.getUserTickets(account);
        }, 2);
      } catch (error: any) {
        if (error?.code === -32005 || error?.message?.includes('rate limited')) {
          return;
        }
        return;
      }

      if (!userTickets || userTickets.length === 0) {
        setUserWinningTickets({});
        return;
      }

      const winningTicketsByDraw: Record<string, { ticketId: string; prizeAmount: string; prizeTier: number; claimed: boolean }[]> = {};

      // Batch load tickets to reduce RPC calls
      const ticketBatchSize = 10;
      const ticketData: Array<{ ticketId: bigint; ticket: any }> = [];

      for (let i = 0; i < userTickets.length; i += ticketBatchSize) {
        const batch = userTickets.slice(i, i + ticketBatchSize);
        const batchPromises = batch.map(async (ticketId: bigint) => {
          try {
            const ticket = await callWithRpcFallback(async (rpcProvider) => {
              const contract = new ethers.Contract(
                CONTRACTS.PUSDLottery.address,
                CONTRACTS.PUSDLottery.abi,
                rpcProvider
              );
              return await contract.getTicket(ticketId);
            }, 2); // Only 2 retries for batch operations
            return { ticketId, ticket };
          } catch (error: any) {
            if (error?.code === -32005 || error?.message?.includes('rate limited')) {
              return null;
            }
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        ticketData.push(...batchResults.filter((t): t is NonNullable<typeof t> => t !== null));

        // Delay between batches
        if (i + ticketBatchSize < userTickets.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Check each result to see if user has winning tickets
      for (const result of results) {
        const drawId = result.drawId;
        const winningNumber = BigInt(result.winningNumber);

        // Filter tickets for this draw
        const drawTickets = ticketData.filter(t => t.ticket.drawId.toString() === drawId);

        if (drawTickets.length === 0) continue;

        for (const { ticketId, ticket } of drawTickets) {
          // ticket is already loaded from batch, no need to reload
          // Check if ticket is a winner
          const ticketNum = BigInt(ticket.number);
          const ticketLast6 = ticketNum % BigInt(1000000);
          const ticketLast5 = ticketNum % BigInt(100000);
          const ticketLast4 = ticketNum % BigInt(10000);
          const ticketLast3 = ticketNum % BigInt(1000);
          const ticketLast2 = ticketNum % BigInt(100);

          const winningLast6 = winningNumber % BigInt(1000000);
          const winningLast5 = winningNumber % BigInt(100000);
          const winningLast4 = winningNumber % BigInt(10000);
          const winningLast3 = winningNumber % BigInt(1000);
          const winningLast2 = winningNumber % BigInt(100);

          let prizeTier = 0;
          let prizeAmount = BigInt(0);

          // Match contract logic exactly (check from highest to lowest tier)
          if (ticketLast6 === winningLast6) {
            // 1st Prize: 6 digits match (50% of jackpot)
            prizeTier = 1;
            prizeAmount = (BigInt(ethers.parseEther(result.jackpot)) * BigInt(5000)) / BigInt(10000);
          } else if (ticketLast5 === winningLast5) {
            // 2nd Prize: 5 digits match (20% of jackpot)
            prizeTier = 2;
            prizeAmount = (BigInt(ethers.parseEther(result.jackpot)) * BigInt(2000)) / BigInt(10000);
          } else if (ticketLast4 === winningLast4) {
            // 3rd Prize: 4 digits match (10% of jackpot)
            prizeTier = 3;
            prizeAmount = (BigInt(ethers.parseEther(result.jackpot)) * BigInt(1000)) / BigInt(10000);
          } else if (ticketLast3 === winningLast3) {
            // 4th Prize: 3 digits match (5% of jackpot)
            prizeTier = 4;
            prizeAmount = (BigInt(ethers.parseEther(result.jackpot)) * BigInt(500)) / BigInt(10000);
          } else if (ticketLast2 === winningLast2) {
            // Consolation: 2 digits match (1 PUSD fixed)
            prizeTier = 5;
            prizeAmount = BigInt(ethers.parseEther("1")); // Fixed 1 PUSD
          }

          if (prizeTier > 0) {
            if (!winningTicketsByDraw[drawId]) {
              winningTicketsByDraw[drawId] = [];
            }
            winningTicketsByDraw[drawId].push({
              ticketId: ticketId.toString(),
              prizeAmount: ethers.formatEther(prizeAmount.toString()),
              prizeTier,
              claimed: ticket.claimed,
            });
          }
        }
      }

      setUserWinningTickets(winningTicketsByDraw);
      // Cache for 5 minutes
      cache.set(cacheKey, winningTicketsByDraw, 300000);
    } catch (error) {
      // Error loading user winning tickets
    }
  };

  const handleClaimReward = async (drawId: string, ticketId: string) => {
    if (!signer || !CONTRACTS.PUSDLottery) {
      showNotification('Please connect your wallet', 'error');
      return;
    }

    setClaiming(prev => ({ ...prev, [`${drawId}-${ticketId}`]: true }));

    try {
      const lotteryContract = new ethers.Contract(
        CONTRACTS.PUSDLottery.address,
        CONTRACTS.PUSDLottery.abi,
        signer
      );

      await executeTransaction(
        lotteryContract,
        'claimReward',
        [ticketId],
        signer
      );

      showNotification('Reward claimed successfully!', 'success');
      
      // Clear cache to refresh
      cache.delete('lottery-results');
      cache.delete(`user-winning-tickets-${account?.toLowerCase()}`);
      
      // Reload user winning tickets after delay
      setTimeout(() => {
        loadUserWinningTickets();
      }, 2000);
    } catch (error: any) {
      showNotification(getTransactionErrorMessage(error), 'error');
    } finally {
      setClaiming(prev => ({ ...prev, [`${drawId}-${ticketId}`]: false }));
    }
  };

  if (loading) {
    return (
      <div className="lottery-results-container">
        <div className="loading-state">
          <span className="terminal-prompt">&gt;</span> Loading results...
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="lottery-results-container">
        <div className="empty-state">
          <span className="terminal-prompt">&gt;</span> No draw results yet. Check back after the first draw!
        </div>
      </div>
    );
  }

  return (
    <div className="lottery-results-container">
      <h2>
        <span className="terminal-prompt">&gt;</span> Draw Results
      </h2>
      
      <div className="results-list">
        {results.map((result) => (
          <div key={result.drawId} className="result-card">
            <div className="result-header">
              <div className="result-draw-id">Draw #{result.drawId}</div>
            </div>
            
            <div className="result-winning-number">
              <div className="winning-label">Winning Number</div>
              <div className="winning-number-value">
                {result.winningNumber.padStart(6, '0')}
              </div>
            </div>
            
            <div className="result-details">
              <div className="result-detail">
                <span>Jackpot:</span>
                <strong>
                  {parseFloat(result.jackpot).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} PUSD
                </strong>
              </div>
              <div className="result-detail">
                <span>Date:</span>
                <span>{formatDate(result.timestamp)}</span>
              </div>
            </div>
            
            {result.winners && result.winners.length > 0 && (
              <div className="result-winners">
                <div className="winners-header">
                  <span className="terminal-prompt">&gt;</span> Winners ({result.winners.length})
                </div>
                <div className="winners-list">
                  {result.winners.map((winner, idx) => (
                    <div key={winner.ticketId} className="winner-item">
                      <div className="winner-rank">#{idx + 1}</div>
                      <div className="winner-info">
                        <div className="winner-address">
                          {winner.address.slice(0, 6)}...{winner.address.slice(-4)}
                        </div>
                        <div className="winner-ticket">
                          Ticket #{winner.ticketNumber} - {getPrizeTierName(winner.prizeTier)}
                        </div>
                        <div className="winner-amount">
                          {parseFloat(winner.prizeAmount).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })} PUSD
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {result.winners && result.winners.length === 0 && (
              <div className="result-winners">
                <div className="no-winners">
                  <span className="terminal-prompt">&gt;</span> No winners yet (or winners haven't claimed)
                </div>
              </div>
            )}

            {/* Show claim button if user has winning tickets */}
            {account && userWinningTickets[result.drawId] && userWinningTickets[result.drawId].length > 0 && (
              <div className="result-user-winnings">
                <div className="user-winnings-header">
                  <span className="terminal-prompt">&gt;</span> Your Winning Tickets ({userWinningTickets[result.drawId].length})
                </div>
                <div className="user-winnings-list">
                  {userWinningTickets[result.drawId].map((winningTicket) => (
                    <div key={winningTicket.ticketId} className="user-winning-item">
                      <div className="user-winning-info">
                        <div className="user-winning-tier">
                          {getPrizeTierName(winningTicket.prizeTier)}
                        </div>
                        <div className="user-winning-amount">
                          {parseFloat(winningTicket.prizeAmount).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })} PUSD
                        </div>
                      </div>
                      {winningTicket.claimed ? (
                        <div className="claimed-badge">✓ Claimed</div>
                      ) : (
                        <button
                          className="claim-button"
                          onClick={() => handleClaimReward(result.drawId, winningTicket.ticketId)}
                          disabled={claiming[`${result.drawId}-${winningTicket.ticketId}`]}
                        >
                          {claiming[`${result.drawId}-${winningTicket.ticketId}`] ? 'Claiming...' : 'Claim Reward'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Debug info: Show user's tickets for this draw if no winners found */}
            {account && (!userWinningTickets[result.drawId] || userWinningTickets[result.drawId].length === 0) && (
              <div className="result-debug-info" style={{ marginTop: '10px', padding: '10px', background: '#1a1a1a', borderRadius: '4px', fontSize: '12px', color: '#888' }}>
                <div>Winning Number: {result.winningNumber}</div>
                <div>Check your tickets in "My Tickets" tab to see if any match the last 2-6 digits</div>
                <div style={{ marginTop: '5px', fontSize: '11px' }}>
                  Prize tiers: 6 digits (1st), 5 digits (2nd), 4 digits (3rd), 3 digits (4th), 2 digits (Consolation)
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

