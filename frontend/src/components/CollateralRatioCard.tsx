import { useCollateralRatio } from '../hooks/useCollateralRatio';
import { getCollateralRatioStatus } from '../utils/calculateCollateralRatio';

export default function CollateralRatioCard() {
  const collateralRatio = useCollateralRatio(30000); // Refresh every 30 seconds
  const status = getCollateralRatioStatus(collateralRatio.ratio);

  if (collateralRatio.loading) {
    return (
      <div className="section collateral-ratio-card">
        <h3>Collateral Ratio</h3>
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (collateralRatio.error) {
    return (
      <div className="section collateral-ratio-card">
        <h3>Collateral Ratio</h3>
        <div className="error">Error: {collateralRatio.error}</div>
      </div>
    );
  }

  return (
    <div className="section collateral-ratio-card">
      <h3>Collateral Ratio</h3>
      
      <div className="ratio-display">
        <div 
          className="ratio-value" 
          style={{ color: status.color }}
        >
          {collateralRatio.formatted.ratio}%
        </div>
        <div className="ratio-status" style={{ color: status.color }}>
          {status.message} - {status.description}
        </div>
      </div>

      <div className="ratio-details">
        <div className="detail-item">
          <span className="label">POL in Vault:</span>
          <span className="value">{collateralRatio.formatted.polInVault}</span>
        </div>
        <div className="detail-item">
          <span className="label">POL in SwapPool:</span>
          <span className="value">{collateralRatio.formatted.polInSwapPool}</span>
        </div>
        <div className="detail-item">
          <span className="label">POL Price:</span>
          <span className="value">${collateralRatio.formatted.polPrice}</span>
        </div>
        <div className="detail-item">
          <span className="label">POL Value (USD):</span>
          <span className="value">${collateralRatio.formatted.polValueUSD}</span>
        </div>
        <div className="detail-item">
          <span className="label">PUSD Supply:</span>
          <span className="value">{collateralRatio.formatted.pusdSupply}</span>
        </div>
      </div>

      <div className="ratio-bar">
        <div 
          className="ratio-bar-fill" 
          style={{ 
            width: `${Math.min(collateralRatio.ratio, 200)}%`,
            backgroundColor: status.color 
          }}
        />
      </div>

      <div className="ratio-info">
        <p>
          <strong>Formula:</strong> (POL Value in USD / PUSD Supply) × 100
        </p>
        <p>
          <strong>Status:</strong> {status.description}
        </p>
      </div>
    </div>
  );
}

