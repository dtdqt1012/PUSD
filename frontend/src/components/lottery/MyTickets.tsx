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

  useEffect(() => {
    if (provider && account && CONTRACTS.PUSDLottery) {
      loadTickets();
    }
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
        try {
          const draw = await lotteryContract.getDraw(drawId);
          drawResolved = draw.resolved;
          if (drawResolved) {
            winningNumber = draw.winningNumber.toString().padStart(6, '0');
          }
        } catch (error) {
          // Draw might not exist yet
        }
        
        return {
          ticketId: id.toString(),
          number: ticket.number.toString().padStart(6, '0'),
          drawId: drawId,
          claimed: ticket.claimed,
          prizeAmount: ethers.formatEther(ticket.prizeAmount || 0),
          prizeTier: ticket.prizeTier,
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
      <h2>
        <span className="terminal-prompt">&gt;</span> My Tickets ({tickets.length})
      </h2>
      
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
                  <span className="terminal-prompt">&gt;</span> Draw not resolved yet
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

