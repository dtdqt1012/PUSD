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

export default function PGOLDMintSection() {
  const { signer, isConnected, provider, account } = useWeb3();
  const { showNotification } = useNotification();
  const { isExpanded, toggle, headerStyle, toggleIcon } = useExpandable();
  const [pusdAmount, setPusdAmount] = useState('');
  const [pgoldReceive, setPgoldReceive] = useState('');
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [pusdBalance, setPusdBalance] = useState<string>('0');
  const [goldPrice, setGoldPrice] = useState<string>('0');
  const [mintFee, setMintFee] = useState<string>('0');
  const [minMintAmount, setMinMintAmount] = useState<string>('0');
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
        const [pusdContract, vaultContract, oracleContract] = await Promise.all([
          new Contract(CONTRACTS.PUSDToken.address, CONTRACTS.PUSDToken.abi, provider),
          new Contract(CONTRACTS.PGOLDVault.address, CONTRACTS.PGOLDVault.abi, provider),
          new Contract(CONTRACTS.GoldOracle.address, CONTRACTS.GoldOracle.abi, provider),
        ]);

        const [balance, fee, price, minAmount] = await Promise.allSettled([
          loadWithTimeout(() => pusdContract.balanceOf(account), 15000).catch(() => null),
          loadWithTimeout(() => vaultContract.mintFeeBPS(), 15000).catch(() => null),
          loadWithTimeout(() => oracleContract.getGoldPrice(), 15000).catch(() => null),
          loadWithTimeout(() => vaultContract.minMintAmount(), 15000).catch(() => null),
        ]);

        if (mountedRef.current) {
          setPusdBalance(
            balance.status === 'fulfilled' && balance.value 
              ? formatBalance(balance.value) 
              : '0'
          );
          setMintFee(
            fee.status === 'fulfilled' && fee.value 
              ? (Number(fee.value) / 100).toFixed(2) 
              : '0'
          );
          setGoldPrice(
            price.status === 'fulfilled' && price.value 
              ? formatBalance(price.value) 
              : '0'
          );
          setMinMintAmount(
            minAmount.status === 'fulfilled' && minAmount.value 
              ? formatBalance(minAmount.value) 
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

  // Calculate PGOLD to receive
  const calculatePGOLD = useCallback(async (pusdAmount: string) => {
    if (!pusdAmount || parseFloat(pusdAmount) <= 0 || !provider) {
      setPgoldReceive('');
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

        const pgoldAmount = await loadWithTimeout(
          () => vaultContract.getMintablePGOLD(parseAmount(pusdAmount)),
          5000
        );

        if (mountedRef.current) {
          setPgoldReceive(formatBalance(pgoldAmount));
        }
      } catch (error) {
        // Failed to calculate PGOLD
        if (mountedRef.current) {
          setPgoldReceive('');
        }
      } finally {
        if (mountedRef.current) {
          setCalculating(false);
        }
      }
    }, 500);
  }, [provider]);

  useEffect(() => {
    calculatePGOLD(pusdAmount);
    return () => {
      if (calculationTimeoutRef.current) {
        clearTimeout(calculationTimeoutRef.current);
      }
    };
  }, [pusdAmount, calculatePGOLD]);

  const handleMint = async () => {
    if (!signer || !isConnected) {
      showNotification('Please connect your wallet', 'error');
      return;
    }

    if (!pusdAmount || parseFloat(pusdAmount) <= 0) {
      showNotification('Please enter PUSD amount', 'error');
      return;
    }

    if (parseFloat(pusdAmount) > parseFloat(pusdBalance)) {
      showNotification('Insufficient PUSD balance', 'error');
      return;
    }

    // Check minimum mint amount
    const pusdWei = parseAmount(pusdAmount);
    const minMintWei = parseAmount(minMintAmount);
    if (pusdWei < minMintWei) {
      showNotification(`Minimum mint amount is ${minMintAmount} PUSD`, 'error');
      return;
    }

    setLoading(true);

    try {
      const pusdContract = new Contract(
        CONTRACTS.PUSDToken.address,
        CONTRACTS.PUSDToken.abi,
        signer
      );
      const vaultContract = new Contract(
        CONTRACTS.PGOLDVault.address,
        CONTRACTS.PGOLDVault.abi,
        signer
      );

      const minPGOLDOut = pgoldReceive 
        ? (BigInt(parseAmount(pgoldReceive)) * 95n) / 100n // 5% slippage
        : 0n;

      // Approve PUSD
      const allowance = await pusdContract.allowance(account, CONTRACTS.PGOLDVault.address);
      if (allowance < pusdWei) {
        await executeTransaction(
          pusdContract,
          'approve',
          [CONTRACTS.PGOLDVault.address, pusdWei],
          signer
        );
      }

      // Mint PGOLD
      await executeTransaction(
        vaultContract,
        'mintPGOLD',
        [pusdWei, minPGOLDOut],
        signer
      );

      showNotification('PGOLD minted successfully!', 'success');
      setPusdAmount('');
      setPgoldReceive('');
    } catch (error: any) {
      // Mint failed
      showNotification(getTransactionErrorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="section mint-section">
      <h2 onClick={toggle} style={headerStyle}>
        Mint PGOLD {toggleIcon}
      </h2>
      
      {isExpanded && (
        <div className="input-group">
          <div className="input-label-group">
            <label>PUSD Amount</label>
            <div className="balance-info">
              {account && (
                <span className="balance-text">
                  Balance: <TerminalNumber value={parseFloat(pusdBalance).toFixed(2)} /> PUSD
                </span>
              )}
              {minMintAmount !== '0' && (
                <span className="min-amount-text">
                  Minimum: <TerminalNumber value={parseFloat(minMintAmount).toFixed(2)} /> PUSD
                </span>
              )}
            </div>
          </div>
          <div className="input-wrapper">
            <input
              type="number"
              placeholder="0.00"
              value={pusdAmount}
              onChange={(e) => setPusdAmount(e.target.value)}
              disabled={loading || !isConnected}
            />
          </div>
        </div>
      )}

      {isExpanded && pusdAmount && parseFloat(pusdAmount) > 0 && (
        <div className="output-group">
          <div className="output-label-group">
            <label>You will receive</label>
            {calculating && <span className="calculating">Calculating...</span>}
          </div>
          <div className="output-value">
            {pgoldReceive ? (
              <>
                <TerminalNumber value={formatPGOLD(pgoldReceive)} /> PGOLD
                {mintFee !== '0' && (
                  <span className="fee-text"> (Fee: {mintFee}%)</span>
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
          onClick={handleMint}
          disabled={
            loading || 
            !isConnected || 
            !pusdAmount || 
            parseFloat(pusdAmount) <= 0 ||
            (minMintAmount !== '0' && parseFloat(pusdAmount) < parseFloat(minMintAmount))
          }
        >
          {loading ? 'Minting...' : 'Mint PGOLD'}
        </button>
      )}
    </div>
  );
}

