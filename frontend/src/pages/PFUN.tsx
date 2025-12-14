import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import { CONTRACTS } from '../config/contracts';
import { useNotification } from '../contexts/NotificationContext';
import TokenChart from '../components/TokenChart';
import { isRateLimitError, isRPCError, rpcBatchHandler } from '../utils/rpcHandler';
import { cache } from '../utils/cache';
import { executeTransaction, getTransactionErrorMessage } from '../utils/transaction';
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

// Format price for display - removes unnecessary trailing zeros and handles very small numbers
const formatPriceForDisplay = (price: number | string): string => {
  const priceNum = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(priceNum) || priceNum === 0) return '0';
  
  // Handle very small numbers
  if (priceNum < 0.000001) {
    // For very small numbers (< 0.000001), show up to 12 decimal places
    return priceNum.toFixed(12).replace(/\.?0+$/, '');
  } else if (priceNum === 0.000001) {
    // For exactly 0.000001, show 6 decimal places
    return '0.000001';
  } else if (priceNum < 0.01) {
    // For small numbers, show up to 8 decimal places
    return priceNum.toFixed(8).replace(/\.?0+$/, '');
  } else if (priceNum < 1) {
    // For numbers less than 1, show up to 6 decimal places
    return priceNum.toFixed(6).replace(/\.?0+$/, '');
  } else if (priceNum < 1000) {
    // For numbers less than 1000, show up to 4 decimal places
    return priceNum.toFixed(4).replace(/\.?0+$/, '');
  } else {
    // For large numbers, show up to 2 decimal places
    return priceNum.toFixed(2).replace(/\.?0+$/, '');
  }
};

