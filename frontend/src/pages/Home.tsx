import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="home-page">
      <div className="hero-section">
        <div className="hero-content">
          <div className="hero-badge">
            <span className="badge-dot"></span>
            <span>Live on Polygon Mainnet</span>
          </div>
          <h1 className="hero-title">
            <span className="title-line">
              <span className="terminal-prompt">&gt;</span>
              <span className="title-text">PUSD</span>
            </span>
            <span className="title-subtitle">Decentralized Stablecoin</span>
          </h1>
          <p className="hero-description">
            Fully collateralized stablecoin backed by Polygon (POL),
            delivering stability, transparency, and earning opportunities in the DeFi ecosystem.
          </p>
          <p className="hero-description" style={{ fontSize: '0.9rem', opacity: 0.8 }}>
            Independent project on Polygon network; not affiliated with Polygon Labs.
          </p>
          <div className="hero-actions">
            <Link to="/app" className="btn-primary">
              Launch DApp
            </Link>
          </div>
        </div>
        <div className="hero-stats">
          <div className="stat-card">
            <div className="stat-label">Collateral Ratio</div>
            <div className="stat-value">&gt;100%</div>
            <div className="stat-desc">Fully Backed</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Lock Periods</div>
            <div className="stat-value">4 Options</div>
            <div className="stat-desc">30-365 Days</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Network</div>
            <div className="stat-value">Polygon</div>
            <div className="stat-desc">Mainnet</div>
          </div>
        </div>
      </div>

        <div className="features-section">
          <div className="section-header">
            <h2 className="section-title">PFUN</h2>
            <p className="section-subtitle">
              Launch your meme token with PUSD. Create, trade, and grow your community.
            </p>
            <Link to="/pfun" className="btn-primary" style={{ marginTop: '1rem', display: 'inline-block' }}>
              Launch Your Token →
            </Link>
          </div>
        </div>

        <div className="features-section">
        <div className="section-header">
          <h2 className="section-title">
            <span className="terminal-prompt">&gt;</span>
            <span>Key Features</span>
          </h2>
          <p className="section-subtitle">Everything you need for DeFi stability</p>
        </div>
        <div className="features-grid">
          <div className="feature-card">
            <h3>Fully Collateralized</h3>
            <p>Backed by Polygon (POL) with real-time price feeds via Chainlink Oracle for maximum security</p>
            <div className="feature-highlight"></div>
          </div>
          <div className="feature-card">
            <h3>Auto Staking</h3>
            <p>60% mint PUSD, 20% auto-stake POL, 20% auto-stake PUSD - start earning immediately upon minting</p>
            <div className="feature-highlight"></div>
          </div>
          <div className="feature-card">
            <h3>Staking Rewards</h3>
            <p>Stake POL or PUSD with flexible lock periods (30-365 days) to earn points and PUSD rewards</p>
            <div className="feature-highlight"></div>
          </div>
          <div className="feature-card">
            <h3>Swap Pool</h3>
            <p>Deep liquidity pool for seamless POL ↔ PUSD exchange with minimal slippage</p>
            <div className="feature-highlight"></div>
          </div>
          <div className="feature-card">
            <h3>Real-Time Metrics</h3>
            <p>Track collateral ratio, TVL, and all key metrics in real-time through the dashboard</p>
            <div className="feature-highlight"></div>
          </div>
          <div className="feature-card">
            <h3>Fully Transparent</h3>
            <p>All contracts verified on PolygonScan, fully auditable and open source</p>
            <div className="feature-highlight"></div>
          </div>
        </div>
      </div>

      <div className="how-it-works-section">
        <div className="section-header">
          <h2 className="section-title">
            <span className="terminal-prompt">&gt;</span>
            <span>How It Works</span>
          </h2>
          <p className="section-subtitle">Simple steps to get started</p>
        </div>
        <div className="steps-container">
          <div className="step-item">
            <div className="step-number">01</div>
            <div className="step-content">
              <h3>Mint PUSD</h3>
              <p>Deposit POL to mint PUSD at 60% USD value. The remaining 40% is auto-staked - 20% as POL and 20% as PUSD on your behalf.</p>
            </div>
            <div className="step-arrow">→</div>
          </div>
          <div className="step-item">
            <div className="step-number">02</div>
            <div className="step-content">
              <h3>Stake & Earn</h3>
              <p>Stake POL or PUSD with lock periods of 30, 60, 120, or 365 days. Longer locks = higher multiplier = more points and rewards.</p>
            </div>
            <div className="step-arrow">→</div>
          </div>
          <div className="step-item">
            <div className="step-number">03</div>
            <div className="step-content">
              <h3>Swap & Trade</h3>
              <p>Use our liquidity pool to exchange between POL and PUSD instantly with competitive rates and minimal slippage protection.</p>
            </div>
            <div className="step-arrow">→</div>
          </div>
          <div className="step-item">
            <div className="step-number">04</div>
            <div className="step-content">
              <h3>Claim Rewards</h3>
              <p>Accumulate points through staking and claim your PUSD rewards anytime through the Reward Distributor.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

