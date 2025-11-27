import { useEffect, useState, useRef } from 'react';
import { Contract } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import { CONTRACTS } from '../config/contracts';
import { formatBalance, formatPrice, formatPGOLD } from '../utils/format';
import TerminalNumber from './TerminalNumber';
import { loadWithTimeout } from '../utils/loadWithTimeout';
import { useExpandable } from '../hooks/useExpandable';

export default function PGOLDInfoCard() {
  const { provider, account } = useWeb3();
  const { isExpanded, toggle, headerStyle, toggleIcon } = useExpandable(false);
  const [goldPrice, setGoldPrice] = useState<string>('0');
  const [pgoldBalance, setPgoldBalance] = useState<string>('0');
  const [pusdBalance, setPusdBalance] = useState<string>('0');
  const [totalPGOLD, setTotalPGOLD] = useState<string>('0');
  const [reserveRatio, setReserveRatio] = useState<string>('0');
  const [pusdReserve, setPusdReserve] = useState<string>('0');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!provider) return;

    const loadData = async () => {
      try {
        const [oracleContract, pgoldTokenContract, pgoldVaultContract, pusdContract] = await Promise.all([
          new Contract(CONTRACTS.GoldOracle.address, CONTRACTS.GoldOracle.abi, provider),
          new Contract(CONTRACTS.PGOLDToken.address, CONTRACTS.PGOLDToken.abi, provider),
          new Contract(CONTRACTS.PGOLDVault.address, CONTRACTS.PGOLDVault.abi, provider),
          new Contract(CONTRACTS.PUSDToken.address, CONTRACTS.PUSDToken.abi, provider),
        ]);

        const results = await Promise.allSettled([
          loadWithTimeout(() => oracleContract.getGoldPrice(), 10000).catch((err) => {
            console.warn('Failed to load gold price:', err);
            return null;
          }),
          loadWithTimeout(() => pgoldTokenContract.totalSupply(), 10000).catch((err) => {
            console.warn('Failed to load total PGOLD:', err);
            return null;
          }),
          loadWithTimeout(() => pgoldVaultContract.totalPUSDReserve(), 10000).catch((err) => {
            console.warn('Failed to load PUSD reserve:', err);
            return null;
          }),
        ]);

        if (!mountedRef.current) return;

        const price = results[0].status === 'fulfilled' && results[0].value 
          ? formatPrice(results[0].value) 
          : '0';
        const total = results[1].status === 'fulfilled' && results[1].value 
          ? formatBalance(results[1].value) 
          : '0';
        const reserve = results[2].status === 'fulfilled' && results[2].value 
          ? formatBalance(results[2].value) 
          : '0';

        setGoldPrice(price);
        setTotalPGOLD(total);
        setPusdReserve(reserve);
        
        // Calculate reserve ratio: (PUSD Reserve / Total PGOLD * Gold Price) * 100
        if (total !== '0' && price !== '0' && reserve !== '0') {
          const totalPGOLDNum = parseFloat(total);
          const goldPriceNum = parseFloat(price);
          const reserveNum = parseFloat(reserve);
          const totalPGOLDValueUSD = totalPGOLDNum * goldPriceNum;
          const ratio = totalPGOLDValueUSD > 0 ? (reserveNum / totalPGOLDValueUSD) * 100 : 0;
          setReserveRatio(ratio.toFixed(2));
        } else {
          setReserveRatio('0');
        }

        // Load user balances
        if (account && mountedRef.current) {
          const [userPGOLD, userPUSD] = await Promise.allSettled([
            loadWithTimeout(() => pgoldTokenContract.balanceOf(account), 10000).catch((err) => {
              console.warn('Failed to load user PGOLD balance:', err);
              return null;
            }),
            loadWithTimeout(() => pusdContract.balanceOf(account), 10000).catch((err) => {
              console.warn('Failed to load user PUSD balance:', err);
              return null;
            }),
          ]);

          if (mountedRef.current) {
            setPgoldBalance(
              userPGOLD.status === 'fulfilled' && userPGOLD.value 
                ? formatBalance(userPGOLD.value) 
                : '0'
            );
            setPusdBalance(
              userPUSD.status === 'fulfilled' && userPUSD.value 
                ? formatBalance(userPUSD.value) 
                : '0'
            );
          }
        }
      } catch (error: any) {
        console.error('Failed to load PGOLD data:', error);
        // Silently handle RPC errors - don't spam console
        if (error?.code !== -32603 && error?.message !== 'Internal JSON-RPC error.') {
          console.error('RPC Error details:', error);
        }
      }
    };

    loadData();
    // Increase interval to 60 seconds to reduce RPC calls
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [provider, account]);

  return (
    <div className="section pgold-info">
      <h2 onClick={toggle} style={headerStyle}>
        PGOLD {toggleIcon}
      </h2>
      
      {isExpanded && (
        <>
          <div className="info-section compact">
            <h3>Gold Price</h3>
            <div className="stats-grid compact">
              <div className="stat-item highlight">
                <strong>Gold Price (XAU/USD)</strong>
                <span>
                  <TerminalNumber value={`$${goldPrice}`} />
                </span>
              </div>
            </div>
          </div>

          {account && (
            <div className="info-section compact">
              <h3>Your Balances</h3>
              <div className="stats-grid compact">
                <div className="stat-item">
                  <strong>PGOLD Balance</strong>
                  <span>
                    <TerminalNumber value={formatPGOLD(pgoldBalance)} />
                  </span>
                </div>
                <div className="stat-item">
                  <strong>PUSD Balance</strong>
                  <span>
                    <TerminalNumber value={parseFloat(pusdBalance).toFixed(2)} />
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="info-section compact">
            <h3>Platform Stats</h3>
            <div className="stats-grid compact">
              <div className="stat-item">
                <strong>Total PGOLD</strong>
                <span>
                  <TerminalNumber value={formatPGOLD(totalPGOLD)} />
                </span>
              </div>
              <div className="stat-item">
                <strong>PUSD Reserve</strong>
                <span>
                  <TerminalNumber value={parseFloat(pusdReserve).toFixed(2)} />
                </span>
              </div>
              <div className="stat-item highlight">
                <strong>Reserve Ratio</strong>
                <span>
                  <TerminalNumber value={parseFloat(reserveRatio).toFixed(2)} suffix="%" />
                </span>
              </div>
            </div>
          </div>

          <div className="info-section compact">
            <h3>About PGOLD</h3>
            <div className="info-content compact">
              <p>PGOLD is a Real World Asset (RWA) token pegged to real gold price.</p>
              <p><strong>1 PGOLD</strong> = Current Gold Price (XAU/USD)</p>
              <p><strong>Oracle:</strong> Chainlink XAU/USD</p>
              <p><strong>Network:</strong> Polygon (137)</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

