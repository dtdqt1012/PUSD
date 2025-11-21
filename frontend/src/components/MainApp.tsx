import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { NotificationProvider } from '../contexts/NotificationContext';
import WalletConnect from './WalletConnect';
import BalanceCard from './BalanceCard';
import FooterInfo from './FooterInfo';
import LoadingSkeleton from './LoadingSkeleton';
import '../index.css';

const MintSection = lazy(() => import('./MintSection'));
const StakingSection = lazy(() => import('./StakingSection'));
const SwapSection = lazy(() => import('./SwapSection'));
const Leaderboard = lazy(() => import('./Leaderboard'));
const PGOLDInfoCard = lazy(() => import('./PGOLDInfoCard'));
const PGOLDMintSection = lazy(() => import('./PGOLDMintSection'));
const PGOLDRedeemSection = lazy(() => import('./PGOLDRedeemSection'));

const Lazy = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<LoadingSkeleton />}>{children}</Suspense>
);

export default function MainApp() {
  return (
    <NotificationProvider>
      <div className="app">
        <header className="header">
          <h1>POLYGON USD</h1>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <Link 
              to="/pfun" 
              style={{
                padding: '0.5rem 1rem',
                background: 'rgba(0, 255, 0, 0.1)',
                border: '1px solid #00ff00',
                borderRadius: '4px',
                color: '#00ff00',
                textDecoration: 'none',
                fontFamily: 'Courier New, monospace',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0, 255, 0, 0.2)';
                e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 255, 0, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0, 255, 0, 0.1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              PFUN
            </Link>
            <WalletConnect />
          </div>
        </header>
        
        <main className="main">
          <BalanceCard />
          
          <div className="actions-grid">
            <Lazy><MintSection /></Lazy>
            <Lazy><StakingSection /></Lazy>
            <Lazy><SwapSection /></Lazy>
          </div>
        
          <Lazy><Leaderboard /></Lazy>

          <div className="pgold-section">
            <Lazy><PGOLDInfoCard /></Lazy>
            <div className="actions-grid">
              <Lazy><PGOLDMintSection /></Lazy>
              <Lazy><PGOLDRedeemSection /></Lazy>
            </div>
          </div>
        
          <FooterInfo />
        </main>
      </div>
    </NotificationProvider>
  );
}

