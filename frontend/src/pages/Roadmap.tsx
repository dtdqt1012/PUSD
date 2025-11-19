export default function Roadmap() {
  const phases = [
    {
      title: 'Phase 1: Foundation',
      status: 'completed',
      period: 'Q4 2023',
      items: [
        'PUSD Token Contract Deployment',
        'Vault Mint with Auto Staking',
        'Staking Pool (POL & PUSD)',
        'Swap Pool for Liquidity',
        'Chainlink Oracle Integration',
        'Reward Distribution System',
        'PGOLD RWA Token Launch',
        'Gold Oracle Integration'
      ]
    },
    {
      title: 'Phase 2: Growth',
      status: 'active',
      period: 'Q1 2024',
      items: [
        'Community Building',
        'Liquidity Incentives',
        'PGOLD Mint/Redeem System',
        'Real-time Gold Price Integration'
      ]
    },
    {
      title: 'Phase 3: Ecosystem',
      status: 'upcoming',
      period: 'Q3 2024',
      items: [
        'Dedicated DEX Launch',
        'PUSD Trading Pairs',
        'MEME Launchpad',
        'Advanced Token Launchpad'
      ]
    },
    {
      title: 'Phase 4: Integration',
      status: 'upcoming',
      period: 'Q4 2024',
      items: [
        'Stablecoin Bridge Network',
        'Multi-Chain Compatibility',
        'Airdrop Program for Stakers',
        'Partner Integrations'
      ]
    },
    {
      title: 'Phase 5: Fiat Integration',
      status: 'upcoming',
      period: 'Q1 2025',
      items: [
        'Cross-Border Fiat Payments (Visa)',
        'PUSD Credit Card'
      ]
    }
  ];

  return (
    <div className="roadmap-page">
      <div className="roadmap-header">
        <h1 className="page-title">
          <span className="terminal-prompt">&gt;</span>
          <span>Roadmap</span>
        </h1>
        <p className="page-subtitle">Our journey building the future of decentralized stablecoins</p>
      </div>

      <div className="roadmap-timeline">
        {phases.map((phase, index) => (
          <div key={index} className={`timeline-item ${phase.status}`}>
            <div className="timeline-line"></div>
            <div className="timeline-marker">
              <div className="marker-inner">
                {phase.status === 'completed' && '✓'}
                {phase.status === 'active' && '●'}
                {phase.status === 'upcoming' && <span className="marker-dot"></span>}
              </div>
            </div>
            <div className="timeline-content">
              <div className="timeline-header">
                <h3>{phase.title}</h3>
              </div>
              <div className="timeline-status-badge">
                {phase.status === 'completed' && 'Completed'}
                {phase.status === 'active' && 'In Progress'}
                {phase.status === 'upcoming' && 'Upcoming'}
              </div>
              <ul className="timeline-items">
                {phase.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <span className="item-bullet">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

