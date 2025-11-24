import { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import { CONTRACTS } from '../config/contracts';
import { useNotification } from '../contexts/NotificationContext';
import TokenChart from '../components/TokenChart';
import './PFUN.css';

interface Launch {
  token: string;
  creator: string;
  launchAmount: string;
  collateralLocked: string;
  createdAt: number;
  unlockTime: number;
  totalVolume: string;
  boostPoints: string;
  isActive: boolean;
  isListed: boolean;
  logoUrl: string;
  website: string;
  telegram: string;
  discord: string;
  name: string;
  symbol: string;
}

function PFUN() {
  const { account, provider, signer } = useWeb3();
  const { showNotification } = useNotification();
  
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [topLaunches, setTopLaunches] = useState<Launch[]>([]);
  const [loading, setLoading] = useState(false);
  const [boostAmount, setBoostAmount] = useState<{ [key: string]: string }>({});
  const [boosting, setBoosting] = useState<{ [key: string]: boolean }>({});
  const [showLaunchForm, setShowLaunchForm] = useState(false);
  const [expandedTopToken, setExpandedTopToken] = useState<string | null>(null);
  const [expandedNewToken, setExpandedNewToken] = useState<string | null>(null);
  const [tradeAmount, setTradeAmount] = useState<{ [key: string]: { buy: string; sell: string } }>({});
  const [trading, setTrading] = useState<{ [key: string]: { buy: boolean; sell: boolean } }>({});
  const [tokenBalances, setTokenBalances] = useState<{ [key: string]: string }>({});
  const [currentPrices, setCurrentPrices] = useState<{ [key: string]: string }>({});
  const [buyPreview, setBuyPreview] = useState<{ [key: string]: string }>({});
  const [sellPreview, setSellPreview] = useState<{ [key: string]: string }>({});
  const [launchForm, setLaunchForm] = useState({
    name: '',
    symbol: '',
    totalSupply: '',
    launchAmount: '',
    logoUrl: '',
    website: '',
    telegram: '',
    discord: '',
  });
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [isOwner, setIsOwner] = useState(false);
  const previewTimeoutRef = useRef<{ [key: string]: NodeJS.Timeout }>({});

  useEffect(() => {
    if (provider) {
      loadLaunches();
      checkOwner();
      const interval = setInterval(() => {
        refreshPrices();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [provider, account]);

  const refreshPrices = useCallback(async () => {
    if (!provider) return;
    const allTokens = [...new Set([...topLaunches, ...launches].map(l => l.token))];
    await Promise.all(allTokens.map(token => loadTokenPrice(token)));
    if (account) {
      await Promise.all(allTokens.map(token => loadTokenBalance(token)));
    }
  }, [provider, account, topLaunches, launches]);

  const checkOwner = async () => {
    if (!provider || !account) {
      setIsOwner(false);
      return;
    }
    
    try {
      const launchpad = new ethers.Contract(
        CONTRACTS.PFUNLaunchpad.address,
        CONTRACTS.PFUNLaunchpad.abi,
        provider
      );
      const owner = await launchpad.owner();
      setIsOwner(owner.toLowerCase() === account.toLowerCase());
    } catch (error) {
      console.error('Error checking owner:', error);
      setIsOwner(false);
    }
  };

  const handleLogoUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value.trim();
    setLaunchForm(prev => ({ ...prev, logoUrl: url }));
    setLogoPreview(url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/')) ? url : '');
  };

  const getContract = (contractName: keyof typeof CONTRACTS, useSigner = false) => {
    const contract = CONTRACTS[contractName];
    return new ethers.Contract(contract.address, contract.abi, useSigner && signer ? signer : provider);
  };

  const handleApprove = async (tokenAddress: string, spender: string, amount: bigint, tokenAbi: any[]) => {
    if (!signer) return false;
    const token = new ethers.Contract(tokenAddress, tokenAbi, signer);
    const currentAllowance = await token.allowance(account, spender);
    if (currentAllowance < amount) {
      const approveTx = await token.approve(spender, ethers.MaxUint256);
      await approveTx.wait();
      return true;
    }
    return false;
  };


  const handleBoost = async (token: string) => {
    if (!signer || !account) {
      showNotification('Please connect your wallet', 'error');
      return;
    }

    const amount = boostAmount[token];
    if (!amount || parseFloat(amount) <= 0) {
      showNotification('Please enter a valid boost amount', 'error');
      return;
    }

    setBoosting(prev => ({ ...prev, [token]: true }));
    try {
      const launchpad = getContract('PFUNLaunchpad', true);
      const boostAmountWei = ethers.parseEther(amount);

      await handleApprove(
        CONTRACTS.PUSDToken.address,
        CONTRACTS.PFUNLaunchpad.address,
        boostAmountWei,
        CONTRACTS.PUSDToken.abi
      );

      const boostTx = await launchpad.boostToken(token, boostAmountWei);
      await boostTx.wait();

      showNotification(`Boosted with ${amount} PUSD (${amount} points)!`, 'success');
      setBoostAmount(prev => ({ ...prev, [token]: '' }));
      await loadLaunches();
    } catch (error: any) {
      showNotification(error.message || 'Failed to boost token', 'error');
    } finally {
      setBoosting(prev => ({ ...prev, [token]: false }));
    }
  };

  const loadLaunches = async () => {
    if (!provider) return;
    
    try {
      const launchpad = getContract('PFUNLaunchpad');
      const bondingCurve = getContract('PFUNBondingCurve');
      const allLaunches = await launchpad.getAllLaunches();

      const tokenFactory = getContract('TokenFactory');
      
      const launchData = await Promise.all(
        allLaunches.map(async (token: string) => {
          const [launch, curve, launchInfo] = await Promise.all([
            launchpad.getLaunch(token),
            bondingCurve.curves(token).catch(() => null),
            tokenFactory.launches(token).catch(() => null)
          ]);
          
          const volume = curve?.isActive && curve.pusdRaised > 0n 
            ? curve.pusdRaised.toString() 
            : '0';
          
          return {
            token,
            creator: launch.creator,
            launchAmount: launch.launchAmount.toString(),
            collateralLocked: launch.collateralLocked.toString(),
            createdAt: Number(launch.createdAt),
            unlockTime: Number(launch.unlockTime),
            totalVolume: volume,
            boostPoints: launch.boostPoints.toString(),
            isActive: launch.isActive,
            isListed: launch.isListed,
            logoUrl: launch.logoUrl,
            website: launch.website,
            telegram: launch.telegram,
            discord: launch.discord,
            name: launchInfo?.name || 'Unknown',
            symbol: launchInfo?.symbol || 'UNK',
          };
        })
      );
      
      const sortedByNew = [...launchData].sort((a, b) => b.createdAt - a.createdAt);
      const topData = [...launchData].sort((a, b) => 
        parseFloat(b.boostPoints) - parseFloat(a.boostPoints)
      );
      
      setLaunches(sortedByNew);
      setTopLaunches(topData);
      
      const allTokens = [...new Set(launchData.map(l => l.token))];
      await Promise.all([
        ...allTokens.map(token => loadTokenPrice(token)),
        ...(account ? allTokens.map(token => loadTokenBalance(token)) : [])
      ]);
    } catch (error) {
      console.error('Error loading launches:', error);
    }
  };

  const loadTokenPrice = async (tokenAddress: string) => {
    if (!provider) return;
    
    try {
      const bondingCurve = getContract('PFUNBondingCurve');
      const price = await bondingCurve.getCurrentPrice(tokenAddress).catch(() => 0n);
      const priceFormatted = ethers.formatEther(price);
      const priceNum = parseFloat(priceFormatted);
      
      if (priceNum > 1000000) {
        try {
          const curve = await bondingCurve.curves(tokenAddress);
          if (curve.tokensSold > 0n && curve.pusdRaised > 0n) {
            const actualPrice = (Number(ethers.formatEther(curve.pusdRaised)) * 1e18) / Number(ethers.formatEther(curve.tokensSold));
            setCurrentPrices(prev => ({ ...prev, [tokenAddress]: (actualPrice / 1e18).toString() }));
          } else {
            setCurrentPrices(prev => ({ ...prev, [tokenAddress]: '0' }));
          }
        } catch {
          setCurrentPrices(prev => ({ ...prev, [tokenAddress]: '0' }));
        }
      } else {
        setCurrentPrices(prev => ({ ...prev, [tokenAddress]: priceFormatted }));
      }
    } catch (error) {
      console.error('Error loading token price:', error);
    }
  };

  const loadTokenBalance = async (tokenAddress: string) => {
    if (!provider || !account) return;
    
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function balanceOf(address) view returns (uint256)'],
        provider
      );
      const balance = await tokenContract.balanceOf(account).catch(() => 0n);
      setTokenBalances(prev => ({ ...prev, [tokenAddress]: ethers.formatEther(balance) }));
    } catch (error) {
      console.error('Error loading token balance:', error);
    }
  };

  const loadTokenData = async (tokenAddress: string) => {
    // Load both price and balance
    await loadTokenPrice(tokenAddress);
    await loadTokenBalance(tokenAddress);
    
    // Update previews if there are input values
    if (tradeAmount[tokenAddress]?.buy) {
      calculateBuyPreview(tokenAddress, tradeAmount[tokenAddress].buy);
    }
    if (tradeAmount[tokenAddress]?.sell) {
      calculateSellPreview(tokenAddress, tradeAmount[tokenAddress].sell);
    }
  };

  const calculateBuyPreview = useCallback(async (tokenAddress: string, pusdAmount: string) => {
    if (!provider || !pusdAmount || parseFloat(pusdAmount) <= 0) {
      setBuyPreview(prev => ({ ...prev, [tokenAddress]: '' }));
      return;
    }

    if (previewTimeoutRef.current[tokenAddress]) {
      clearTimeout(previewTimeoutRef.current[tokenAddress]);
    }

    previewTimeoutRef.current[tokenAddress] = setTimeout(async () => {
      try {
        const bondingCurve = getContract('PFUNBondingCurve');
        const curve = await bondingCurve.curves(tokenAddress);
        if (!curve.isActive) {
          setBuyPreview(prev => ({ ...prev, [tokenAddress]: '0' }));
          return;
        }

        const currentPriceWei = await bondingCurve.getCurrentPrice(tokenAddress);
        const PRICE_INCREMENT_WEI = BigInt(1e12);
        const nextPrice = currentPriceWei + PRICE_INCREMENT_WEI;
        const avgPrice = (currentPriceWei + nextPrice) / BigInt(2);
        const pusdAmountWei = ethers.parseEther(pusdAmount);
        const tokensReceived = (pusdAmountWei * BigInt(1e18)) / avgPrice;
        
        setBuyPreview(prev => ({ ...prev, [tokenAddress]: ethers.formatEther(tokensReceived) }));
      } catch (error) {
        setBuyPreview(prev => ({ ...prev, [tokenAddress]: '0' }));
      }
    }, 300);
  }, [provider]);

  const calculateSellPreview = useCallback(async (tokenAddress: string, tokenAmount: string) => {
    if (!provider || !tokenAmount || parseFloat(tokenAmount) <= 0) {
      setSellPreview(prev => ({ ...prev, [tokenAddress]: '' }));
      return;
    }

    const key = `${tokenAddress}-sell`;
    if (previewTimeoutRef.current[key]) {
      clearTimeout(previewTimeoutRef.current[key]);
    }

    previewTimeoutRef.current[key] = setTimeout(async () => {
      try {
        const bondingCurve = getContract('PFUNBondingCurve');
        const curve = await bondingCurve.curves(tokenAddress);
        if (!curve.isActive || curve.tokensSold === 0n) {
          setSellPreview(prev => ({ ...prev, [tokenAddress]: '0' }));
          return;
        }

        const tokenAmountWei = ethers.parseEther(tokenAmount);
        if (curve.tokensSold < tokenAmountWei) {
          setSellPreview(prev => ({ ...prev, [tokenAddress]: '0' }));
          return;
        }

        const currentPriceWei = await bondingCurve.getCurrentPrice(tokenAddress);
        const PRICE_INCREMENT_WEI = BigInt(1e12);
        const prevPrice = currentPriceWei > PRICE_INCREMENT_WEI 
          ? currentPriceWei - PRICE_INCREMENT_WEI 
          : currentPriceWei;
        const avgPrice = (currentPriceWei + prevPrice) / BigInt(2);
        const pusdReceived = (tokenAmountWei * avgPrice) / BigInt(1e18);
        
        if (curve.pusdRaised < pusdReceived) {
          setSellPreview(prev => ({ ...prev, [tokenAddress]: '0' }));
          return;
        }
        
        setSellPreview(prev => ({ ...prev, [tokenAddress]: ethers.formatEther(pusdReceived) }));
      } catch (error) {
        setSellPreview(prev => ({ ...prev, [tokenAddress]: '0' }));
      }
    }, 300);
  }, [provider]);

  const initializeCurveIfNeeded = async (token: string): Promise<boolean> => {
    if (!isOwner || !signer) return false;
    
    try {
      const bondingCurve = getContract('PFUNBondingCurve', true);
      const curveInfo = await bondingCurve.curves(token).catch(() => null);
      
      if (curveInfo?.isActive) return true;
      
      const tokenFactory = getContract('TokenFactory');
      const launchInfo = await tokenFactory.launches(token);
      const initTx = await bondingCurve.initializeCurve(token, launchInfo.totalSupply);
      await initTx.wait();
      showNotification('Curve initialized!', 'success');
      return true;
    } catch (error: any) {
      if (isOwner) {
        showNotification('Failed to initialize curve', 'error');
      }
      return false;
    }
  };

  const handleBuy = async (token: string) => {
    if (!signer || !account) {
      showNotification('Please connect your wallet', 'error');
      return;
    }

    const amount = tradeAmount[token]?.buy;
    if (!amount || parseFloat(amount) <= 0) {
      showNotification('Please enter a valid amount', 'error');
      return;
    }

    setTrading(prev => ({ ...prev, [token]: { ...prev[token], buy: true } }));
    try {
      const bondingCurve = getContract('PFUNBondingCurve', true);
      const curveInfo = await bondingCurve.curves(token).catch(() => null);
      
      if (!curveInfo?.isActive) {
        const initialized = await initializeCurveIfNeeded(token);
        if (!initialized) {
          showNotification('Curve not initialized. Please wait for owner to initialize.', 'error');
          return;
        }
      }

      const pusdAmount = ethers.parseEther(amount);
      const approved = await handleApprove(
        CONTRACTS.PUSDToken.address,
        CONTRACTS.PFUNBondingCurve.address,
        pusdAmount,
        CONTRACTS.PUSDToken.abi
      );
      if (approved) showNotification('PUSD approved', 'success');

      const buyTx = await bondingCurve.buyTokens(token, pusdAmount);
      await buyTx.wait();

      showNotification(`Bought tokens with ${amount} PUSD!`, 'success');
      setTradeAmount(prev => ({ ...prev, [token]: { ...prev[token], buy: '' } }));
      await Promise.all([loadTokenData(token), loadLaunches()]);
    } catch (error: any) {
      showNotification(error.message || 'Failed to buy tokens', 'error');
    } finally {
      setTrading(prev => ({ ...prev, [token]: { ...prev[token], buy: false } }));
    }
  };

  const handleSell = async (token: string) => {
    if (!signer || !account) {
      showNotification('Please connect your wallet', 'error');
      return;
    }

    const amount = tradeAmount[token]?.sell;
    if (!amount || parseFloat(amount) <= 0) {
      showNotification('Please enter a valid amount', 'error');
      return;
    }

    setTrading(prev => ({ ...prev, [token]: { ...prev[token], sell: true } }));
    try {
      const bondingCurve = getContract('PFUNBondingCurve', true);
      const tokenAmount = ethers.parseEther(amount);
      
      const tokenAbi = ['function approve(address,uint256) returns (bool)', 'function allowance(address,address) view returns (uint256)'];
      const approved = await handleApprove(token, CONTRACTS.PFUNBondingCurve.address, tokenAmount, tokenAbi);
      if (approved) showNotification('Tokens approved', 'success');

      const sellTx = await bondingCurve.sellTokens(token, tokenAmount);
      await sellTx.wait();

      showNotification(`Sold ${amount} tokens!`, 'success');
      setTradeAmount(prev => ({ ...prev, [token]: { ...prev[token], sell: '' } }));
      await Promise.all([loadTokenData(token), loadLaunches()]);
    } catch (error: any) {
      showNotification(error.message || 'Failed to sell tokens', 'error');
    } finally {
      setTrading(prev => ({ ...prev, [token]: { ...prev[token], sell: false } }));
    }
  };

  const parseLaunchError = (error: any): string => {
    if (error.reason) return error.reason;
    if (!error.message) return 'Failed to launch token';
    
    const msg = error.message.toLowerCase();
    if (msg.includes('logo url too long')) return 'Logo URL too long (max 2000 chars)';
    if (msg.includes('invalid logo url format')) return 'Invalid logo URL format. Must be HTTP/HTTPS URL';
    if (msg.includes('insufficient launch amount')) return 'Launch amount too low. Minimum: 0.06 PUSD';
    if (msg.includes('launch fee transfer failed')) return 'Insufficient PUSD balance or approval';
    return error.message;
  };

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signer || !account) {
      showNotification('Please connect your wallet', 'error');
      return;
    }

    const logoUrl = launchForm.logoUrl.trim();
    if (!logoUrl) {
      showNotification('Please enter a logo URL', 'error');
      return;
    }
    if (logoUrl.length > 2000) {
      showNotification('Logo URL too long (max 2000 characters)', 'error');
      return;
    }

    setLoading(true);
    try {
      const launchpad = getContract('PFUNLaunchpad', true);
      const tokenFactory = getContract('TokenFactory', true);
      const launchFee = isOwner ? 0n : await tokenFactory.launchFee();
      const launchAmount = ethers.parseEther(launchForm.launchAmount);
      const totalNeeded = launchAmount + launchFee;

      const approved = await handleApprove(
        CONTRACTS.PUSDToken.address,
        CONTRACTS.PFUNLaunchpad.address,
        totalNeeded,
        CONTRACTS.PUSDToken.abi
      );
      if (approved) showNotification('PUSD approved', 'success');

      const launchTx = await launchpad.launchToken(
        launchForm.name,
        launchForm.symbol,
        ethers.parseEther(launchForm.totalSupply),
        launchAmount,
        logoUrl,
        launchForm.website || '',
        launchForm.telegram || '',
        launchForm.discord || ''
      );
      const receipt = await launchTx.wait();
      
      const tokenFactoryRead = getContract('TokenFactory');
      const tokenCreatedEvent = receipt.logs.find((log: any) => {
        try {
          const parsed = tokenFactoryRead.interface.parseLog(log);
          return parsed?.name === 'TokenCreated';
        } catch {
          return false;
        }
      });
      
      const tokenAddress = tokenCreatedEvent 
        ? tokenFactoryRead.interface.parseLog(tokenCreatedEvent)?.args[0]
        : (await launchpad.getAllLaunches()).slice(-1)[0];
      
      showNotification(
        tokenAddress 
          ? `Token launched! ${formatAddress(tokenAddress)}`
          : 'Token launched successfully!',
        'success'
      );
      
      setLaunchForm({
        name: '',
        symbol: '',
        totalSupply: '',
        launchAmount: '',
        logoUrl: '',
        website: '',
        telegram: '',
        discord: '',
      });
      setLogoPreview('');
      await loadLaunches();
    } catch (error: any) {
      showNotification(parseLaunchError(error), 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatEther = (value: string) => {
    return parseFloat(ethers.formatEther(value)).toLocaleString();
  };

  const setMaxBuy = async (token: string) => {
    if (!provider || !account) {
      showNotification('Please connect your wallet', 'error');
      return;
    }
    try {
      const pusdToken = getContract('PUSDToken');
      const balance = await pusdToken.balanceOf(account);
      const balanceFormatted = ethers.formatEther(balance);
      setTradeAmount(prev => ({ 
        ...prev, 
        [token]: { 
          ...prev[token], 
          buy: balanceFormatted 
        } 
      }));
      if (parseFloat(balanceFormatted) > 0) {
        await calculateBuyPreview(token, balanceFormatted);
      }
    } catch (error) {
      console.error('Error getting PUSD balance:', error);
    }
  };

  const setMaxSell = (token: string) => {
    const balance = tokenBalances[token] || '0';
    setTradeAmount(prev => ({ 
      ...prev, 
      [token]: { 
        ...prev[token], 
        sell: balance 
      } 
    }));
    if (parseFloat(balance) > 0) {
      calculateSellPreview(token, balance);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      action();
    }
  };

  return (
    <div className="pfun-page">
      <div className="container">
        <div className="terminal-header">
          <span className="terminal-prompt">&gt;</span>
          <span className="terminal-title">PFUN</span>
        </div>
        <p className="terminal-subtitle">Launch your token with PUSD</p>

        {/* Launch Form - Collapsible */}
        <div className="terminal-section">
          <div 
            className="terminal-section-header"
            onClick={() => setShowLaunchForm(!showLaunchForm)}
          >
            <span className="terminal-prompt">&gt;</span>
            <span>Launch New Token</span>
            <span className="terminal-toggle">{showLaunchForm ? '[-]' : '[+]'}</span>
          </div>
          {showLaunchForm && (
            <div className="terminal-section-content">
              <form onSubmit={handleLaunch} className="terminal-form">
            <div className="form-group">
              <label>Token Name *</label>
              <input
                type="text"
                value={launchForm.name}
                onChange={(e) => setLaunchForm(prev => ({ ...prev, name: e.target.value }))}
                required
                placeholder="My Token"
              />
            </div>

            <div className="form-group">
              <label>Token Symbol *</label>
              <input
                type="text"
                value={launchForm.symbol}
                onChange={(e) => setLaunchForm(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                required
                placeholder="TOKEN"
                maxLength={10}
              />
            </div>

            <div className="form-group">
              <label>Total Supply *</label>
              <input
                type="text"
                value={launchForm.totalSupply}
                onChange={(e) => setLaunchForm(prev => ({ ...prev, totalSupply: e.target.value }))}
                required
                placeholder="1000000"
              />
            </div>

            <div className="form-group">
              <label>Launch Amount (PUSD) *</label>
              <input
                type="text"
                value={launchForm.launchAmount}
                onChange={(e) => setLaunchForm(prev => ({ ...prev, launchAmount: e.target.value }))}
                required
                placeholder="0.06"
              />
              <small>Minimum: 0.06 PUSD</small>
            </div>

            <div className="form-group">
              <label>Logo Image URL *</label>
              <input
                type="text"
                value={launchForm.logoUrl}
                onChange={handleLogoUrlChange}
                placeholder="https://photos.pinksale.finance/file/..."
                style={{ width: '100%', padding: '0.5rem' }}
                required
              />
              {logoPreview && (
                <div style={{ marginTop: '0.5rem' }}>
                  <img 
                    src={logoPreview} 
                    alt="Logo preview" 
                    style={{ 
                      maxWidth: '200px', 
                      maxHeight: '200px', 
                      borderRadius: '8px',
                      border: '1px solid #ddd'
                    }} 
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
              <small style={{ display: 'block', marginTop: '0.5rem', color: '#888' }}>
                Tip: Upload your image to <a href="https://upload.pinksale.finance" target="_blank" rel="noopener noreferrer" style={{ color: '#8247e5' }}>pinksale.finance</a>, then paste the direct image URL here
              </small>
            </div>

            <div className="form-group">
              <label>Website (Optional)</label>
              <input
                type="url"
                value={launchForm.website}
                onChange={(e) => setLaunchForm(prev => ({ ...prev, website: e.target.value }))}
                placeholder="https://example.com"
              />
            </div>

            <div className="form-group">
              <label>Telegram (Optional)</label>
              <input
                type="url"
                value={launchForm.telegram}
                onChange={(e) => setLaunchForm(prev => ({ ...prev, telegram: e.target.value }))}
                placeholder="https://t.me/yourgroup"
              />
            </div>

            <div className="form-group">
              <label>Discord (Optional)</label>
              <input
                type="url"
                value={launchForm.discord}
                onChange={(e) => setLaunchForm(prev => ({ ...prev, discord: e.target.value }))}
                placeholder="https://discord.gg/yourgroup"
              />
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading 
                ? 'Launching...' 
                : isOwner 
                  ? 'Launch Token (FREE for Owner)' 
                  : 'Launch Token (6.666 PUSD fee)'}
                </button>
                {isOwner && (
                  <div className="terminal-info">
                    <span className="terminal-prompt">&gt;</span>
                    <span className="terminal-success">Owner detected - Launch fee is FREE!</span>
                  </div>
                )}
              </form>
            </div>
          )}
        </div>

        {/* Top and New - Side by Side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          {/* Top by Boost Points */}
          <div className="terminal-section">
            <div className="terminal-section-header">
              <span className="terminal-prompt">&gt;</span>
              <span>Top Leaderboard</span>
            </div>
            <div className="terminal-section-content">
            {topLaunches.length === 0 ? (
              <div className="terminal-info">
                <span className="terminal-prompt">&gt;</span>
                <span>No launches yet</span>
              </div>
            ) : (
              <div className="terminal-list-single">
              {topLaunches.map((launch, index) => {
                const rank = index + 1;
                const points = parseFloat(launch.boostPoints);
                const formattedPoints = points >= 1000000 
                  ? `${(points / 1000000).toFixed(2)}M`
                  : points >= 1000 
                    ? `${(points / 1000).toFixed(2)}K`
                    : points.toLocaleString(undefined, { maximumFractionDigits: 2 });
                
                return (
                <div key={launch.token} className="terminal-card">
                  <div 
                    className="terminal-card-header"
                    onClick={() => setExpandedTopToken(expandedTopToken === launch.token ? null : launch.token)}
                  >
                    <span className={`terminal-rank rank-${rank <= 3 ? rank : 'other'}`}>
                      #{rank}
                    </span>
                    {launch.logoUrl && (
                      <img src={launch.logoUrl} alt="Logo" className="terminal-logo-small" />
                    )}
                    <span className="terminal-address" title={launch.token}>
                      {launch.name || formatAddress(launch.token)}
                    </span>
                    {currentPrices[launch.token] && (
                      <span className="terminal-price-badge">
                        {parseFloat(currentPrices[launch.token]).toFixed(6)} PUSD
                      </span>
                    )}
                    <span className="terminal-boost" title={`${points.toLocaleString()} boost points`}>
                      {formattedPoints} pts
                    </span>
                    <span className={launch.isListed ? 'terminal-status-badge listed' : 'terminal-status-badge active'}>
                      {launch.isListed ? 'Listed' : 'Active'}
                    </span>
                    <span className="terminal-toggle">{expandedTopToken === launch.token ? '[-]' : '[+]'}</span>
                  </div>
                  
                  {expandedTopToken === launch.token && (
                    <div className="terminal-card-content">
                      <div className="terminal-info-row">
                        <span className="terminal-label">Creator:</span>
                        <span className="terminal-value">{formatAddress(launch.creator)}</span>
                      </div>
                      <div className="terminal-info-row" style={{ background: rank <= 3 ? 'rgba(255, 215, 0, 0.05)' : 'transparent', padding: '0.5rem', borderRadius: '4px', marginBottom: '0.5rem' }}>
                        <span className="terminal-label">Rank:</span>
                        <span className="terminal-value" style={{ fontWeight: 'bold', fontSize: '1rem' }}>
                          #{rank} of {topLaunches.length}
                        </span>
                      </div>
                      <div className="terminal-info-row">
                        <span className="terminal-label">Boost Points:</span>
                        <span className="terminal-boost-value" style={{ fontSize: '1.1rem' }}>
                          {parseFloat(launch.boostPoints).toLocaleString(undefined, { maximumFractionDigits: 2 })} pts
                        </span>
                      </div>
                      <div className="terminal-info-row">
                        <span className="terminal-label">PUSD Burned:</span>
                        <span className="terminal-value" style={{ color: '#ff6b6b' }}>
                          {parseFloat(launch.boostPoints).toLocaleString(undefined, { maximumFractionDigits: 2 })} PUSD
                        </span>
                      </div>
                      <div className="terminal-info-row">
                        <span className="terminal-label">Points per PUSD:</span>
                        <span className="terminal-value">1:1 (1 PUSD = 1 Point)</span>
                      </div>
                      <div className="terminal-info-row">
                        <span className="terminal-label">Launch Amount:</span>
                        <span className="terminal-value">{formatEther(launch.launchAmount)} PUSD</span>
                      </div>
                      <div className="terminal-info-row">
                        <span className="terminal-label">Collateral:</span>
                        <span className="terminal-value">{formatEther(launch.collateralLocked)} PUSD</span>
                      </div>
                      <div className="terminal-info-row">
                        <span className="terminal-label">Volume:</span>
                        <span className="terminal-value">{formatEther(launch.totalVolume)} PUSD</span>
                      </div>
                      <div className="terminal-info-row">
                        <span className="terminal-label">Status:</span>
                        <span className={launch.isListed ? 'terminal-status-listed' : 'terminal-status-active'}>
                          {launch.isListed ? 'Listed' : 'Active'}
                        </span>
                      </div>

                      {/* Trading Section */}
                      <div className="terminal-trading-section">
                        <div className="terminal-section-header" style={{ marginBottom: '0.5rem', cursor: 'default' }}>
                          <span className="terminal-prompt">&gt;</span>
                          <span>Trade</span>
                        </div>
                        
                        {currentPrices[launch.token] && (
                          <div className="terminal-info-row" style={{ marginBottom: '0.5rem' }}>
                            <span className="terminal-label">Current Price:</span>
                            <span className="terminal-value">{parseFloat(currentPrices[launch.token]).toFixed(6)} PUSD</span>
                          </div>
                        )}
                        
                        {tokenBalances[launch.token] && (
                          <div className="terminal-info-row" style={{ marginBottom: '1rem' }}>
                            <span className="terminal-label">Your Balance:</span>
                            <span className="terminal-value">{parseFloat(tokenBalances[launch.token]).toFixed(2)} tokens</span>
                          </div>
                        )}

                        {/* Buy Section */}
                        <div className="terminal-trade-group" style={{ marginBottom: '1rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <label style={{ color: '#00ff88' }}>Buy Tokens</label>
                            <button
                              type="button"
                              onClick={() => setMaxBuy(launch.token)}
                              className="terminal-btn-max"
                              title="Use maximum PUSD balance"
                            >
                              MAX
                            </button>
                          </div>
                          <div className="terminal-input-group">
                            <input
                              type="number"
                              placeholder="PUSD amount"
                              value={tradeAmount[launch.token]?.buy || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setTradeAmount(prev => ({ 
                                  ...prev, 
                                  [launch.token]: { 
                                    ...prev[launch.token], 
                                    buy: value 
                                  } 
                                }));
                                if (value && parseFloat(value) > 0) {
                                  calculateBuyPreview(launch.token, value);
                                } else {
                                  setBuyPreview(prev => ({ ...prev, [launch.token]: '' }));
                                }
                              }}
                              onKeyPress={(e) => handleKeyPress(e, () => handleBuy(launch.token))}
                              min="0.01"
                              step="0.01"
                              className="terminal-input"
                            />
                            <button
                              onClick={() => handleBuy(launch.token)}
                              disabled={trading[launch.token]?.buy || !tradeAmount[launch.token]?.buy}
                              className="terminal-btn-buy"
                            >
                              {trading[launch.token]?.buy ? 'Buying...' : 'Buy'}
                            </button>
                          </div>
                          {buyPreview[launch.token] && parseFloat(buyPreview[launch.token]) > 0 && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#00ff88', opacity: 0.8 }}>
                              ≈ {parseFloat(buyPreview[launch.token]).toLocaleString(undefined, { maximumFractionDigits: 6 })} tokens
                            </div>
                          )}
                        </div>

                        {/* Sell Section */}
                        <div className="terminal-trade-group">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <label style={{ color: '#ff6b6b' }}>Sell Tokens</label>
                            <button
                              type="button"
                              onClick={() => setMaxSell(launch.token)}
                              className="terminal-btn-max"
                              title="Use maximum token balance"
                            >
                              MAX
                            </button>
                          </div>
                          <div className="terminal-input-group">
                            <input
                              type="number"
                              placeholder="Token amount"
                              value={tradeAmount[launch.token]?.sell || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setTradeAmount(prev => ({ 
                                  ...prev, 
                                  [launch.token]: { 
                                    ...prev[launch.token], 
                                    sell: value 
                                  } 
                                }));
                                if (value && parseFloat(value) > 0) {
                                  calculateSellPreview(launch.token, value);
                                } else {
                                  setSellPreview(prev => ({ ...prev, [launch.token]: '' }));
                                }
                              }}
                              onKeyPress={(e) => handleKeyPress(e, () => handleSell(launch.token))}
                              min="0.01"
                              step="0.01"
                              className="terminal-input"
                            />
                            <button
                              onClick={() => handleSell(launch.token)}
                              disabled={trading[launch.token]?.sell || !tradeAmount[launch.token]?.sell}
                              className="terminal-btn-sell"
                            >
                              {trading[launch.token]?.sell ? 'Selling...' : 'Sell'}
                            </button>
                          </div>
                          {sellPreview[launch.token] && parseFloat(sellPreview[launch.token]) > 0 && (
                            <div className="terminal-preview" style={{ color: '#ff6b6b', borderLeftColor: '#ff6b6b' }}>
                              <strong>You will receive:</strong> ≈ {parseFloat(sellPreview[launch.token]).toLocaleString(undefined, { maximumFractionDigits: 6 })} PUSD
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Boost Section */}
                      <div className="terminal-boost-section">
                        <div className="terminal-section-header" style={{ marginBottom: '0.5rem', cursor: 'default' }}>
                          <span className="terminal-prompt">&gt;</span>
                          <span>Boost</span>
                        </div>
                        <div className="terminal-input-group">
                          <input
                            type="number"
                            placeholder="PUSD to burn"
                            value={boostAmount[launch.token] || ''}
                            onChange={(e) => setBoostAmount(prev => ({ ...prev, [launch.token]: e.target.value }))}
                            min="1"
                            step="0.1"
                            className="terminal-input"
                          />
                          <button
                            onClick={() => handleBoost(launch.token)}
                            disabled={boosting[launch.token]}
                            className="terminal-btn-boost"
                          >
                            {boosting[launch.token] ? 'Boosting...' : 'Boost (1 PUSD = 1 Point)'}
                          </button>
                        </div>
                      </div>

                      {(launch.website || launch.telegram || launch.discord) && (
                        <div className="terminal-links">
                          {launch.website && (
                            <a href={launch.website} target="_blank" rel="noopener noreferrer" className="terminal-link">
                              Website
                            </a>
                          )}
                          {launch.telegram && (
                            <a href={launch.telegram} target="_blank" rel="noopener noreferrer" className="terminal-link">
                              Telegram
                            </a>
                          )}
                          {launch.discord && (
                            <a href={launch.discord} target="_blank" rel="noopener noreferrer" className="terminal-link">
                              Discord
                            </a>
                          )}
                        </div>
                      )}

                      {/* Price Chart */}
                      <div style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
                        <div className="terminal-section-header" style={{ marginBottom: '0.5rem' }}>
                          <span className="terminal-prompt">&gt;</span>
                          <span>Price Chart</span>
                        </div>
                        <TokenChart tokenAddress={launch.token} height={250} />
                      </div>

                      <a
                        href={`https://polygonscan.com/address/${launch.token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="terminal-link-external"
                      >
                        View on PolygonScan →
                      </a>
                    </div>
                  )}
                </div>
                );
              })}
              </div>
            )}
            </div>
          </div>

          {/* New (Latest) */}
          <div className="terminal-section">
            <div className="terminal-section-header">
              <span className="terminal-prompt">&gt;</span>
              <span>New</span>
            </div>
            <div className="terminal-section-content">
            {launches.length === 0 ? (
              <div className="terminal-info">
                <span className="terminal-prompt">&gt;</span>
                <span>No launches yet</span>
              </div>
            ) : (
              <div className="terminal-list-single">
              {launches.map((launch) => {
                const rankIndex = topLaunches.findIndex(t => t.token === launch.token);
                const points = parseFloat(launch.boostPoints);
                const formattedPoints = points >= 1000000 
                  ? `${(points / 1000000).toFixed(2)}M`
                  : points >= 1000 
                    ? `${(points / 1000).toFixed(2)}K`
                    : points.toLocaleString(undefined, { maximumFractionDigits: 2 });
                
                return (
                <div key={launch.token} className="terminal-card">
                  <div 
                    className="terminal-card-header"
                    onClick={() => setExpandedNewToken(expandedNewToken === launch.token ? null : launch.token)}
                  >
                    {launch.logoUrl && (
                      <img src={launch.logoUrl} alt="Logo" className="terminal-logo-small" />
                    )}
                    <span className="terminal-address" title={launch.token}>
                      {launch.name || formatAddress(launch.token)}
                    </span>
                    {currentPrices[launch.token] && (
                      <span className="terminal-price-badge">
                        {parseFloat(currentPrices[launch.token]).toFixed(6)} PUSD
                      </span>
                    )}
                    <span className="terminal-boost" title={`${points.toLocaleString()} boost points`}>
                      {formattedPoints} pts
                    </span>
                    <span className={launch.isListed ? 'terminal-status-badge listed' : 'terminal-status-badge active'}>
                      {launch.isListed ? 'Listed' : 'Active'}
                    </span>
                    <span className="terminal-toggle">{expandedNewToken === launch.token ? '[-]' : '[+]'}</span>
                  </div>
                  
                  {expandedNewToken === launch.token && (
                    <div className="terminal-card-content">
                      <div className="terminal-info-row">
                        <span className="terminal-label">Creator:</span>
                        <span className="terminal-value">{formatAddress(launch.creator)}</span>
                      </div>
                      {rankIndex >= 0 && (
                        <div className="terminal-info-row">
                          <span className="terminal-label">Leaderboard Rank:</span>
                          <span className="terminal-value">#{rankIndex + 1} of {topLaunches.length}</span>
                        </div>
                      )}
                      {rankIndex >= 0 && (
                        <div className="terminal-info-row" style={{ background: (rankIndex + 1) <= 3 ? 'rgba(255, 215, 0, 0.05)' : 'transparent', padding: '0.5rem', borderRadius: '4px', marginBottom: '0.5rem' }}>
                          <span className="terminal-label">Leaderboard Rank:</span>
                          <span className="terminal-value" style={{ fontWeight: 'bold' }}>
                            #{(rankIndex + 1)} of {topLaunches.length}
                          </span>
                        </div>
                      )}
                      <div className="terminal-info-row">
                        <span className="terminal-label">Boost Points:</span>
                        <span className="terminal-boost-value" style={{ fontSize: '1.1rem' }}>
                          {parseFloat(launch.boostPoints).toLocaleString(undefined, { maximumFractionDigits: 2 })} pts
                        </span>
                      </div>
                      <div className="terminal-info-row">
                        <span className="terminal-label">PUSD Burned:</span>
                        <span className="terminal-value" style={{ color: '#ff6b6b' }}>
                          {parseFloat(launch.boostPoints).toLocaleString(undefined, { maximumFractionDigits: 2 })} PUSD
                        </span>
                      </div>
                      <div className="terminal-info-row">
                        <span className="terminal-label">Points per PUSD:</span>
                        <span className="terminal-value">1:1 (1 PUSD = 1 Point)</span>
                      </div>
                      <div className="terminal-info-row">
                        <span className="terminal-label">Launch Amount:</span>
                        <span className="terminal-value">{formatEther(launch.launchAmount)} PUSD</span>
                      </div>
                      <div className="terminal-info-row">
                        <span className="terminal-label">Collateral:</span>
                        <span className="terminal-value">{formatEther(launch.collateralLocked)} PUSD</span>
                      </div>
                      <div className="terminal-info-row">
                        <span className="terminal-label">Volume:</span>
                        <span className="terminal-value">{formatEther(launch.totalVolume)} PUSD</span>
                      </div>
                      <div className="terminal-info-row">
                        <span className="terminal-label">Status:</span>
                        <span className={launch.isListed ? 'terminal-status-listed' : 'terminal-status-active'}>
                          {launch.isListed ? 'Listed' : 'Active'}
                        </span>
                      </div>

                      {/* Trading Section */}
                      <div className="terminal-trading-section">
                        <div className="terminal-section-header" style={{ marginBottom: '0.5rem', cursor: 'default' }}>
                          <span className="terminal-prompt">&gt;</span>
                          <span>Trade</span>
                        </div>
                        
                        {currentPrices[launch.token] && (
                          <div className="terminal-info-row" style={{ marginBottom: '0.5rem' }}>
                            <span className="terminal-label">Current Price:</span>
                            <span className="terminal-value">{parseFloat(currentPrices[launch.token]).toFixed(6)} PUSD</span>
                          </div>
                        )}
                        
                        {tokenBalances[launch.token] && (
                          <div className="terminal-info-row" style={{ marginBottom: '1rem' }}>
                            <span className="terminal-label">Your Balance:</span>
                            <span className="terminal-value">{parseFloat(tokenBalances[launch.token]).toFixed(2)} tokens</span>
                          </div>
                        )}

                        {/* Buy Section */}
                        <div className="terminal-trade-group" style={{ marginBottom: '1rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <label style={{ color: '#00ff88' }}>Buy Tokens</label>
                            <button
                              type="button"
                              onClick={() => setMaxBuy(launch.token)}
                              className="terminal-btn-max"
                              title="Use maximum PUSD balance"
                            >
                              MAX
                            </button>
                          </div>
                          <div className="terminal-input-group">
                            <input
                              type="number"
                              placeholder="PUSD amount"
                              value={tradeAmount[launch.token]?.buy || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setTradeAmount(prev => ({ 
                                  ...prev, 
                                  [launch.token]: { 
                                    ...prev[launch.token], 
                                    buy: value 
                                  } 
                                }));
                                if (value && parseFloat(value) > 0) {
                                  calculateBuyPreview(launch.token, value);
                                } else {
                                  setBuyPreview(prev => ({ ...prev, [launch.token]: '' }));
                                }
                              }}
                              onKeyPress={(e) => handleKeyPress(e, () => handleBuy(launch.token))}
                              min="0.01"
                              step="0.01"
                              className="terminal-input"
                            />
                            <button
                              onClick={() => handleBuy(launch.token)}
                              disabled={trading[launch.token]?.buy || !tradeAmount[launch.token]?.buy}
                              className="terminal-btn-buy"
                            >
                              {trading[launch.token]?.buy ? 'Buying...' : 'Buy'}
                            </button>
                          </div>
                          {buyPreview[launch.token] && parseFloat(buyPreview[launch.token]) > 0 && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#00ff88', opacity: 0.8 }}>
                              ≈ {parseFloat(buyPreview[launch.token]).toLocaleString(undefined, { maximumFractionDigits: 6 })} tokens
                            </div>
                          )}
                        </div>

                        {/* Sell Section */}
                        <div className="terminal-trade-group">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <label style={{ color: '#ff6b6b' }}>Sell Tokens</label>
                            <button
                              type="button"
                              onClick={() => setMaxSell(launch.token)}
                              className="terminal-btn-max"
                              title="Use maximum token balance"
                            >
                              MAX
                            </button>
                          </div>
                          <div className="terminal-input-group">
                            <input
                              type="number"
                              placeholder="Token amount"
                              value={tradeAmount[launch.token]?.sell || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setTradeAmount(prev => ({ 
                                  ...prev, 
                                  [launch.token]: { 
                                    ...prev[launch.token], 
                                    sell: value 
                                  } 
                                }));
                                if (value && parseFloat(value) > 0) {
                                  calculateSellPreview(launch.token, value);
                                } else {
                                  setSellPreview(prev => ({ ...prev, [launch.token]: '' }));
                                }
                              }}
                              onKeyPress={(e) => handleKeyPress(e, () => handleSell(launch.token))}
                              min="0.01"
                              step="0.01"
                              className="terminal-input"
                            />
                            <button
                              onClick={() => handleSell(launch.token)}
                              disabled={trading[launch.token]?.sell || !tradeAmount[launch.token]?.sell}
                              className="terminal-btn-sell"
                            >
                              {trading[launch.token]?.sell ? 'Selling...' : 'Sell'}
                            </button>
                          </div>
                          {sellPreview[launch.token] && parseFloat(sellPreview[launch.token]) > 0 && (
                            <div className="terminal-preview" style={{ color: '#ff6b6b', borderLeftColor: '#ff6b6b' }}>
                              <strong>You will receive:</strong> ≈ {parseFloat(sellPreview[launch.token]).toLocaleString(undefined, { maximumFractionDigits: 6 })} PUSD
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Boost Section */}
                      <div className="terminal-boost-section">
                        <div className="terminal-section-header" style={{ marginBottom: '0.5rem', cursor: 'default' }}>
                          <span className="terminal-prompt">&gt;</span>
                          <span>Boost</span>
                        </div>
                        <div className="terminal-input-group">
                          <input
                            type="number"
                            placeholder="PUSD to burn"
                            value={boostAmount[launch.token] || ''}
                            onChange={(e) => setBoostAmount(prev => ({ ...prev, [launch.token]: e.target.value }))}
                            min="1"
                            step="0.1"
                            className="terminal-input"
                          />
                          <button
                            onClick={() => handleBoost(launch.token)}
                            disabled={boosting[launch.token]}
                            className="terminal-btn-boost"
                          >
                            {boosting[launch.token] ? 'Boosting...' : 'Boost (1 PUSD = 1 Point)'}
                          </button>
                        </div>
                      </div>

                      {(launch.website || launch.telegram || launch.discord) && (
                        <div className="terminal-links">
                          {launch.website && (
                            <a href={launch.website} target="_blank" rel="noopener noreferrer" className="terminal-link">
                              Website
                            </a>
                          )}
                          {launch.telegram && (
                            <a href={launch.telegram} target="_blank" rel="noopener noreferrer" className="terminal-link">
                              Telegram
                            </a>
                          )}
                          {launch.discord && (
                            <a href={launch.discord} target="_blank" rel="noopener noreferrer" className="terminal-link">
                              Discord
                            </a>
                          )}
                        </div>
                      )}

                      {/* Price Chart */}
                      <div style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
                        <div className="terminal-section-header" style={{ marginBottom: '0.5rem' }}>
                          <span className="terminal-prompt">&gt;</span>
                          <span>Price Chart</span>
                        </div>
                        <TokenChart tokenAddress={launch.token} height={250} />
                      </div>

                      <a
                        href={`https://polygonscan.com/address/${launch.token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="terminal-link-external"
                      >
                        View on PolygonScan →
                      </a>
                    </div>
                  )}
                </div>
                );
              })}
              </div>
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PFUN;

