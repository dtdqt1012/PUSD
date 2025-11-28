import { useState, useEffect } from 'react';
import { useWeb3 } from '../../hooks/useWeb3';
import { CONTRACTS } from '../../config/contracts';
import { ethers } from 'ethers';
import { loadWithTimeout } from '../../utils/loadWithTimeout';

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
      const lotteryContract = new ethers.Contract(
        CONTRACTS.PUSDLottery.address,
        CONTRACTS.PUSDLottery.abi,
        provider
      );

      const currentBlock = await provider.getBlockNumber();
      // Use last 500k blocks as default (faster, covers ~2-3 months)
      // If lottery is older, we can increase this later
      let fromBlock = Math.max(0, currentBlock - 500000);

      // Helper function to query events with pagination (optimized)
      const queryEventsWithPagination = async (filter: any, from: number, to: number) => {
        const maxRangePerQuery = 200000; // Increased batch size
        const totalRange = to - from;
        
        if (totalRange <= maxRangePerQuery) {
          try {
            return await loadWithTimeout(
              () => lotteryContract.queryFilter(filter, from, to),
              30000, // Reduced timeout
              1 // Reduced retries
            ).catch(() => []);
          } catch (error) {
            return [];
          }
        }
        
        const allEvents: any[] = [];
        let batchFrom = from;
        
        while (batchFrom < to) {
          const batchTo = Math.min(batchFrom + maxRangePerQuery, to);
          try {
            const batchEvents = await loadWithTimeout(
              () => lotteryContract.queryFilter(filter, batchFrom, batchTo),
              30000, // Reduced timeout
              1 // Reduced retries
            ).catch(() => []);
            
            allEvents.push(...batchEvents);
            batchFrom = batchTo + 1;
            
            if (batchFrom < to) {
              await new Promise(resolve => setTimeout(resolve, 200)); // Reduced delay
            }
          } catch (error) {
            batchFrom = batchTo + 1;
          }
        }
        
        return allEvents;
      };

      // Query both events in parallel for faster loading
      const [ticketsEvents, rewardEvents] = await Promise.all([
        (async () => {
          try {
            const ticketsPurchasedFilter = lotteryContract.filters.TicketsPurchased();
            return await queryEventsWithPagination(
              ticketsPurchasedFilter,
              fromBlock,
              currentBlock
            );
          } catch (error) {
            console.error('Error loading tickets sold:', error);
            return [];
          }
        })(),
        (async () => {
          try {
            const rewardClaimedFilter = lotteryContract.filters.RewardClaimed();
            return await queryEventsWithPagination(
              rewardClaimedFilter,
              fromBlock,
              currentBlock
            );
          } catch (error) {
            console.error('Error loading prizes:', error);
            return [];
          }
        })()
      ]);

      // 1. Calculate total tickets sold
      let totalTicketsSold = 0;
      for (const event of ticketsEvents) {
        if ('args' in event && event.args) {
          const ticketIds = event.args.ticketIds;
          if (Array.isArray(ticketIds)) {
            totalTicketsSold += ticketIds.length;
          }
        }
      }

      // 2. Calculate total prizes distributed and biggest win
      let totalPrizesDistributed = BigInt(0);
      let biggestWin = BigInt(0);
      for (const event of rewardEvents) {
        if ('args' in event && event.args) {
          const amount = event.args.amount;
          if (amount) {
            totalPrizesDistributed += BigInt(amount.toString());
            if (BigInt(amount.toString()) > biggestWin) {
              biggestWin = BigInt(amount.toString());
            }
          }
        }
      }

      // 3. Calculate total burned (5% of ticket sales)
      // Each ticket costs 0.1 PUSD, 5% is burned
      const ticketPrice = BigInt('100000000000000000'); // 0.1 PUSD in wei
      const burnRate = BigInt(500); // 5% = 500/10000
      const totalSales = BigInt(totalTicketsSold) * ticketPrice;
      const totalBurned = (totalSales * burnRate) / BigInt(10000);

      setStats({
        totalTicketsSold,
        totalPrizesDistributed: ethers.formatEther(totalPrizesDistributed.toString()),
        totalBurned: ethers.formatEther(totalBurned.toString()),
        biggestWin: ethers.formatEther(biggestWin.toString()),
      });
    } catch (error) {
      console.error('Error loading stats:', error);
      // Set default values on error
      setStats({
        totalTicketsSold: 0,
        totalPrizesDistributed: '0',
        totalBurned: '0',
        biggestWin: '0',
      });
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
            {stats?.totalTicketsSold?.toLocaleString() || '0'}
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">Total Prizes Distributed</div>
          <div className="stat-value">
            {stats?.totalPrizesDistributed 
              ? parseFloat(stats.totalPrizesDistributed).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : '0.00'} PUSD
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">Total PUSD Burned</div>
          <div className="stat-value">
            {stats?.totalBurned
              ? parseFloat(stats.totalBurned).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : '0.00'} PUSD
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">Biggest Win</div>
          <div className="stat-value">
            {stats?.biggestWin
              ? parseFloat(stats.biggestWin).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : '0.00'} PUSD
          </div>
        </div>
      </div>
    </div>
  );
}

