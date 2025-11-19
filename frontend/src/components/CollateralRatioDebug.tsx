import { useCollateralRatio } from '../hooks/useCollateralRatio';
import { getCollateralRatioStatus } from '../utils/calculateCollateralRatio';

export default function CollateralRatioDebug() {
  const collateralRatio = useCollateralRatio(30000);

  if (collateralRatio.loading) {
    return <div>Loading collateral data...</div>;
  }

  if (collateralRatio.error) {
    return <div>Error: {collateralRatio.error}</div>;
  }

  const status = getCollateralRatioStatus(collateralRatio.ratio);
  
  // Calculate what's needed to reach 110%
  const targetRatio = 110;
  const currentPOLValueUSD = Number(collateralRatio.polValueUSD) / 1e18;
  const pusdSupply = Number(collateralRatio.pusdSupply) / 1e18;
  const targetPOLValueUSD = (pusdSupply * targetRatio) / 100;
  const neededPOLValueUSD = Math.max(0, targetPOLValueUSD - currentPOLValueUSD);
  const polPrice = Number(collateralRatio.polPrice) / 1e8;
  const neededPOL = neededPOLValueUSD / polPrice;

  return (
    <div className="section collateral-debug" style={{ 
      background: 'rgba(26, 0, 51, 0.8)', 
      padding: '1rem', 
      borderRadius: '8px',
      border: '1px solid var(--purple-400)',
      marginTop: '1rem'
    }}>
      <h3 style={{ color: 'var(--purple-400)', marginBottom: '1rem' }}>
        Collateral Ratio Analysis
      </h3>
      
      <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--purple-300)' }}>Current Ratio:</span>
          <span style={{ color: status.color, fontWeight: 'bold' }}>
            {collateralRatio.formatted.ratio}% ({status.message})
          </span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--purple-300)' }}>POL Value USD:</span>
          <span style={{ color: 'var(--green-glow)' }}>
            ${currentPOLValueUSD.toFixed(4)}
          </span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--purple-300)' }}>PUSD Supply:</span>
          <span style={{ color: 'var(--green-glow)' }}>
            {pusdSupply.toFixed(4)} PUSD
          </span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--purple-300)' }}>POL in Vault:</span>
          <span style={{ color: 'var(--green-glow)' }}>
            {collateralRatio.formatted.polInVault} POL
          </span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--purple-300)' }}>POL in SwapPool:</span>
          <span style={{ color: 'var(--green-glow)' }}>
            {collateralRatio.formatted.polInSwapPool} POL
          </span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--purple-300)' }}>POL Price:</span>
          <span style={{ color: 'var(--green-glow)' }}>
            ${collateralRatio.formatted.polPrice}
          </span>
        </div>
      </div>

      {collateralRatio.ratio < 110 && (
        <div style={{ 
          background: 'rgba(255, 165, 0, 0.1)', 
          padding: '1rem', 
          borderRadius: '4px',
          border: '1px solid #ffa500',
          marginTop: '1rem'
        }}>
          <h4 style={{ color: '#ffa500', marginBottom: '0.5rem' }}>
            ⚠️ To reach 110% Collateral Ratio:
          </h4>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--purple-200)' }}>Need POL Value:</span>
              <span style={{ color: '#ffa500', fontWeight: 'bold' }}>
                ${neededPOLValueUSD.toFixed(4)} USD
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--purple-200)' }}>Need POL Amount:</span>
              <span style={{ color: '#ffa500', fontWeight: 'bold' }}>
                {neededPOL.toFixed(4)} POL
              </span>
            </div>
            <div style={{ 
              marginTop: '0.5rem', 
              padding: '0.5rem', 
              background: 'rgba(138, 71, 229, 0.1)',
              borderRadius: '4px',
              fontSize: '0.9rem',
              color: 'var(--purple-200)'
            }}>
              <strong>Or:</strong> Burn {((pusdSupply - currentPOLValueUSD) * 100 / pusdSupply).toFixed(2)}% of PUSD supply
            </div>
          </div>
        </div>
      )}

      <div style={{ 
        marginTop: '1rem', 
        padding: '0.75rem', 
        background: 'rgba(138, 71, 229, 0.05)',
        borderRadius: '4px',
        fontSize: '0.85rem',
        color: 'var(--purple-200)'
      }}>
        <strong style={{ color: 'var(--purple-400)' }}>Formula:</strong><br/>
        Ratio = (POL Value USD / PUSD Supply) × 100<br/>
        POL Value USD = (POL in Vault + POL in SwapPool) × POL Price
      </div>
    </div>
  );
}

