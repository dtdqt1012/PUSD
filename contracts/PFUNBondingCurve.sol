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
    address public launchpad; // PFUNLaunchpad address
    
    // Bonding curve parameters
    uint256 public constant INITIAL_PRICE = 1e15; // 0.001 PUSD per token
    uint256 public constant PRICE_INCREMENT = 1e12; // 0.000001 PUSD increment per token
    
    // Token => Curve info
    mapping(address => CurveInfo) public curves;
    
    modifier onlyLaunchpad() {
        require(msg.sender == launchpad, "PFUNBondingCurve: Only launchpad");
        _;
    }
    
    // Packed struct for gas optimization
    struct CurveInfo {
        address token;          // 20 bytes
        uint128 tokensSold;     // Packed
        uint128 pusdRaised;     // Packed
        uint128 totalSupply;    // Packed
        uint128 initialPrice;   // Packed - initial price in wei (18 decimals)
        bool isActive;          // 1 byte
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
        
        // If initialPusdAmount > 0, buy 1% of supply to set initial price
        if (initialPusdAmount > 0) {
            // 1% of total supply
            uint256 onePercentSupply = (totalSupply * 1) / 100;
            initialTokensSold = uint128(onePercentSupply);
            initialPusdRaised = uint128(initialPusdAmount);
            // Calculate initial price from launch amount and 1% supply
            // initialPrice = (initialPusdAmount * 1e18) / onePercentSupply
            initialPrice = uint128((initialPusdAmount * 1e18) / onePercentSupply);
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
        
        // Calculate tokens to receive using average price (current and next)
        // This ensures price increases with each purchase
        uint256 currentPrice = getCurrentPrice(token);
        uint256 nextPrice = currentPrice + PRICE_INCREMENT;
        uint256 avgPrice = (currentPrice + nextPrice) / 2;
        tokensReceived = (pusdAmount * 1e18) / avgPrice;
        
        uint128 newTokensSold = curve.tokensSold + uint128(tokensReceived);
        require(
            newTokensSold <= curve.totalSupply,
            "PFUNBondingCurve: Insufficient tokens"
        );
        
        // Transfer PUSD from buyer
        require(
            pusdToken.transferFrom(msg.sender, address(this), pusdAmount),
            "PFUNBondingCurve: PUSD transfer failed"
        );
        
        // Transfer tokens to buyer
        require(
            IERC20(token).transfer(msg.sender, tokensReceived),
            "PFUNBondingCurve: Token transfer failed"
        );
        
        // Update curve (packed)
        curve.tokensSold = newTokensSold;
        curve.pusdRaised += uint128(pusdAmount);
        
        // Check for auto-listing based on LP (pusdRaised)
        // After updating pusdRaised, check if threshold reached
        if (launchpad != address(0)) {
            try IPFUNLaunchpad(launchpad).checkAndList(token) {
                // Auto-listed successfully when LP threshold reached
            } catch {
                // Not ready to list yet or already listed
            }
        }
        
        emit TokensBought(token, msg.sender, tokensReceived, pusdAmount);
        
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
        
        // Calculate PUSD to receive using average price (current and previous)
        // This ensures price decreases with each sale
        uint256 currentPrice = getCurrentPrice(token);
        uint256 prevPrice = currentPrice > PRICE_INCREMENT ? currentPrice - PRICE_INCREMENT : currentPrice;
        uint256 avgPrice = (currentPrice + prevPrice) / 2;
        
        pusdReceived = (tokenAmount * avgPrice) / 1e18;
        require(pusdReceived > 0, "PFUNBondingCurve: No PUSD to return");
        
        // Check if we have enough PUSD in the curve
        require(uint256(curve.pusdRaised) >= pusdReceived, "PFUNBondingCurve: Insufficient PUSD in curve");
        
        // Transfer tokens from seller
        require(
            IERC20(token).transferFrom(msg.sender, address(this), tokenAmount),
            "PFUNBondingCurve: Token transfer failed"
        );
        
        // Update curve BEFORE transfer (to prevent reentrancy)
        // tokensSold decreases, so price will decrease for next sell
        curve.tokensSold = curve.tokensSold - uint128(tokenAmount);
        curve.pusdRaised = curve.pusdRaised - uint128(pusdReceived);
        
        // Note: Sell reduces LP, so we don't check for listing on sell
        // Only check on buy when LP increases
        
        // Transfer PUSD to seller
        require(
            pusdToken.transfer(msg.sender, pusdReceived),
            "PFUNBondingCurve: PUSD transfer failed"
        );
        
        emit TokensSold(token, msg.sender, tokenAmount, pusdReceived);
        
        return pusdReceived;
    }
    
    /**
     * @dev Get current price for a token
     * Price increases linearly: price = initialPrice + (tokensSold * PRICE_INCREMENT)
     * This ensures price increases with each purchase
     * Fallback: if initialPrice is 0 (old contract), calculate from pusdRaised / tokensSold
     */
    function getCurrentPrice(address token) public view returns (uint256) {
        CurveInfo memory curve = curves[token];
        if (!curve.isActive) return 0;
        
        // If initialPrice is 0, it's an old contract - calculate from actual PUSD raised
        if (curve.initialPrice == 0 && curve.tokensSold > 0 && curve.pusdRaised > 0) {
            // Price = pusdRaised / tokensSold (both in wei, result in wei)
            return (uint256(curve.pusdRaised) * 1e18) / uint256(curve.tokensSold);
        }
        
        // Price increases linearly: initialPrice + (tokensSold / 1e18) * PRICE_INCREMENT
        // tokensSold is in wei (18 decimals), so divide by 1e18 first
        // This ensures price increases with each purchase
        return uint256(curve.initialPrice) + ((uint256(curve.tokensSold) * PRICE_INCREMENT) / 1e18);
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

