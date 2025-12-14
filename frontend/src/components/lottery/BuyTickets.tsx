import { useState, useEffect } from 'react';
import { useWeb3 } from '../../hooks/useWeb3';
import { CONTRACTS } from '../../config/contracts';
import { ethers } from 'ethers';
import { useNotification } from '../../contexts/NotificationContext';
import { formatBalance } from '../../utils/format';
import { executeTransaction, getTransactionErrorMessage } from '../../utils/transaction';
import { cache } from '../../utils/cache';

interface BuyTicketsProps {
  onPurchaseSuccess: () => void;
}

export default function BuyTickets({ onPurchaseSuccess }: BuyTicketsProps) {
  const { provider, account, signer } = useWeb3();
  const { showNotification } = useNotification();
  const [quantity, setQuantity] = useState(1);
  const [approving, setApproving] = useState(false);
  const [buying, setBuying] = useState(false);
  const [approved, setApproved] = useState(false);
  const [pusdBalance, setPusdBalance] = useState('0');
  const [canClaimFree, setCanClaimFree] = useState(false);
  const [freeTicketsAvailable, setFreeTicketsAvailable] = useState(0);
  const [ticketsPurchasedToday, setTicketsPurchasedToday] = useState(0);
  const [remainingTicketsToday, setRemainingTicketsToday] = useState(6);

  const TICKET_PRICE = 0.1; // 0.1 PUSD
  const MAX_TICKETS_PER_DAY = 6; // Maximum 6 tickets per day

  useEffect(() => {
    if (provider && account && CONTRACTS.PUSDToken) {
      loadBalance();
      checkFreeTicket();
      loadDailyTicketLimit();
    }
  }, [provider, account]);

  const loadBalance = async () => {
    if (!provider || !account || !CONTRACTS.PUSDToken) return;
    
    // Check cache first
    const cacheKey = `pusd-balance-${account}`;
    const cached = cache.get<string>(cacheKey);
    if (cached !== null) {
      setPusdBalance(cached);
      return;
    }
    
    try {
      const pusdContract = new ethers.Contract(
        CONTRACTS.PUSDToken.address,
        CONTRACTS.PUSDToken.abi,
        provider
      );
      const balance = await pusdContract.balanceOf(account);
      const formattedBalance = formatBalance(balance);
      setPusdBalance(formattedBalance);
      // Cache for 1 minute
      cache.set(cacheKey, formattedBalance, 60000);
    } catch (error) {
      // Error loading balance
    }
  };

  const checkFreeTicket = async () => {
    if (!provider || !account || !CONTRACTS.PUSDLottery) return;
    
    // Check if contract address is valid
    if (CONTRACTS.PUSDLottery.address === '0x0000000000000000000000000000000000000000') {
      return;
    }
    
    // Check cache first
    const cacheKey = `free-ticket-${account}`;
    const cached = cache.get<{ canClaim: boolean; freeTickets: number }>(cacheKey);
    if (cached !== null) {
      setCanClaimFree(cached.canClaim);
      setFreeTicketsAvailable(cached.freeTickets);
      return;
    }
    
    try {
      const lotteryContract = new ethers.Contract(
        CONTRACTS.PUSDLottery.address,
        CONTRACTS.PUSDLottery.abi,
        provider
      );
      const canClaim = await lotteryContract.canClaimFreeTicket(account);
      const freeTickets = await lotteryContract.getFreeTicketsAvailable(account);
      const freeTicketData = {
        canClaim,
        freeTickets: Number(freeTickets)
      };
      setCanClaimFree(canClaim);
      setFreeTicketsAvailable(Number(freeTickets));
      // Cache for 1 minute
      cache.set(cacheKey, freeTicketData, 60000);
    } catch (error) {
      setCanClaimFree(false);
      setFreeTicketsAvailable(0);
    }
  };

  const loadDailyTicketLimit = async () => {
    if (!provider || !account || !CONTRACTS.PUSDLottery) return;
    
    // Check if contract address is valid
    if (CONTRACTS.PUSDLottery.address === '0x0000000000000000000000000000000000000000') {
      return;
    }
    
    try {
      const lotteryContract = new ethers.Contract(
        CONTRACTS.PUSDLottery.address,
        CONTRACTS.PUSDLottery.abi,
        provider
      );
      const purchased = await lotteryContract.getTicketsPurchasedToday(account);
      const remaining = await lotteryContract.getRemainingTicketsToday(account);
      setTicketsPurchasedToday(Number(purchased));
      setRemainingTicketsToday(Number(remaining));
    } catch (error) {
      // If function doesn't exist yet (old contract), set defaults
      setTicketsPurchasedToday(0);
      setRemainingTicketsToday(MAX_TICKETS_PER_DAY);
    }
  };

  const checkApproval = async () => {
    if (!provider || !account || !signer || !CONTRACTS.PUSDToken || !CONTRACTS.PUSDLottery) return;
    
    try {
      const pusdContract = new ethers.Contract(
        CONTRACTS.PUSDToken.address,
        CONTRACTS.PUSDToken.abi,
        provider
      );
      const allowance = await pusdContract.allowance(account, CONTRACTS.PUSDLottery.address);
      const totalCost = ethers.parseEther((quantity * TICKET_PRICE).toString());
      // Check if allowance is sufficient (at least 100 PUSD or unlimited)
      const minApproval = ethers.parseEther('100'); // Approve at least 100 PUSD
      setApproved(allowance >= totalCost && allowance >= minApproval);
    } catch (error) {
      // Error checking approval
    }
  };

  useEffect(() => {
    if (quantity > 0) {
      checkApproval();
    }
  }, [quantity, provider, account]);

  const handleApprove = async () => {
    if (!signer || !CONTRACTS.PUSDToken || !CONTRACTS.PUSDLottery) return;
    
    setApproving(true);
    try {
      const pusdContract = new ethers.Contract(
        CONTRACTS.PUSDToken.address,
        CONTRACTS.PUSDToken.abi,
        signer
      );
      // Approve unlimited (MaxUint256) so user only needs to approve once
      const maxApproval = ethers.MaxUint256;
      await executeTransaction(
        pusdContract,
        'approve',
        [CONTRACTS.PUSDLottery.address, maxApproval],
        signer
      );
      setApproved(true);
      showNotification('Approval successful! You can now buy tickets without approving again.', 'success');
    } catch (error: any) {
      showNotification(getTransactionErrorMessage(error), 'error');
    } finally {
      setApproving(false);
    }
  };

  const handleBuyTickets = async () => {
    if (!signer || !CONTRACTS.PUSDLottery) return;
    
    // Check daily limit
    if (quantity > remainingTicketsToday) {
      showNotification(`You can only buy ${remainingTicketsToday} more ticket(s) today (6 tickets/day limit)`, 'error');
      return;
    }
    
    const totalCost = quantity * TICKET_PRICE;
    if (parseFloat(pusdBalance) < totalCost) {
      showNotification('Insufficient PUSD balance', 'error');
      return;
    }
    
    setBuying(true);
    try {
      const lotteryContract = new ethers.Contract(
        CONTRACTS.PUSDLottery.address,
        CONTRACTS.PUSDLottery.abi,
        signer
      );
      
      await executeTransaction(
        lotteryContract,
        'buyTickets',
        [quantity],
        signer
      );
      showNotification(`Successfully purchased ${quantity} ticket(s)!`, 'success');
      setQuantity(1);
      // Clear cache to force refresh
      if (account) {
        cache.delete(`pusd-balance-${account}`);
        cache.delete(`free-ticket-${account}`);
        // Clear localStorage tickets to avoid RPC limit
        try {
          const key = `lottery-tickets-${account.toLowerCase()}`;
          localStorage.removeItem(key);
          // Also clear draw info cache
          const drawInfoKey = `lottery-draw-info-${account.toLowerCase()}`;
          localStorage.removeItem(drawInfoKey);
        } catch (error) {
          // Ignore localStorage errors
        }
      }
      loadBalance();
      checkFreeTicket();
      loadDailyTicketLimit(); // Refresh daily limit
      // Dispatch event to notify MyTickets component
      window.dispatchEvent(new CustomEvent('lottery-ticket-purchased'));
      onPurchaseSuccess();
    } catch (error: any) {
      const errorMessage = getTransactionErrorMessage(error);
      if (errorMessage.includes('Network error') || errorMessage.includes('RPC') || errorMessage.includes('retried multiple times')) {
        showNotification(`Network is busy. Please try again with a smaller quantity (${Math.min(6, remainingTicketsToday)} tickets or less) or wait a moment.`, 'error');
      } else if (errorMessage.includes('Insufficient') || errorMessage.includes('balance') || errorMessage.includes('allowance')) {
        showNotification(errorMessage, 'error');
      } else if (errorMessage.includes('Exceeds ticket limit') || errorMessage.includes('ticket limit')) {
        showNotification(errorMessage, 'error');
      } else {
        showNotification(errorMessage || 'Transaction failed. Please try again with a smaller quantity.', 'error');
      }
    } finally {
      setBuying(false);
    }
  };

  const handleClaimFreeTicket = async () => {
    if (!signer || !CONTRACTS.PUSDLottery) return;
    
    setBuying(true);
    try {
      const lotteryContract = new ethers.Contract(
        CONTRACTS.PUSDLottery.address,
        CONTRACTS.PUSDLottery.abi,
        signer
      );
      await executeTransaction(
        lotteryContract,
        'claimFreeTicket',
        [],
        signer
      );
      showNotification('Free ticket claimed!', 'success');
      // Clear cache to force refresh
      if (account) {
        cache.delete(`free-ticket-${account}`);
        cache.delete(`pusd-balance-${account}`);
        // Clear localStorage tickets to avoid RPC limit
        try {
          const key = `lottery-tickets-${account.toLowerCase()}`;
          localStorage.removeItem(key);
          // Also clear draw info cache
          const drawInfoKey = `lottery-draw-info-${account.toLowerCase()}`;
          localStorage.removeItem(drawInfoKey);
        } catch (error) {
          // Ignore localStorage errors
        }
      }
      checkFreeTicket();
      loadBalance();
      // Dispatch event to notify MyTickets component
      window.dispatchEvent(new CustomEvent('lottery-ticket-purchased'));
      onPurchaseSuccess();
    } catch (error: any) {
      showNotification(getTransactionErrorMessage(error), 'error');
    } finally {
      setBuying(false);
    }
  };

  const totalCost = quantity * TICKET_PRICE;

  return (
    <div className="buy-tickets-container">
      <div className="buy-tickets-card">
        <h2>
          <span className="terminal-prompt">&gt;</span> Buy Tickets
        </h2>
        
        <div className="balance-info">
          <div className="balance-label">
            <span className="terminal-prompt">&gt;</span> Your PUSD Balance
          </div>
          <div className="balance-value">
            {parseFloat(pusdBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PUSD
          </div>
        </div>

        <div className="draw-limit-info" style={{ 
          marginTop: '1rem', 
          padding: '0.75rem', 
          background: remainingTicketsToday === 0 ? '#3a1a1a' : '#1a2a1a', 
          borderRadius: '4px',
          fontSize: '14px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              <span className="terminal-prompt">&gt;</span> Daily Limit: {ticketsPurchasedToday}/{MAX_TICKETS_PER_DAY} tickets
            </span>
            <span style={{ color: remainingTicketsToday === 0 ? '#ff6b6b' : '#4ade80' }}>
              {remainingTicketsToday} remaining today
            </span>
          </div>
        </div>

        {canClaimFree && freeTicketsAvailable > 0 && (
          <div className="free-ticket-banner">
            <span className="terminal-prompt">&gt;</span> You're eligible for {freeTicketsAvailable} free ticket{freeTicketsAvailable > 1 ? 's' : ''} this week!
            <div className="free-ticket-info">
              {parseFloat(pusdBalance) >= 10000 && <span>Hold 10,000+ PUSD = 12 tickets/week</span>}
              {parseFloat(pusdBalance) >= 5000 && parseFloat(pusdBalance) < 10000 && <span>Hold 5,000+ PUSD = 5 tickets/week</span>}
              {parseFloat(pusdBalance) >= 2000 && parseFloat(pusdBalance) < 5000 && <span>Hold 2,000+ PUSD = 2 tickets/week</span>}
              {parseFloat(pusdBalance) >= 1000 && parseFloat(pusdBalance) < 2000 && <span>Hold 1,000+ PUSD = 1 ticket/week</span>}
            </div>
            <button
              className="btn-primary"
              onClick={handleClaimFreeTicket}
              disabled={buying}
            >
              {buying ? 'Claiming...' : `Claim ${freeTicketsAvailable} Free Ticket${freeTicketsAvailable > 1 ? 's' : ''}`}
            </button>
          </div>
        )}

        <div className="ticket-quantity">
          <label>
            <span className="terminal-prompt">&gt;</span> Number of Tickets
          </label>
          <div className="quantity-controls">
            <button
              className="quantity-btn"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={buying}
            >
              -
            </button>
            <input
              type="number"
              min="1"
              max={Math.min(MAX_TICKETS_PER_DAY, remainingTicketsToday)}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.min(MAX_TICKETS_PER_DAY, remainingTicketsToday, parseInt(e.target.value) || 1)))}
              disabled={buying || remainingTicketsToday === 0}
              className="quantity-input"
            />
            <button
              className="quantity-btn"
              onClick={() => setQuantity(Math.min(MAX_TICKETS_PER_DAY, remainingTicketsToday, quantity + 1))}
              disabled={buying || remainingTicketsToday === 0 || quantity >= remainingTicketsToday}
            >
              +
            </button>
          </div>
        </div>

        <div className="ticket-cost">
          <div className="cost-line">
            <span>Price per ticket:</span>
            <span>{TICKET_PRICE} PUSD</span>
          </div>
          <div className="cost-line total">
            <span>Total cost:</span>
            <strong>{totalCost.toFixed(2)} PUSD</strong>
          </div>
        </div>

        <div className="revenue-split-info">
          <div className="split-item">
            <span>80%</span>
            <span>→ Jackpot Pool</span>
          </div>
          <div className="split-item">
            <span>10%</span>
            <span>→ Reward Distributor</span>
          </div>
          <div className="split-item">
            <span>5%</span>
            <span>→ Development Fund</span>
          </div>
          <div className="split-item">
            <span>5%</span>
            <span>→ Burn PUSD</span>
          </div>
        </div>

        {!approved ? (
          <button
            className="btn-primary btn-large"
            onClick={handleApprove}
            disabled={approving || buying}
          >
            {approving ? 'Approving...' : 'Approve PUSD'}
          </button>
        ) : (
          <button
            className="btn-primary btn-large"
            onClick={handleBuyTickets}
            disabled={buying || parseFloat(pusdBalance) < totalCost || remainingTicketsToday === 0 || quantity > remainingTicketsToday}
          >
            {buying ? 'Purchasing...' : remainingTicketsToday === 0 ? 'Daily Limit Reached (6/6)' : `Buy ${quantity} Ticket(s)`}
          </button>
        )}
      </div>
    </div>
  );
}

