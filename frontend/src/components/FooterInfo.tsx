import { memo } from 'react';

const FooterInfo = memo(function FooterInfo() {
  return (
    <footer style={{
      marginTop: '3rem',
      padding: '2rem',
      borderTop: '1px solid rgba(0, 255, 0, 0.2)',
      textAlign: 'center',
      color: '#00ff00',
      fontFamily: 'Courier New, monospace'
    }}>
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
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
        <span style={{ opacity: 0.5 }}>|</span>
        <a 
          href="https://x.com/_PUSD" 
          target="_blank" 
          rel="noopener noreferrer"
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
          X
        </a>
      </div>
      <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
        PUSD - Polygon's Native Stablecoin
      </div>
    </footer>
  );
});

export default FooterInfo;

