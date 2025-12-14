import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { NotificationProvider } from '../contexts/NotificationContext';
import WalletConnect from './WalletConnect';
import FooterInfo from './FooterInfo';
import LoadingSkeleton from './LoadingSkeleton';
import '../index.css';

const BalanceCard = lazy(() => import('./BalanceCard'));
const MintSection = lazy(() => import('./MintSection'));
const StakingSection = lazy(() => import('./StakingSection'));
const SwapSection = lazy(() => import('./SwapSection'));
const DailyCheckIn = lazy(() => import('./DailyCheckIn'));
const PGOLDInfoCard = lazy(() => import('./PGOLDInfoCard'));
const PGOLDMintSection = lazy(() => import('./PGOLDMintSection'));
const PGOLDRedeemSection = lazy(() => import('./PGOLDRedeemSection'));

const Lazy = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<LoadingSkeleton />}>{children}</Suspense>
);

// Intersection Observer hook for lazy loading components when visible
function useIntersectionObserver(ref: React.RefObject<HTMLElement>, options = {}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.1, ...options });

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, [ref, options]);

  return isVisible;
}

export default function MainApp() {
  const balanceCardRef = useRef<HTMLDivElement>(null);
  const actionsGridRef = useRef<HTMLDivElement>(null);
  const dailyCheckInRef = useRef<HTMLDivElement>(null);
  const pgoldSectionRef = useRef<HTMLDivElement>(null);

  const balanceCardVisible = useIntersectionObserver(balanceCardRef);
  const actionsGridVisible = useIntersectionObserver(actionsGridRef);
  const dailyCheckInVisible = useIntersectionObserver(dailyCheckInRef);
  const pgoldSectionVisible = useIntersectionObserver(pgoldSectionRef);

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
          <div ref={balanceCardRef}>
            {balanceCardVisible && <Lazy><BalanceCard /></Lazy>}
          </div>
          
          {/* Delay loading action sections to prioritize balance card */}
          <div ref={actionsGridRef} className="actions-grid">
            {actionsGridVisible && (
              <>
                <Lazy><MintSection /></Lazy>
                <Lazy><StakingSection /></Lazy>
                <Lazy><SwapSection /></Lazy>
              </>
            )}
          </div>
        
          {/* Delay loading check-in and PGOLD sections even more */}
          <div ref={dailyCheckInRef}>
            {dailyCheckInVisible && <Lazy><DailyCheckIn /></Lazy>}
          </div>

          <div ref={pgoldSectionRef} className="pgold-section">
            {pgoldSectionVisible && (
              <>
                <Lazy><PGOLDInfoCard /></Lazy>
                <div className="actions-grid">
                  <Lazy><PGOLDMintSection /></Lazy>
                  <Lazy><PGOLDRedeemSection /></Lazy>
                </div>
              </>
            )}
          </div>
        
          <FooterInfo />
        </main>
      </div>
    </NotificationProvider>
  );
}

