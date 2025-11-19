import { useState, useEffect, useRef, useCallback } from 'react';
import { Contract } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import { useNotification } from '../contexts/NotificationContext';
import { CONTRACTS } from '../config/contracts';
import { parseAmount, formatBalance, formatPrice } from '../utils/format';
import { cache } from '../utils/cache';
import { executeTransaction, getTransactionErrorMessage } from '../utils/transaction';
import { useExpandable } from '../hooks/useExpandable';

export default function MintSection() {
  const { signer, isConnected, provider } = useWeb3();
  const { showNotification } = useNotification();
  const { isExpanded, toggle, headerStyle, toggleIcon } = useExpandable();
  const [polAmount, setPolAmount] = useState('');
  const [lockDays, setLockDays] = useState('30');
  const [pusdReceive, setPusdReceive] = useState('');
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const calculationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Calculate instant estimate
  const calculateInstant = useCallback((polAmount: string) => {
    const cachedPrice = cache.get<bigint>('pol-price-raw');
    if (cachedPrice && polAmount && parseFloat(polAmount) > 0) {
      try {
        const polWei = parseAmount(polAmount);
        const usdValue = (Number(polWei) * Number(cachedPrice)) / 1e8;
        const pusdAmount = (usdValue * 0.6) / 1e18; // 60% mint PUSD
        if (mountedRef.current) {
          setPusdReceive(pusdAmount.toFixed(4));
        }
      } catch {
        if (mountedRef.current) {
          setPusdReceive('');
        }
      }
    }
  }, []);

  // Main calculation effect
  useEffect(() => {
    if (!polAmount || parseFloat(polAmount) <= 0) {
      setPusdReceive('');
      return;
    }

    // Clear previous timeout
    if (calculationTimeoutRef.current) {
      clearTimeout(calculationTimeoutRef.current);
      calculationTimeoutRef.current = null;
    }

    // Show instant estimate immediately
    calculateInstant(polAmount);

    // Then get accurate calculation from contract
    if (!provider || !signer) return;

    calculationTimeoutRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      
      setCalculating(true);
      try {
        // First check if oracle price is available
        let oraclePrice: bigint | null = null;
        try {
          const oracleContract = new Contract(CONTRACTS.OraclePriceFeed.address, CONTRACTS.OraclePriceFeed.abi, provider);
          oraclePrice = await oracleContract.getPOLPrice();
          if (oraclePrice && oraclePrice > 0n) {
            cache.set('pol-price-raw', oraclePrice, 120000);
            // Recalculate instant with fresh price
            if (mountedRef.current && polAmount) {
              calculateInstant(polAmount);
            }
          }
        } catch (err) {
          // Oracle may not be configured
        }

        // Only call contract if we have a valid price
        const cachedPrice = cache.get<bigint>('pol-price-raw');
        if (!oraclePrice && !cachedPrice) {
          setCalculating(false);
          return;
        }

        const vaultAddress = CONTRACTS.MintingVault.address;
        const vaultABI = CONTRACTS.MintingVault.abi;
        const vaultContract = new Contract(vaultAddress, vaultABI, signer);
        const polWei = parseAmount(polAmount);
        
        try {
          const pusdWei = await vaultContract.getMintablePUSD(polWei);
          if (mountedRef.current) {
            const accurateValue = formatBalance(pusdWei);
            setPusdReceive(accurateValue);
          }
        } catch (contractError: any) {
          // Contract reverted - keep instant estimate
          if (mountedRef.current) {
            calculateInstant(polAmount);
          }
        }
      } catch (error) {
        console.error('Failed to calculate PUSD:', error);
      } finally {
        if (mountedRef.current) {
          setCalculating(false);
        }
      }
    }, 500);

    return () => {
      if (calculationTimeoutRef.current) {
        clearTimeout(calculationTimeoutRef.current);
        calculationTimeoutRef.current = null;
      }
    };
  }, [polAmount, provider, signer, calculateInstant]);

  // Reset when account changes or disconnects
  useEffect(() => {
    if (!isConnected) {
      setPolAmount('');
      setPusdReceive('');
    }
  }, [isConnected]);

  // Preload price when provider changes
  useEffect(() => {
    if (!provider) {
      cache.delete('pol-price-raw');
      return;
    }
    
    let cancelled = false;
    
    const loadPrice = async () => {
      try {
        const oracleContract = new Contract(CONTRACTS.OraclePriceFeed.address, CONTRACTS.OraclePriceFeed.abi, provider);
        const price = await oracleContract.getPOLPrice();
        if (!cancelled && price && price > 0n) {
          cache.set('pol-price-raw', price, 120000);
          const priceDisplay = formatPrice(price);
          cache.set('pol-price-display', priceDisplay, 120000);
          // Recalculate if we have polAmount
          if (polAmount && parseFloat(polAmount) > 0) {
            calculateInstant(polAmount);
          }
        }
      } catch (err) {
        // Oracle may not be configured yet
      }
    };

    loadPrice();
    
    return () => {
      cancelled = true;
    };
  }, [provider, isConnected, polAmount, calculateInstant]);

  const handleMint = async () => {
    if (!signer || !polAmount || parseFloat(polAmount) <= 0) return;
    if (parseInt(lockDays) < 30) {
      showNotification('Lock period must be at least 30 days', 'error');
      return;
    }

    setLoading(true);
    try {
      const vaultAddress = CONTRACTS.MintingVault.address;
      const vaultABI = CONTRACTS.MintingVault.abi;
      
      const vaultContract = new Contract(vaultAddress, vaultABI, signer);
      const polWei = parseAmount(polAmount);
      
      await executeTransaction(
        vaultContract,
        'mintWithPOL',
        [parseInt(lockDays)],
        signer,
        { value: polWei }
      );
      
      showNotification('Mint successful!', 'success');
      setPolAmount('');
      setPusdReceive('');
    } catch (error: any) {
      console.error('Mint failed:', error);
      showNotification(getTransactionErrorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="section mint-section">
      <h2 onClick={toggle} style={headerStyle}>
        Mint PUSD {toggleIcon}
      </h2>
      {isExpanded && (
        <>
          {!isConnected ? (
            <p>Please connect your wallet</p>
          ) : (
            <>
          <div className="info-section" style={{ marginTop: 0, marginBottom: '1.5rem' }}>
            <p style={{ marginBottom: '0.5rem' }}>
              <strong>How it works:</strong> Send POL, Receive 60% value as PUSD + 20% POL auto-staked + 20% PUSD auto-staked
            </p>
            <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>
              Price from Chainlink Oracle: ${cache.get<string>('pol-price-display') || 'Loading...'}
            </p>
          </div>
          <div className="input-group">
            <label>POL Amount</label>
            <input
              type="number"
              value={polAmount}
              onChange={(e) => setPolAmount(e.target.value)}
              placeholder="0.0"
              step="0.0001"
              min="0"
            />
          </div>
          <div className="input-group">
            <label>Lock Days - for auto-staked POL</label>
            <div className="lock-days-selector">
              <button
                type="button"
                onClick={() => setLockDays('30')}
                className={lockDays === '30' ? 'active' : ''}
              >
                30 Days
              </button>
              <button
                type="button"
                onClick={() => setLockDays('60')}
                className={lockDays === '60' ? 'active' : ''}
              >
                60 Days
              </button>
              <button
                type="button"
                onClick={() => setLockDays('120')}
                className={lockDays === '120' ? 'active' : ''}
              >
                120 Days
              </button>
              <button
                type="button"
                onClick={() => setLockDays('365')}
                className={lockDays === '365' ? 'active' : ''}
              >
                365 Days
              </button>
            </div>
            <input
              type="number"
              value={lockDays}
              onChange={(e) => setLockDays(e.target.value)}
              min="30"
              placeholder="Or enter custom days"
              style={{ marginTop: '0.75rem' }}
            />
          </div>
          <div className="output-group">
            <label>PUSD You Will Receive:</label>
            <div className="output-value">
              {calculating && pusdReceive ? pusdReceive + '...' : pusdReceive || '0.00'}
            </div>
          </div>
          <button
            onClick={handleMint}
            disabled={loading || !polAmount || parseFloat(polAmount) <= 0 || calculating}
            className="btn-primary"
          >
            {loading ? 'Minting...' : 'Mint PUSD'}
          </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
