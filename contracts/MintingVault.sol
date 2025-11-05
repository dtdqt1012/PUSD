// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./PUSD.sol";
import "./StakingPool.sol";
import "./OraclePriceFeed.sol";

contract MintingVault is Ownable, ReentrancyGuard {
    PUSDToken public pusdToken;
    StakingPool public stakingPool;
    OraclePriceFeed public oracle;
    
    // Default lock period for staked portion (30 days minimum)
    uint256 public defaultLockDays = 30;
    
    // Total POL deposited
    uint256 public totalCollateral;
    
    // Collateral per user
    mapping(address => uint256) public userCollateral;
    
    // Minting split: 60% PUSD, 20% stake POL, 20% stake PUSD
    uint256 public constant PUSD_MINT_BPS = 6000; // 60%
    uint256 public constant POL_STAKE_BPS = 2000; // 20%
    uint256 public constant PUSD_STAKE_BPS = 2000; // 20%
    uint256 public constant BPS_DENOMINATOR = 10000;
    
    event Minted(
        address indexed user,
        uint256 polAmount,
        uint256 pusdMinted,
        uint256 polStaked,
        uint256 pusdStaked,
        uint256 lockDays
    );
    
    event Redeemed(
        address indexed user,
        uint256 pusdAmount,
        uint256 polReturned
    );
    
    event DefaultLockDaysUpdated(uint256 oldDays, uint256 newDays);

    constructor(
        address _pusdToken,
        address _stakingPool,
        address _oracle,
        address initialOwner
    ) Ownable(initialOwner) {
        require(_pusdToken != address(0), "MintingVault: Invalid PUSD token");
        require(_stakingPool != address(0), "MintingVault: Invalid staking pool");
        require(_oracle != address(0), "MintingVault: Invalid oracle");
        require(initialOwner != address(0), "MintingVault: Invalid owner");
        pusdToken = PUSDToken(_pusdToken);
        stakingPool = StakingPool(payable(_stakingPool));
        oracle = OraclePriceFeed(_oracle);
    }

    receive() external payable {
        // Accept POL transfers for minting
    }

    function mintWithPOL(uint256 lockDays) external payable nonReentrant {
        require(msg.value > 0, "MintingVault: Must send POL");
        require(lockDays >= 30, "MintingVault: Lock period must be >= 30 days");
        
        uint256 polAmount = msg.value;
        
        // Get POL price in USD (8 decimals)
        uint256 polPrice = oracle.getPOLPrice();
        
        // Calculate total USD value of POL
        // polAmount (wei, 18 decimals) * polPrice (8 decimals) / 1e8 = USD value (18 decimals)
        uint256 usdValue = (polAmount * polPrice) / 1e8;
        
        // 60% mint PUSD for user (1 PUSD = $1)
        uint256 pusdToMint = (usdValue * PUSD_MINT_BPS) / BPS_DENOMINATOR;
        
        // 20% USD value stake POL
        uint256 polToStake = (usdValue * POL_STAKE_BPS * 1e8) / (BPS_DENOMINATOR * polPrice);
        
        // 20% USD value stake PUSD (1 PUSD = $1)
        uint256 pusdToStake = (usdValue * PUSD_STAKE_BPS) / BPS_DENOMINATOR;
        
        require(polToStake <= polAmount, "MintingVault: Stake amount exceeds POL");
        
        // Mint total PUSD (60% for user + 20% to stake)
        pusdToken.mint(msg.sender, pusdToMint);
        pusdToken.mint(address(this), pusdToStake);
        
        // Stake POL in pool for user
        (bool success, ) = address(stakingPool).call{value: polToStake}(
            abi.encodeWithSignature("stakeFor(address,uint256)", msg.sender, lockDays)
        );
        require(success, "MintingVault: POL stake failed");
        
        // Stake PUSD in pool for user
        IERC20(address(pusdToken)).approve(address(stakingPool), pusdToStake);
        (bool success2, ) = address(stakingPool).call(
            abi.encodeWithSignature("stakePUSDFor(address,uint256,uint256)", msg.sender, pusdToStake, lockDays)
        );
        require(success2, "MintingVault: PUSD stake failed");
        
        // Track collateral: remaining POL in vault (after staking)
        uint256 polInVault = polAmount - polToStake;
        totalCollateral += polInVault;
        userCollateral[msg.sender] += polInVault;
        
        emit Minted(msg.sender, polAmount, pusdToMint, polToStake, pusdToStake, lockDays);
    }

    function mintWithPOLDefault() external payable nonReentrant {
        require(msg.value > 0, "MintingVault: Must send POL");
        
        uint256 polAmount = msg.value;
        
        // Get POL price in USD (8 decimals)
        uint256 polPrice = oracle.getPOLPrice();
        
        // Calculate total USD value of POL
        uint256 usdValue = (polAmount * polPrice) / 1e8;
        
        // 60% mint PUSD for user (1 PUSD = $1)
        uint256 pusdToMint = (usdValue * PUSD_MINT_BPS) / BPS_DENOMINATOR;
        
        // 20% USD value stake POL
        uint256 polToStake = (usdValue * POL_STAKE_BPS * 1e8) / (BPS_DENOMINATOR * polPrice);
        
        // 20% USD value stake PUSD (1 PUSD = $1)
        uint256 pusdToStake = (usdValue * PUSD_STAKE_BPS) / BPS_DENOMINATOR;
        
        require(polToStake <= polAmount, "MintingVault: Stake amount exceeds POL");
        
        // Mint total PUSD (60% for user + 20% to stake)
        pusdToken.mint(msg.sender, pusdToMint);
        pusdToken.mint(address(this), pusdToStake);
        
        // Stake POL with default lock days
        (bool success, ) = address(stakingPool).call{value: polToStake}(
            abi.encodeWithSignature("stakeFor(address,uint256)", msg.sender, defaultLockDays)
        );
        require(success, "MintingVault: POL stake failed");
        
        // Stake PUSD with default lock days
        IERC20(address(pusdToken)).approve(address(stakingPool), pusdToStake);
        (bool success2, ) = address(stakingPool).call(
            abi.encodeWithSignature("stakePUSDFor(address,uint256,uint256)", msg.sender, pusdToStake, defaultLockDays)
        );
        require(success2, "MintingVault: PUSD stake failed");
        
        // Track collateral
        uint256 polInVault = polAmount - polToStake;
        totalCollateral += polInVault;
        userCollateral[msg.sender] += polInVault;
        
        emit Minted(msg.sender, polAmount, pusdToMint, polToStake, pusdToStake, defaultLockDays);
    }

    function redeemPUSD(uint256 pusdAmount, uint256 minPolOut) external nonReentrant {
        require(pusdAmount > 0, "MintingVault: Amount must be > 0");
        
        uint256 availableCollateral = userCollateral[msg.sender];
        require(availableCollateral > 0, "MintingVault: No collateral");
        
        uint256 polPrice = oracle.getPOLPrice();
        uint256 polToReturn = (pusdAmount * 1e8) / polPrice;
        
        uint256 actualPolToReturn = polToReturn > availableCollateral 
            ? availableCollateral 
            : polToReturn;
        
        if (minPolOut > 0) {
            require(actualPolToReturn >= minPolOut, "MintingVault: Slippage too high");
        }
        
        uint256 actualPusdToBurn = (actualPolToReturn * polPrice) / 1e8;
        
        require(
            address(this).balance >= actualPolToReturn,
            "MintingVault: Insufficient POL balance"
        );
        
        pusdToken.burnFrom(msg.sender, actualPusdToBurn);
        
        totalCollateral -= actualPolToReturn;
        userCollateral[msg.sender] -= actualPolToReturn;
        
        (bool success, ) = payable(msg.sender).call{value: actualPolToReturn}("");
        require(success, "MintingVault: Transfer failed");
        
        emit Redeemed(msg.sender, actualPusdToBurn, actualPolToReturn);
    }

    function getMintablePUSD(uint256 polAmount) external view returns (uint256) {
        uint256 polPrice = oracle.getPOLPrice();
        // Calculate USD value
        uint256 usdValue = (polAmount * polPrice) / 1e8;
        return (usdValue * PUSD_MINT_BPS) / BPS_DENOMINATOR;
    }

    function getRedeemablePOL(uint256 pusdAmount) external view returns (uint256) {
        uint256 polPrice = oracle.getPOLPrice();
        uint256 polToReturn = (pusdAmount * 1e8) / polPrice;
        uint256 availableCollateral = userCollateral[msg.sender];
        return polToReturn > availableCollateral ? availableCollateral : polToReturn;
    }

    function setDefaultLockDays(uint256 _days) external onlyOwner {
        require(_days >= 30, "MintingVault: Must be >= 30 days");
        uint256 oldDays = defaultLockDays;
        defaultLockDays = _days;
        emit DefaultLockDaysUpdated(oldDays, _days);
    }

    function setPUSDToken(address _pusdToken) external onlyOwner {
        require(_pusdToken != address(0), "MintingVault: Invalid address");
        pusdToken = PUSDToken(_pusdToken);
    }

    function setStakingPool(address _stakingPool) external onlyOwner {
        require(_stakingPool != address(0), "MintingVault: Invalid address");
        stakingPool = StakingPool(payable(_stakingPool));
    }

    function setOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "MintingVault: Invalid address");
        oracle = OraclePriceFeed(_oracle);
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}

