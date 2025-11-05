import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface Line {
  text: string;
  type: 'command' | 'output' | 'info' | 'success' | 'error';
  delay?: number;
}

interface ContentBlock {
  lines: Line[];
  delay: number; // Delay before showing this block
}

const introBlocks: ContentBlock[] = [
  {
    lines: [
      { text: 'Initializing POLYGON USD...', type: 'info' },
      { text: 'Connecting to Polygon network...', type: 'info' },
      { text: 'Loading contracts...', type: 'info' },
      { text: 'Connected to Polygon Mainnet', type: 'success' },
      { text: 'Contracts verified on PolygonScan', type: 'success' },
    ],
    delay: 0
  },
  {
    lines: [
      { text: '', type: 'command' },
      { text: 'Welcome to POLYGON USD', type: 'output' },
      { text: '', type: 'command' },
      { text: 'Decentralized stablecoin backed by Polygon (POL)', type: 'output' },
      { text: 'Maintains 1:1 ratio with USD through collateralization', type: 'output' },
    ],
    delay: 500
  },
  {
    lines: [
      { text: '', type: 'command' },
      { text: 'Key Features:', type: 'output' },
      { text: '  • 60% mint PUSD from POL deposits', type: 'output' },
      { text: '  • 20% auto-staked as POL', type: 'output' },
      { text: '  • 20% auto-staked as PUSD', type: 'output' },
      { text: '  • Staking rewards with lock periods (30, 60, 120, 365 days)', type: 'output' },
      { text: '  • Swap pool for POL ↔ PUSD exchange', type: 'output' },
      { text: '  • Real-time price feed via Chainlink Oracle', type: 'output' },
    ],
    delay: 500
  },
  {
    lines: [
      { text: '', type: 'command' },
      { text: 'System Status:', type: 'output' },
      { text: '  All contracts deployed on Polygon Mainnet', type: 'success' },
      { text: '  Oracle configured with Chainlink', type: 'success' },
      { text: '  Reward system operational', type: 'success' },
      { text: '  Swap pool operational', type: 'success' },
    ],
    delay: 500
  },
  {
    lines: [
      { text: '', type: 'command' },
      { text: 'Ready to explore the PUSD ecosystem?', type: 'output' },
    ],
    delay: 500
  },
];

export default function Intro() {
  const [lines, setLines] = useState<Array<{ text: string; type: string; isComplete: boolean }>>([]);
  const [showLoading, setShowLoading] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const blockIndexRef = useRef(0);
  const lineIndexRef = useRef(0);
  const charIndexRef = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showBlock = () => {
    if (blockIndexRef.current >= introBlocks.length) {
      // Show loading for 3 seconds before navigating
      setShowLoading(true);
      setTimeout(() => {
        navigate('/home');
      }, 3000);
      return;
    }

    const block = introBlocks[blockIndexRef.current];

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Wait for block delay before showing
    timeoutRef.current = setTimeout(() => {
      // Clear previous block and start fresh
      setLines([]);
      lineIndexRef.current = 0;
      
      const typeLine = () => {
        if (lineIndexRef.current >= block.lines.length) {
          // All lines in current block are complete
          // Wait a bit, then clear and move to next block
          setTimeout(() => {
            setLines([]); // Clear current block
            setTimeout(() => {
              blockIndexRef.current++;
              showBlock();
            }, 200); // Small delay before showing next block
          }, 500); // Pause to show completed block
          return;
        }

        const line = block.lines[lineIndexRef.current];
        
        if (line.text === '') {
          // Empty line - add immediately
          setLines(prev => [...prev, { text: '', type: line.type, isComplete: true }]);
          lineIndexRef.current++;
          setTimeout(typeLine, 80);
          return;
        }

        // Start typing effect for this line
        setLines(prev => [...prev, { text: '', type: line.type, isComplete: false }]);
        charIndexRef.current = 0;

        const typeChar = () => {
          if (charIndexRef.current < line.text.length) {
            setLines(prev => {
              const newLines = [...prev];
              const lastLine = newLines[newLines.length - 1];
              if (lastLine) {
                lastLine.text = line.text.substring(0, charIndexRef.current + 1);
              }
              return newLines;
            });
            
            charIndexRef.current++;
            setTimeout(typeChar, 50); // Typing speed
          } else {
            // Line complete
            setLines(prev => {
              const newLines = [...prev];
              const lastLine = newLines[newLines.length - 1];
              if (lastLine) {
                lastLine.isComplete = true;
              }
              return newLines;
            });
            
            // Move to next line in current block
            setTimeout(() => {
              lineIndexRef.current++;
              typeLine();
            }, 100); // Pause between lines
          }
        };

        typeChar();
      };

      typeLine(); // Start typing first line of block
    }, block.delay);
  };

  useEffect(() => {
    // Auto start immediately when component mounts
    showBlock();
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Auto-scroll to bottom when new lines are added (smooth, not aggressive)
  useEffect(() => {
    if (bodyRef.current && lines.length > 0) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        if (bodyRef.current) {
          const { scrollHeight, clientHeight, scrollTop } = bodyRef.current;
          // Only scroll if content overflows and we're not at bottom
          if (scrollHeight > clientHeight) {
            const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
            // Scroll if we're more than 50px from bottom
            if (distanceFromBottom > 50) {
              bodyRef.current.scrollTop = scrollHeight - clientHeight;
            }
          }
        }
      }, 100);
    }
  }, [lines]);



  const handleContinue = () => {
    navigate('/home');
  };

  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      navigate('/home');
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  const getLineClass = (type: string) => {
    switch (type) {
      case 'command':
        return 'terminal-line command';
      case 'output':
        return 'terminal-line output';
      case 'info':
        return 'terminal-line info';
      case 'success':
        return 'terminal-line success';
      case 'error':
        return 'terminal-line error';
      default:
        return 'terminal-line';
    }
  };

  const getPrompt = (type: string) => {
    switch (type) {
      case 'command':
        return '> ';
      case 'info':
        return '> ';
      case 'success':
        return '';
      default:
        return '';
    }
  };

  return (
    <div className="intro-page">
      <div className="terminal-container" ref={containerRef}>
        <div className="terminal-header">
          <div className="terminal-title">POLYGON USD Terminal</div>
          <div className="terminal-controls">
            <span className="control-dot"></span>
            <span className="control-dot"></span>
            <span className="control-dot"></span>
          </div>
        </div>
        <div className="terminal-body" ref={bodyRef} onClick={handleContinue}>
          {lines.length === 0 && (
            <div className="terminal-line">
              <span className="terminal-prompt">&gt; </span>
              <span className="cursor">▊</span>
            </div>
          )}
          {lines.map((line, index) => (
            <div key={index} className={getLineClass(line.type)}>
              {line.type !== 'output' && <span className="terminal-prompt">{getPrompt(line.type)}</span>}
              <span>
                {line.text}
                {!line.isComplete && index === lines.length - 1 && (
                  <span className="cursor">▊</span>
                )}
              </span>
            </div>
          ))}
          {showLoading && (
            <div className="terminal-line loading">
              <span className="terminal-prompt">&gt; </span>
              <span className="loading-text">Loading...</span>
              <span className="loading-dots">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
