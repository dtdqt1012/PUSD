/**
 * Embeddable PGOLD Widget
 * For embedding in iframe or as a widget
 */

import { NotificationProvider } from '../contexts/NotificationContext';
import PGOLDInfoCard from '../components/PGOLDInfoCard';
import PGOLDMintSection from '../components/PGOLDMintSection';
import PGOLDRedeemSection from '../components/PGOLDRedeemSection';
import '../index.css';

export default function PGOLDEmbed() {
  return (
    <NotificationProvider>
      <div style={{ 
        fontFamily: "'Courier New', monospace",
        background: '#000000',
        color: '#00ff00',
        padding: '1rem',
        minHeight: '100vh'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h2 style={{ 
            color: '#00ffff', 
            marginBottom: '1rem',
            borderBottom: '1px solid #333',
            paddingBottom: '0.5rem'
          }}>
            PGOLD - Polygon Gold
          </h2>
          
          <PGOLDInfoCard />
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '1rem',
            marginTop: '2rem'
          }}>
            <PGOLDMintSection />
            <PGOLDRedeemSection />
          </div>
        </div>
      </div>
    </NotificationProvider>
  );
}

