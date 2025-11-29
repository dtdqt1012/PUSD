import { useState, useEffect } from 'react';
import { useWeb3 } from '../../hooks/useWeb3';
import { CONTRACTS } from '../../config/contracts';
import { ethers } from 'ethers';
import { useNotification } from '../../contexts/NotificationContext';
import { formatBalance } from '../../utils/format';

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

  const TICKET_PRICE = 0.1; // 0.1 PUSD

  useEffect(() => {
    if (provider && account && CONTRACTS.PUSDToken) {
      loadBalance();
      checkFreeTicket();
    }
  }, [provider, account]);

  const loadBalance = async () => {
    if (!provider || !account || !CONTRACTS.PUSDToken) return;
    
    try {
      const pusdContract = new ethers.Contract(
        CONTRACTS.PUSDToken.address,
        CONTRACTS.PUSDToken.abi,
        provider
      );
      const balance = await pusdContract.balanceOf(account);
      setPusdBalance(formatBalance(balance));
    } catch (error) {
      console.error('Error loading balance:', error);
    }
  };

  const checkFreeTicket = async () => {
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
      const canClaim = await lotteryContract.canClaimFreeTicket(account);
      setCanClaimFree(canClaim);
    } catch (error) {
      console.error('Error checking free ticket:', error);
      setCanClaimFree(false);
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
      console.error('Error checking approval:', error);
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
      const tx = await pusdContract.approve(CONTRACTS.PUSDLottery.address, maxApproval);
      await tx.wait();
      setApproved(true);
      showNotification('Approval successful! You can now buy tickets without approving again.', 'success');
    } catch (error: any) {
      showNotification(error.message || 'Approval failed', 'error');
    } finally {
      setApproving(false);
    }
  };

  const handleBuyTickets = async () => {
    if (!signer || !CONTRACTS.PUSDLottery) return;
    
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
      const tx = await lotteryContract.buyTickets(quantity);
      showNotification('Transaction submitted...', 'info');
      await tx.wait();
      showNotification(`Successfully purchased ${quantity} ticket(s)!`, 'success');
      setQuantity(1);
      loadBalance();
      onPurchaseSuccess();
    } catch (error: any) {
      showNotification(error.message || 'Purchase failed', 'error');
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
      const tx = await lotteryContract.claimFreeTicket();
      showNotification('Claiming free ticket...', 'info');
      await tx.wait();
      showNotification('Free ticket claimed!', 'success');
      checkFreeTicket();
      onPurchaseSuccess();
    } catch (error: any) {
      showNotification(error.message || 'Claim failed', 'error');
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

        {canClaimFree && (
          <div className="free-ticket-banner">
            <span className="terminal-prompt">&gt;</span> You're eligible for a free ticket! (Hold 100+ PUSD)
            <button
              className="btn-primary"
              onClick={handleClaimFreeTicket}
              disabled={buying}
            >
              {buying ? 'Claiming...' : 'Claim Free Ticket'}
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
              max="1000"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.min(1000, parseInt(e.target.value) || 1)))}
              disabled={buying}
              className="quantity-input"
            />
            <button
              className="quantity-btn"
              onClick={() => setQuantity(Math.min(1000, quantity + 1))}
              disabled={buying}
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
            disabled={buying || parseFloat(pusdBalance) < totalCost}
          >
            {buying ? 'Purchasing...' : `Buy ${quantity} Ticket(s)`}
          </button>
        )}
      </div>
    </div>
  );
}

