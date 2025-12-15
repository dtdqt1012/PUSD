import { useState } from 'react';

interface FAQItem {
  question: string;
  answer: string;
}

const pfunFAQData: FAQItem[] = [
  {
    question: 'What is PFUN?',
    answer: 'PFUN is a decentralized token launchpad on Polygon. It allows anyone to create and launch tokens with a bonding curve mechanism for price discovery. Tokens can be boosted by burning PUSD, and top tokens can be listed on the platform.'
  },
  {
    question: 'How do I launch a token?',
    answer: 'To launch a token, provide token details (name, symbol, total supply), a launch amount in PUSD (minimum 0.06 PUSD), and optional socials. There is a fixed launch fee of 1 PUSD (burn). On launch, 10% of the launch amount is locked as collateral for 30 days. The token appears in the "New" section and can be traded immediately.'
  },
  {
    question: 'What is a bonding curve?',
    answer: 'A bonding curve is a mathematical formula that determines token price based on supply. As more tokens are bought, the price increases. When tokens are sold, the price decreases. This creates automatic price discovery without needing a traditional order book or liquidity pool.'
  },
  {
    question: 'How does boosting work?',
    answer: 'You can boost any active token by burning PUSD. Each PUSD burned equals 1 boost point. Boost points help tokens rank higher in the "Top" section. The more boost points a token has, the higher it appears in rankings. Boosting is permanent - the PUSD is burned and cannot be recovered.'
  },
  {
    question: 'How do I buy tokens?',
    answer: 'To buy tokens, enter the amount of PUSD you want to spend in the buy input field. The system will calculate how many tokens you will receive based on the current bonding curve price. Click "Buy" to execute the transaction. You can also click "MAX" to use all available PUSD.'
  },
  {
    question: 'How do I sell tokens?',
    answer: 'To sell tokens, enter the amount of tokens you want to sell in the sell input field. The system will calculate how much PUSD you will receive based on the current bonding curve price. Click "Sell" to execute the transaction. You can also click "MAX" to sell all your tokens.'
  },
  {
    question: 'What is collateral locking?',
    answer: 'When you launch a token, 10% of your launch amount (in PUSD) is automatically locked as collateral for 30 days. This collateral is separate from the 1 PUSD launch fee and can be unlocked after the lock period via unlockCollateral.'
  },
  {
    question: 'How does listing work?',
    answer: 'Tokens with high boost points and trading volume can be listed by the contract owner. Listed tokens gain more visibility and credibility. The listing process is manual and based on token performance metrics like boost points, volume, and community engagement.'
  },
  {
    question: 'What happens to the launch fee?',
    answer: 'The launch fee is a fixed 1 PUSD, burned by the TokenFactory contract (if the launcher is not the owner). This discourages spam launches.'
  },
  {
    question: 'Can I change token details after launch?',
    answer: 'No, token details (name, symbol, total supply) cannot be changed after launch. However, you can update social links (website, Telegram, Discord) if you are the token creator.'
  },
  {
    question: 'What is the minimum launch amount?',
    answer: 'Minimum launch amount per contract is 0.06 PUSD (6e16). Practically, you should add more to ensure initial liquidity and price stability.'
  },
  {
    question: 'How is token price calculated?',
    answer: 'Token price is calculated using a bonding curve formula: Price = Initial Price + (Tokens Sold × Price Increment). As more tokens are bought, the price increases linearly. When tokens are sold, the price decreases accordingly. The exact formula is implemented in the smart contract.'
  },
  {
    question: 'What are boost points?',
    answer: 'Boost points represent the total amount of PUSD burned to boost a token. Each PUSD burned equals 1 boost point. Tokens are ranked by boost points in the "Top" section. Higher boost points indicate more community support and investment.'
  },
  {
    question: 'Can I unlock my collateral early?',
    answer: 'No, collateral (10% of launch amount) is locked for 30 days from the moment you launch the token. This ensures token stability and prevents creators from abandoning tokens immediately after launch. You must wait until the 30-day lock period expires before you can claim your collateral back using the unlockCollateral function.'
  },
  {
    question: 'Is there a trading fee?',
    answer: 'Trading fees may apply depending on the bonding curve implementation. Check the token contract or trading interface for specific fee information. Fees typically go to liquidity reserves or are distributed to token holders.'
  },
  {
    question: 'How do I see my token balance?',
    answer: 'Your token balance is automatically displayed when you expand a token card. The balance shows how many tokens you own for that specific token. Make sure your wallet is connected to see your balances.'
  },
  {
    question: 'What happens if I sell all my tokens?',
    answer: 'If you sell all your tokens, you will receive PUSD back based on the current bonding curve price. The tokens are burned (removed from circulation), and the price decreases accordingly. You can always buy back tokens later if you want.'
  },
  {
    question: 'Can I launch multiple tokens?',
    answer: 'Yes. Each launch requires the 1 PUSD launch fee (burn) and the launch amount with 10% collateral lock. No limit on number of launches, but each must meet minimum requirements.'
  },
  {
    question: 'How do I get my token to the top?',
    answer: 'To get your token to the top, you need boost points. Encourage community members to boost your token by burning PUSD. Each PUSD burned = 1 boost point. Higher boost points and trading volume will help your token rank higher in the "Top" section.'
  },
  {
    question: 'What is the difference between "Top" and "New" tokens?',
    answer: '"Top" tokens are ranked by boost points - tokens with the most PUSD burned appear first. "New" tokens are sorted by creation time - the most recently launched tokens appear first. Both sections show active tokens that can be traded.'
  },
  {
    question: 'Is PFUN safe to use?',
    answer: 'PFUN smart contracts are verified on PolygonScan and can be audited by anyone. However, always do your own research (DYOR) before launching or trading tokens. Be cautious of scams and only interact with tokens you trust. Never invest more than you can afford to lose.'
  }
];

