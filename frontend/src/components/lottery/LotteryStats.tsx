import { useState, useEffect } from 'react';
import { useWeb3 } from '../../hooks/useWeb3';
import { CONTRACTS } from '../../config/contracts';
import { ethers } from 'ethers';

export default function LotteryStats() {
  const { provider } = useWeb3();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (provider && CONTRACTS.PUSDLottery) {
      loadStats();
    }
  }, [provider]);

  const loadStats = async () => {
    if (!provider || !CONTRACTS.PUSDLottery) return;
    
    setLoading(true);
    try {
      // Load stats from contract events or state
      // For now, show placeholder stats
      setStats({
        totalTicketsSold: 0,
        totalPrizesDistributed: 0,
        totalBurned: 0,
        biggestWin: 0,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="lottery-stats-container">
        <div className="loading-state">
          <span className="terminal-prompt">&gt;</span> Loading statistics...
        </div>
      </div>
    );
  }

  return (
    <div className="lottery-stats-container">
      <h2>
        <span className="terminal-prompt">&gt;</span> Lottery Statistics
      </h2>
      
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Tickets Sold</div>
          <div className="stat-value">
            {stats?.totalTicketsSold.toLocaleString() || '0'}
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">Total Prizes Distributed</div>
          <div className="stat-value">
            {stats?.totalPrizesDistributed.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }) || '0'} PUSD
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">Total PUSD Burned</div>
          <div className="stat-value">
            {stats?.totalBurned.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }) || '0'} PUSD
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">Biggest Win</div>
          <div className="stat-value">
            {stats?.biggestWin.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }) || '0'} PUSD
          </div>
        </div>
      </div>
    </div>
  );
}

