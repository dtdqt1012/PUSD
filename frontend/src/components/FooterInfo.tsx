import { useState, memo, useCallback } from 'react';
import { CONTRACTS } from '../config/contracts';

const FooterInfo = memo(function FooterInfo() {
  const [showContracts, setShowContracts] = useState(false);
  
  const toggleContracts = useCallback(() => {
    setShowContracts(prev => !prev);
  }, []);
  
  return (
    <div className="section footer-info">
      {/* Contract Info */}
      <div className="info-section">
        <h3 
          onClick={toggleContracts} 
          style={{ cursor: 'pointer', userSelect: 'none' }}
        >
          Contract Addresses {showContracts ? '▼' : '▶'}
        </h3>
        {showContracts && (
          <div className="contract-list">
          <div className="contract-item">
            <label>PUSD Token:</label>
            <span className="contract-address">{CONTRACTS.PUSDToken.address}</span>
          </div>
          <div className="contract-item">
            <label>Minting Vault:</label>
            <span className="contract-address">{CONTRACTS.MintingVault.address}</span>
          </div>
          <div className="contract-item">
            <label>Staking Pool:</label>
            <span className="contract-address">{CONTRACTS.StakingPool.address}</span>
          </div>
          <div className="contract-item">
            <label>Swap Pool:</label>
            <span className="contract-address">{CONTRACTS.SwapPool.address}</span>
          </div>
          <div className="contract-item">
            <label>Oracle (Chainlink):</label>
            <span className="contract-address">{CONTRACTS.OraclePriceFeed.address}</span>
          </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default FooterInfo;

