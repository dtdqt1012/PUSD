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
        return {
          ticketId: id.toString(),
          number: ticket.number.toString().padStart(6, '0'),
          drawId: ticket.drawId.toString(),
          claimed: ticket.claimed,
          prizeAmount: ethers.formatEther(ticket.prizeAmount || 0),
          prizeTier: ticket.prizeTier,
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
        {tickets.map((ticket) => (
          <div key={ticket.ticketId} className={`ticket-card ${ticket.prizeTier > 0 ? 'winner' : ''}`}>
            <div className="ticket-header">
              <div className="ticket-number">#{ticket.number}</div>
              <div className="ticket-draw">Draw #{ticket.drawId}</div>
            </div>
            
            {ticket.prizeTier > 0 && (
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
                  <div className="claimed-badge">Claimed</div>
                )}
              </div>
            )}
            
            {ticket.prizeTier === 0 && (
              <div className="ticket-status">No prize</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

