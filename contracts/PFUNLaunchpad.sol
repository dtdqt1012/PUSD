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

    address public developmentFund;

    uint256 public minLaunchAmount = 6 * 1e16; 
    uint256 public listingThreshold = 6000 * 1e18; 

    uint256 public collateralLockPeriod = 30 days;
    uint256 public collateralPercentage = 10; 

    uint128 private constant _RESERVED = 0;

    struct Launch {
        address token;              
        address creator;             
        uint128 launchAmount;         
        uint128 collateralLocked;    
        uint64 createdAt;            
        uint64 unlockTime;           
        uint128 totalVolume;         
        uint128 boostPoints;         
        bool isActive;               
        bool isListed;
        string logoUrl;               
    }
    
    mapping(address => Launch) public launches;
    address[] public allLaunches;

    event TokenLaunched(
        address indexed token,
        address indexed creator,
        uint256 launchAmount,
        uint256 collateralLocked,
        string logoUrl
    );
    
    event TokenListed(address indexed token);
    event CollateralUnlocked(address indexed token, uint256 amount);
    event TokenBoosted(
        address indexed token,
        address indexed booster,
        uint256 pusdSent,
        uint256 newBoostPoints
    );
    
    constructor(
        address _pusdToken,
        address _tokenFactory,
        address _bondingCurve,
        address _developmentFund,
        address initialOwner
    ) Ownable(initialOwner) {
        require(_pusdToken != address(0), "PFUN: Invalid PUSD token");
        require(_tokenFactory != address(0), "PFUN: Invalid TokenFactory");
        require(_bondingCurve != address(0), "PFUN: Invalid BondingCurve");
        require(_developmentFund != address(0), "PFUN: Invalid development fund");
        pusdToken = PUSDToken(_pusdToken);
        tokenFactory = TokenFactory(_tokenFactory);
        bondingCurve = PFUNBondingCurve(_bondingCurve);
        developmentFund = _developmentFund;
    }
    
    /**
     * @dev Launch a new token
     * @param name Token name
     * @param symbol Token symbol
     * @param totalSupply Total supply
     * @param launchAmount Launch amount in PUSD
     */
    function launchToken(
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        uint256 launchAmount,
        string memory logoUrl
    ) external nonReentrant returns (address tokenAddress) {
        require(launchAmount >= minLaunchAmount, "PFUN: Insufficient launch amount");

        bool isOwner = (msg.sender == owner()) || (msg.sender == tokenFactory.owner());
        uint256 factoryFee = isOwner ? 0 : tokenFactory.launchFee();

        if (factoryFee > 0) {
            require(
                pusdToken.transferFrom(msg.sender, address(this), factoryFee),
                "PFUN: Factory fee transfer to launchpad failed"
            );

            require(
                pusdToken.approve(address(tokenFactory), factoryFee),
                "PFUN: Factory fee approval failed"
            );
        }

        tokenAddress = tokenFactory.createToken(name, symbol, totalSupply, msg.sender);

        require(
            pusdToken.transferFrom(msg.sender, address(this), launchAmount),
            "PFUN: Launch amount transfer failed"
        );

        uint256 collateral = (launchAmount * collateralPercentage) / 100;

        IERC20 token = IERC20(tokenAddress);
        require(
            token.transfer(address(bondingCurve), totalSupply),
            "PFUN: Token transfer to bonding curve failed"
        );

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
            logoUrl: logoUrl
        });
        
        allLaunches.push(tokenAddress);

        // Initialize bonding curve (launchpad is authorized to call this)
        bondingCurve.initializeCurve(tokenAddress, totalSupply, launchAmount);
        
        // Transfer launch amount to bonding curve as initial liquidity
        require(
            pusdToken.transfer(address(bondingCurve), launchAmount),
            "PFUN: Launch amount transfer to bonding curve failed"
        );
        
        emit TokenLaunched(tokenAddress, msg.sender, launchAmount, collateral, logoUrl);
        
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
     * @dev Boost a token by sending PUSD to development fund
     * @param token Token address to boost
     * @param pusdAmount Amount of PUSD to send (1 PUSD = 1 point)
     * PUSD is sent to development fund when boosting
     */
    function boostToken(address token, uint256 pusdAmount) external nonReentrant {
        Launch storage launch = launches[token];
        require(launch.isActive, "PFUN: Launch not active");
        require(pusdAmount > 0, "PFUN: Amount must be > 0");

        require(
            pusdToken.transferFrom(msg.sender, developmentFund, pusdAmount),
            "PFUN: PUSD transfer failed"
        );

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
    
    function setDevelopmentFund(address _developmentFund) external onlyOwner {
        require(_developmentFund != address(0), "PFUN: Invalid address");
        developmentFund = _developmentFund;
    }
    
}

