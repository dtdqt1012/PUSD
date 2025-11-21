// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./PUSD.sol";

/**
 * @title PFUN CollateralLock
 * @dev Rug pull protection through collateral locking
 * Locks PUSD as collateral for a period after token launch
 */
contract PFUNCollateralLock is Ownable, ReentrancyGuard {
    PUSDToken public pusdToken;
    
    // Lock configuration
    uint256 public defaultLockPeriod = 30 days;
    uint256 public minCollateralPercentage = 10; // 10% minimum
    uint256 public maxCollateralPercentage = 50; // 50% maximum
    
    // Token => Lock info
    mapping(address => LockInfo) public locks;
    
    // Packed struct for gas optimization
    struct LockInfo {
        address token;              // 20 bytes
        address creator;            // 20 bytes
        uint128 collateralAmount;   // Packed
        uint64 lockStartTime;       // Packed
        uint64 lockEndTime;         // Packed
        bool isLocked;              // 1 byte
        bool isUnlocked;            // 1 byte
    }
    
    event CollateralLocked(
        address indexed token,
        address indexed creator,
        uint256 amount,
        uint256 unlockTime
    );
    
    event CollateralUnlocked(
        address indexed token,
        address indexed creator,
        uint256 amount
    );
    
    constructor(address _pusdToken, address initialOwner) Ownable(initialOwner) {
        require(_pusdToken != address(0), "PFUNCollateralLock: Invalid PUSD token");
        pusdToken = PUSDToken(_pusdToken);
    }
    
    /**
     * @dev Lock collateral for a token
     * @param token Token address
     * @param collateralAmount Amount of PUSD to lock
     * @param lockPeriod Lock period in seconds (optional, uses default if 0)
     */
    function lockCollateral(
        address token,
        uint256 collateralAmount,
        uint256 lockPeriod
    ) external nonReentrant {
        require(token != address(0), "PFUNCollateralLock: Invalid token");
        require(collateralAmount > 0, "PFUNCollateralLock: Amount must be > 0");
        require(!locks[token].isLocked, "PFUNCollateralLock: Already locked");
        
        uint256 period = lockPeriod > 0 ? lockPeriod : defaultLockPeriod;
        uint256 unlockTime = block.timestamp + period;
        
        // Transfer PUSD from creator
        require(
            pusdToken.transferFrom(msg.sender, address(this), collateralAmount),
            "PFUNCollateralLock: Transfer failed"
        );
        
        // Record lock (packed for gas optimization)
        locks[token] = LockInfo({
            token: token,
            creator: msg.sender,
            collateralAmount: uint128(collateralAmount),
            lockStartTime: uint64(block.timestamp),
            lockEndTime: uint64(unlockTime),
            isLocked: true,
            isUnlocked: false
        });
        
        emit CollateralLocked(token, msg.sender, collateralAmount, unlockTime);
    }
    
    /**
     * @dev Unlock collateral after lock period
     */
    function unlockCollateral(address token) external nonReentrant {
        LockInfo storage lock = locks[token];
        require(lock.isLocked, "PFUNCollateralLock: Not locked");
        require(!lock.isUnlocked, "PFUNCollateralLock: Already unlocked");
        require(uint64(block.timestamp) >= lock.lockEndTime, "PFUNCollateralLock: Lock period not ended");
        require(msg.sender == lock.creator || msg.sender == owner(), "PFUNCollateralLock: Unauthorized");
        
        uint256 amount = lock.collateralAmount;
        lock.isUnlocked = true;
        lock.isLocked = false;
        
        // Return collateral to creator
        require(
            pusdToken.transfer(lock.creator, amount),
            "PFUNCollateralLock: Unlock transfer failed"
        );
        
        emit CollateralUnlocked(token, lock.creator, amount);
    }
    
    /**
     * @dev Get lock info for a token
     */
    function getLockInfo(address token) external view returns (LockInfo memory) {
        return locks[token];
    }
    
    /**
     * @dev Check if collateral is locked
     */
    function isCollateralLocked(address token) external view returns (bool) {
        return locks[token].isLocked && !locks[token].isUnlocked;
    }
    
    // Admin functions
    function setDefaultLockPeriod(uint256 _period) external onlyOwner {
        require(_period >= 7 days, "PFUNCollateralLock: Min 7 days");
        defaultLockPeriod = _period;
    }
    
    function setCollateralPercentage(uint256 min, uint256 max) external onlyOwner {
        require(min <= max, "PFUNCollateralLock: Invalid range");
        require(max <= 100, "PFUNCollateralLock: Max 100%");
        minCollateralPercentage = min;
        maxCollateralPercentage = max;
    }
}


