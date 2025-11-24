import { useEffect, useState, useRef } from 'react';
import { Contract } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import { CONTRACTS } from '../config/contracts';
import { formatBalance, formatPrice } from '../utils/format';
import { loadWithTimeout } from '../utils/loadWithTimeout';
import { useExpandable } from '../hooks/useExpandable';
import TVLChart from './TVLChart';

function ProjectInfo() {
  const { provider } = useWeb3();
  const [polPrice, setPolPrice] = useState<string>('0');
  const [totalPusd, setTotalPusd] = useState<string>('0');
  const [vaultPol, setVaultPol] = useState<string>('0');
  const [totalStaked, setTotalStaked] = useState<string>('0');
  const [swapPoolReserves, setSwapPoolReserves] = useState<string>('0');
  const [pusdStaked, setPusdStaked] = useState<string>('0');
  const { isExpanded, toggle, headerStyle, toggleIcon } = useExpandable(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!provider) return;

    const loadStats = async () => {
      try {
        const pgoldVaultContract = CONTRACTS.PGOLDVault 
          ? new Contract(CONTRACTS.PGOLDVault.address, CONTRACTS.PGOLDVault.abi, provider)
          : null;
        
        const [oracleContract, pusdContract, vaultContract, stakingContract, swapContract] = await Promise.all([
          new Contract(CONTRACTS.OraclePriceFeed.address, CONTRACTS.OraclePriceFeed.abi, provider),
          new Contract(CONTRACTS.PUSDToken.address, CONTRACTS.PUSDToken.abi, provider),
          new Contract(CONTRACTS.MintingVault.address, CONTRACTS.MintingVault.abi, provider),
          new Contract(CONTRACTS.StakingPool.address, CONTRACTS.StakingPool.abi, provider),
          new Contract(CONTRACTS.SwapPool.address, CONTRACTS.SwapPool.abi, provider),
        ]);

        const results = await Promise.allSettled([
          loadWithTimeout(oracleContract.getPOLPrice(), 5000).catch(() => null),
          loadWithTimeout(pusdContract.totalSupply(), 5000).catch(() => null),
          loadWithTimeout(vaultContract.getBalance(), 5000).catch(() => null),
          loadWithTimeout(stakingContract.totalStaked(), 5000).catch(() => null),
          loadWithTimeout(swapContract.getBalance(), 5000).catch(() => null),
          loadWithTimeout(stakingContract.totalPUSDStaked(), 5000).catch(() => null),
          // PUSD trong contracts để tính PUSD users đang cầm
          loadWithTimeout(pusdContract.balanceOf(CONTRACTS.MintingVault.address), 5000).catch(() => null),
          loadWithTimeout(pusdContract.balanceOf(CONTRACTS.SwapPool.address), 5000).catch(() => null),
          pgoldVaultContract ? loadWithTimeout(pusdContract.balanceOf(CONTRACTS.PGOLDVault.address), 5000).catch(() => null) : Promise.resolve(null),
        ]);

        if (!mountedRef.current) return;

        const price = results[0].status === 'fulfilled' && results[0].value ? formatPrice(results[0].value) : '0';
        const totalSupply = results[1].status === 'fulfilled' && results[1].value ? formatBalance(results[1].value) : '0';
        const vault = results[2].status === 'fulfilled' && results[2].value ? formatBalance(results[2].value) : '0';
        const staked = results[3].status === 'fulfilled' && results[3].value ? formatBalance(results[3].value) : '0';
        const swapReserves = results[4].status === 'fulfilled' && results[4].value ? formatBalance(results[4].value) : '0';
        const pusdStakedValue = results[5].status === 'fulfilled' && results[5].value ? formatBalance(results[5].value) : '0';
        
        // Tính PUSD trong contracts (calculated but not used)
        // const pusdInVault = results[6].status === 'fulfilled' && results[6].value ? formatBalance(results[6].value) : '0';
        // const pusdInSwap = results[7].status === 'fulfilled' && results[7].value ? formatBalance(results[7].value) : '0';
        // const pusdInPgoldVault = results[8].status === 'fulfilled' && results[8].value ? formatBalance(results[8].value) : '0';
        
        // PUSD mà users đang cầm = Total Supply - PUSD trong contracts (calculated but not used)
        // const pusdUsersHold = Math.max(0, 
        //   parseFloat(totalSupply) - parseFloat(pusdInVault) - parseFloat(pusdStakedValue) - parseFloat(pusdInSwap) - parseFloat(pusdInPgoldVault)
        // );

        setPolPrice(price);
        setTotalPusd(totalSupply); // Vẫn hiển thị total supply
        setVaultPol(vault);
        setTotalStaked(staked);
        setSwapPoolReserves(swapReserves);
        setPusdStaked(pusdStakedValue);
      } catch (error) {
        console.error('Failed to load stats:', error);
      }
    };

    loadStats();
    const interval = setInterval(loadStats, 60000); // Auto-refresh every 60 seconds (reduced RPC calls)
    return () => clearInterval(interval);
  }, [provider]);

  // TVL = Tất cả POL đang lock (Vault + Staking + Swap Pool) * POL Price
  const tvl = (parseFloat(vaultPol) + parseFloat(totalStaked) + parseFloat(swapPoolReserves)) * parseFloat(polPrice);
  

  return (
    <div className="section project-info">
      <h2 onClick={toggle} style={headerStyle}>
        Project Info {toggleIcon}
      </h2>
      
      {isExpanded && (
        <>
          <div className="info-section compact">
            <h3>Quick Stats</h3>
            <div className="stats-grid compact">
              <div className="stat-item">
                <strong>POL Price</strong>
                <span>${polPrice}</span>
              </div>
              <div className="stat-item">
                <strong>Total PUSD</strong>
                <span>{parseFloat(totalPusd).toFixed(2)}</span>
              </div>
              <div className="stat-item">
                <strong>PUSD Staked</strong>
                <span>{parseFloat(pusdStaked).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="info-section compact">
            <h3>TVL Chart</h3>
            <TVLChart height={250} />
          </div>

          <div className="info-section compact">
            <h3>Contracts</h3>
            <div className="address-list compact">
              <div className="address-item">
                <label>PUSD:</label>
                <span className="address">{CONTRACTS.PUSDToken.address.slice(0, 10)}...</span>
              </div>
              <div className="address-item">
                <label>Vault:</label>
                <span className="address">{CONTRACTS.MintingVault.address.slice(0, 10)}...</span>
              </div>
              <div className="address-item">
                <label>Staking:</label>
                <span className="address">{CONTRACTS.StakingPool.address.slice(0, 10)}...</span>
              </div>
              <div className="address-item">
                <label>Swap:</label>
                <span className="address">{CONTRACTS.SwapPool.address.slice(0, 10)}...</span>
              </div>
            </div>
          </div>

          <div className="info-section compact">
            <h3>About</h3>
            <div className="info-content compact">
              <p>PUSD is a decentralized stablecoin pegged to $1 USD, backed by POL.</p>
              <p><strong>60% Mint</strong> PUSD | <strong>20% Auto-Stake</strong> POL | <strong>20% Auto-Stake</strong> PUSD</p>
              <p><strong>Network:</strong> Polygon (137) | <strong>Oracle:</strong> Chainlink</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ProjectInfo;
