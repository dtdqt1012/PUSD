import { useState, useEffect } from 'react';
import { useWeb3 } from '../hooks/useWeb3';
import { CONTRACTS } from '../config/contracts';
import { ethers } from 'ethers';
import { useNotification } from '../contexts/NotificationContext';
import BuyTickets from '../components/lottery/BuyTickets';
import MyTickets from '../components/lottery/MyTickets';
import LotteryStats from '../components/lottery/LotteryStats';
import LotteryResults from '../components/lottery/LotteryResults';
import '../index.css';

export default function Lottery() {
  const { provider } = useWeb3();
  const [activeTab, setActiveTab] = useState<'buy' | 'tickets' | 'stats' | 'results'>('buy');
  const [currentDraw, setCurrentDraw] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeUntilDraw, setTimeUntilDraw] = useState<string>('');

  useEffect(() => {
    if (provider && CONTRACTS.PUSDLottery) {
      loadCurrentDraw();
    }
  }, [provider]);

  // Auto-update countdown every second
  useEffect(() => {
    const updateCountdown = () => {
      if (currentDraw) {
        const nextDrawTime = getNextDrawTime();
        setTimeUntilDraw(formatTimeUntilDraw(nextDrawTime));
      }
    };

    // Update immediately
    updateCountdown();

    // Update every second
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [currentDraw]);

  const loadCurrentDraw = async () => {
    if (!provider || !CONTRACTS.PUSDLottery) {
      setLoading(false);
      return;
    }
    
    // Check if contract address is valid (not zero address)
    if (CONTRACTS.PUSDLottery.address === '0x0000000000000000000000000000000000000000') {
      setLoading(false);
      return;
    }
    
    try {
      const lotteryContract = new ethers.Contract(
        CONTRACTS.PUSDLottery.address,
        CONTRACTS.PUSDLottery.abi,
        provider
      );

      const drawInfo = await lotteryContract.getCurrentDrawInfo();
      setCurrentDraw({
        drawId: drawInfo.drawId.toString(),
        drawType: drawInfo.drawType,
        jackpot: ethers.formatEther(drawInfo.jackpot || 0),
        ticketsSold: drawInfo.ticketsSold.toString(),
        timestamp: drawInfo.timestamp.toString(),
        resolved: drawInfo.resolved,
      });
    } catch (error) {
      console.error('Error loading draw info:', error);
      // Set default values if contract call fails
      setCurrentDraw({
        drawId: '1',
        drawType: 0,
        jackpot: '0',
        ticketsSold: '0',
        timestamp: Math.floor(Date.now() / 1000).toString(),
        resolved: false,
      });
    } finally {
      setLoading(false);
    }
  };

  const formatTimeUntilDraw = (timestamp: number) => {
    const now = Math.floor(Date.now() / 1000);
    const diff = timestamp - now;
    
    if (diff <= 0) return 'Draw in progress...';
    
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const getNextDrawTime = () => {
    if (!currentDraw) return 0;
    // Daily draw at 20:00 UTC
    const now = new Date();
    const utcHour = now.getUTCHours();
    
    let nextDraw = new Date(now);
    nextDraw.setUTCHours(20, 0, 0, 0);
    
    if (utcHour >= 20) {
      nextDraw.setUTCDate(nextDraw.getUTCDate() + 1);
    }
    
    return Math.floor(nextDraw.getTime() / 1000);
  };

  return (
    <div className="lottery-page">
      <div className="lottery-header">
        <h1>
          <span className="terminal-prompt">&gt;</span> PUSD Lottery
        </h1>
        <p className="lottery-subtitle">
          Win big with PUSD! Buy tickets for 0.1 PUSD each.
        </p>
      </div>

      {loading ? (
        <div className="lottery-loading">
          <span className="terminal-prompt">&gt;</span> Loading lottery data...
        </div>
      ) : (
        <>
          {/* Current Draw Info */}
          {currentDraw && (
            <div className="lottery-draw-info">
              <div className="draw-info-card">
                <div className="draw-info-label">Current Jackpot</div>
                <div className="draw-info-value">
                  {parseFloat(currentDraw.jackpot).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} PUSD
                </div>
              </div>
              <div className="draw-info-card">
                <div className="draw-info-label">Tickets Sold</div>
                <div className="draw-info-value">
                  {parseInt(currentDraw.ticketsSold).toLocaleString()}
                </div>
              </div>
              <div className="draw-info-card">
                <div className="draw-info-label">Next Draw</div>
                <div className="draw-info-value">
                  {timeUntilDraw || formatTimeUntilDraw(getNextDrawTime())}
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="lottery-tabs">
            <button
              className={`lottery-tab ${activeTab === 'buy' ? 'active' : ''}`}
              onClick={() => setActiveTab('buy')}
            >
              Buy Tickets
            </button>
            <button
              className={`lottery-tab ${activeTab === 'tickets' ? 'active' : ''}`}
              onClick={() => setActiveTab('tickets')}
            >
              My Tickets
            </button>
            <button
              className={`lottery-tab ${activeTab === 'stats' ? 'active' : ''}`}
              onClick={() => setActiveTab('stats')}
            >
              Statistics
            </button>
            <button
              className={`lottery-tab ${activeTab === 'results' ? 'active' : ''}`}
              onClick={() => setActiveTab('results')}
            >
              Results
            </button>
          </div>

          {/* Tab Content */}
          <div className="lottery-content">
            {activeTab === 'buy' && (
              <BuyTickets
                onPurchaseSuccess={() => {
                  loadCurrentDraw();
                  setActiveTab('tickets');
                }}
              />
            )}
            {activeTab === 'tickets' && <MyTickets />}
            {activeTab === 'stats' && <LotteryStats />}
            {activeTab === 'results' && <LotteryResults />}
          </div>
        </>
      )}
    </div>
  );
}

