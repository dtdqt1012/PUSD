// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./PUSD.sol";
import "./TokenFactory.sol";
import "./PFUNBondingCurve.sol";

/**
 * @title PFUN Launchpad
 * @dev Main launchpad contract for PFUN - PUSD Meme Launchpad
 * Manages token launches, trading, and security features
 */
contract PFUNLaunchpad is Ownable, ReentrancyGuard {
    PUSDToken public pusdToken;
    TokenFactory public tokenFactory;
    PFUNBondingCurve public bondingCurve;
    
    // Launch configuration
    uint256 public minLaunchAmount = 6 * 1e16; // Minimum 0.06 PUSD to launch
    uint256 public listingThreshold = 6000 * 1e18; // 6k PUSD volume to auto-list
    
    // Collateral lock for rug pull protection
    uint256 public collateralLockPeriod = 30 days;
    uint256 public collateralPercentage = 10; // 10% of launch amount
    
    // Gas optimization: Pack struct
    uint128 private constant _RESERVED = 0;
    
    // Launch info (packed for gas optimization)
    struct Launch {
        address token;              // 20 bytes
        address creator;             // 20 bytes
        uint128 launchAmount;         // PUSD amount raised (packed)
        uint128 collateralLocked;    // PUSD locked (packed)
        uint64 createdAt;            // Timestamp (packed)
        uint64 unlockTime;           // Timestamp (packed)
        uint128 totalVolume;         // Total volume (packed)
        uint128 boostPoints;         // Boost points (packed)
        bool isActive;               // 1 byte
        bool isListed;               // 1 byte
        string logoUrl;              // Logo URL (required)
        string website;              // Website URL (optional)
        string telegram;             // Telegram URL (optional)
        string discord;               // Discord URL (optional)
    }
    
    mapping(address => Launch) public launches;
    address[] public allLaunches;
    
    
           event TokenLaunched(
               address indexed token,
               address indexed creator,
               uint256 launchAmount,
               uint256 collateralLocked,
               string logoUrl,
               string website,
               string telegram,
               string discord
           );
           
           event TokenListed(address indexed token);
           event CollateralUnlocked(address indexed token, uint256 amount);
           event TokenBoosted(
               address indexed token,
               address indexed booster,
               uint256 pusdBurned,
               uint256 newBoostPoints
           );
    
    constructor(
        address _pusdToken,
        address _tokenFactory,
        address _bondingCurve,
        address initialOwner
    ) Ownable(initialOwner) {
        require(_pusdToken != address(0), "PFUN: Invalid PUSD token");
        require(_tokenFactory != address(0), "PFUN: Invalid TokenFactory");
        require(_bondingCurve != address(0), "PFUN: Invalid BondingCurve");
        pusdToken = PUSDToken(_pusdToken);
        tokenFactory = TokenFactory(_tokenFactory);
        bondingCurve = PFUNBondingCurve(_bondingCurve);
    }
    
    /**
     * @dev Launch a new token
     * @param name Token name
     * @param symbol Token symbol
     * @param totalSupply Total supply
     * @param launchAmount Launch amount in PUSD
     * @param logoUrl Logo URL (required, must be valid URL)
     * @param website Website URL (optional, empty string if not provided)
     * @param telegram Telegram URL (optional, empty string if not provided)
     * @param discord Discord URL (optional, empty string if not provided)
     */
    function launchToken(
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        uint256 launchAmount,
        string memory logoUrl,
        string memory website,
        string memory telegram,
        string memory discord
    ) external nonReentrant returns (address tokenAddress) {
        require(launchAmount >= minLaunchAmount, "PFUN: Insufficient launch amount");
        // Validate logo URL (required)
        require(bytes(logoUrl).length > 0, "PFUN: Logo URL required");
        require(bytes(logoUrl).length <= 2000, "PFUN: Logo URL too long");
        // Accept HTTP/HTTPS URLs, IPFS URLs, and data URLs (for small compressed images)
        require(
            _isValidUrl(logoUrl) || 
            _isValidIPFS(logoUrl) ||
            _isValidDataUrl(logoUrl),
            "PFUN: Invalid logo URL format"
        );
        
        // Validate optional URLs (if provided)
        if (bytes(website).length > 0) {
            require(bytes(website).length <= 200, "PFUN: Website URL too long");
            require(_isValidUrl(website), "PFUN: Invalid website URL format");
        }
        if (bytes(telegram).length > 0) {
            require(bytes(telegram).length <= 200, "PFUN: Telegram URL too long");
            require(_isValidUrl(telegram), "PFUN: Invalid telegram URL format");
        }
        if (bytes(discord).length > 0) {
            require(bytes(discord).length <= 200, "PFUN: Discord URL too long");
            require(_isValidUrl(discord), "PFUN: Invalid discord URL format");
        }
        
               // Get factory fee (owner creates for free)
               // Check if user is owner of launchpad OR owner of tokenFactory
               bool isOwner = (msg.sender == owner()) || (msg.sender == tokenFactory.owner());
               uint256 factoryFee = isOwner ? 0 : tokenFactory.launchFee();
               
               // Transfer fee from user to launchpad first, then launchpad will approve TokenFactory
               // This allows TokenFactory to pull fee from launchpad
               if (factoryFee > 0) {
                   // Step 1: Transfer fee from user to launchpad
                   require(
                       pusdToken.transferFrom(msg.sender, address(this), factoryFee),
                       "PFUN: Factory fee transfer to launchpad failed"
                   );
                   
                   // Step 2: Approve TokenFactory to pull fee from launchpad
                   require(
                       pusdToken.approve(address(tokenFactory), factoryFee),
                       "PFUN: Factory fee approval failed"
                   );
               }
        
        // Create token via factory (pump.fun style)
        // Token is minted to launchpad, then immediately transferred to bonding curve
        // Pass msg.sender (user) as initialOwner so TokenFactory can check if user is owner for free launch
        tokenAddress = tokenFactory.createToken(name, symbol, totalSupply, msg.sender);
        
        // Transfer launch amount to launchpad
        require(
            pusdToken.transferFrom(msg.sender, address(this), launchAmount),
            "PFUN: Launch amount transfer failed"
        );
        
        // Lock collateral (10% of launch amount, not including factory fee)
        uint256 collateral = (launchAmount * collateralPercentage) / 100;
        
        // Transfer ALL tokens to bonding curve (pump.fun style)
        // This is how pump.fun works - all supply goes to bonding curve for trading
        IERC20 token = IERC20(tokenAddress);
        require(
            token.transfer(address(bondingCurve), totalSupply),
            "PFUN: Token transfer to bonding curve failed"
        );
        
               // Record launch (packed for gas optimization)
               launches[tokenAddress] = Launch({
                   token: tokenAddress,
                   creator: msg.sender,
                   launchAmount: uint128(launchAmount),
                   collateralLocked: uint128(collateral),
                   createdAt: uint64(block.timestamp),
                   unlockTime: uint64(block.timestamp + collateralLockPeriod),
                   totalVolume: 0,
                   boostPoints: 0,
                   isActive: true,
                   isListed: false,
                   logoUrl: logoUrl,
                   website: website,
                   telegram: telegram,
                   discord: discord
               });
        
        allLaunches.push(tokenAddress);
        
        // Automatically initialize bonding curve for the new token
        // Buy 1% of supply with launch amount to set initial price
        // Use try-catch in case bonding curve doesn't have launchpad set or is old version
        try bondingCurve.initializeCurve(tokenAddress, totalSupply, launchAmount) {
            // Success - curve initialized with initial price set
            // Transfer launch amount to bonding curve (for the initial LP)
            require(
                pusdToken.transfer(address(bondingCurve), launchAmount),
                "PFUN: Launch amount transfer to bonding curve failed"
            );
        } catch {
            // Failed - curve will need to be initialized manually by owner
            // This allows token launch to succeed even if curve init fails
        }
        
        emit TokenLaunched(tokenAddress, msg.sender, launchAmount, collateral, logoUrl, website, telegram, discord);
        
        return tokenAddress;
    }
    
    /**
     * @dev Update volume for a token (called by bonding curve)
     */
    function updateVolume(address token, uint256 volume) external {
        require(msg.sender == address(bondingCurve), "PFUN: Only bonding curve");
        Launch storage launch = launches[token];
        require(launch.isActive, "PFUN: Launch not active");
        
        launch.totalVolume += uint128(volume);
    }
    
    /**
     * @dev Auto-list token when LP threshold reached (can be called by anyone or bonding curve)
     * Checks pusdRaised in bonding curve (LP amount) instead of volume
     */
    function checkAndList(address token) external {
        Launch storage launch = launches[token];
        require(launch.isActive, "PFUN: Launch not active");
        require(!launch.isListed, "PFUN: Already listed");
        
        // Check LP amount (pusdRaised) in bonding curve
        // CurveInfo struct: (address token, uint128 tokensSold, uint128 pusdRaised, uint128 totalSupply, bool isActive)
        (,, uint128 pusdRaised,,,) = bondingCurve.curves(token);
        require(uint256(pusdRaised) >= listingThreshold, "PFUN: LP threshold not reached");
        
        launch.isListed = true;
        emit TokenListed(token);
    }
    
    /**
     * @dev Unlock collateral after lock period
     */
    function unlockCollateral(address token) external nonReentrant {
        Launch storage launch = launches[token];
        require(launch.isActive, "PFUN: Launch not active");
        require(uint64(block.timestamp) >= launch.unlockTime, "PFUN: Lock period not ended");
        require(launch.collateralLocked > 0, "PFUN: No collateral to unlock");
        
        uint256 amount = launch.collateralLocked;
        launch.collateralLocked = 0;
        
        require(
            pusdToken.transfer(launch.creator, amount),
            "PFUN: Collateral transfer failed"
        );
        
        emit CollateralUnlocked(token, amount);
    }
    
    /**
     * @dev Get all launches
     */
    function getAllLaunches() external view returns (address[] memory) {
        return allLaunches;
    }
    
           /**
            * @dev Boost a token by burning PUSD
            * @param token Token address to boost
            * @param pusdAmount Amount of PUSD to burn (1 PUSD = 1 point)
            * PUSD is burned (reduces totalSupply) when boosting
            */
           function boostToken(address token, uint256 pusdAmount) external nonReentrant {
               Launch storage launch = launches[token];
               require(launch.isActive, "PFUN: Launch not active");
               require(pusdAmount > 0, "PFUN: Amount must be > 0");
               
               // Burn PUSD (reduces totalSupply)
               // Transfer from user to this contract first, then burn
               require(
                   pusdToken.transferFrom(msg.sender, address(this), pusdAmount),
                   "PFUN: PUSD transfer failed"
               );
               
               // Burn the PUSD (reduces totalSupply)
               pusdToken.burn(pusdAmount);
               
               // Increase boost points (1 PUSD = 1 point)
               launch.boostPoints += uint128(pusdAmount);
               
               emit TokenBoosted(token, msg.sender, pusdAmount, launch.boostPoints);
           }
           
           /**
            * @dev Get launch info
            */
           function getLaunch(address token) external view returns (Launch memory) {
               return launches[token];
           }
           
           /**
            * @dev Get all launches sorted by boost points (descending)
            */
           function getAllLaunchesSortedByBoost() external view returns (address[] memory) {
               address[] memory all = allLaunches;
               // Sort by boost points (bubble sort for simplicity, can optimize later)
               for (uint i = 0; i < all.length; i++) {
                   for (uint j = 0; j < all.length - i - 1; j++) {
                       if (launches[all[j]].boostPoints < launches[all[j + 1]].boostPoints) {
                           address temp = all[j];
                           all[j] = all[j + 1];
                           all[j + 1] = temp;
                       }
                   }
               }
               return all;
           }
           
           // Admin functions
    function setMinLaunchAmount(uint256 _amount) external onlyOwner {
        minLaunchAmount = _amount;
    }
    
    function setListingThreshold(uint256 _threshold) external onlyOwner {
        listingThreshold = _threshold;
    }
    
    function setCollateralPercentage(uint256 _percentage) external onlyOwner {
        require(_percentage <= 50, "PFUN: Max 50%");
        collateralPercentage = _percentage;
    }
    
    /**
     * @dev Helper function to validate URL format
     */
    function _isValidUrl(string memory url) private pure returns (bool) {
        bytes memory urlBytes = bytes(url);
        if (urlBytes.length < 8) return false;
        
        // Check for http:// or https://
        bytes memory httpPrefix = "http://";
        bytes memory httpsPrefix = "https://";
        
        if (urlBytes.length >= 7) {
            bool isHttp = true;
            for (uint i = 0; i < 7; i++) {
                if (urlBytes[i] != httpPrefix[i]) {
                    isHttp = false;
                    break;
                }
            }
            if (isHttp) return true;
        }
        
        if (urlBytes.length >= 8) {
            bool isHttps = true;
            for (uint i = 0; i < 8; i++) {
                if (urlBytes[i] != httpsPrefix[i]) {
                    isHttps = false;
                    break;
                }
            }
            if (isHttps) return true;
        }
        
        return false;
    }
    
    /**
     * @dev Helper function to validate IPFS URL format
     */
    function _isValidIPFS(string memory url) private pure returns (bool) {
        bytes memory urlBytes = bytes(url);
        if (urlBytes.length < 7) return false;
        
        // Check for ipfs://
        bytes memory ipfsPrefix = "ipfs://";
        if (urlBytes.length >= 7) {
            for (uint i = 0; i < 7; i++) {
                if (urlBytes[i] != ipfsPrefix[i]) {
                    return false;
                }
            }
            return true;
        }
        
        // Check for https://ipfs
        bytes memory httpsIPFS = "https://ipfs";
        if (urlBytes.length >= 12) {
            for (uint i = 0; i < 12; i++) {
                if (urlBytes[i] != httpsIPFS[i]) {
                    return false;
                }
            }
            return true;
        }
        
        return false;
    }
    
    /**
     * @dev Helper function to validate data URL format (for small compressed images)
     */
    function _isValidDataUrl(string memory url) private pure returns (bool) {
        bytes memory urlBytes = bytes(url);
        if (urlBytes.length < 11) return false;
        
        // Check for data:image/
        bytes memory dataPrefix = "data:image/";
        if (urlBytes.length >= 11) {
            for (uint i = 0; i < 11; i++) {
                if (urlBytes[i] != dataPrefix[i]) {
                    return false;
                }
            }
            return true;
        }
        
        return false;
    }
}

