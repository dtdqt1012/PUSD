import { useState, useEffect } from 'react';
import { useWeb3 } from '../../hooks/useWeb3';
import { CONTRACTS } from '../../config/contracts';
import { ethers } from 'ethers';
import { useNotification } from '../../contexts/NotificationContext';

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

export default function MyTickets() {
  const { provider, account, signer } = useWeb3();
  const { showNotification } = useNotification();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [drawInfo, setDrawInfo] = useState<Record<string, any>>({});

  useEffect(() => {
    if (provider && account && CONTRACTS.PUSDLottery) {
      loadTickets();
    }
  }, [provider, account]);

  // Listen for draw triggered event to refresh tickets
  useEffect(() => {
    const handleDrawTriggered = () => {
      console.log('Draw triggered event received, refreshing tickets...');
      if (provider && account && CONTRACTS.PUSDLottery) {
        // Wait a bit for blockchain to update
        setTimeout(() => {
          loadTickets();
        }, 3000);
      }
    };

    window.addEventListener('lottery-draw-triggered', handleDrawTriggered);
    return () => {
      window.removeEventListener('lottery-draw-triggered', handleDrawTriggered);
    };
  }, [provider, account]);

  const loadTickets = async () => {
    if (!provider || !account || !CONTRACTS.PUSDLottery) return;
    
    setLoading(true);
    try {
      const lotteryContract = new ethers.Contract(
        CONTRACTS.PUSDLottery.address,
        CONTRACTS.PUSDLottery.abi,
        provider
      );

      const ticketIds = await lotteryContract.getUserTickets(account);
      const ticketPromises = ticketIds.map(async (id: bigint) => {
        const ticket = await lotteryContract.getTicket(id);
        const drawId = ticket.drawId.toString();
        
        // Get draw info to check if resolved and get winning number
        let winningNumber = '';
        let drawResolved = false;
        let calculatedPrizeAmount = '0';
        let calculatedPrizeTier = 0;
        
        try {
          const draw = await lotteryContract.getDraw(drawId);
          const currentDrawId = await lotteryContract.currentDrawId();
          drawResolved = draw.resolved;
          
          // Store draw info for display
          const drawIdNum = Number(drawId);
          const currentDrawIdNum = Number(currentDrawId);
          
          setDrawInfo(prev => ({
            ...prev,
            [drawId]: {
              resolved: draw.resolved,
              winningNumber: draw.winningNumber.toString(),
              ticketsSold: draw.ticketsSold.toString(),
              currentDrawId: currentDrawId.toString(),
              isPreviousDraw: drawIdNum === currentDrawIdNum - 1,
              isOldDraw: drawIdNum < currentDrawIdNum - 1,
              isCurrentDraw: drawIdNum === currentDrawIdNum,
            }
          }));
          
          // Debug: log draw info
          console.log(`Draw #${drawId}: resolved=${draw.resolved}, winningNumber=${draw.winningNumber}, ticketsSold=${draw.ticketsSold}, currentDrawId=${currentDrawId}`);
          
          // Check if draw needs to be resolved
          if (!drawResolved && draw.ticketsSold > 0) {
            console.warn(`Draw #${drawId} has tickets but is not resolved. Current draw ID: ${currentDrawId}`);
            
            if (drawIdNum === currentDrawIdNum - 1) {
              console.error(`⚠️ Draw #${drawId} should have been resolved when draw #${currentDrawId} was created!`);
              console.error(`This might be a contract issue. Draw #${drawId} needs to be resolved manually.`);
            } else if (drawIdNum < currentDrawIdNum - 1) {
              console.warn(`Draw #${drawId} is an old draw (current is #${currentDrawId}). It should have been resolved earlier.`);
            } else if (drawIdNum === currentDrawIdNum) {
              console.info(`Draw #${drawId} is the current draw. It will be resolved when next draw is triggered.`);
            }
          } else if (!drawResolved && draw.ticketsSold === 0) {
            console.info(`Draw #${drawId} has no tickets sold, so it won't be resolved.`);
          }
          
          // Also check if draw was resolved but winningNumber is 0 (edge case)
          if (drawResolved && draw.winningNumber === 0) {
            console.warn(`Draw #${drawId} is marked as resolved but winningNumber is 0!`);
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
            
            if (ticketLast6 === winningLast6) {
              // 1st Prize: 50% of jackpot
              prizeAmount = (BigInt(draw.jackpot.toString()) * BigInt(5000)) / BigInt(10000);
              prizeTier = 1;
            } else if (ticketLast5 === winningLast5) {
              // 2nd Prize: 20% of jackpot
              prizeAmount = (BigInt(draw.jackpot.toString()) * BigInt(2000)) / BigInt(10000);
              prizeTier = 2;
            } else if (ticketLast4 === winningLast4) {
              // 3rd Prize: 10% of jackpot
              prizeAmount = (BigInt(draw.jackpot.toString()) * BigInt(1000)) / BigInt(10000);
              prizeTier = 3;
            } else if (ticketLast3 === winningLast3) {
              // 4th Prize: 5% of jackpot
              prizeAmount = (BigInt(draw.jackpot.toString()) * BigInt(500)) / BigInt(10000);
              prizeTier = 4;
            } else if (ticketLast2 === winningLast2) {
              // Consolation: 1 PUSD
              prizeAmount = BigInt('1000000000000000000'); // 1 PUSD
              prizeTier = 5;
            }
            
            calculatedPrizeAmount = ethers.formatEther(prizeAmount.toString());
            calculatedPrizeTier = prizeTier;
          }
        } catch (error) {
          // Draw might not exist yet
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
      
      const loadedTickets = await Promise.all(ticketPromises);
      setTickets(loadedTickets.reverse()); // Newest first
    } catch (error) {
      console.error('Error loading tickets:', error);
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
      loadTickets();
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

  return (
    <div className="my-tickets-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2>
          <span className="terminal-prompt">&gt;</span> My Tickets ({tickets.length})
        </h2>
        <button
          className="btn-primary btn-small"
          onClick={loadTickets}
          disabled={loading}
          style={{ minWidth: '120px' }}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      
      <div className="tickets-grid">
        {tickets.map((ticket) => {
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
    </div>
  );
}

