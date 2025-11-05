export interface EthereumProvider {
  request(args: { method: string; params?: any[] }): Promise<any>;
  on(event: string, handler: (...args: any[]) => void): void;
  removeListener(event: string, handler: (...args: any[]) => void): void;
  isMetaMask?: boolean;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export const getEthereum = (): EthereumProvider | null => {
  if (typeof window !== 'undefined' && window.ethereum) {
    return window.ethereum;
  }
  return null;
};

