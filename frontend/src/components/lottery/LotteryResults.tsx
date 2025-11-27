import { useState, useEffect } from 'react';
import { useWeb3 } from '../../hooks/useWeb3';
import { CONTRACTS } from '../../config/contracts';
import { ethers } from 'ethers';

interface DrawResult {
  drawId: string;
  winningNumber: string;
  jackpot: string;
  timestamp: number;
  drawType: number;
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

      // Load recent draws (simplified - in production, use events)
      // For now, show placeholder
      setResults([]);
    } catch (error) {
      console.error('Error loading results:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
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
          </div>
        ))}
      </div>
    </div>
  );
}

