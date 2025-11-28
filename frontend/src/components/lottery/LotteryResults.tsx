import { useState, useEffect } from 'react';
import { useWeb3 } from '../../hooks/useWeb3';
import { CONTRACTS } from '../../config/contracts';
import { ethers } from 'ethers';

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

export default function LotteryResults() {
  const { provider } = useWeb3();
  const [results, setResults] = useState<DrawResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (provider && CONTRACTS.PUSDLottery) {
      loadResults();
    }
  }, [provider]);

  const loadResults = async () => {
    if (!provider || !CONTRACTS.PUSDLottery) return;
    
    setLoading(true);
    try {
      const lotteryContract = new ethers.Contract(
        CONTRACTS.PUSDLottery.address,
        CONTRACTS.PUSDLottery.abi,
        provider
      );

      // Get current draw ID
      const currentDrawId = await lotteryContract.currentDrawId();
      
      // Load recent draws (last 10 draws)
      const drawPromises: Promise<DrawResult | null>[] = [];
      const maxDraws = 10;
      const startDrawId = Math.max(1, Number(currentDrawId) - maxDraws + 1);
      
      for (let i = Number(currentDrawId); i >= startDrawId && i >= 1; i--) {
        drawPromises.push(
          (async () => {
            try {
              const draw = await lotteryContract.getDraw(i);
              if (draw.resolved && draw.winningNumber > 0) {
                return {
                  drawId: i.toString(),
                  winningNumber: draw.winningNumber.toString().padStart(6, '0'),
                  jackpot: ethers.formatEther(draw.jackpot || 0),
                  timestamp: Number(draw.timestamp),
                  drawType: draw.drawType === 0 ? 0 : 1, // 0 = Daily, 1 = Weekly
                  winners: [], // Will be populated later
                };
              }
              return null;
            } catch (error) {
              return null;
            }
          })()
        );
      }
      
      const loadedResults = await Promise.all(drawPromises);
      const validResults = loadedResults.filter((r): r is DrawResult => r !== null);
      
      // Load winners for each draw from RewardClaimed events
      const resultsWithWinners = await Promise.all(
        validResults.map(async (result) => {
          try {
            // Query RewardClaimed events for this draw
            // We need to get tickets for this draw and check which ones were claimed
            // For now, we'll query all RewardClaimed events and filter by drawId
            const rewardClaimedFilter = lotteryContract.filters.RewardClaimed();
            const currentBlock = await provider.getBlockNumber();
            const fromBlock = Math.max(0, currentBlock - 1000000); // Last 1M blocks
            
            const events = await lotteryContract.queryFilter(
              rewardClaimedFilter,
              fromBlock,
              currentBlock
            );
            
            const winners: Winner[] = [];
            for (const event of events) {
              try {
                // Type guard: check if event is EventLog
                if ('args' in event && event.args) {
                  // Get ticket info to check drawId
                  const ticket = await lotteryContract.getTicket(event.args.ticketId);
                  if (ticket.drawId.toString() === result.drawId && ticket.claimed) {
                    winners.push({
                      address: event.args.user,
                      ticketId: event.args.ticketId.toString(),
                      ticketNumber: ticket.number.toString().padStart(6, '0'),
                      prizeAmount: ethers.formatEther(event.args.amount),
                      prizeTier: event.args.tier,
                    });
                  }
                }
              } catch (error) {
                // Skip invalid tickets
              }
            }
            
            return {
              ...result,
              winners: winners.sort((a, b) => a.prizeTier - b.prizeTier), // Sort by tier
            };
          } catch (error) {
            return { ...result, winners: [] };
          }
        })
      );
      
      setResults(resultsWithWinners);
    } catch (error) {
      console.error('Error loading results:', error);
    } finally {
      setLoading(false);
    }
  };

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
              <div className="result-type">
                {result.drawType === 0 ? 'Daily' : 'Weekly'}
              </div>
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
          </div>
        ))}
      </div>
    </div>
  );
}

