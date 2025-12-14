import { useState, useEffect, useRef, useCallback } from 'react';
import { Contract } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import { useNotification } from '../contexts/NotificationContext';
import { CONTRACTS } from '../config/contracts';
import { parseAmount, formatBalance, formatPGOLD } from '../utils/format';
import TerminalNumber from './TerminalNumber';
import { executeTransaction, getTransactionErrorMessage } from '../utils/transaction';
import { loadWithTimeout } from '../utils/loadWithTimeout';
import { useExpandable } from '../hooks/useExpandable';

export default function PGOLDRedeemSection() {
  const { signer, isConnected, provider, account } = useWeb3();
  const { showNotification } = useNotification();
  const { isExpanded, toggle, headerStyle, toggleIcon } = useExpandable();
  const [pgoldAmount, setPgoldAmount] = useState('');
  const [pusdReceive, setPusdReceive] = useState('');
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [pgoldBalance, setPgoldBalance] = useState<string>('0');
  const [goldPrice, setGoldPrice] = useState<string>('0');
  const [redeemFee, setRedeemFee] = useState<string>('0');
  const calculationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Load balances and fees
  useEffect(() => {
    if (!provider || !account) return;

    const loadData = async () => {
      try {
        const [pgoldContract, vaultContract, oracleContract] = await Promise.all([
          new Contract(CONTRACTS.PGOLDToken.address, CONTRACTS.PGOLDToken.abi, provider),
          new Contract(CONTRACTS.PGOLDVault.address, CONTRACTS.PGOLDVault.abi, provider),
          new Contract(CONTRACTS.GoldOracle.address, CONTRACTS.GoldOracle.abi, provider),
        ]);

        const [balance, fee, price] = await Promise.allSettled([
          loadWithTimeout(() => pgoldContract.balanceOf(account), 15000).catch(() => null),
          loadWithTimeout(() => vaultContract.redeemFeeBPS(), 15000).catch(() => null),
          loadWithTimeout(() => oracleContract.getGoldPrice(), 15000).catch(() => null),
        ]);

        if (mountedRef.current) {
          setPgoldBalance(
            balance.status === 'fulfilled' && balance.value 
              ? formatBalance(balance.value) 
              : '0'
          );
          setRedeemFee(
            fee.status === 'fulfilled' && fee.value 
              ? (Number(fee.value) / 100).toFixed(2) 
              : '0'
          );
          setGoldPrice(
            price.status === 'fulfilled' && price.value 
              ? formatBalance(price.value) 
              : '0'
          );
        }
      } catch (error: any) {
        // Silently handle RPC errors
      }
    };

    // Add delay before initial load
    // Load immediately
    loadData();
    
    // Increase interval to 10 minutes to reduce RPC calls
    const interval = setInterval(loadData, 600000);
    return () => clearInterval(interval);
  }, [provider, account]);

  // Calculate PUSD to receive
  const calculatePUSD = useCallback(async (pgoldAmount: string) => {
    if (!pgoldAmount || parseFloat(pgoldAmount) <= 0 || !provider) {
      setPusdReceive('');
      return;
    }

    setCalculating(true);
    
    if (calculationTimeoutRef.current) {
      clearTimeout(calculationTimeoutRef.current);
    }

    calculationTimeoutRef.current = setTimeout(async () => {
      try {
        const vaultContract = new Contract(
          CONTRACTS.PGOLDVault.address,
          CONTRACTS.PGOLDVault.abi,
          provider
        );

        const pusdAmount = await loadWithTimeout(
          () => vaultContract.getRedeemablePUSD(parseAmount(pgoldAmount)),
          5000
        );

        if (mountedRef.current) {
          setPusdReceive(formatBalance(pusdAmount));
        }
      } catch (error) {
        // Failed to calculate PUSD
        if (mountedRef.current) {
          setPusdReceive('');
        }
      } finally {
        if (mountedRef.current) {
          setCalculating(false);
        }
      }
    }, 500);
  }, [provider]);

  useEffect(() => {
    calculatePUSD(pgoldAmount);
    return () => {
      if (calculationTimeoutRef.current) {
        clearTimeout(calculationTimeoutRef.current);
      }
    };
  }, [pgoldAmount, calculatePUSD]);

  const handleRedeem = async () => {
    if (!signer || !isConnected) {
      showNotification('Please connect your wallet', 'error');
      return;
    }

    if (!pgoldAmount || parseFloat(pgoldAmount) <= 0) {
      showNotification('Please enter PGOLD amount', 'error');
      return;
    }

    if (parseFloat(pgoldAmount) > parseFloat(pgoldBalance)) {
      showNotification('Insufficient PGOLD balance', 'error');
      return;
    }

    setLoading(true);

    try {
      const pgoldContract = new Contract(
        CONTRACTS.PGOLDToken.address,
        CONTRACTS.PGOLDToken.abi,
        signer
      );
      const vaultContract = new Contract(
        CONTRACTS.PGOLDVault.address,
        CONTRACTS.PGOLDVault.abi,
        signer
      );

      const pgoldWei = parseAmount(pgoldAmount);
      const minPUSDOut = pusdReceive 
        ? (BigInt(parseAmount(pusdReceive)) * 95n) / 100n // 5% slippage
        : 0n;

      // Approve PGOLD
      const allowance = await pgoldContract.allowance(account, CONTRACTS.PGOLDVault.address);
      if (allowance < pgoldWei) {
        await executeTransaction(
          pgoldContract,
          'approve',
          [CONTRACTS.PGOLDVault.address, pgoldWei],
          signer
        );
      }

      // Redeem PGOLD
      await executeTransaction(
        vaultContract,
        'redeemPGOLD',
        [pgoldWei, minPUSDOut],
        signer
      );

      showNotification('PGOLD redeemed successfully!', 'success');
      setPgoldAmount('');
      setPusdReceive('');
    } catch (error: any) {
      // Redeem failed
      showNotification(getTransactionErrorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="section redeem-section">
      <h2 onClick={toggle} style={headerStyle}>
        Redeem PGOLD {toggleIcon}
      </h2>
      
      {isExpanded && (
        <div className="input-group">
          <div className="input-label-group">
            <label>PGOLD Amount</label>
            {account && (
              <span className="balance-text">
                Balance: <TerminalNumber value={formatPGOLD(pgoldBalance)} /> PGOLD
              </span>
            )}
          </div>
          <div className="input-wrapper">
            <input
              type="number"
              placeholder="0.0000"
              value={pgoldAmount}
              onChange={(e) => setPgoldAmount(e.target.value)}
              disabled={loading || !isConnected}
            />
          </div>
        </div>
      )}

      {isExpanded && pgoldAmount && parseFloat(pgoldAmount) > 0 && (
        <div className="output-group">
          <div className="output-label-group">
            <label>You will receive</label>
            {calculating && <span className="calculating">Calculating...</span>}
          </div>
          <div className="output-value">
            {pusdReceive ? (
              <>
                <TerminalNumber value={parseFloat(pusdReceive).toFixed(2)} /> PUSD
                {redeemFee !== '0' && (
                  <span className="fee-text"> (Fee: {redeemFee}%)</span>
                )}
              </>
            ) : (
              <span className="placeholder">-</span>
            )}
          </div>
          {goldPrice !== '0' && (
            <div className="info-text">
              Gold Price: $<TerminalNumber value={goldPrice} />
            </div>
          )}
        </div>
      )}

      {isExpanded && (
        <button
          className="btn-primary"
          onClick={handleRedeem}
          disabled={loading || !isConnected || !pgoldAmount || parseFloat(pgoldAmount) <= 0}
        >
          {loading ? 'Redeeming...' : 'Redeem PGOLD'}
        </button>
      )}
    </div>
  );
}