export default function PFUNFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div style={{ 
      marginTop: '2rem', 
      padding: '1.5rem',
      border: '1px solid #333',
      borderRadius: '4px',
      background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)'
    }}>
      <div style={{ 
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        <span style={{ color: '#00ff00' }}>&gt;</span>
        <h2 style={{ 
          margin: 0, 
          fontSize: '1.25rem', 
          fontWeight: 'bold',
          color: '#00ff00',
          fontFamily: 'Courier New, monospace'
        }}>
          FAQ
        </h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {pfunFAQData.map((faq, index) => {
          const isOpen = openIndex === index;
          
          return (
            <div 
              key={`${faq.question}-${index}`}
              style={{ 
                border: '1px solid #333',
                borderRadius: '4px',
                background: isOpen ? '#1a1a1a' : '#0f0f0f',
                transition: 'all 0.2s ease',
                overflow: 'hidden'
              }}
            >
              <div 
                onClick={() => toggleFAQ(index)}
                style={{ 
                  padding: '1rem',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem',
                  userSelect: 'none'
                }}
              >
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ 
                    color: '#888',
                    fontSize: '0.75rem',
                    fontFamily: 'Courier New, monospace',
                    minWidth: '2rem'
                  }}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 style={{ 
                    margin: 0, 
                    fontSize: '0.95rem', 
                    color: isOpen ? '#00ff00' : '#ccc',
                    fontFamily: 'Courier New, monospace',
                    fontWeight: 'normal'
                  }}>
                    {faq.question}
                  </h3>
                </div>
                <span style={{ 
                  color: '#888',
                  fontSize: '0.75rem',
                  fontFamily: 'Courier New, monospace',
                  transition: 'transform 0.2s ease',
                  transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)'
                }}>
                  ▶
                </span>
              </div>
              <div style={{ 
                maxHeight: isOpen ? '500px' : '0',
                overflow: 'hidden',
                transition: 'max-height 0.3s ease',
                borderTop: isOpen ? '1px solid #333' : 'none'
              }}>
                <div style={{ 
                  padding: '1rem',
                  paddingTop: isOpen ? '1rem' : '0',
                  color: '#aaa',
                  fontSize: '0.9rem',
                  lineHeight: '1.6',
                  fontFamily: 'Courier New, monospace'
                }}>
                  {faq.answer}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

