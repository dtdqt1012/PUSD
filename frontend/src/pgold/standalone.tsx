/**
 * Standalone PGOLD Component
 * Can be embedded in any website with minimal setup
 */

import { NotificationProvider } from '../contexts/NotificationContext';
import PGOLDInfoCard from '../components/PGOLDInfoCard';
import PGOLDMintSection from '../components/PGOLDMintSection';
import PGOLDRedeemSection from '../components/PGOLDRedeemSection';

export default function PGOLDStandalone() {
  return (
    <NotificationProvider>
      <div className="pgold-standalone">
        <div className="pgold-header">
          <h2>PGOLD - Polygon Gold</h2>
          <p>Real World Asset (RWA) backed by gold</p>
        </div>
        
        <PGOLDInfoCard />
        
        <div className="pgold-actions">
          <PGOLDMintSection />
          <PGOLDRedeemSection />
        </div>
      </div>
    </NotificationProvider>
  );
}

