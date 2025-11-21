import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ethers } from 'ethers';
import { CONTRACTS } from '../config/contracts';
import { useWeb3 } from '../hooks/useWeb3';

interface PricePoint {
  time: number;
  price: number;
  volume: number;
}

interface TokenChartProps {
  tokenAddress: string;
  height?: number;
  launchTimestamp?: number; // Optional: timestamp when token was launched
}

export default function TokenChart({ tokenAddress, height = 300, launchTimestamp }: TokenChartProps) {
  const { provider } = useWeb3();
  const [priceData, setPriceData] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPrice, setCurrentPrice] = useState<string>('0');

  useEffect(() => {
    if (!provider || !tokenAddress) return;
    
    // Load price immediately
    loadCurrentPrice();
    // Load chart data
    loadPriceData();
    
    // Update current price frequently (every 5 seconds) for realtime
    const priceInterval = setInterval(loadCurrentPrice, 5000);
    // Update chart less frequently (30s) to reduce load
    const chartInterval = setInterval(loadPriceData, 30000);
    
    return () => {
      clearInterval(priceInterval);
      clearInterval(chartInterval);
    };
  }, [provider, tokenAddress]);

  // Load only current price (fast, for realtime updates)
  const loadCurrentPrice = async () => {
    if (!provider) return;
    
    try {
      const bondingCurve = new ethers.Contract(
        CONTRACTS.PFUNBondingCurve.address,
        CONTRACTS.PFUNBondingCurve.abi,
        provider
      );

      const currentPriceWei = await bondingCurve.getCurrentPrice(tokenAddress).catch(() => 0n);
      const currentPriceFormatted = ethers.formatEther(currentPriceWei);
      const priceNum = parseFloat(currentPriceFormatted);
      
      if (priceNum > 1000000) {
        try {
          const curve = await bondingCurve.curves(tokenAddress);
          if (curve.tokensSold > 0n && curve.pusdRaised > 0n) {
            const actualPrice = (Number(ethers.formatEther(curve.pusdRaised)) * 1e18) / Number(ethers.formatEther(curve.tokensSold));
            setCurrentPrice((actualPrice / 1e18).toString());
          } else {
            setCurrentPrice('0');
          }
        } catch {
          setCurrentPrice('0');
        }
      } else {
        setCurrentPrice(currentPriceFormatted);
      }
    } catch (error) {
      console.error('Error loading current price:', error);
    }
  };

  const loadPriceData = async () => {
    if (!provider) return;
    
    setLoading(true);
    try {
      const bondingCurve = new ethers.Contract(
        CONTRACTS.PFUNBondingCurve.address,
        CONTRACTS.PFUNBondingCurve.abi,
        provider
      );

      // Fetch current price and curve info in parallel for faster loading
      const [currentPriceWei, curve] = await Promise.all([
        bondingCurve.getCurrentPrice(tokenAddress).catch(() => 0n),
        bondingCurve.curves(tokenAddress).catch(() => null),
      ]);
      
      if (!curve || !curve.isActive) {
        setLoading(false);
        return;
      }

      if (!curve || !curve.isActive) {
        setLoading(false);
        return;
      }

      const currentPriceFormatted = ethers.formatEther(currentPriceWei);
      const priceNum = parseFloat(currentPriceFormatted);
      
      if (priceNum > 1000000) {
        if (curve.tokensSold > 0n && curve.pusdRaised > 0n) {
          const actualPrice = (Number(ethers.formatEther(curve.pusdRaised)) * 1e18) / Number(ethers.formatEther(curve.tokensSold));
          setCurrentPrice((actualPrice / 1e18).toString());
        } else {
          setCurrentPrice('0');
        }
      } else {
        setCurrentPrice(currentPriceFormatted);
      }

      // Fetch buy/sell events to build price history
      try {
        const buyFilter = bondingCurve.filters.TokensBought(tokenAddress);
        const sellFilter = bondingCurve.filters.TokensSold(tokenAddress);
        
        // Get current block number
        const currentBlock = await provider.getBlockNumber();
        
        // Find launch block by querying TokenLaunched event from PFUNLaunchpad
        let fromBlock = 0;
        if (launchTimestamp) {
          // If launch timestamp provided, estimate block number
          // Polygon: ~2 seconds per block, so estimate from timestamp
          const currentBlockInfo = await provider.getBlock(currentBlock);
          if (currentBlockInfo) {
            const blocksSinceLaunch = Math.floor((currentBlockInfo.timestamp - launchTimestamp) / 2);
            fromBlock = Math.max(0, currentBlock - blocksSinceLaunch - 1000); // Add buffer
          }
        } else {
          // Try to find launch event from PFUNLaunchpad
          try {
            const launchpad = new ethers.Contract(
              CONTRACTS.PFUNLaunchpad.address,
              CONTRACTS.PFUNLaunchpad.abi,
              provider
            );
            const launchFilter = launchpad.filters.TokenLaunched(tokenAddress);
            // Query from a reasonable starting point (last 100k blocks = ~2-3 days)
            const launchEvents = await launchpad.queryFilter(
              launchFilter,
              Math.max(0, currentBlock - 100000),
              currentBlock
            );
            if (launchEvents.length > 0) {
              // Found launch event, query from that block
              fromBlock = Math.max(0, launchEvents[0].blockNumber - 10); // 10 blocks before launch
            } else {
              // Not found in recent blocks, query from block 0 (full history)
              fromBlock = 0;
            }
          } catch {
            // If can't find launch event, query from block 0 (full history)
            fromBlock = 0;
          }
        }
        
        // Query events with timeout protection
        // If querying from block 0, it might be slow, so add timeout
        const queryEvents = async () => {
          try {
            const [buyEvents, sellEvents] = await Promise.all([
              bondingCurve.queryFilter(buyFilter, fromBlock, currentBlock).catch(() => []),
              bondingCurve.queryFilter(sellFilter, fromBlock, currentBlock).catch(() => []),
            ]);
            return { buyEvents, sellEvents };
          } catch (error) {
            // If query fails (e.g., timeout), fallback to recent blocks
            if (fromBlock === 0) {
              console.warn('Full history query failed, falling back to recent blocks');
              const fallbackBlock = Math.max(0, currentBlock - 10000); // Last 10k blocks
              const [buyEvents, sellEvents] = await Promise.all([
                bondingCurve.queryFilter(buyFilter, fallbackBlock, currentBlock).catch(() => []),
                bondingCurve.queryFilter(sellFilter, fallbackBlock, currentBlock).catch(() => []),
              ]);
              return { buyEvents, sellEvents };
            }
            throw error;
          }
        };
        
        const { buyEvents, sellEvents } = await queryEvents();

        // Combine and sort events by block number
        const allEvents = [
          ...buyEvents.map((e: any) => ({ ...e, type: 'buy' as const })),
          ...sellEvents.map((e: any) => ({ ...e, type: 'sell' as const })),
        ].sort((a, b) => a.blockNumber - b.blockNumber);

        // Use curve info already fetched above (avoid duplicate call)
        const INITIAL_PRICE = 1e15; // 0.001 PUSD in wei
        const PRICE_INCREMENT = 1e12; // 0.000001 PUSD in wei
        
        // Get initial price from curve (or use default)
        const initialPriceWei = curve.initialPrice > 0n ? curve.initialPrice : BigInt(INITIAL_PRICE);
        const initialPrice = Number(ethers.formatEther(initialPriceWei));
        const priceIncrement = Number(ethers.formatEther(BigInt(PRICE_INCREMENT)));

        // Build price history
        const history: PricePoint[] = [];
        
        // Start with initial tokensSold and pusdRaised from curve
        // This ensures chart starts from the correct initial price (when launched with launch amount)
        // We'll subtract these values when processing events to get the actual event-based changes
        const initialTokensSold = curve.tokensSold;
        const initialPusdRaised = curve.pusdRaised;
        
        // Track tokensSold and pusdRaised starting from 0 (before any events)
        // Then add initial values to get the actual state
        let tokensSold = BigInt(0);
        let pusdRaised = BigInt(0);
        
        // Add initial point if curve was initialized with launch amount
        if (initialTokensSold > 0n && initialPusdRaised > 0n) {
          // Find the launch event or use a timestamp before first event
          const launchTime = allEvents.length > 0 
            ? (await provider.getBlock(allEvents[0].blockNumber))?.timestamp 
            : (await provider.getBlock(await provider.getBlockNumber()))?.timestamp;
          
          if (launchTime) {
            // Calculate initial price from initial values
            const initialPriceValue = initialPrice; // Use initialPrice from curve
            history.push({
              time: launchTime * 1000,
              price: initialPriceValue,
              volume: Number(ethers.formatEther(initialPusdRaised)),
            });
          }
        }

        for (const event of allEvents) {
          try {
            if (event.type === 'buy') {
              tokensSold += BigInt(event.args.tokensAmount);
              pusdRaised += BigInt(event.args.pusdPaid);
            } else {
              tokensSold -= BigInt(event.args.tokensAmount);
              pusdRaised -= BigInt(event.args.pusdReceived);
            }

            // Calculate total tokensSold and pusdRaised (including initial values)
            const totalTokensSold = initialTokensSold + tokensSold;

            // Calculate price at this point using bonding curve formula
            // Price = initialPrice + (totalTokensSold * PRICE_INCREMENT) / 1e18
            let price = initialPrice; // Start with initial price
            if (totalTokensSold > 0n) {
              const tokensSoldNum = Number(ethers.formatEther(totalTokensSold));
              // Use same formula as contract: initialPrice + ((totalTokensSold * PRICE_INCREMENT) / 1e18)
              price = initialPrice + (tokensSoldNum * priceIncrement);
            }
            
            // Validate price (shouldn't be unreasonably high)
            if (price > 1000000) {
              // Fallback: calculate from average (for old contracts)
              if (pusdRaised > 0n && tokensSold > 0n) {
                price = Number(ethers.formatEther(pusdRaised)) / Number(ethers.formatEther(tokensSold));
              }
            }

            // Batch block queries for better performance
            // Use event.blockNumber to estimate timestamp if needed
            // For now, fetch block but cache if possible
            const block = await provider.getBlock(event.blockNumber);
            if (!block) continue;
            
            history.push({
              time: block.timestamp * 1000, // Convert to milliseconds
              price,
              volume: event.type === 'buy' 
                ? Number(ethers.formatEther(event.args.pusdPaid))
                : Number(ethers.formatEther(event.args.pusdReceived)),
            });
          } catch (err) {
            console.error('Error processing event:', err);
            continue;
          }
        }

        // Always add current price point at the end (even if there are events)
        // Use getCurrentPrice from contract to ensure accuracy
        const latestBlock = await provider.getBlockNumber();
        const block = await provider.getBlock(latestBlock);
        if (block) {
          // Use the current price from contract (already fetched above)
          // This is the source of truth
          let currentPriceValue = parseFloat(currentPriceFormatted);
          
          // If price is unreasonably high, it might be from old contract
          // Recalculate using bonding curve formula
          if (currentPriceValue > 1000000 || currentPriceValue <= 0) {
            const currentTokensSold = curve.tokensSold;
            if (currentTokensSold > 0n) {
              const tokensSoldNum = Number(ethers.formatEther(currentTokensSold));
              currentPriceValue = initialPrice + (tokensSoldNum * priceIncrement);
            } else {
              currentPriceValue = initialPrice;
            }
          }
          
          // Add current price point (or update last point if it's at the same time)
          const lastPoint = history[history.length - 1];
          if (lastPoint && lastPoint.time === block.timestamp * 1000) {
            // Update last point with current price from contract
            lastPoint.price = currentPriceValue;
          } else {
            // Add new point with current price from contract
            history.push({
              time: block.timestamp * 1000,
              price: currentPriceValue,
              volume: 0,
            });
          }
        }

        setPriceData(history);
      } catch (eventError) {
        console.error('Error fetching events:', eventError);
        // Fallback: just show current price
        const fallbackBlock = await provider.getBlockNumber();
        const block = await provider.getBlock(fallbackBlock);
        if (block) {
          setPriceData([{
            time: block.timestamp * 1000,
            price: parseFloat(currentPriceFormatted),
            volume: 0,
          }]);
        }
      }
    } catch (error) {
      console.error('Error loading price data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    // Hiển thị đầy đủ, không làm tròn
    // Tối đa 10 chữ số thập phân để đảm bảo độ chính xác
    if (price === 0) return '0';
    // Tìm số chữ số thập phân có nghĩa (loại bỏ trailing zeros)
    const str = price.toString();
    if (str.includes('e')) {
      // Số quá nhỏ, dùng toFixed với nhiều chữ số
      return price.toFixed(10).replace(/\.?0+$/, '');
    }
    // Hiển thị tối đa 10 chữ số thập phân, loại bỏ trailing zeros
    return price.toFixed(10).replace(/\.?0+$/, '');
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading && priceData.length === 0) {
    return (
      <div style={{ 
        backgroundColor: '#0a0a0a', 
        border: '1px solid #333',
        borderLeft: '2px solid #00ff00',
        borderRadius: '0 4px 4px 0',
        padding: '1rem',
        fontFamily: 'Courier New, monospace'
      }}>
        <div style={{ 
          marginBottom: '1rem', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          borderBottom: '1px solid #333',
          paddingBottom: '0.75rem'
        }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>
              <span style={{ color: '#00ff00' }}>&gt;</span> Current Price
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#00ff00' }}>
              {currentPrice} PUSD
            </div>
          </div>
        </div>
        <div style={{ 
          height: height - 80, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          color: '#888',
          fontSize: '0.85rem',
          fontFamily: 'Courier New, monospace'
        }}>
          <span style={{ color: '#00ff00' }}>&gt;</span> Loading chart data...
        </div>
      </div>
    );
  }

  if (priceData.length === 0) {
    return (
      <div style={{ 
        height, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#0a0a0a',
        border: '1px solid #333',
        borderLeft: '2px solid #00ff00',
        borderRadius: '0 4px 4px 0',
        color: '#888',
        fontFamily: 'Courier New, monospace',
        padding: '1rem'
      }}>
        <div>
          <span style={{ color: '#00ff00' }}>&gt;</span> No trading data available yet
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      backgroundColor: '#0a0a0a', 
      border: '1px solid #333',
      borderLeft: '2px solid #00ff00',
      borderRadius: '0 4px 4px 0',
      padding: '1rem',
      fontFamily: 'Courier New, monospace'
    }}>
      <div style={{ 
        marginBottom: '1rem', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        borderBottom: '1px solid #333',
        paddingBottom: '0.75rem'
      }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>
            <span style={{ color: '#00ff00' }}>&gt;</span> Current Price
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#00ff00' }}>
            {currentPrice} PUSD
          </div>
        </div>
        <div style={{ fontSize: '0.75rem', color: '#888' }}>
          {priceData.length} points
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height={height - 80}>
        <LineChart data={priceData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid 
            strokeDasharray="2 2" 
            stroke="#1a1a1a" 
            strokeWidth={1}
            vertical={false}
          />
          <XAxis 
            dataKey="time" 
            tickFormatter={formatTime}
            stroke="#00ff00"
            tick={{ fill: '#888', fontSize: 11, fontFamily: 'Courier New, monospace' }}
            axisLine={{ stroke: '#333' }}
            tickLine={{ stroke: '#333' }}
          />
          <YAxis 
            tickFormatter={formatPrice}
            stroke="#00ff00"
            tick={{ fill: '#888', fontSize: 11, fontFamily: 'Courier New, monospace' }}
            axisLine={{ stroke: '#333' }}
            tickLine={{ stroke: '#333' }}
            width={80}
          />
          <Tooltip
            contentStyle={{ 
              backgroundColor: '#0a0a0a', 
              border: '1px solid #00ff00',
              borderRadius: '2px',
              color: '#00ff00',
              fontFamily: 'Courier New, monospace',
              fontSize: '0.85rem',
              padding: '0.5rem 0.75rem',
              boxShadow: '0 0 10px rgba(0, 255, 0, 0.3)'
            }}
            labelStyle={{ color: '#888', marginBottom: '0.25rem' }}
            labelFormatter={(value) => `> ${new Date(value).toLocaleString()}`}
            formatter={(value: number) => [`${formatPrice(value)} PUSD`, 'Price']}
            cursor={{ stroke: '#00ff00', strokeWidth: 1, strokeDasharray: '3 3' }}
          />
          <Line 
            type="monotone" 
            dataKey="price" 
            stroke="#00ff00" 
            strokeWidth={2.5}
            dot={false}
            activeDot={{ 
              r: 5, 
              fill: '#00ff00',
              stroke: '#0a0a0a',
              strokeWidth: 2,
              filter: 'drop-shadow(0 0 4px #00ff00)'
            }}
            animationDuration={300}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

