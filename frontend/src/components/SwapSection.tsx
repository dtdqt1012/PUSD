import { useState, useEffect } from 'react';
import { Contract } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import { useNotification } from '../contexts/NotificationContext';
import { CONTRACTS } from '../config/contracts';
import { parseAmount, formatBalance } from '../utils/format';
import { executeTransaction, getTransactionErrorMessage } from '../utils/transaction';
import { useExpandable } from '../hooks/useExpandable';
import { isRateLimitError, isRPCError } from '../utils/rpcHandler';

export default function SwapSection() {
  const { signer, account, isConnected, provider } = useWeb3();
  const { showNotification } = useNotification();
  const { isExpanded, toggle, headerStyle, toggleIcon } = useExpandable();
  const [swapType, setSwapType] = useState<'POL_TO_PUSD' | 'PUSD_TO_POL'>('POL_TO_PUSD');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [poolReserves, setPoolReserves] = useState<string>('0');
  const [quote, setQuote] = useState<string>('0');
  const [fee, setFee] = useState<string>('0');

  // Load pool reserves
  useEffect(() => {
    if (!provider) return;

    const loadReserves = async () => {
      try {
        const swapAddress = CONTRACTS.SwapPool.address;
        const swapABI = CONTRACTS.SwapPool.abi;
        
        const swapContract = new Contract(swapAddress, swapABI, provider);
        const reserves = await swapContract.getBalance();
        setPoolReserves(formatBalance(reserves));
      } catch (error) {
        // Failed to load reserves
      }
    };

    // Load immediately
    loadReserves();
    
    // Increase interval to 10 minutes to reduce RPC calls
    const interval = setInterval(loadReserves, 600000);
    return () => clearInterval(interval);
  }, [provider]);

  // Calculate quote when amount changes
  useEffect(() => {
    if (!provider || !amount || parseFloat(amount) <= 0) {
      setQuote('0');
      setFee('0');
      return;
    }

    const calculateQuote = async () => {
      try {
        const swapAddress = CONTRACTS.SwapPool.address;
        const swapABI = CONTRACTS.SwapPool.abi;
        
        const swapContract = new Contract(swapAddress, swapABI, provider);
        
        if (swapType === 'POL_TO_PUSD') {
          const polWei = parseAmount(amount);
          const [pusdAmount, swapFee] = await swapContract.getPOLtoPUSDQuote(polWei);
          setQuote(formatBalance(pusdAmount));
          setFee(formatBalance(swapFee));
        } else {
          const pusdWei = parseAmount(amount);
          const [polAmount, swapFee] = await swapContract.getPUSDtoPOLQuote(pusdWei);
          setQuote(formatBalance(polAmount));
          setFee(formatBalance(swapFee));
        }
        } catch (error) {
          // Silently handle RPC errors
          setQuote('0');
          setFee('0');
        }
    };

    // Debounce quote calculation to avoid too many RPC calls while typing
    const timeoutId = setTimeout(calculateQuote, 1500);
    return () => clearTimeout(timeoutId);
  }, [amount, swapType, provider]);

  const handleSwap = async () => {
    if (!signer || !amount || parseFloat(amount) <= 0) return;

    setLoading(true);
    try {
      const swapAddress = CONTRACTS.SwapPool.address;
      const swapABI = CONTRACTS.SwapPool.abi;
      const oracleAddress = CONTRACTS.OraclePriceFeed.address;
      const oracleABI = CONTRACTS.OraclePriceFeed.abi;
      
      const swapContract = new Contract(swapAddress, swapABI, signer);
      
      // Check if oracle is configured by trying to get price
      try {
        const oracleContract = new Contract(oracleAddress, oracleABI, signer);
        await oracleContract.getPOLPrice();
      } catch (oracleError: any) {
        // Oracle check failed
        showNotification('Oracle price feed not configured. Please configure the oracle first.', 'error');
        setLoading(false);
        return;
      }

      if (swapType === 'POL_TO_PUSD') {
        const polWei = parseAmount(amount);
        
        // Get quote for slippage protection - wrap in try-catch to handle oracle errors
        let quotePusd: bigint;
        try {
          [quotePusd] = await swapContract.getPOLtoPUSDQuote(polWei);
        } catch (quoteError: any) {
          // Failed to get quote
          showNotification('Failed to get price quote. Oracle may not be configured.', 'error');
          setLoading(false);
          return;
        }
        
        if (!quotePusd || quotePusd === 0n) {
          showNotification('Invalid quote amount. Please try again.', 'error');
          setLoading(false);
          return;
        }
        
        // Calculate min output with 1% slippage tolerance, but ensure it's at least 1 wei
        const slippage = quotePusd / 100n;
        const minPusdOut = slippage < quotePusd ? quotePusd - slippage : 1n;
        
        if (minPusdOut === 0n) {
          showNotification('Slippage calculation resulted in zero. Please try a larger amount.', 'error');
          setLoading(false);
          return;
        }
        
        
        await executeTransaction(
          swapContract,
          'swapPOLtoPUSD',
          [minPusdOut],
          signer,
          { value: polWei }
        );
        
        showNotification('Swap successful! POL added to pool reserves.', 'success');
        setPoolReserves((prev) => (parseFloat(prev) + parseFloat(amount)).toFixed(4));
      } else {
        const pusdWei = parseAmount(amount);
        const pusdTokenContract = new Contract(CONTRACTS.PUSDToken.address, CONTRACTS.PUSDToken.abi, signer);
        
        // Check balance first
        const balance = await pusdTokenContract.balanceOf(account);
        if (balance < pusdWei) {
          showNotification(`Insufficient PUSD balance. You have ${formatBalance(balance)} PUSD.`, 'error');
          return;
        }
        
        // Check allowance - even if SwapPool is a burner, _spendAllowance still needs allowance >= amount
        // So we always need to approve
        const allowance = await pusdTokenContract.allowance(account, swapAddress);
        if (allowance < pusdWei) {
          showNotification('Approving PUSD for swap...', 'info');
          // Approve max to avoid repeated approvals
          const maxApproval = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
          await executeTransaction(
            pusdTokenContract,
            'approve',
            [swapAddress, maxApproval],
            signer
          );
          showNotification('Approval successful. Proceeding with swap...', 'success');
        }
        
        // Get quote for slippage protection
        const [quotePol, feePol] = await swapContract.getPUSDtoPOLQuote(pusdWei);
        const minPolOut = quotePol - (quotePol / 100n); // 1% slippage tolerance
        
        // Check if pool has enough POL
        // Contract checks: address(this).balance >= polAmount (before fee)
        // polAmount = quotePol + feePol (total POL needed before fee deduction)
        const poolBalance = await swapContract.getBalance();
        const polAmountBeforeFee = quotePol + feePol; // Total POL before fee (what contract checks)
        if (poolBalance < polAmountBeforeFee) {
          showNotification(`Insufficient POL in pool. Pool has ${formatBalance(poolBalance)} POL, but needs ${formatBalance(polAmountBeforeFee)} POL.`, 'error');
          return;
        }
        
        await executeTransaction(
          swapContract,
          'swapPUSDtoPOL',
          [pusdWei, minPolOut],
          signer
        );
        
        showNotification('Swap successful! POL withdrawn from pool reserves.', 'success');
      }
      setAmount('');
      setQuote('0');
      setFee('0');
    } catch (error: any) {
      showNotification(getTransactionErrorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="section swap-section">
      <h2 onClick={toggle} style={headerStyle}>
        Swap {toggleIcon}
      </h2>
      {isExpanded && (
        <>
          <div className="swap-info">
        <div className="info-item">
          <label>Pool Reserves:</label>
          <span className="value">{parseFloat(poolReserves).toFixed(4)} POL</span>
        </div>
        {parseFloat(poolReserves) === 0 && (
          <p className="info-text">
            <strong>No reserves yet!</strong> Swap POL to PUSD to add liquidity to the pool.
            Each swap POL to PUSD adds POL to reserves, enabling PUSD to POL swaps.
          </p>
        )}
      </div>

      {!isConnected ? (
        <p>Please connect your wallet</p>
      ) : (
        <>
          <div className="swap-type-selector">
            <button
              onClick={() => {
                setSwapType('POL_TO_PUSD');
                setAmount('');
              }}
              className={swapType === 'POL_TO_PUSD' ? 'active' : ''}
            >
              POL to PUSD
            </button>
            <button
              onClick={() => {
                setSwapType('PUSD_TO_POL');
                setAmount('');
              }}
              className={swapType === 'PUSD_TO_POL' ? 'active' : ''}
            >
              PUSD to POL
            </button>
          </div>
          
          <div className="input-group">
            <label>{swapType === 'POL_TO_PUSD' ? 'POL' : 'PUSD'} Amount</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              step="0.0001"
              min="0"
            />
          </div>

          {amount && parseFloat(amount) > 0 && (
            <div className="quote-info">
              <div className="quote-row">
                <span>You will receive:</span>
                <strong>{parseFloat(quote).toFixed(4)} {swapType === 'POL_TO_PUSD' ? 'PUSD' : 'POL'}</strong>
              </div>
              <div className="quote-row">
                <span>Fee:</span>
                <span>{parseFloat(fee).toFixed(4)} {swapType === 'POL_TO_PUSD' ? 'PUSD' : 'POL'}</span>
              </div>
              {swapType === 'POL_TO_PUSD' && (
                <div className="quote-note">
                  This POL will be added to pool reserves
                </div>
              )}
              {swapType === 'PUSD_TO_POL' && parseFloat(poolReserves) === 0 && (
                <div className="quote-note error">
                  No reserves available! Swap POL to PUSD first.
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleSwap}
            disabled={loading || !amount || parseFloat(amount) <= 0 || (swapType === 'PUSD_TO_POL' && parseFloat(poolReserves) === 0)}
            className="btn-primary"
          >
            {loading ? 'Swapping...' : 'Swap'}
          </button>
        </>
      )}
        </>
      )}
    </div>
  );
}
