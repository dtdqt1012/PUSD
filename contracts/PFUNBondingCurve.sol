// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./PUSD.sol";

/**
 * @title IPFUNLaunchpad
 * @dev Interface for PFUNLaunchpad to avoid circular dependency
 */
interface IPFUNLaunchpad {
    function updateVolume(address token, uint256 volume) external;
    function checkAndList(address token) external;
}

/**
 * @title PFUN BondingCurve
 * @dev Bonding curve mechanism for PFUN token launches
 * Price increases as more tokens are bought
 */
contract PFUNBondingCurve is Ownable, ReentrancyGuard {
    PUSDToken public pusdToken;
    address public launchpad; 

    uint256 public constant INITIAL_PRICE = 1e15; 
    uint256 public constant PRICE_INCREMENT = 1e12; 

    mapping(address => CurveInfo) public curves;
    
    modifier onlyLaunchpad() {
        require(msg.sender == launchpad, "PFUNBondingCurve: Only launchpad");
        _;
    }

    struct CurveInfo {
        address token;          
        uint128 tokensSold;     
        uint128 pusdRaised;     
        uint128 totalSupply;    
        uint128 initialPrice;   
        bool isActive;          
    }
    
    event TokensBought(
        address indexed token,
        address indexed buyer,
        uint256 tokensAmount,
        uint256 pusdPaid
    );
    
    event TokensSold(
        address indexed token,
        address indexed seller,
        uint256 tokensAmount,
        uint256 pusdReceived
    );
    
    constructor(address _pusdToken, address initialOwner) Ownable(initialOwner) {
        require(_pusdToken != address(0), "PFUNBondingCurve: Invalid PUSD token");
        pusdToken = PUSDToken(_pusdToken);
    }
    
    /**
     * @dev Set launchpad address (can only be set once by owner)
     */
    function setLaunchpad(address _launchpad) external onlyOwner {
        require(_launchpad != address(0), "PFUNBondingCurve: Invalid launchpad");
        require(launchpad == address(0), "PFUNBondingCurve: Launchpad already set");
        launchpad = _launchpad;
    }
    
    /**
     * @dev Initialize bonding curve for a token
     * Can be called by owner or launchpad
     * @param token Token address
     * @param totalSupply Total supply of the token
     * @param initialPusdAmount Initial PUSD amount to buy 1% of supply (0 if not provided)
     */
    function initializeCurve(address token, uint256 totalSupply, uint256 initialPusdAmount) external {
        require(msg.sender == owner() || msg.sender == launchpad, "PFUNBondingCurve: Not authorized");
        require(token != address(0), "PFUNBondingCurve: Invalid token");
        require(totalSupply > 0, "PFUNBondingCurve: Invalid supply");
        require(!curves[token].isActive, "PFUNBondingCurve: Already initialized");
        
        uint128 initialTokensSold = 0;
        uint128 initialPusdRaised = 0;
        uint128 initialPrice = uint128(INITIAL_PRICE);

        if (initialPusdAmount > 0) {
            uint256 totalSupplyActual = totalSupply / 1e18;
            
            uint256 initialPriceWei;
            if (totalSupplyActual > 0) {
                initialPriceWei = (1000000 * 1e18) / totalSupplyActual;
            } else {
                initialPriceWei = 1e15;
            }

            if (initialPriceWei == 0) {
                initialPriceWei = 1;
            }

            uint256 tokensToBuyWei = (initialPusdAmount * 1e18) / initialPriceWei;

            if (tokensToBuyWei > totalSupply) {
                tokensToBuyWei = totalSupply;
            }

            if (tokensToBuyWei == 0) {
                tokensToBuyWei = 1e18;
            }
            
            initialTokensSold = uint128(tokensToBuyWei);
            initialPusdRaised = uint128(initialPusdAmount);

            initialPrice = uint128(initialPriceWei);
        }
        
        curves[token] = CurveInfo({
            token: token,
            tokensSold: initialTokensSold,
            pusdRaised: initialPusdRaised,
            totalSupply: uint128(totalSupply),
            initialPrice: initialPrice,
            isActive: true
        });
    }
    
    /**
     * @dev Initialize bonding curve for a token (backward compatibility - no initial LP)
     * Can be called by owner or launchpad
     */
    function initializeCurve(address token, uint256 totalSupply) external {
        require(msg.sender == owner() || msg.sender == launchpad, "PFUNBondingCurve: Not authorized");
        require(token != address(0), "PFUNBondingCurve: Invalid token");
        require(totalSupply > 0, "PFUNBondingCurve: Invalid supply");
        require(!curves[token].isActive, "PFUNBondingCurve: Already initialized");
        
        curves[token] = CurveInfo({
            token: token,
            tokensSold: 0,
            pusdRaised: 0,
            totalSupply: uint128(totalSupply),
            initialPrice: uint128(INITIAL_PRICE),
            isActive: true
        });
    }
    
    /**
     * @dev Buy tokens using PUSD
     * Price increases with each purchase
     */
    function buyTokens(address token, uint256 pusdAmount) external nonReentrant returns (uint256 tokensReceived) {
        CurveInfo storage curve = curves[token];
        require(curve.isActive, "PFUNBondingCurve: Curve not active");
        require(pusdAmount > 0, "PFUNBondingCurve: Amount must be > 0");

        uint128 cachedTokensSold = curve.tokensSold;
        uint128 cachedTotalSupply = curve.totalSupply;
        uint128 cachedInitialPrice = curve.initialPrice;

        uint256 tokensAvailable = uint256(cachedTotalSupply) - uint256(cachedTokensSold);
        require(tokensAvailable > 0, "PFUNBondingCurve: No tokens available");

        uint256 priceIncrement = uint256(cachedInitialPrice) / 10000;
        if (priceIncrement == 0) {
            priceIncrement = PRICE_INCREMENT;
        }
        
        uint256 currentPrice = uint256(cachedInitialPrice) + ((uint256(cachedTokensSold) * priceIncrement) / 1e18);
        require(currentPrice > 0, "PFUNBondingCurve: Invalid current price");
        
        uint256 maxTokensFromPrice = (pusdAmount * 1e18) / currentPrice;
        if (maxTokensFromPrice == 0) {
            require(false, "PFUNBondingCurve: Amount too small");
        }
        
        uint256 actualPusdAmount;
        uint256 estimatedTokens = (pusdAmount * 1e18) / currentPrice;
        
        if (estimatedTokens >= tokensAvailable) {
            tokensReceived = tokensAvailable;
            uint256 finalTokensSold = uint256(cachedTokensSold) + tokensAvailable;
            uint256 finalPrice = uint256(cachedInitialPrice) + ((finalTokensSold * priceIncrement) / 1e18);
            uint256 avgPrice = (currentPrice + finalPrice) / 2;
            require(avgPrice > 0, "PFUNBondingCurve: Invalid average price");
            actualPusdAmount = (tokensAvailable * avgPrice) / 1e18;
            require(actualPusdAmount > 0, "PFUNBondingCurve: Actual PUSD amount must be > 0");
            require(actualPusdAmount <= pusdAmount, "PFUNBondingCurve: Actual PUSD exceeds requested");
        } else {
            uint256 finalTokensSold = uint256(cachedTokensSold) + estimatedTokens;
            uint256 finalPrice = uint256(cachedInitialPrice) + ((finalTokensSold * priceIncrement) / 1e18);
            uint256 avgPrice = (currentPrice + finalPrice) / 2;
            require(avgPrice > 0, "PFUNBondingCurve: Invalid average price");
            
            tokensReceived = (pusdAmount * 1e18) / avgPrice;
            require(tokensReceived > 0, "PFUNBondingCurve: Calculated tokens must be > 0");
            require(tokensReceived <= tokensAvailable, "PFUNBondingCurve: Calculated tokens exceed available");
            
            uint256 verifyFinalTokensSold = uint256(cachedTokensSold) + tokensReceived;
            uint256 verifyFinalPrice = uint256(cachedInitialPrice) + ((verifyFinalTokensSold * priceIncrement) / 1e18);
            uint256 verifyAvgPrice = (currentPrice + verifyFinalPrice) / 2;
            actualPusdAmount = (tokensReceived * verifyAvgPrice) / 1e18;
            require(actualPusdAmount > 0, "PFUNBondingCurve: Actual PUSD amount must be > 0");
            require(actualPusdAmount <= pusdAmount, "PFUNBondingCurve: Actual PUSD exceeds requested");
        }
        
        require(tokensReceived > 0, "PFUNBondingCurve: No tokens to receive");
        
        uint128 newTokensSold = cachedTokensSold + uint128(tokensReceived);
        require(
            newTokensSold <= cachedTotalSupply,
            "PFUNBondingCurve: Insufficient tokens"
        );
        
        require(actualPusdAmount > 0, "PFUNBondingCurve: Actual PUSD amount must be > 0");

        require(
            pusdToken.transferFrom(msg.sender, address(this), actualPusdAmount),
            "PFUNBondingCurve: PUSD transfer failed"
        );

        require(
            IERC20(token).transfer(msg.sender, tokensReceived),
            "PFUNBondingCurve: Token transfer failed"
        );

        curve.tokensSold = newTokensSold;
        curve.pusdRaised = curve.pusdRaised + uint128(actualPusdAmount);

        if (launchpad != address(0)) {
            try IPFUNLaunchpad(launchpad).checkAndList(token) {
            } catch {
            }
        }
        
        emit TokensBought(token, msg.sender, tokensReceived, actualPusdAmount);
        
        return tokensReceived;
    }
    
    /**
     * @dev Sell tokens back for PUSD
     * Price decreases with each sale (tokensSold decreases, so price decreases)
     */
    function sellTokens(address token, uint256 tokenAmount) external nonReentrant returns (uint256 pusdReceived) {
        CurveInfo storage curve = curves[token];
        require(curve.isActive, "PFUNBondingCurve: Curve not active");
        require(tokenAmount > 0, "PFUNBondingCurve: Amount must be > 0");
        require(curve.tokensSold >= tokenAmount, "PFUNBondingCurve: Insufficient tokens sold");

        uint256 currentPrice = getCurrentPrice(token);
        uint256 priceIncrement = uint256(curve.initialPrice) / 10000;
        if (priceIncrement == 0) {
            priceIncrement = PRICE_INCREMENT;
        }
        uint256 prevTokensSold = uint256(curve.tokensSold) > 1e18 ? uint256(curve.tokensSold) - 1e18 : 0;
        uint256 prevPrice = prevTokensSold > 0 
            ? uint256(curve.initialPrice) + ((prevTokensSold * priceIncrement) / 1e18)
            : uint256(curve.initialPrice);
        uint256 avgPrice = (currentPrice + prevPrice) / 2;
        
        pusdReceived = (tokenAmount * avgPrice) / 1e18;
        require(pusdReceived > 0, "PFUNBondingCurve: No PUSD to return");

        require(uint256(curve.pusdRaised) >= pusdReceived, "PFUNBondingCurve: Insufficient PUSD in curve");

        require(
            IERC20(token).transferFrom(msg.sender, address(this), tokenAmount),
            "PFUNBondingCurve: Token transfer failed"
        );

        curve.tokensSold = curve.tokensSold - uint128(tokenAmount);
        curve.pusdRaised = curve.pusdRaised - uint128(pusdReceived);

        require(
            pusdToken.transfer(msg.sender, pusdReceived),
            "PFUNBondingCurve: PUSD transfer failed"
        );
        
        emit TokensSold(token, msg.sender, tokenAmount, pusdReceived);
        
        return pusdReceived;
    }
    
    /**
     * @dev Get initial price for a token (price at launch, before any tokens are bought)
     * @param token Token address
     * @return Initial price in wei (18 decimals)
     */
    function getInitialPrice(address token) public view returns (uint256) {
        CurveInfo storage curve = curves[token];
        if (!curve.isActive) return 0;
        return uint256(curve.initialPrice);
    }
    
    /**
     * @dev Get current price for a token
     * Price increases linearly: price = initialPrice + (tokensSold * PRICE_INCREMENT)
     * This ensures price increases with each purchase
     * Fallback: if initialPrice is 0 (old contract), calculate from pusdRaised / tokensSold
     * Gas optimization: Use storage pointer instead of memory copy when possible
     */
    function getCurrentPrice(address token) public view returns (uint256) {
        CurveInfo storage curve = curves[token];
        if (!curve.isActive) return 0;

        if (curve.initialPrice == 0 && curve.tokensSold > 0 && curve.pusdRaised > 0) {
            return (uint256(curve.pusdRaised) * 1e18) / uint256(curve.tokensSold);
        }

        uint256 tokensSold = uint256(curve.tokensSold);
        uint256 priceIncrement = uint256(curve.initialPrice) / 10000;
        if (priceIncrement == 0) {
            priceIncrement = PRICE_INCREMENT;
        }
        return uint256(curve.initialPrice) + ((tokensSold * priceIncrement) / 1e18);
    }
    
    /**
     * @dev Get quote for buying tokens
     */
    function getBuyQuote(address token, uint256 pusdAmount) external view returns (uint256 tokensOut) {
        uint256 currentPrice = getCurrentPrice(token);
        if (currentPrice == 0) return 0;
        return (pusdAmount * 1e18) / currentPrice;
    }
    
    /**
     * @dev Get quote for selling tokens
     */
    function getSellQuote(address token, uint256 tokenAmount) external view returns (uint256 pusdOut) {
        CurveInfo memory curve = curves[token];
        if (!curve.isActive || curve.tokensSold == 0 || curve.pusdRaised == 0) return 0;
        if (uint256(curve.tokensSold) < tokenAmount) return 0;
        return (tokenAmount * uint256(curve.pusdRaised)) / uint256(curve.tokensSold);
    }
}

