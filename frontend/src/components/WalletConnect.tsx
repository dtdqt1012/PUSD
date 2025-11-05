import { useWeb3 } from '../hooks/useWeb3';
import { formatAddress } from '../utils/format';

export default function WalletConnect() {
  const { account, isConnecting, isSwitchingNetwork, connect, disconnect, isConnected } = useWeb3();

  return (
    <div className="wallet-connect">
      {isConnected ? (
        <div className="wallet-info">
          <span className="network-badge">Polygon</span>
          <span className="wallet-address">{formatAddress(account)}</span>
          <button onClick={disconnect} className="btn-disconnect">
            Disconnect
          </button>
        </div>
      ) : (
        <button 
          onClick={connect} 
          disabled={isConnecting || isSwitchingNetwork} 
          className="btn-connect"
        >
          {isSwitchingNetwork ? 'Switching to Polygon...' : isConnecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
      )}
    </div>
  );
}

