import { lazy, Suspense } from 'react';
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
          <WalletConnect />
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

