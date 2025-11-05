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
            <Suspense fallback={<LoadingSkeleton />}>
              <MintSection />
            </Suspense>
            
            <Suspense fallback={<LoadingSkeleton />}>
              <StakingSection />
            </Suspense>
            
            <Suspense fallback={<LoadingSkeleton />}>
              <SwapSection />
            </Suspense>
          </div>
        
        <Suspense fallback={<LoadingSkeleton />}>
          <Leaderboard />
        </Suspense>
        
        <FooterInfo />
        </main>
      </div>
    </NotificationProvider>
  );
}

