import { useState } from 'react';

export default function PFUNWhitepaper() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div style={{ 
      marginTop: '2rem', 
      padding: '1.5rem',
      border: '1px solid #333',
      borderRadius: '4px',
      background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)'
    }}>
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ 
          marginBottom: isExpanded ? '1.5rem' : '0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: '#00ff00' }}>&gt;</span>
          <h2 style={{ 
            margin: 0, 
            fontSize: '1.25rem', 
            fontWeight: 'bold',
            color: '#00ff00',
            fontFamily: 'Courier New, monospace'
          }}>
            Whitepaper
          </h2>
        </div>
        <span style={{ 
          color: '#888',
          fontSize: '0.75rem',
          fontFamily: 'Courier New, monospace',
          transition: 'transform 0.2s ease',
          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'
        }}>
          ▶
        </span>
      </div>

      <div style={{ 
        maxHeight: isExpanded ? '10000px' : '0',
        overflow: 'hidden',
        transition: 'max-height 0.5s ease'
      }}>
        <div style={{ 
          color: '#ccc',
          fontSize: '0.9rem',
          lineHeight: '1.8',
          fontFamily: 'Courier New, monospace',
          paddingTop: isExpanded ? '1rem' : '0'
        }}>
          {/* Executive Summary */}
          <section style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: '#00ff00', fontSize: '1.1rem', marginBottom: '1rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
              1. Executive Summary
            </h3>
            <p>
              PFUN is a decentralized token launchpad built on Polygon that enables anyone to create, launch, and trade tokens through an innovative bonding curve mechanism. Unlike traditional launchpads that require extensive liquidity pools or order books, PFUN uses mathematical curves to automatically discover prices based on supply and demand.
            </p>
            <p>
              The platform combines token creation, price discovery, community engagement (through boosting), and decentralized trading into a single, seamless experience. PFUN is designed to be permissionless, transparent, and accessible to all users while maintaining security through smart contract verification and collateral locking mechanisms.
            </p>
          </section>

          {/* Core Concepts */}
          <section style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: '#00ff00', fontSize: '1.1rem', marginBottom: '1rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
              2. Core Concepts
            </h3>
            
            <h4 style={{ color: '#00ccff', fontSize: '1rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
              2.1 Bonding Curves
            </h4>
            <p>
              A bonding curve is a mathematical function that determines token price based on the number of tokens sold. In PFUN, the price formula is:
            </p>
            <pre style={{ 
              background: '#0a0a0a', 
              padding: '1rem', 
              borderRadius: '4px', 
              border: '1px solid #333',
              overflowX: 'auto',
              margin: '1rem 0'
            }}>
              <code style={{ color: '#00ff00' }}>
{`Price = Initial Price + (Tokens Sold × Price Increment)

Where:
- Initial Price: Starting price when token launches
- Tokens Sold: Total tokens purchased from the curve
- Price Increment: Fixed amount price increases per token`}
              </code>
            </pre>
            <p>
              As tokens are bought, the price increases linearly. When tokens are sold back to the curve, the price decreases accordingly. This creates automatic price discovery without requiring external market makers or liquidity providers.
            </p>

            <h4 style={{ color: '#00ccff', fontSize: '1rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
              2.2 Token Launching
            </h4>
            <p>
              Anyone can launch a token on PFUN by providing:
            </p>
            <ul style={{ marginLeft: '2rem', marginTop: '0.5rem' }}>
              <li>Token name and symbol</li>
              <li>Total supply (fixed at launch)</li>
              <li>Launch amount in PUSD (minimum varies by parameters)</li>
              <li>Optional: Logo URL, website, Telegram, Discord links</li>
            </ul>
            <p>
              Launching requires:
            </p>
            <ul style={{ marginLeft: '2rem', marginTop: '0.5rem' }}>
              <li><strong>Launch Fee:</strong> 1 PUSD (burned by TokenFactory if not owner)</li>
              <li><strong>Launch Amount:</strong> PUSD to seed the bonding curve (minimum 0.06 PUSD)</li>
              <li><strong>Collateral Lock:</strong> 10% of launch amount in PUSD is automatically locked for 30 days</li>
            </ul>
            <p>
              The collateral lock ensures commitment from creators and prevents malicious launches. After the 30-day lock period, creators can claim back their locked PUSD collateral.
            </p>

            <h4 style={{ color: '#00ccff', fontSize: '1rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
              2.3 Boosting Mechanism
            </h4>
            <p>
              Tokens can be boosted by burning PUSD. Each PUSD burned equals 1 boost point. Boost points determine token rankings in the "Top" section, providing visibility and credibility. The boosting mechanism:
            </p>
            <ul style={{ marginLeft: '2rem', marginTop: '0.5rem' }}>
              <li>Permanently burns PUSD (reduces total supply)</li>
              <li>Increases token boost points 1:1</li>
              <li>Helps tokens rank higher in listings</li>
              <li>Demonstrates community support and investment</li>
            </ul>
            <p>
              Boosting is irreversible - burned PUSD cannot be recovered, ensuring genuine commitment from boosters.
            </p>
          </section>

          {/* Technical Architecture */}
          <section style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: '#00ff00', fontSize: '1.1rem', marginBottom: '1rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
              3. Technical Architecture
            </h3>
            
            <h4 style={{ color: '#00ccff', fontSize: '1rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
              3.1 Smart Contracts
            </h4>
            <p>
              PFUN consists of several key smart contracts:
            </p>
            <ul style={{ marginLeft: '2rem', marginTop: '0.5rem' }}>
              <li><strong>TokenFactory:</strong> Creates ERC-20 tokens and collects launch fees</li>
              <li><strong>PFUNLaunchpad:</strong> Manages token launches, boosting, and listings</li>
              <li><strong>PFUNBondingCurve:</strong> Implements bonding curve logic for price discovery</li>
              <li><strong>PUSD Token:</strong> Native stablecoin used for payments and boosting</li>
            </ul>

            <h4 style={{ color: '#00ccff', fontSize: '1rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
              3.2 Price Discovery Algorithm
            </h4>
            <p>
              The bonding curve uses a linear price function:
            </p>
            <pre style={{ 
              background: '#0a0a0a', 
              padding: '1rem', 
              borderRadius: '4px', 
              border: '1px solid #333',
              overflowX: 'auto',
              margin: '1rem 0'
            }}>
              <code style={{ color: '#00ff00' }}>
{`When buying:
  tokensReceived = calculateTokensFromPUSD(pusdAmount)
  newPrice = currentPrice + (tokensReceived × priceIncrement)

When selling:
  pusdReceived = calculatePUSDFromTokens(tokenAmount)
  newPrice = currentPrice - (tokenAmount × priceIncrement)

Price is always calculated on-chain for transparency.`}
              </code>
            </pre>

            <h4 style={{ color: '#00ccff', fontSize: '1rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
              3.3 Collateral Locking
            </h4>
            <p>
              When launching a token, 10% of the launch amount (in PUSD) is automatically locked as collateral. This collateral:
            </p>
            <ul style={{ marginLeft: '2rem', marginTop: '0.5rem' }}>
              <li>Ensures commitment from creators</li>
              <li>Prevents spam and malicious launches</li>
              <li>Is locked for 30 days (configurable by contract owner)</li>
              <li>Can be claimed back after the unlock period expires using the `unlockCollateral` function</li>
              <li>Is separate from the launch fee (1 PUSD) and launch amount</li>
            </ul>
            <p>
              The collateral lock period starts from the moment the token is launched. After 30 days, the creator can call `unlockCollateral` to retrieve their locked PUSD.
            </p>
          </section>

          {/* Token Economics */}
          <section style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: '#00ff00', fontSize: '1.1rem', marginBottom: '1rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
              4. Token Economics
            </h3>
            
            <h4 style={{ color: '#00ccff', fontSize: '1rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
              4.1 Launch Fee Structure
            </h4>
            <p>
              Launching a token requires:
            </p>
            <ul style={{ marginLeft: '2rem', marginTop: '0.5rem' }}>
              <li><strong>1 PUSD:</strong> Fixed launch fee (burned by TokenFactory if not owner)</li>
              <li><strong>Launch Amount:</strong> Initial PUSD to seed the bonding curve (minimum 0.06 PUSD)</li>
              <li><strong>Collateral Lock:</strong> 10% of launch amount in PUSD locked for 30 days</li>
            </ul>
            <p>
              Example: If you launch with 100 PUSD:
            </p>
            <ul style={{ marginLeft: '2rem', marginTop: '0.5rem' }}>
              <li>1 PUSD goes to launch fee</li>
              <li>100 PUSD goes to bonding curve</li>
              <li>10 PUSD (10% of 100) is locked as collateral for 30 days</li>
              <li>Total required: 101 PUSD</li>
            </ul>

            <h4 style={{ color: '#00ccff', fontSize: '1rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
              4.2 Trading Mechanics
            </h4>
            <p>
              Trading on PFUN:
            </p>
            <ul style={{ marginLeft: '2rem', marginTop: '0.5rem' }}>
              <li>Buy orders increase price and token supply</li>
              <li>Sell orders decrease price and token supply (tokens are burned)</li>
              <li>No slippage protection needed - price is deterministic</li>
              <li>All trades execute immediately on-chain</li>
            </ul>

            <h4 style={{ color: '#00ccff', fontSize: '1rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
              4.3 Boost Economics
            </h4>
            <p>
              The boosting mechanism creates a deflationary pressure on PUSD:
            </p>
            <ul style={{ marginLeft: '2rem', marginTop: '0.5rem' }}>
              <li>PUSD burned for boosting reduces total supply</li>
              <li>This increases scarcity and value of remaining PUSD</li>
              <li>Boost points are permanent and cannot be removed</li>
              <li>Creates a competitive environment for token visibility</li>
            </ul>
          </section>

          {/* Security & Safety */}
          <section style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: '#00ff00', fontSize: '1.1rem', marginBottom: '1rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
              5. Security & Safety
            </h3>
            
            <h4 style={{ color: '#00ccff', fontSize: '1rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
              5.1 Smart Contract Security
            </h4>
            <p>
              All PFUN smart contracts are:
            </p>
            <ul style={{ marginLeft: '2rem', marginTop: '0.5rem' }}>
              <li>Verified on PolygonScan for transparency</li>
              <li>Open source and auditable by anyone</li>
              <li>Built using OpenZeppelin security standards</li>
              <li>Protected by reentrancy guards and access controls</li>
            </ul>

            <h4 style={{ color: '#00ccff', fontSize: '1rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
              5.2 User Protection
            </h4>
            <p>
              Users are protected through:
            </p>
            <ul style={{ marginLeft: '2rem', marginTop: '0.5rem' }}>
              <li>Collateral locking prevents malicious launches</li>
              <li>Deterministic pricing eliminates front-running risks</li>
              <li>On-chain verification of all transactions</li>
              <li>No admin controls over user funds</li>
            </ul>

            <h4 style={{ color: '#00ccff', fontSize: '1rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
              5.3 Risk Warnings
            </h4>
            <p>
              Users should be aware that:
            </p>
            <ul style={{ marginLeft: '2rem', marginTop: '0.5rem' }}>
              <li>Token prices can be volatile due to bonding curve mechanics</li>
              <li>Early buyers may face higher prices as more tokens are sold</li>
              <li>Collateral (10% of launch amount) is locked for 30 days (no early withdrawal)</li>
              <li>Launch fee (1 PUSD) is non-refundable</li>
              <li>Always do your own research (DYOR) before launching or trading</li>
              <li>Never invest more than you can afford to lose</li>
            </ul>
          </section>

          {/* Use Cases */}
          <section style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: '#00ff00', fontSize: '1.1rem', marginBottom: '1rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
              6. Use Cases
            </h3>
            
            <h4 style={{ color: '#00ccff', fontSize: '1rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
              6.1 Token Creators
            </h4>
            <p>
              PFUN enables creators to:
            </p>
            <ul style={{ marginLeft: '2rem', marginTop: '0.5rem' }}>
              <li>Launch tokens without needing liquidity pools</li>
              <li>Get immediate price discovery through bonding curves</li>
              <li>Build community through boosting mechanisms</li>
              <li>Access decentralized trading from day one</li>
            </ul>

            <h4 style={{ color: '#00ccff', fontSize: '1rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
              6.2 Traders
            </h4>
            <p>
              Traders can:
            </p>
            <ul style={{ marginLeft: '2rem', marginTop: '0.5rem' }}>
              <li>Trade tokens instantly without waiting for liquidity</li>
              <li>Benefit from predictable price movements</li>
              <li>Support projects through boosting</li>
              <li>Access new tokens early in their lifecycle</li>
            </ul>

            <h4 style={{ color: '#00ccff', fontSize: '1rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
              6.3 Communities
            </h4>
            <p>
              Communities can:
            </p>
            <ul style={{ marginLeft: '2rem', marginTop: '0.5rem' }}>
              <li>Rally around tokens through collective boosting</li>
              <li>Show support by burning PUSD for boost points</li>
              <li>Help tokens reach the top rankings</li>
              <li>Create organic growth through engagement</li>
            </ul>
          </section>

          {/* Roadmap */}
          <section style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: '#00ff00', fontSize: '1.1rem', marginBottom: '1rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
              7. Roadmap & Future Development
            </h3>
            
            <h4 style={{ color: '#00ccff', fontSize: '1rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
              7.1 Current Features
            </h4>
            <ul style={{ marginLeft: '2rem', marginTop: '0.5rem' }}>
              <li>Token creation and launching</li>
              <li>Bonding curve price discovery</li>
              <li>PUSD boosting mechanism</li>
              <li>Decentralized trading</li>
              <li>Collateral locking</li>
              <li>Token listings and rankings</li>
            </ul>

            <h4 style={{ color: '#00ccff', fontSize: '1rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
              7.2 Future Enhancements
            </h4>
            <ul style={{ marginLeft: '2rem', marginTop: '0.5rem' }}>
              <li>Advanced bonding curve types (exponential, logarithmic)</li>
              <li>Multi-token launch campaigns</li>
              <li>Governance mechanisms for listed tokens</li>
              <li>Cross-chain token launches</li>
              <li>Analytics and insights dashboard</li>
              <li>Mobile app integration</li>
            </ul>
          </section>

          {/* Conclusion */}
          <section style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: '#00ff00', fontSize: '1.1rem', marginBottom: '1rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
              8. Conclusion
            </h3>
            <p>
              PFUN represents a new paradigm in token launching and trading, combining the simplicity of bonding curves with the power of decentralized finance. By removing barriers to entry and providing automatic price discovery, PFUN democratizes token creation and trading.
            </p>
            <p>
              The platform's innovative boosting mechanism creates a sustainable ecosystem where community support directly translates into token visibility and success. With transparent, on-chain operations and security-first design, PFUN provides a trustworthy foundation for the next generation of decentralized projects.
            </p>
            <p style={{ marginTop: '1rem', color: '#888', fontSize: '0.85rem' }}>
              <strong>Disclaimer:</strong> This whitepaper is for informational purposes only. Always conduct your own research and consult with financial advisors before making investment decisions. Cryptocurrency investments carry significant risk.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

