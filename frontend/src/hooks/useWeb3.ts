import { useState, useEffect, useCallback } from 'react';
import { BrowserProvider, Signer } from 'ethers';
import { getEthereum } from '../utils/ethereum-safe';

const POLYGON_CHAIN_ID = 137;
const POLYGON_MAINNET_PARAMS = {
  chainId: `0x${POLYGON_CHAIN_ID.toString(16)}`,
  chainName: 'Polygon Mainnet',
  nativeCurrency: {
    name: 'POL',
    symbol: 'POL',
    decimals: 18,
  },
  rpcUrls: ['https://polygon-rpc.com'],
  blockExplorerUrls: ['https://polygonscan.com'],
};

export const useWeb3 = () => {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const [account, setAccount] = useState<string>('');
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);

  const switchToPolygon = useCallback(async (): Promise<boolean> => {
    const ethereum = getEthereum();
    if (!ethereum) return false;

    try {
      setIsSwitchingNetwork(true);
      // Try to switch to Polygon
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: POLYGON_MAINNET_PARAMS.chainId }],
      });
      return true;
    } catch (switchError: any) {
      // This error code indicates that the chain has not been added to MetaMask
      if (switchError.code === 4902) {
        try {
          // Add Polygon network
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [POLYGON_MAINNET_PARAMS],
          });
          return true;
        } catch (addError) {
          console.error('Failed to add Polygon network:', addError);
          alert('Please add Polygon network manually in MetaMask');
          return false;
        }
      } else if (switchError.code === 4001) {
        // User rejected the request
        return false;
      } else {
        console.error('Failed to switch network:', switchError);
        return false;
      }
    } finally {
      setIsSwitchingNetwork(false);
    }
  }, []);

  const checkAndSwitchNetwork = useCallback(async () => {
    if (chainId && chainId !== POLYGON_CHAIN_ID) {
      const switched = await switchToPolygon();
      if (switched) {
        // Reload after switching
        window.location.reload();
      }
    }
  }, [chainId, switchToPolygon]);

  const connect = useCallback(async () => {
    const ethereum = getEthereum();
    if (!ethereum) {
      alert('Please install MetaMask!');
      return;
    }

    setIsConnecting(true);
    try {
      await ethereum.request({ method: 'eth_requestAccounts' });
      const provider = new BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();
      const accounts = await provider.listAccounts();
      const currentChainId = Number(network.chainId);
      
      // Auto switch to Polygon if on different network
      if (currentChainId !== POLYGON_CHAIN_ID) {
        const switched = await switchToPolygon();
        if (switched) {
          // Wait a bit for network switch to complete
          await new Promise(resolve => setTimeout(resolve, 1000));
          window.location.reload();
          return;
        }
      }
      
      setProvider(provider);
      setSigner(signer);
      setAccount(accounts[0]?.address || '');
      setChainId(currentChainId);
    } catch (error: any) {
      console.error('Failed to connect:', error);
      if (error.code !== 4001) {
        alert('Failed to connect wallet');
      }
    } finally {
      setIsConnecting(false);
    }
  }, [switchToPolygon]);

  const disconnect = useCallback(() => {
    setProvider(null);
    setSigner(null);
    setAccount('');
    setChainId(null);
  }, []);

  useEffect(() => {
    const ethereum = getEthereum();
    if (!ethereum) return;

    const handleAccountsChanged = async (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
      } else {
        try {
          const provider = new BrowserProvider(ethereum);
          const signer = await provider.getSigner();
          const network = await provider.getNetwork();
          const currentChainId = Number(network.chainId);
          
          // Auto switch to Polygon if on different network
          if (currentChainId !== POLYGON_CHAIN_ID) {
            await switchToPolygon();
            return;
          }
          
          setProvider(provider);
          setSigner(signer);
          setAccount(accounts[0]);
          setChainId(currentChainId);
        } catch (error) {
          console.error('Failed to update account:', error);
        }
      }
    };

    const handleChainChanged = () => {
      window.location.reload();
    };

    ethereum.on('accountsChanged', handleAccountsChanged);
    ethereum.on('chainChanged', handleChainChanged);

    // Try to reconnect if already connected
    (async () => {
      try {
        const provider = new BrowserProvider(ethereum);
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
          const signer = await provider.getSigner();
          const network = await provider.getNetwork();
          const currentChainId = Number(network.chainId);
          
          // Auto switch to Polygon if on different network
          if (currentChainId !== POLYGON_CHAIN_ID) {
            await switchToPolygon();
            return;
          }
          
          setProvider(provider);
          setSigner(signer);
          setAccount(accounts[0].address);
          setChainId(currentChainId);
        }
      } catch (error) {
        console.error('Failed to reconnect:', error);
      }
    })();

    return () => {
      ethereum.removeListener('accountsChanged', handleAccountsChanged);
      ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, [disconnect, switchToPolygon]);

  // Auto check network on mount and when chainId changes
  useEffect(() => {
    if (chainId !== null && chainId !== POLYGON_CHAIN_ID) {
      checkAndSwitchNetwork();
    }
  }, [chainId, checkAndSwitchNetwork]);

  return {
    provider,
    signer,
    account,
    chainId,
    isConnecting,
    isSwitchingNetwork,
    connect,
    disconnect,
    switchToPolygon,
    isConnected: !!signer && !!account && chainId === POLYGON_CHAIN_ID,
  };
};