function PFUN() {
  const { account, provider, signer } = useWeb3();
  const { showNotification } = useNotification();
  const { tokenAddress } = useParams<{ tokenAddress?: string }>();
  const navigate = useNavigate();
  
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
  const [initialPrices, setInitialPrices] = useState<{ [key: string]: string }>({});
  const [buyPreview, setBuyPreview] = useState<{ [key: string]: string }>({});
  const [sellPreview, setSellPreview] = useState<{ [key: string]: string }>({});
  const [launchForm, setLaunchForm] = useState({
    name: '',
    symbol: '',
    totalSupply: '',
    logoUrl: '',
    website: '',
    telegram: '',
    discord: '',
  });
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [isOwner, setIsOwner] = useState(false);
  const [chartRefreshTrigger, setChartRefreshTrigger] = useState(0);
  const previewTimeoutRef = useRef<{ [key: string]: NodeJS.Timeout }>({});

  useEffect(() => {
    if (provider) {
      // Minimal delay - load quickly but after critical UI renders
      const timeoutId = setTimeout(() => {
        loadLaunches();
        checkOwner();
      }, 1000); // Reduced to 1 second for faster loading
      
      const interval = setInterval(() => {
        refreshPrices();
      }, 60000); // 60s refresh interval
      
      return () => {
        clearTimeout(timeoutId);
        clearInterval(interval);
      };
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
    
    // Check cache first
    const cacheKey = `owner-${account}`;
    const cached = cache.get<boolean>(cacheKey);
    if (cached !== null) {
      setIsOwner(cached);
      return;
    }
    
    try {
      // Check if account is owner of PFUNBondingCurve or is the launchpad address
      const bondingCurve = new ethers.Contract(
        CONTRACTS.PFUNBondingCurve.address,
        CONTRACTS.PFUNBondingCurve.abi,
        provider
      );
      
      const [bondingCurveOwner, bondingCurveLaunchpad] = await Promise.all([
        bondingCurve.owner(),
        bondingCurve.launchpad()
      ]);
      
      const isBondingCurveOwner = bondingCurveOwner.toLowerCase() === account.toLowerCase();
      const isLaunchpad = bondingCurveLaunchpad && bondingCurveLaunchpad.toLowerCase() === account.toLowerCase();
      const isOwnerValue = isBondingCurveOwner || isLaunchpad;
      
      setIsOwner(isOwnerValue);
      cache.set(cacheKey, isOwnerValue, 300000); // Cache for 5 minutes
    } catch (error: any) {
      setIsOwner(false);
    }
  };

  const handleLogoUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value.trim();
    setLaunchForm(prev => ({ ...prev, logoUrl: url }));
    // Show preview if URL is valid (http, https, or data:image)
    if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/'))) {
      setLogoPreview(url);
    } else {
      setLogoPreview('');
    }
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

      showNotification('Boosted successfully!', 'success');
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
    
    // Check cache first
    const cacheKey = 'pfun-launches';
    const cached = cache.get<Launch[]>(cacheKey);
    if (cached && cached.length > 0) {
      setLaunches(cached);
      const topData = [...cached].sort((a, b) => 
        parseFloat(b.boostPoints) - parseFloat(a.boostPoints)
      );
      setTopLaunches(topData);
    }
    
    try {
      const launchpad = getContract('PFUNLaunchpad');
      const bondingCurve = getContract('PFUNBondingCurve');
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const allLaunches = await launchpad.getAllLaunches().catch(() => {
        return [];
      });

      if (allLaunches.length === 0) {
        return;
      }

      const tokenFactory = getContract('TokenFactory');
      
      // Process launches in batches to avoid rate limiting
      const batchSize = 5;
      const launchData: Launch[] = [];
      
      for (let i = 0; i < allLaunches.length; i += batchSize) {
        const batch = allLaunches.slice(i, i + batchSize);
        
        const batchData = await Promise.allSettled(
          batch.map(async (token: string) => {
            try {
              const [launch, curve, launchInfo] = await Promise.allSettled([
            launchpad.getLaunch(token),
            bondingCurve.curves(token).catch(() => null),
            tokenFactory.launches(token).catch(() => null)
          ]);
          
              if (launch.status !== 'fulfilled') {
                return null;
              }
              
              const volume = curve.status === 'fulfilled' && curve.value?.isActive && curve.value.pusdRaised > 0n 
                ? curve.value.pusdRaised.toString() 
            : '0';
          
              const launchData = {
            token,
                creator: launch.value.creator,
                launchAmount: launch.value.launchAmount.toString(),
                collateralLocked: launch.value.collateralLocked.toString(),
                createdAt: Number(launch.value.createdAt),
                unlockTime: Number(launch.value.unlockTime),
            totalVolume: volume,
                boostPoints: ethers.formatEther(launch.value.boostPoints),
                isActive: launch.value.isActive,
                isListed: launch.value.isListed,
                logoUrl: launch.value.logoUrl || '',
                website: '',
                telegram: '',
                discord: '',
                name: launchInfo.status === 'fulfilled' && launchInfo.value?.name ? launchInfo.value.name : 'Unknown',
                symbol: launchInfo.status === 'fulfilled' && launchInfo.value?.symbol ? launchInfo.value.symbol : 'UNK',
              };
              
              return launchData;
            } catch (error: any) {
              return null;
            }
          })
        );
        
        const validData = batchData
          .filter((result): result is PromiseFulfilledResult<Launch> => 
            result.status === 'fulfilled' && result.value !== null
          )
          .map(result => result.value);
        
        launchData.push(...validData);
        
        // Add delay between batches to avoid rate limiting
        if (i + batchSize < allLaunches.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      const sortedByNew = [...launchData].sort((a, b) => b.createdAt - a.createdAt);
      const topData = [...launchData].sort((a, b) => 
        parseFloat(b.boostPoints) - parseFloat(a.boostPoints)
      );
      
      setLaunches(sortedByNew);
      setTopLaunches(topData);
      
      // Cache the results
      cache.set(cacheKey, sortedByNew, 300000); // Cache for 5 minutes
      
      // Load prices and balances with delay
      const allTokens = [...new Set(launchData.map(l => l.token))];
      for (let i = 0; i < allTokens.length; i++) {
        loadTokenPrice(allTokens[i]);
        if (account) {
          loadTokenBalance(allTokens[i]);
        }
        // Small delay between each token
        if (i < allTokens.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } catch (error: any) {
      // Don't log rate limit errors
      if (!isRateLimitError(error) && !isRPCError(error)) {
      }
    }
  };

  const loadTokenPrice = async (tokenAddress: string) => {
    if (!provider) return;
    
    try {
      const bondingCurve = getContract('PFUNBondingCurve');
      
      // Load both current price and initial price in parallel
      const [currentPrice, initialPrice] = await Promise.all([
        rpcBatchHandler.add(() => bondingCurve.getCurrentPrice(tokenAddress)).catch(() => 0n),
        rpcBatchHandler.add(() => bondingCurve.getInitialPrice(tokenAddress)).catch(() => 0n),
      ]);
      
      // Set current price
      if (currentPrice !== 0n) {
        const currentPriceFormatted = ethers.formatEther(currentPrice);
        setCurrentPrices(prev => ({ ...prev, [tokenAddress]: currentPriceFormatted }));
        cache.set(`token-current-price-${tokenAddress}`, currentPriceFormatted, 300000);
      } else {
        setCurrentPrices(prev => ({ ...prev, [tokenAddress]: '0' }));
      }
      
      // Set initial price (launch price)
      if (initialPrice !== 0n) {
        const initialPriceFormatted = ethers.formatEther(initialPrice);
        setInitialPrices(prev => ({ ...prev, [tokenAddress]: initialPriceFormatted }));
        cache.set(`token-initial-price-${tokenAddress}`, initialPriceFormatted, 300000);
      } else {
        setInitialPrices(prev => ({ ...prev, [tokenAddress]: '0' }));
      }
    } catch (error: any) {
      if (!isRateLimitError(error) && !isRPCError(error)) {
      }
      setCurrentPrices(prev => ({ ...prev, [tokenAddress]: '0' }));
      setInitialPrices(prev => ({ ...prev, [tokenAddress]: '0' }));
    }
  };

  const loadTokenBalance = async (tokenAddress: string) => {
    if (!provider || !account) return;
    
    // Check cache first
    const cacheKey = `token-balance-${tokenAddress}-${account}`;
    const cached = cache.get<string>(cacheKey);
    if (cached !== null) {
      setTokenBalances(prev => ({ ...prev, [tokenAddress]: cached }));
      return;
    }
    
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function balanceOf(address) view returns (uint256)'],
        provider
      );
      const balance = await rpcBatchHandler.add(() => 
        tokenContract.balanceOf(account)
      ).catch(() => 0n);
      const balanceFormatted = ethers.formatEther(balance);
      setTokenBalances(prev => ({ ...prev, [tokenAddress]: balanceFormatted }));
      // Cache for 30 seconds
      cache.set(cacheKey, balanceFormatted, 30000);
    } catch (error) {
      if (!isRateLimitError(error) && !isRPCError(error)) {
      }
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
        const initialPriceWei = await bondingCurve.getInitialPrice(tokenAddress);
        
        let priceIncrementWei = initialPriceWei / 10000n;
        if (priceIncrementWei === 0n) {
          priceIncrementWei = BigInt(1e12);
        }
        
        const pusdAmountWei = ethers.parseEther(pusdAmount);
        const tokensSoldWei = curve.tokensSold;
        const tokensAvailable = BigInt(curve.totalSupply) - BigInt(tokensSoldWei);
        
        if (tokensAvailable === 0n) {
          setBuyPreview(prev => ({ ...prev, [tokenAddress]: '0' }));
          return;
        }
        
        const estimatedTokens = (pusdAmountWei * BigInt(1e18)) / currentPriceWei;
        
        if (estimatedTokens === 0n) {
          setBuyPreview(prev => ({ ...prev, [tokenAddress]: '0' }));
          return;
        }
        
        let tokensReceived: bigint;
        
        if (estimatedTokens >= tokensAvailable) {
          tokensReceived = tokensAvailable;
        } else {
          const finalTokensSoldWei = tokensSoldWei + estimatedTokens;
          const finalPriceWei = initialPriceWei + ((finalTokensSoldWei * priceIncrementWei) / BigInt(1e18));
          const avgPrice = (currentPriceWei + finalPriceWei) / BigInt(2);
          
          tokensReceived = (pusdAmountWei * BigInt(1e18)) / avgPrice;
          
          if (tokensReceived > tokensAvailable) {
            tokensReceived = tokensAvailable;
          }
          
          const verifyFinalTokensSoldWei = tokensSoldWei + tokensReceived;
          const verifyFinalPriceWei = initialPriceWei + ((verifyFinalTokensSoldWei * priceIncrementWei) / BigInt(1e18));
          const verifyAvgPrice = (currentPriceWei + verifyFinalPriceWei) / BigInt(2);
          const actualPusdAmount = (tokensReceived * verifyAvgPrice) / BigInt(1e18);
          
          if (actualPusdAmount > pusdAmountWei) {
            tokensReceived = (pusdAmountWei * BigInt(1e18)) / verifyAvgPrice;
          }
        }
        
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

        // Use current price for sell preview (price decreases as tokens are sold)
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
    if (!signer || !account) return false;
    
    try {
      const bondingCurve = getContract('PFUNBondingCurve', true);
      const curveInfo = await bondingCurve.curves(token).catch(() => null);
      
      if (curveInfo?.isActive) return true;
      
      // Check if caller is authorized (owner or launchpad)
      const [bondingCurveOwner, bondingCurveLaunchpad] = await Promise.all([
        bondingCurve.owner(),
        bondingCurve.launchpad()
      ]);
      
      const isBondingCurveOwner = bondingCurveOwner.toLowerCase() === account.toLowerCase();
      const isLaunchpad = bondingCurveLaunchpad && bondingCurveLaunchpad.toLowerCase() === account.toLowerCase();
      
      if (!isBondingCurveOwner && !isLaunchpad) {
        return false; // Not authorized
      }
      
      const tokenFactory = getContract('TokenFactory');
      const launchInfo = await tokenFactory.launches(token);
      const initTx = await bondingCurve.initializeCurve(token, launchInfo.totalSupply);
      await initTx.wait();
      showNotification('Curve initialized!', 'success');
      return true;
    } catch (error: any) {
      console.error('Initialize curve error:', error);
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
          showNotification('Curve not initialized. Please wait for owner to initialize. If you are the owner, try again.', 'error');
          setTrading(prev => ({ ...prev, [token]: { ...prev[token], buy: false } }));
          return;
        }
        // Retry buy after initialization
        setTimeout(() => handleBuy(token), 2000);
        return;
      }

      // Check PUSD balance
      const pusdToken = getContract('PUSDToken');
      const pusdAmount = ethers.parseEther(amount);
      const balance = await pusdToken.balanceOf(account);
      if (balance < pusdAmount) {
        showNotification(`Insufficient PUSD balance. You have ${ethers.formatEther(balance)} PUSD, but need ${amount} PUSD.`, 'error');
        return;
      }

      // Approve the full amount (contract will only use what's needed)
      const approved = await handleApprove(
        CONTRACTS.PUSDToken.address,
        CONTRACTS.PFUNBondingCurve.address,
        pusdAmount,
        CONTRACTS.PUSDToken.abi
      );
      if (approved) showNotification('PUSD approved', 'success');

      // Use executeTransaction for better error handling and retry logic
      const buyTx = await bondingCurve.buyTokens(token, pusdAmount);
      const receipt = await executeTransaction(buyTx, signer);

      // Get actual PUSD used from event
      let actualPusdUsed = amount;
      try {
        const event = receipt?.logs?.find((log: any) => {
          try {
            const parsed = bondingCurve.interface.parseLog(log);
            return parsed?.name === 'TokensBought' && parsed.args.token.toLowerCase() === token.toLowerCase();
          } catch {
            return false;
          }
        });
        if (event) {
          const parsed = bondingCurve.interface.parseLog(event);
          if (parsed) {
            actualPusdUsed = ethers.formatEther(parsed.args.pusdPaid);
          }
        }
      } catch (e) {
        // Fallback to original amount if can't parse event
      }

      showNotification(`Bought tokens! Used ${actualPusdUsed} PUSD (requested ${amount} PUSD)`, 'success');
      setTradeAmount(prev => ({ ...prev, [token]: { ...prev[token], buy: '' } }));
      setChartRefreshTrigger(prev => prev + 1);
      await Promise.all([loadTokenData(token), loadLaunches()]);
    } catch (error: any) {
      const errorMessage = getTransactionErrorMessage(error);
      showNotification(errorMessage || 'Failed to buy tokens', 'error');
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

      // Use executeTransaction for better error handling and retry logic
      const sellTx = await bondingCurve.sellTokens(token, tokenAmount);
      await executeTransaction(sellTx, signer);

      showNotification(`Sold ${amount} tokens!`, 'success');
      setTradeAmount(prev => ({ ...prev, [token]: { ...prev[token], sell: '' } }));
      setChartRefreshTrigger(prev => prev + 1);
      await Promise.all([loadTokenData(token), loadLaunches()]);
    } catch (error: any) {
      const errorMessage = getTransactionErrorMessage(error);
      showNotification(errorMessage || 'Failed to sell tokens', 'error');
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
      const minLaunchAmount = await launchpad.minLaunchAmount();
      const launchAmount = minLaunchAmount;
      const totalNeeded = launchAmount + launchFee;
      
      if (!isOwner && launchFee > 0n) {
        showNotification(`Launch fee: 1 PUSD (will be burned)`, 'info');
      }

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
        launchForm.logoUrl.trim()
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
      
      let tokenAddress = tokenCreatedEvent 
        ? tokenFactoryRead.interface.parseLog(tokenCreatedEvent)?.args[0]
        : null;
      
      // If not found in event, try to get from getAllLaunches
      if (!tokenAddress) {
        try {
          const allLaunches = await launchpad.getAllLaunches();
          if (allLaunches.length > 0) {
            tokenAddress = allLaunches[allLaunches.length - 1];
          }
        } catch (error) {
          // Error getting launches
        }
      }
      
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
        logoUrl: '',
        website: '',
        telegram: '',
        discord: '',
      });
      setLogoPreview('');
      
      // Clear cache to force refresh
      cache.delete('pfun-launches');
      
      // Wait a bit for blockchain to update and retry loading
      let retries = 3;
      while (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check directly from contract if token is in allLaunches
        if (tokenAddress) {
          try {
            const allLaunchesCheck = await launchpad.getAllLaunches();
            const found = allLaunchesCheck.some((addr: string) => addr.toLowerCase() === tokenAddress.toLowerCase());
            
            if (found) {
              await loadLaunches();
              break;
            }
          } catch (error) {
            // Error checking launches
          }
        }
        
        // Still try to load launches
        await loadLaunches();
        
        retries--;
      }
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

  // Find the token to display if tokenAddress is in URL
  const allLaunches = [...topLaunches, ...launches];
  const displayedToken = tokenAddress 
    ? allLaunches.find(launch => launch.token.toLowerCase() === tokenAddress.toLowerCase())
    : null;

  // If viewing a specific token, show only that token
  if (displayedToken) {
    const launch = displayedToken;
    const rankIndex = topLaunches.findIndex(t => t.token === launch.token);
    const points = parseFloat(launch.boostPoints);
    const formattedPoints = points >= 1000000 
      ? `${(points / 1000000).toFixed(2)}M`
      : points >= 1000 
        ? `${(points / 1000).toFixed(2)}K`
        : points.toLocaleString(undefined, { maximumFractionDigits: 2 });
    const rank = rankIndex >= 0 ? rankIndex + 1 : null;

    return (
      <div className="pfun-page">
        <div className="container">
          <div className="terminal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span className="terminal-prompt">&gt;</span>
              <span className="terminal-title">Token Details</span>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <button
                onClick={() => {
                  const url = `${window.location.origin}/pfun/${launch.token}`;
                  navigator.clipboard.writeText(url);
                  showNotification('Link copied to clipboard!', 'success');
                }}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: 'rgba(0, 255, 136, 0.1)',
                  border: '1px solid rgba(0, 255, 136, 0.3)',
                  color: '#00ff88',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  fontFamily: 'monospace'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(0, 255, 136, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(0, 255, 136, 0.1)';
                }}
              >
                Share
              </button>
              <button
                onClick={() => navigate('/pfun')}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: 'rgba(138, 71, 229, 0.1)',
                  border: '1px solid rgba(138, 71, 229, 0.3)',
                  color: '#8a47e5',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  fontFamily: 'monospace'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(138, 71, 229, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(138, 71, 229, 0.1)';
                }}
              >
                ← Back to All Tokens
              </button>
            </div>
          </div>

          {/* Single Token View */}
          <div className="terminal-list-single" style={{ marginTop: '2rem' }}>
            <div id={`token-${launch.token.toLowerCase()}`} className="terminal-card">
              <div className="terminal-card-header" style={{ cursor: 'default' }}>
                {rank && (
                  <span className={`terminal-rank rank-${rank <= 3 ? rank : 'other'}`}>
                    #{rank}
                  </span>
                )}
                {launch.logoUrl && launch.logoUrl.trim() ? (
                  <img src={launch.logoUrl} alt="Logo" className="terminal-logo-small" onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const placeholder = document.createElement('div');
                    placeholder.className = 'terminal-logo-small';
                    placeholder.style.cssText = 'width: 40px; height: 40px; border-radius: 50%; background-color: #1a1a1a; border: 2px solid #00ff00; display: flex; align-items: center; justify-content: center; color: #00ff00; font-size: 18px; font-weight: bold;';
                    placeholder.textContent = launch.symbol ? launch.symbol.charAt(0).toUpperCase() : '?';
                    target.parentNode?.insertBefore(placeholder, target.nextSibling);
                  }} />
                ) : (
                  <div className="terminal-logo-small" style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: '#1a1a1a',
                    border: '2px solid #00ff00',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#00ff00',
                    fontSize: '18px',
                    fontWeight: 'bold'
                  }}>
                    {launch.symbol ? launch.symbol.charAt(0).toUpperCase() : '?'}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="terminal-token-name">
                      {launch.name || formatAddress(launch.token)}
                    </span>
                    {launch.symbol && (
                      <span className="terminal-token-symbol">({launch.symbol})</span>
                    )}
                  </div>
                  <div className="terminal-token-meta">
                    <span className="terminal-value">{formatAddress(launch.creator)}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="terminal-token-price">
                    {currentPrices[launch.token] ? `$${formatPriceForDisplay(currentPrices[launch.token])}` : 'Loading...'}
                  </div>
                  <div className="terminal-token-boost">
                    {formattedPoints} points
                  </div>
                </div>
              </div>

              {/* Expanded Content - Always shown for single token view */}
              <div className="terminal-card-content" style={{ display: 'block' }}>
                {/* Price Chart - First */}
                <div style={{ marginTop: '0', marginBottom: '1.5rem' }}>
                  <div className="terminal-section-header" style={{ marginBottom: '0.5rem' }}>
                    <span className="terminal-prompt">&gt;</span>
                    <span>Price Chart</span>
                  </div>
                  <TokenChart tokenAddress={launch.token} height={250} refreshTrigger={chartRefreshTrigger} />
                </div>

                {/* Trading Section - Second */}
                <div className="terminal-trading-section">
                  <div className="terminal-section-header" style={{ marginBottom: '0.5rem', cursor: 'default' }}>
                    <span className="terminal-prompt">&gt;</span>
                    <span>Trade</span>
                  </div>
                  
                  {initialPrices[launch.token] && (
                    <div className="terminal-info-row" style={{ marginBottom: '0.5rem' }}>
                      <span className="terminal-label">Launch Price:</span>
                      <span className="terminal-value">{formatPriceForDisplay(initialPrices[launch.token])} PUSD</span>
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
                    {tradeAmount[launch.token]?.sell && parseFloat(tradeAmount[launch.token].sell) > 0 && (
                      <div className="terminal-preview" style={{ color: '#ff6b6b', borderLeftColor: '#ff6b6b' }}>
                        <strong>You will receive:</strong>{' '}
                        {sellPreview[launch.token] && parseFloat(sellPreview[launch.token]) > 0 ? (
                          <span>≈ {parseFloat(sellPreview[launch.token]).toLocaleString(undefined, { maximumFractionDigits: 6 })} PUSD</span>
                        ) : (
                          <span style={{ opacity: 0.7 }}>Calculating...</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Boost Section - Third */}
                <div className="terminal-boost-section" style={{ marginTop: '1.5rem' }}>
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

                {/* Info Section - Fourth */}
                <div style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
                  <div className="terminal-section-header" style={{ marginBottom: '0.5rem' }}>
                    <span className="terminal-prompt">&gt;</span>
                    <span>Token Information</span>
                  </div>
                  <div className="terminal-info-row">
                    <span className="terminal-label">Creator:</span>
                    <span className="terminal-value">{formatAddress(launch.creator)}</span>
                  </div>
                  {rank && (
                    <div className="terminal-info-row" style={{ background: rank <= 3 ? 'rgba(255, 215, 0, 0.05)' : 'transparent', padding: '0.5rem', borderRadius: '4px', marginBottom: '0.5rem' }}>
                      <span className="terminal-label">Rank:</span>
                      <span className="terminal-value" style={{ fontWeight: 'bold', fontSize: '1rem' }}>
                        #{rank} of {topLaunches.length}
                      </span>
                    </div>
                  )}
                  <div className="terminal-info-row">
                    <span className="terminal-label">Boost Points:</span>
                    <span className="terminal-boost-value" style={{ fontSize: '1.1rem' }}>
                      {parseFloat(launch.boostPoints).toLocaleString(undefined, { 
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2 
                      })} pts
                    </span>
                  </div>
                  <div className="terminal-info-row">
                    <span className="terminal-label">PUSD Burned:</span>
                    <span className="terminal-value" style={{ color: '#ff6b6b' }}>
                      {parseFloat(launch.boostPoints).toLocaleString(undefined, { 
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2 
                      })} PUSD
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
                </div>

                {/* Links */}
                {(launch.website || launch.telegram || launch.discord) && (
                  <div className="terminal-links" style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
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

                {/* Contract Address - Hidden, but keep View on PolygonScan link */}
                <a
                  href={`https://polygonscan.com/address/${launch.token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="terminal-link-external"
                  style={{ marginTop: '1.5rem', display: 'inline-block' }}
                >
                  View on PolygonScan →
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
                      border: '1px solid #00ff00',
                      backgroundColor: '#1a1a1a',
                      padding: '4px'
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

            {/* Calculate and display initial price */}
            {launchForm.totalSupply && 
             parseFloat(launchForm.totalSupply) > 0 && (
              <div className="form-group" style={{ 
                background: 'rgba(130, 71, 229, 0.1)', 
                padding: '1rem', 
                borderRadius: '8px',
                border: '1px solid rgba(130, 71, 229, 0.3)'
              }}>
                <label style={{ color: '#8247e5', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                  Initial Price When Launch
                </label>
                <div style={{ 
                  fontSize: '1.2rem', 
                  color: '#8247e5',
                  fontFamily: 'monospace',
                  padding: '0.5rem',
                  background: 'rgba(0, 0, 0, 0.2)',
                  borderRadius: '4px'
                }}>
                  {(() => {
                    try {
                      const totalSupply = parseFloat(launchForm.totalSupply);
                      if (totalSupply > 0) {
                        // Calculate initial price: price = 1,000,000 / supply
                        // Examples:
                        //   - supply 100,000 → price = 1,000,000 / 100,000 = 10 PUSD
                        //   - supply 1,000,000 → price = 1,000,000 / 1,000,000 = 1 PUSD
                        //   - supply 10,000,000 → price = 1,000,000 / 10,000,000 = 0.1 PUSD
                        //   - supply 100,000,000 → price = 1,000,000 / 100,000,000 = 0.01 PUSD
                        
                        const totalSupplyActual = totalSupply;
                        let initialPriceWei: bigint;
                        
                        if (totalSupplyActual > 0) {
                          initialPriceWei = BigInt(1000000 * 1e18) / BigInt(totalSupplyActual);
                        } else {
                          initialPriceWei = BigInt(1e15);
                        }
                        
                        // Ensure minimum price of 1 wei
                        if (initialPriceWei === 0n) {
                          initialPriceWei = BigInt(1);
                        }
                        
                        const initialPrice = parseFloat(ethers.formatEther(initialPriceWei));
                        
                        // Display the initial price
                        return `${formatPriceForDisplay(initialPrice)} PUSD per token`;
                      }
                    } catch (e) {
                      return 'Calculating...';
                    }
                    return '0 PUSD per token';
                  })()}
            </div>
                <small style={{ display: 'block', marginTop: '0.5rem', color: '#888' }}>
                  This is the starting price when your token launches. Price will increase as tokens are bought.
                </small>
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading 
                ? 'Launching...' 
                : isOwner 
                  ? 'Launch Token (FREE for Owner)' 
                  : 'Launch Token (1 PUSD fee - burned)'}
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
                <div key={launch.token} id={`token-${launch.token.toLowerCase()}`} className="terminal-card">
                  <div 
                    className="terminal-card-header"
                    onClick={() => {
                      setExpandedTopToken(expandedTopToken === launch.token ? null : launch.token);
                      // Update URL when expanding/collapsing
                      if (expandedTopToken !== launch.token) {
                        navigate(`/pfun/${launch.token}`, { replace: true });
                      } else {
                        navigate('/pfun', { replace: true });
                      }
                    }}
                  >
                    <span className={`terminal-rank rank-${rank <= 3 ? rank : 'other'}`}>
                      #{rank}
                    </span>
                    {launch.logoUrl && launch.logoUrl.trim() ? (
                      <img src={launch.logoUrl} alt="Logo" className="terminal-logo-small" onError={(e) => {
                        // Fallback to placeholder if image fails to load
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const placeholder = document.createElement('div');
                        placeholder.className = 'terminal-logo-small';
                        placeholder.style.cssText = 'width: 40px; height: 40px; border-radius: 50%; background-color: #1a1a1a; border: 2px solid #00ff00; display: flex; align-items: center; justify-content: center; color: #00ff00; font-size: 18px; font-weight: bold;';
                        placeholder.textContent = launch.symbol ? launch.symbol.charAt(0).toUpperCase() : '?';
                        target.parentNode?.insertBefore(placeholder, target.nextSibling);
                      }} />
                    ) : (
                      <div className="terminal-logo-small" style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        backgroundColor: '#1a1a1a',
                        border: '2px solid #00ff00',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#00ff00',
                        fontSize: '18px',
                        fontWeight: 'bold'
                      }}>
                        {launch.symbol ? launch.symbol.charAt(0).toUpperCase() : '?'}
                      </div>
                    )}
                    <span className="terminal-address" title={launch.token}>
                      {launch.name || formatAddress(launch.token)}
                    </span>
                    {currentPrices[launch.token] && (
                      <span className="terminal-price-badge">
                        {formatPriceForDisplay(currentPrices[launch.token])} PUSD
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
                          {parseFloat(launch.boostPoints).toLocaleString(undefined, { 
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2 
                          })} pts
                        </span>
                      </div>
                      <div className="terminal-info-row">
                        <span className="terminal-label">PUSD Burned:</span>
                        <span className="terminal-value" style={{ color: '#ff6b6b' }}>
                          {parseFloat(launch.boostPoints).toLocaleString(undefined, { 
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2 
                          })} PUSD
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
                        
                        {initialPrices[launch.token] && (
                          <div className="terminal-info-row" style={{ marginBottom: '0.5rem' }}>
                            <span className="terminal-label">Launch Price:</span>
                            <span className="terminal-value">{formatPriceForDisplay(initialPrices[launch.token])} PUSD</span>
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
                          {tradeAmount[launch.token]?.sell && parseFloat(tradeAmount[launch.token].sell) > 0 && (
                            <div className="terminal-preview" style={{ color: '#ff6b6b', borderLeftColor: '#ff6b6b' }}>
                              <strong>You will receive:</strong>{' '}
                              {sellPreview[launch.token] && parseFloat(sellPreview[launch.token]) > 0 ? (
                                <span>≈ {parseFloat(sellPreview[launch.token]).toLocaleString(undefined, { maximumFractionDigits: 6 })} PUSD</span>
                              ) : (
                                <span style={{ opacity: 0.7 }}>Calculating...</span>
                              )}
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
                        <TokenChart tokenAddress={launch.token} height={250} refreshTrigger={chartRefreshTrigger} />
                      </div>

                      {/* Share Link */}
                      <div style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
                        <div className="terminal-section-header" style={{ marginBottom: '0.5rem' }}>
                          <span className="terminal-prompt">&gt;</span>
                          <span>Share</span>
                        </div>
                        <button
                          onClick={() => {
                            const url = `${window.location.origin}/pfun/${launch.token}`;
                            navigator.clipboard.writeText(url);
                            showNotification('Link copied to clipboard!', 'success');
                          }}
                          style={{
                            width: '100%',
                            padding: '0.75rem',
                            backgroundColor: 'rgba(0, 255, 136, 0.1)',
                            border: '1px solid rgba(0, 255, 136, 0.3)',
                            color: '#00ff88',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            fontSize: '0.875rem',
                            fontFamily: 'monospace',
                            textAlign: 'center'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(0, 255, 136, 0.2)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(0, 255, 136, 0.1)';
                          }}
                        >
                          Share
                        </button>
                      </div>

                      {/* Contract Address - Hidden, but keep View on PolygonScan link */}
                      <a
                        href={`https://polygonscan.com/address/${launch.token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="terminal-link-external"
                        style={{ marginTop: '1.5rem', display: 'inline-block' }}
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
                <div key={launch.token} id={`token-${launch.token.toLowerCase()}`} className="terminal-card">
                  <div 
                    className="terminal-card-header"
                    onClick={() => {
                      setExpandedNewToken(expandedNewToken === launch.token ? null : launch.token);
                      // Update URL when expanding/collapsing
                      if (expandedNewToken !== launch.token) {
                        navigate(`/pfun/${launch.token}`, { replace: true });
                      } else {
                        navigate('/pfun', { replace: true });
                      }
                    }}
                  >
                    {launch.logoUrl && launch.logoUrl.trim() ? (
                      <img src={launch.logoUrl} alt="Logo" className="terminal-logo-small" onError={(e) => {
                        // Fallback to placeholder if image fails to load
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const placeholder = document.createElement('div');
                        placeholder.className = 'terminal-logo-small';
                        placeholder.style.cssText = 'width: 40px; height: 40px; border-radius: 50%; background-color: #1a1a1a; border: 2px solid #00ff00; display: flex; align-items: center; justify-content: center; color: #00ff00; font-size: 18px; font-weight: bold;';
                        placeholder.textContent = launch.symbol ? launch.symbol.charAt(0).toUpperCase() : '?';
                        target.parentNode?.insertBefore(placeholder, target.nextSibling);
                      }} />
                    ) : (
                      <div className="terminal-logo-small" style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        backgroundColor: '#1a1a1a',
                        border: '2px solid #00ff00',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#00ff00',
                        fontSize: '18px',
                        fontWeight: 'bold'
                      }}>
                        {launch.symbol ? launch.symbol.charAt(0).toUpperCase() : '?'}
                      </div>
                    )}
                    <span className="terminal-address" title={launch.token}>
                      {launch.name || formatAddress(launch.token)}
                    </span>
                    {currentPrices[launch.token] && (
                      <span className="terminal-price-badge">
                        {formatPriceForDisplay(currentPrices[launch.token])} PUSD
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
                          {parseFloat(launch.boostPoints).toLocaleString(undefined, { 
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2 
                          })} pts
                        </span>
                      </div>
                      <div className="terminal-info-row">
                        <span className="terminal-label">PUSD Burned:</span>
                        <span className="terminal-value" style={{ color: '#ff6b6b' }}>
                          {parseFloat(launch.boostPoints).toLocaleString(undefined, { 
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2 
                          })} PUSD
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
                        
                        {initialPrices[launch.token] && (
                          <div className="terminal-info-row" style={{ marginBottom: '0.5rem' }}>
                            <span className="terminal-label">Launch Price:</span>
                            <span className="terminal-value">{formatPriceForDisplay(initialPrices[launch.token])} PUSD</span>
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
                          {tradeAmount[launch.token]?.sell && parseFloat(tradeAmount[launch.token].sell) > 0 && (
                            <div className="terminal-preview" style={{ color: '#ff6b6b', borderLeftColor: '#ff6b6b' }}>
                              <strong>You will receive:</strong>{' '}
                              {sellPreview[launch.token] && parseFloat(sellPreview[launch.token]) > 0 ? (
                                <span>≈ {parseFloat(sellPreview[launch.token]).toLocaleString(undefined, { maximumFractionDigits: 6 })} PUSD</span>
                              ) : (
                                <span style={{ opacity: 0.7 }}>Calculating...</span>
                              )}
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
                        <TokenChart tokenAddress={launch.token} height={250} refreshTrigger={chartRefreshTrigger} />
                      </div>

                      {/* Share Link */}
                      <div style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
                        <div className="terminal-section-header" style={{ marginBottom: '0.5rem' }}>
                          <span className="terminal-prompt">&gt;</span>
                          <span>Share</span>
                        </div>
                        <button
                          onClick={() => {
                            const url = `${window.location.origin}/pfun/${launch.token}`;
                            navigator.clipboard.writeText(url);
                            showNotification('Link copied to clipboard!', 'success');
                          }}
                          style={{
                            width: '100%',
                            padding: '0.75rem',
                            backgroundColor: 'rgba(0, 255, 136, 0.1)',
                            border: '1px solid rgba(0, 255, 136, 0.3)',
                            color: '#00ff88',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            fontSize: '0.875rem',
                            fontFamily: 'monospace',
                            textAlign: 'center'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(0, 255, 136, 0.2)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(0, 255, 136, 0.1)';
                          }}
                        >
                          Share
                        </button>
                      </div>

                      {/* Contract Address - Hidden, but keep View on PolygonScan link */}
                      <a
                        href={`https://polygonscan.com/address/${launch.token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="terminal-link-external"
                        style={{ marginTop: '1.5rem', display: 'inline-block' }}
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

