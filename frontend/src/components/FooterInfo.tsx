import { useState, memo, useCallback } from 'react';
import { CONTRACTS } from '../config/contracts';

const FooterInfo = memo(function FooterInfo() {
  const [showContracts, setShowContracts] = useState(false);
  
  const toggleContracts = useCallback(() => {
    setShowContracts(prev => !prev);
  }, []);
  
  return (
    <footer style={{
      marginTop: '3rem',
      padding: '2rem',
      borderTop: '1px solid rgba(0, 255, 0, 0.2)',
      textAlign: 'center',
      color: '#00ff00',
      fontFamily: 'Courier New, monospace'
    }}>
      <div style={{ marginBottom: '1rem' }}>
        <a 
          href="mailto:tdat@gjteam.org"
          style={{
            color: '#00ff00',
            textDecoration: 'none',
            fontSize: '0.9rem'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.textDecoration = 'underline';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.textDecoration = 'none';
          }}
        >
          tdat@gjteam.org
        </a>
      </div>
      <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
        PUSD - Polygon's Native Stablecoin
      </div>
    </footer>
  );
});

export default FooterInfo;

