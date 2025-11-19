export default function Whitepaper() {
  const handleDownloadPDF = () => {
    // Create a printable version
    window.print();
  };

  // Calculate relative time (e.g., "2 hours ago", "3 days ago")
  const getRelativeTime = () => {
    // Set the last update time to today (you can change this to the actual last update time)
    const now = new Date();
    const lastUpdate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0); // Today at midnight
    const diffMs = now.getTime() - lastUpdate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffWeeks < 4) return `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`;
    if (diffMonths < 12) return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
    return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) > 1 ? 's' : ''} ago`;
  };

  return (
    <div className="whitepaper-page">
      <div className="whitepaper-container">
        <header className="whitepaper-header">
          <div className="whitepaper-header-actions">
            <button 
              onClick={handleDownloadPDF} 
              className="btn-download-pdf"
              title="Print or Save as PDF"
            >
              📄 Download PDF
            </button>
          </div>
          <h1 className="whitepaper-title">
            <span className="terminal-prompt">&gt;</span> PUSD Whitepaper
          </h1>
          <p className="whitepaper-subtitle">Polygon USD: A Native Stablecoin for the Polygon Ecosystem</p>
          <div className="whitepaper-meta">
            <span>Last Updated: {getRelativeTime()}</span>
          </div>
        </header>

        <div className="whitepaper-content">
          {/* Abstract */}
          <section className="whitepaper-section">
            <h2 className="section-title">Abstract</h2>
            <p>
              PUSD (Polygon USD) is a decentralized, over-collateralized stablecoin native to the Polygon blockchain. 
              Unlike existing stablecoin solutions that require bridging from Ethereum, PUSD is built from the ground up 
              for Polygon, providing users with a native, transparent, and secure stablecoin experience. PUSD maintains 
              a 1:1 peg with the US Dollar through over-collateralization with POL (Polygon's native token), ensuring 
              stability while offering staking rewards to incentivize long-term participation in the ecosystem.
            </p>
          </section>

          {/* Table of Contents */}
          <section className="whitepaper-section">
            <h2 className="section-title">Table of Contents</h2>
            <nav className="toc">
              <a href="#introduction">1. Introduction</a>
              <a href="#problem">2. Problem Statement</a>
              <a href="#solution">3. Solution: PUSD</a>
              <a href="#architecture">4. Technical Architecture</a>
              <a href="#tokenomics">5. Tokenomics</a>
              <a href="#security">6. Security & Risk Management</a>
              <a href="#governance">7. Governance</a>
              <a href="#roadmap">8. Roadmap</a>
              <a href="#usecases">9. Use Cases</a>
              <a href="#conclusion">10. Conclusion</a>
            </nav>
          </section>

          {/* 1. Introduction */}
          <section id="introduction" className="whitepaper-section">
            <h2 className="section-title">1. Introduction</h2>
            
            <h3>1.1 Background</h3>
            <p>
              Polygon has emerged as one of the fastest-growing Layer 2 blockchain ecosystems, with millions of active 
              users and billions in Total Value Locked (TVL). The network offers low transaction fees, fast finality, and 
              a thriving DeFi ecosystem. However, despite this growth, Polygon lacks a native stablecoin solution.
            </p>
            <p>
              Currently, Polygon users rely on stablecoins bridged from Ethereum, primarily USDT, USDC, DAI, and FRAX. 
              While these solutions provide basic functionality, they introduce several limitations including bridge security 
              risks, centralization concerns, and lack of native ecosystem integration.
            </p>

            <h3>1.2 Project Vision</h3>
            <p>PUSD aims to become the primary stablecoin for the Polygon ecosystem by providing:</p>
            <ul>
              <li><strong>Native Integration:</strong> Built specifically for Polygon, eliminating bridge dependencies</li>
              <li><strong>Decentralization:</strong> Fully decentralized with no single point of failure</li>
              <li><strong>Transparency:</strong> 100% on-chain verification, no off-chain audits required</li>
              <li><strong>Ecosystem Alignment:</strong> Backed by POL, aligning incentives with Polygon's growth</li>
              <li><strong>User Incentives:</strong> Staking rewards for long-term holders</li>
            </ul>
          </section>

          {/* 2. Problem Statement */}
          <section id="problem" className="whitepaper-section">
            <h2 className="section-title">2. Problem Statement</h2>
            
            <h3>2.1 Current Stablecoin Landscape on Polygon</h3>
            <p>
              The Polygon ecosystem currently relies on bridged stablecoins from Ethereum:
            </p>
            <ul>
              <li><strong>USDT/USDC:</strong> Centralized fiat-backed stablecoins bridged from Ethereum</li>
              <li><strong>DAI:</strong> Decentralized multi-collateral stablecoin bridged from Ethereum</li>
              <li><strong>FRAX:</strong> Hybrid algorithmic stablecoin bridged from Ethereum</li>
            </ul>

            <h3>2.2 Limitations of Current Solutions</h3>
            
            <h4>2.2.1 Bridge Dependency</h4>
            <ul>
              <li><strong>Security Risks:</strong> Bridge contracts represent a single point of failure</li>
              <li><strong>Additional Fees:</strong> Bridge operations add extra costs</li>
              <li><strong>Slower Transactions:</strong> Bridge operations introduce delays</li>
              <li><strong>Complexity:</strong> Users must understand bridge mechanics</li>
            </ul>

            <h4>2.2.2 Centralization Concerns</h4>
            <ul>
              <li><strong>Freeze Risk:</strong> USDT/USDC issuers can freeze user funds</li>
              <li><strong>Regulatory Risk:</strong> Centralized issuers face regulatory pressure</li>
              <li><strong>Counterparty Risk:</strong> Users depend on third-party issuers</li>
              <li><strong>Transparency:</strong> Off-chain audits, not real-time verification</li>
            </ul>

            <h4>2.2.3 Lack of Native Integration</h4>
            <ul>
              <li><strong>No Ecosystem Alignment:</strong> Bridged tokens don't align with Polygon's growth</li>
              <li><strong>Higher Costs:</strong> Bridge fees increase transaction costs</li>
              <li><strong>Complex Integrations:</strong> Developers face bridge complexity</li>
              <li><strong>Limited Features:</strong> No native-specific features or incentives</li>
            </ul>
          </section>

          {/* 3. Solution: PUSD */}
          <section id="solution" className="whitepaper-section">
            <h2 className="section-title">3. Solution: PUSD</h2>
            
            <h3>3.1 Overview</h3>
            <p>
              PUSD is a decentralized, over-collateralized stablecoin native to Polygon that addresses all limitations 
              of bridged solutions.
            </p>

            <h3>3.2 Key Features</h3>
            
            <h4>3.2.1 Native to Polygon</h4>
            <ul>
              <li>Built from the ground up for Polygon</li>
              <li>No bridge required</li>
              <li>Faster transactions</li>
              <li>Lower fees</li>
              <li>Better integration</li>
            </ul>

            <h4>3.2.2 Fully Decentralized</h4>
            <ul>
              <li>No single point of failure</li>
              <li>No freeze function</li>
              <li>No blacklist</li>
              <li>Permissionless</li>
              <li>Censorship-resistant</li>
            </ul>

            <h4>3.2.3 Over-Collateralized</h4>
            <ul>
              <li>&gt;100% collateral ratio</li>
              <li>Backed by POL (Polygon native token)</li>
              <li>On-chain verification</li>
              <li>Transparent reserves</li>
            </ul>

            <h4>3.2.4 Staking Rewards</h4>
            <ul>
              <li>Stake POL for rewards</li>
              <li>Stake PUSD for rewards</li>
              <li>Long-term incentives</li>
              <li>Ecosystem participation</li>
            </ul>
          </section>

          {/* 4. Technical Architecture */}
          <section id="architecture" className="whitepaper-section">
            <h2 className="section-title">4. Technical Architecture</h2>
            
            <h3>4.1 System Overview</h3>
            <p>
              PUSD consists of nine core smart contract components:
            </p>
            <ol>
              <li>PUSD Token (ERC20)</li>
              <li>MintingVault</li>
              <li>StakingPool</li>
              <li>SwapPool</li>
              <li>RewardDistributor</li>
              <li>OraclePriceFeed</li>
              <li>PGOLD Token (RWA)</li>
              <li>PGOLDVault</li>
              <li>GoldOracle</li>
            </ol>

            <h3>4.2 Core Components</h3>
            
            <h4>4.2.1 PUSD Token</h4>
            <p><strong>Purpose:</strong> ERC20 token representing PUSD stablecoin</p>
            <p><strong>Key Features:</strong></p>
            <ul>
              <li>Standard ERC20 implementation</li>
              <li>Minting controlled by authorized contracts</li>
              <li>Burning by users for redemption</li>
              <li>Dynamic supply based on demand</li>
            </ul>

            <h4>4.2.2 MintingVault</h4>
            <p><strong>Purpose:</strong> Mint PUSD by depositing POL collateral</p>
            <p><strong>Mechanism:</strong></p>
            <p>When a user mints PUSD with POL:</p>
            <ul>
              <li><strong>60%</strong> → User receives PUSD immediately</li>
              <li><strong>20%</strong> → POL is staked (locked for rewards)</li>
              <li><strong>20%</strong> → PUSD is staked (locked for rewards)</li>
            </ul>
            <p><strong>Result:</strong></p>
            <ul>
              <li>&gt;100% collateral ratio maintained</li>
              <li>Staking rewards incentivized</li>
              <li>Ecosystem alignment achieved</li>
            </ul>

            <h4>4.2.3 StakingPool</h4>
            <p><strong>Purpose:</strong> Stake POL and PUSD to earn rewards</p>
            <p><strong>Features:</strong></p>
            <ul>
              <li>Minimum 30-day lock period</li>
              <li>Points-based reward system</li>
              <li>Longer lock = higher multiplier</li>
              <li>Up to 10x multiplier for 365+ days</li>
            </ul>

            <h4>4.2.4 SwapPool</h4>
            <p><strong>Purpose:</strong> Swap POL ↔ PUSD directly</p>
            <p><strong>Features:</strong></p>
            <ul>
              <li>Native swap (no bridge)</li>
              <li>0.3% trading fee (configurable)</li>
              <li>Fee distribution to stakers/treasury</li>
              <li>Real-time price from oracle</li>
            </ul>

            <h4>4.2.5 RewardDistributor</h4>
            <p><strong>Purpose:</strong> Distribute rewards to stakers</p>
            <p><strong>Features:</strong></p>
            <ul>
              <li>Points convert to PUSD rewards</li>
              <li>Rate set by protocol</li>
              <li>Claimable after unlock</li>
              <li>Whitelisted projects can deposit rewards</li>
            </ul>

            <h4>4.2.6 OraclePriceFeed</h4>
            <p><strong>Purpose:</strong> Get POL price in USD</p>
            <p><strong>Price Sources (Priority Order):</strong></p>
            <ol>
              <li><strong>Chainlink</strong> (primary) - If available</li>
              <li><strong>DEX Pool</strong> (fallback) - Uniswap V2 / QuickSwap compatible</li>
              <li><strong>Manual Price</strong> (emergency) - Admin-set price</li>
            </ol>

            <h4>4.2.7 PGOLD Token</h4>
            <p><strong>Purpose:</strong> Real World Asset (RWA) token backed by gold</p>
            <p><strong>Key Features:</strong></p>
            <ul>
              <li>1 PGOLD = $4000 worth of gold (dynamic pricing)</li>
              <li>ERC20 token with mint/burn functionality</li>
              <li>Minter/Burner roles managed by PGOLDVault</li>
              <li>Real-time price updates from Chainlink XAU/USD</li>
            </ul>

            <h4>4.2.8 PGOLDVault</h4>
            <p><strong>Purpose:</strong> Mint and redeem PGOLD using PUSD</p>
            <p><strong>Mechanism:</strong></p>
            <ul>
              <li>Mint PGOLD: Deposit PUSD, receive PGOLD based on gold price</li>
              <li>Redeem PGOLD: Deposit PGOLD, receive PUSD based on gold price</li>
              <li>Mint/Redeem fees (0.5% default) go to vault reserves</li>
              <li>Slippage protection ensures fair pricing</li>
              <li>Staleness check: Rejects prices older than 2 hours</li>
            </ul>

            <h4>4.2.9 GoldOracle</h4>
            <p><strong>Purpose:</strong> Get real-time gold price in USD</p>
            <p><strong>Price Sources (Priority Order):</strong></p>
            <ol>
              <li><strong>Chainlink XAU/USD</strong> (primary) - Real-time gold price</li>
              <li><strong>Manual Price</strong> (fallback) - Admin-set price if Chainlink fails</li>
            </ol>
            <p><strong>Features:</strong></p>
            <ul>
              <li>8 decimals precision</li>
              <li>2-hour staleness check</li>
              <li>Automatic price updates</li>
              <li>Emergency manual override</li>
            </ul>
          </section>

          {/* 5. Tokenomics */}
          <section id="tokenomics" className="whitepaper-section">
            <h2 className="section-title">5. Tokenomics</h2>
            
            <h3>5.1 Supply Model</h3>
            <ul>
              <li><strong>Type:</strong> Collateralized stablecoin</li>
              <li><strong>Peg:</strong> 1 PUSD = $1 USD</li>
              <li><strong>Backing:</strong> POL (Polygon native token)</li>
              <li><strong>Collateral Ratio:</strong> &gt;100%</li>
              <li><strong>Supply:</strong> Dynamic (mint/burn based on demand)</li>
            </ul>

            <h3>5.2 Minting Mechanism</h3>
            <p><strong>Process:</strong></p>
            <ol>
              <li>User deposits POL to MintingVault</li>
              <li>Oracle provides POL price in USD</li>
              <li>Calculate USD value of POL</li>
              <li>Split: 60% → User receives PUSD, 20% → POL staked, 20% → PUSD staked</li>
              <li>Result: &gt;100% collateral ratio</li>
            </ol>

            <h3>5.3 Staking Rewards</h3>
            <p><strong>POL Staking:</strong></p>
            <ul>
              <li>Points = (USD value × multiplier) / 10</li>
              <li>Multiplier based on lock period</li>
              <li>Higher lock = higher multiplier</li>
            </ul>
            <p><strong>Staking Tiers:</strong></p>
            <ul>
              <li><strong>30-60 days:</strong> 1x-2x multiplier</li>
              <li><strong>60-120 days:</strong> 2x-3x multiplier</li>
              <li><strong>120-365 days:</strong> 3x-10x multiplier</li>
              <li><strong>365+ days:</strong> 10x multiplier (cap)</li>
            </ul>

            <h3>5.4 PGOLD Tokenomics</h3>
            <p><strong>Supply Model:</strong></p>
            <ul>
              <li><strong>Type:</strong> Real World Asset (RWA) token</li>
              <li><strong>Backing:</strong> Gold (via Chainlink XAU/USD oracle)</li>
              <li><strong>Peg:</strong> 1 PGOLD = $4000 worth of gold (dynamic)</li>
              <li><strong>Supply:</strong> Dynamic (mint/burn based on demand)</li>
              <li><strong>Reserve:</strong> PUSD tokens held in vault</li>
            </ul>
            <p><strong>Minting Mechanism:</strong></p>
            <ol>
              <li>User deposits PUSD to PGOLDVault</li>
              <li>GoldOracle provides current gold price</li>
              <li>Calculate PGOLD amount: PUSD / (Gold Price × 4000)</li>
              <li>Apply mint fee (0.5% default)</li>
              <li>User receives PGOLD tokens</li>
            </ol>
            <p><strong>Redeeming Mechanism:</strong></p>
            <ol>
              <li>User deposits PGOLD to PGOLDVault</li>
              <li>GoldOracle provides current gold price</li>
              <li>Calculate PUSD amount: PGOLD × (Gold Price × 4000)</li>
              <li>Apply redeem fee (0.5% default)</li>
              <li>User receives PUSD tokens</li>
            </ol>
          </section>

          {/* 6. Security */}
          <section id="security" className="whitepaper-section">
            <h2 className="section-title">6. Security & Risk Management</h2>
            
            <h3>6.1 Security Measures</h3>
            <ul>
              <li><strong>OpenZeppelin Libraries:</strong> Industry-standard, audited code</li>
              <li><strong>ReentrancyGuard:</strong> Protection against reentrancy attacks</li>
              <li><strong>Access Control:</strong> Ownable pattern for admin functions</li>
              <li><strong>Over-Collateralization:</strong> &gt;100% ratio ensures safety</li>
              <li><strong>On-Chain Verification:</strong> All collateral visible on-chain</li>
            </ul>

            <h3>6.2 Transparency</h3>
            <ul>
              <li>All collateral visible on-chain</li>
              <li>Real-time collateral ratio</li>
              <li>No off-chain audits needed</li>
              <li>Anyone can verify anytime</li>
              <li>Smart contracts verified on PolygonScan</li>
            </ul>
          </section>

          {/* 7. Governance */}
          <section id="governance" className="whitepaper-section">
            <h2 className="section-title">7. Governance</h2>
            
            <h3>7.1 Current Governance</h3>
            <p><strong>Owner-Controlled:</strong></p>
            <ul>
              <li>Initial phase: Owner controls key parameters</li>
              <li>Functions: Fee adjustments, oracle settings, emergency controls</li>
            </ul>

            <h3>7.2 Future Governance (Roadmap)</h3>
            <ul>
              <li>Transition to decentralized governance</li>
              <li>Token holders vote on proposals</li>
              <li>Community-driven decisions</li>
              <li>Transparent proposal process</li>
            </ul>
          </section>

          {/* 8. Roadmap */}
          <section id="roadmap" className="whitepaper-section">
            <h2 className="section-title">8. Roadmap</h2>
            
            <h3>Phase 1: Foundation ✅ (Completed)</h3>
            <ul>
              <li>Core smart contracts deployed</li>
              <li>Minting & redeeming functionality</li>
              <li>Staking system operational</li>
              <li>Swap functionality live</li>
              <li>Frontend DApp launched</li>
            </ul>

            <h3>Phase 2: Growth (Current)</h3>
            <ul>
              <li>Community building</li>
              <li>Marketing expansion</li>
              <li>Liquidity incentives</li>
              <li>User acquisition</li>
            </ul>

            <h3>Phase 3: Ecosystem</h3>
            <ul>
              <li>Dedicated DEX</li>
              <li>PUSD trading pairs</li>
              <li>Token launchpads</li>
              <li>Advanced features</li>
            </ul>

            <h3>Phase 4: Integration</h3>
            <ul>
              <li>Stablecoin bridge network</li>
              <li>Multi-chain compatibility</li>
              <li>Airdrop program for stakers</li>
              <li>Partner integrations</li>
            </ul>

            <h3>Phase 5: Fiat Integration</h3>
            <ul>
              <li>Cross-border fiat payments (Visa)</li>
              <li>PUSD Credit Card</li>
            </ul>
          </section>

          {/* 9. Use Cases */}
          <section id="usecases" className="whitepaper-section">
            <h2 className="section-title">9. Use Cases</h2>
            
            <h3>9.1 For Users</h3>
            <ul>
              <li><strong>Stable Store of Value:</strong> Hold PUSD without volatility, earn staking rewards</li>
              <li><strong>DeFi Participation:</strong> Lend/borrow, yield farming, liquidity provision</li>
              <li><strong>Payments:</strong> Stable payments, remittances, cross-border transactions</li>
            </ul>

            <h3>9.2 For Developers</h3>
            <ul>
              <li><strong>Native Integration:</strong> No bridge complexity, better UX, lower costs</li>
              <li><strong>DeFi Protocols:</strong> Lending platforms, DEXs, yield aggregators</li>
              <li><strong>dApps:</strong> Gaming economies, NFT marketplaces, e-commerce</li>
            </ul>
          </section>

          {/* 10. Conclusion */}
          <section id="conclusion" className="whitepaper-section">
            <h2 className="section-title">10. Conclusion</h2>
            
            <p>
              PUSD represents a significant step forward for the Polygon ecosystem by providing a native, decentralized, 
              and transparent stablecoin solution. By eliminating bridge dependencies, centralization risks, and 
              transparency issues, PUSD offers users a superior stablecoin experience while aligning incentives with 
              Polygon's growth through POL backing and staking rewards.
            </p>

            <h3>Key Advantages</h3>
            <ul>
              <li><strong>Native:</strong> Built for Polygon, no bridge needed</li>
              <li><strong>Decentralized:</strong> No freeze risk, no censorship</li>
              <li><strong>Transparent:</strong> 100% on-chain, verifiable</li>
              <li><strong>Secure:</strong> Over-collateralized, audited code</li>
              <li><strong>Rewarding:</strong> Staking incentives for holders</li>
              <li><strong>Aligned:</strong> POL-backed, ecosystem growth</li>
            </ul>
          </section>

          {/* Disclaimer */}
          <section className="whitepaper-section disclaimer">
            <h2 className="section-title">Disclaimer</h2>
            <p>
              This whitepaper is for informational purposes only and does not constitute financial advice, investment 
              recommendation, or solicitation to buy or sell any tokens. Cryptocurrency investments carry significant risk, 
              and users should conduct their own research and consult with financial advisors before making investment decisions.
            </p>
            <p>
              The PUSD protocol is deployed on Polygon mainnet and is subject to smart contract risks, market risks, and 
              regulatory risks. Users should understand these risks before participating.
            </p>
          </section>
        </div>

        <footer className="whitepaper-footer">
          <p><strong>PUSD - Polygon's Native Stablecoin</strong></p>
          <p><em>Native. Decentralized. Transparent. Rewarding.</em></p>
          <p>Last Updated: {getRelativeTime()}</p>
        </footer>
      </div>
    </div>
  );
}

