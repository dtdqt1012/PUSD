import { useState } from 'react';

interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

const faqData: FAQItem[] = [
  {
    category: 'Overview',
    question: 'What is PUSD?',
    answer: 'PUSD (Polygon USD) is a decentralized stablecoin backed by Polygon (POL). It maintains a 1:1 ratio with USD through a collateralization mechanism using POL as collateral. The system ensures transparency and security through on-chain verification and real-time price feeds.'
  },
  {
    category: 'Minting',
    question: 'How do I mint PUSD?',
    answer: 'You can mint PUSD by depositing POL into the Minting Vault. You will receive 60% of the USD value as PUSD, while 20% is automatically staked as POL and 20% is automatically staked as PUSD on your behalf. This automatic staking helps you start earning rewards immediately.'
  },
  {
    category: 'Staking',
    question: 'What are the lock periods for staking?',
    answer: 'You can stake POL or PUSD for 30, 60, 120, or 365 days. Longer lock periods provide higher point multipliers, resulting in more rewards. The multipliers are: 30 days (1x), 60 days (1.5x), 120 days (2x), and 365 days (3x).'
  },
  {
    category: 'Staking',
    question: 'How are points calculated?',
    answer: 'Points are calculated based on the USD value of assets you stake multiplied by a time-based multiplier. For example, staking $1000 worth of POL for 365 days gives you 3000 points (1000 × 3x multiplier). Points accumulate over time and determine your share of rewards.'
  },
  {
    category: 'Rewards',
    question: 'How do I claim rewards?',
    answer: 'You can claim your accumulated PUSD rewards anytime through the Reward Distributor contract. Simply connect your wallet and click "Claim Rewards" in the dashboard. Rewards are distributed based on your total staking points compared to all stakers.'
  },
  {
    category: 'Security',
    question: 'What is the collateral ratio?',
    answer: 'The collateral ratio is the ratio between total collateral value (POL in vault, staked POL, staked PUSD, and swap pool reserves) and total PUSD supply. A higher ratio (e.g., 200%+) indicates better security and over-collateralization.'
  },
  {
    category: 'Minting',
    question: 'Can I redeem PUSD for POL?',
    answer: 'Yes, you can redeem PUSD for POL through the Minting Vault anytime. The amount of POL you receive depends on the current POL price from Chainlink Oracle and available collateral in the vault. Slippage protection ensures you receive the expected amount.'
  },
  {
    category: 'Trading',
    question: 'Are there any fees?',
    answer: 'Swap fees are 0.3% for POL to PUSD swaps and 0.5% for PUSD to POL swaps. These fees accumulate in the swap pool reserves and contribute to the total collateral backing PUSD. No fees are charged for minting or staking.'
  },
  {
    category: 'Security',
    question: 'Is PUSD audited?',
    answer: 'All smart contracts are verified on PolygonScan and publicly auditable. The code is open source and can be reviewed by anyone. We recommend reviewing the contract code on PolygonScan before interacting with the protocol.'
  },
  {
    category: 'Security',
    question: 'What happens if POL price drops?',
    answer: 'The system uses Chainlink oracle for real-time POL price feeds. If the collateral ratio drops significantly, the system may limit new mints to maintain stability. However, users can always redeem their PUSD for POL, ensuring liquidity and exit options.'
  },
  {
    category: 'PGOLD',
    question: 'What is PGOLD?',
    answer: 'PGOLD (Polygon Gold) is a Real World Asset (RWA) token backed by gold. 1 PGOLD is equivalent to $4000 worth of gold, with the price dynamically updated based on real-time gold prices from Chainlink Oracle. You can mint PGOLD using PUSD and redeem it back to PUSD anytime.'
  },
  {
    category: 'PGOLD',
    question: 'How do I mint PGOLD?',
    answer: 'To mint PGOLD, you need PUSD tokens. Connect your wallet, enter the amount of PUSD you want to use, and the system will calculate how much PGOLD you will receive based on the current gold price. There is a small minting fee (0.5% default) that goes to the vault reserves.'
  },
  {
    category: 'PGOLD',
    question: 'How is PGOLD price determined?',
    answer: 'PGOLD price is determined by the real-time gold price from Chainlink XAU/USD oracle. The system ensures 1 PGOLD = $4000 worth of gold. The oracle updates continuously, and prices older than 2 hours are rejected to ensure accuracy.'
  },
  {
    category: 'PGOLD',
    question: 'Can I redeem PGOLD back to PUSD?',
    answer: 'Yes, you can redeem PGOLD back to PUSD at any time. The amount of PUSD you receive is calculated based on the current gold price. There is a small redemption fee (0.5% default) that goes to the vault reserves.'
  },
  {
    category: 'PGOLD',
    question: 'What are the fees for PGOLD?',
    answer: 'PGOLD has mint and redeem fees (default 0.5% each, configurable by owner). These fees help maintain the vault reserves and ensure the stability of the PGOLD ecosystem. The fees are transparent and shown before you confirm any transaction.'
  }
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories = ['All', ...Array.from(new Set(faqData.map(faq => faq.category)))];

  const filteredFAQs = selectedCategory === 'All' 
    ? faqData 
    : faqData.filter(faq => faq.category === selectedCategory);

  const getActualIndex = (filteredIndex: number) => {
    if (selectedCategory === 'All') return filteredIndex;
    const categoryItems = faqData
      .map((faq, idx) => faq.category === selectedCategory ? idx : -1)
      .filter(idx => idx !== -1);
    return categoryItems[filteredIndex];
  };

  const toggleFAQ = (index: number) => {
    const actualIndex = getActualIndex(index);
    setOpenIndex(openIndex === actualIndex ? null : actualIndex);
  };

  return (
    <div className="faq-page">
      <div className="faq-header">
        <h1 className="page-title">
          <span className="terminal-prompt">&gt;</span>
          <span>Frequently Asked Questions</span>
        </h1>
        <p className="page-subtitle">Everything you need to know about PUSD</p>
      </div>

      <div className="faq-filters">
        {categories.map((category) => (
          <button
            key={category}
            className={`filter-btn ${selectedCategory === category ? 'active' : ''}`}
            onClick={() => {
              setSelectedCategory(category);
              setOpenIndex(null);
            }}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="faq-list">
        {filteredFAQs.map((faq, index) => {
          const actualIndex = getActualIndex(index);
          const isOpen = openIndex === actualIndex;
          
          return (
            <div 
              key={actualIndex} 
              className={`faq-item ${isOpen ? 'open' : ''}`}
            >
              <div 
                className="faq-question"
                onClick={() => toggleFAQ(index)}
              >
                <div className="faq-question-left">
                  <span className="faq-number">{String(actualIndex + 1).padStart(2, '0')}</span>
                  <span className="faq-category">{faq.category}</span>
                  <h3>{faq.question}</h3>
                </div>
                <span className={`faq-toggle ${isOpen ? 'open' : ''}`}>
                  {isOpen ? '▼' : '▶'}
                </span>
              </div>
              <div className={`faq-answer ${isOpen ? 'open' : ''}`}>
                <div className="faq-answer-content">
                  <p>{faq.answer}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

