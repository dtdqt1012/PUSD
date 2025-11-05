// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IChainlinkAggregator {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
    
    function decimals() external view returns (uint8);
}

interface IUniswapV2Pair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function token0() external view returns (address);
    function token1() external view returns (address);
}

interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

contract OraclePriceFeed is Ownable {
    // Chainlink aggregator for POL/USD (if available)
    IChainlinkAggregator public chainlinkAggregator;
    bool public useChainlink;
    
    // DEX pool fallback (Uniswap V2 / Quickswap compatible)
    IUniswapV2Pair public dexPool;
    address public polToken; // Native POL or WMATIC address
    address public stableToken; // USDC/USDT address in pool
    bool public useDexFallback;
    
    // Manual price fallback (admin can set)
    uint256 public manualPrice; // Price with 8 decimals
    bool public useManualPrice;
    
    uint256 public constant PRICE_DECIMALS = 8;
    uint256 public priceStaleness = 24 hours; // Reject price older than 24h
    
    event PriceUpdated(uint256 price, uint256 timestamp, string source);
    event ChainlinkSet(address indexed aggregator);
    event DexPoolSet(address indexed pool, address polToken, address stableToken);
    event ManualPriceSet(uint256 price);

    constructor(address initialOwner) Ownable(initialOwner) {
        require(initialOwner != address(0), "OraclePriceFeed: Invalid owner");
    }

    function setChainlinkOracle(address aggregator) external onlyOwner {
        require(aggregator != address(0), "OraclePriceFeed: Invalid address");
        chainlinkAggregator = IChainlinkAggregator(aggregator);
        useChainlink = true;
        emit ChainlinkSet(aggregator);
    }

    function setDexPool(
        address poolAddress,
        address polTokenAddr,
        address stableTokenAddr
    ) external onlyOwner {
        require(poolAddress != address(0), "OraclePriceFeed: Invalid pool");
        require(polTokenAddr != address(0), "OraclePriceFeed: Invalid POL token");
        require(stableTokenAddr != address(0), "OraclePriceFeed: Invalid stable token");
        dexPool = IUniswapV2Pair(poolAddress);
        polToken = polTokenAddr;
        stableToken = stableTokenAddr;
        useDexFallback = true;
        emit DexPoolSet(poolAddress, polTokenAddr, stableTokenAddr);
    }

    function setManualPrice(uint256 priceInUsd8Decimals) external onlyOwner {
        require(priceInUsd8Decimals > 0, "OraclePriceFeed: Price must be > 0");
        manualPrice = priceInUsd8Decimals;
        useManualPrice = true;
        emit ManualPriceSet(priceInUsd8Decimals);
    }

    function disableChainlink() external onlyOwner {
        useChainlink = false;
    }

    function getPOLPrice() public view returns (uint256) {
        // Priority 1: Chainlink
        if (useChainlink && address(chainlinkAggregator) != address(0)) {
            try this._getChainlinkPrice() returns (uint256 price) {
                return price;
            } catch {
                // Fall through to next source
            }
        }
        
        // Priority 2: DEX Pool
        if (useDexFallback && address(dexPool) != address(0)) {
            try this._getDexPrice() returns (uint256 price) {
                return price;
            } catch {
                // Fall through to manual
            }
        }
        
        // Priority 3: Manual price
        if (useManualPrice && manualPrice > 0) {
            return manualPrice;
        }
        
        revert("OraclePriceFeed: No valid price source");
    }

    function _getChainlinkPrice() external view returns (uint256) {
        require(address(chainlinkAggregator) != address(0), "Oracle: Chainlink not set");
        
        (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = chainlinkAggregator.latestRoundData();
        
        require(answer > 0, "Oracle: Invalid Chainlink answer");
        require(updatedAt > 0, "Oracle: Round not complete");
        require(
            block.timestamp - updatedAt <= priceStaleness,
            "Oracle: Chainlink price too stale"
        );
        
        uint8 decimals = chainlinkAggregator.decimals();
        // Convert to 8 decimals
        if (decimals > PRICE_DECIMALS) {
            return uint256(answer) / (10 ** (decimals - PRICE_DECIMALS));
        } else if (decimals < PRICE_DECIMALS) {
            return uint256(answer) * (10 ** (PRICE_DECIMALS - decimals));
        }
        return uint256(answer);
    }

    function _getDexPrice() external view returns (uint256) {
        require(address(dexPool) != address(0), "Oracle: DEX pool not set");
        
        (uint112 reserve0, uint112 reserve1, ) = dexPool.getReserves();
        
        address token0 = dexPool.token0();
        address token1 = dexPool.token1();
        
        uint256 reservePOL;
        uint256 reserveStable;
        uint8 polDecimals;
        uint8 stableDecimals;
        
        if (token0 == polToken) {
            reservePOL = uint256(reserve0);
            reserveStable = uint256(reserve1);
            polDecimals = IERC20Decimals(token0).decimals();
            stableDecimals = IERC20Decimals(token1).decimals();
        } else {
            reservePOL = uint256(reserve1);
            reserveStable = uint256(reserve0);
            polDecimals = IERC20Decimals(token1).decimals();
            stableDecimals = IERC20Decimals(token0).decimals();
        }
        
        require(reservePOL > 0 && reserveStable > 0, "Oracle: Invalid reserves");
        
        // Price = (reserveStable / reservePOL) with decimals adjustment
        // Result in 8 decimals
        // price = (reserveStable * 10^8 * 10^polDecimals) / (reservePOL * 10^stableDecimals)
        uint256 price = (reserveStable * (10 ** PRICE_DECIMALS) * (10 ** polDecimals)) / 
                       (reservePOL * (10 ** stableDecimals));
        
        return price;
    }

    function setPriceStaleness(uint256 _staleness) external onlyOwner {
        priceStaleness = _staleness;
    }
}

