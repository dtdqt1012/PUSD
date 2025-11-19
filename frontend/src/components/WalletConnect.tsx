import { memo, useMemo } from 'react';
import { useWeb3 } from '../hooks/useWeb3';
import { formatAddress } from '../utils/format';

const WalletConnect = memo(function WalletConnect() {
  const { account, isConnecting, isSwitchingNetwork, connect, disconnect, isConnected } = useWeb3();
  
  const formattedAddress = useMemo(() => account ? formatAddress(account) : '', [account]);
  const buttonText = useMemo(() => {
    if (isSwitchingNetwork) return 'Switching to Polygon...';
    if (isConnecting) return 'Connecting...';
    return 'Connect Wallet';
  }, [isSwitchingNetwork, isConnecting]);

  return (
    <div className="wallet-connect">
      {isConnected ? (
        <div className="wallet-info">
          <span className="network-badge">Polygon</span>
          <span className="wallet-address">{formattedAddress}</span>
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
          {buttonText}
        </button>
      )}
    </div>
  );
});

export default WalletConnect;

