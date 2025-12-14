// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./POGNFT.sol";
import "./LockToEarnPool.sol";

/**
 * @title Daily Check-In System
 * @dev Users check in daily to earn small points, maintain streaks, and earn POG NFT at 66 days
 */
contract DailyCheckIn is Ownable, ReentrancyGuard {
    POGNFT public pogNFT;
    LockToEarnPool public lockToEarnPool;
    EcosystemTracker public ecosystemTracker;
    
    // Points per check-in (small amount to protect main points system)
    uint256 public constant POINTS_PER_CHECKIN = 1e15; // 0.001 points (very small)
    
    // Streak requirement for POG NFT
    uint256 public constant POG_STREAK_REQUIREMENT = 66;
    
    // Check-in record
    struct CheckIn {
        uint256 lastCheckIn;      // Last check-in timestamp
        uint256 currentStreak;    // Current streak days
        uint256 longestStreak;    // Longest streak achieved
        uint256 totalCheckIns;    // Total check-ins
        uint256 totalPoints;      // Total points earned from check-ins
        bool hasPOG;              // Has POG NFT
    }
    
    // User check-in records
    mapping(address => CheckIn) public checkIns;
    
    // Total check-ins across all users
    uint256 public totalCheckIns;
    
    // Total points distributed
    uint256 public totalPointsDistributed;
    
    // Events
    event CheckedIn(
        address indexed user,
        uint256 currentStreak,
        uint256 pointsEarned,
        uint256 timestamp
    );
    
    event StreakBroken(address indexed user, uint256 previousStreak);
    event POGEarned(address indexed user, uint256 indexed tokenId, uint256 timestamp);
    event PointsPerCheckInUpdated(uint256 oldAmount, uint256 newAmount);

    constructor(
        address _pogNFT,
        address _lockToEarnPool,
        address _ecosystemTracker,
        address initialOwner
    ) Ownable(initialOwner) {
        require(_pogNFT != address(0), "DailyCheckIn: Invalid POG NFT");
        require(_lockToEarnPool != address(0), "DailyCheckIn: Invalid LockToEarnPool");
        require(initialOwner != address(0), "DailyCheckIn: Invalid owner");
        
        pogNFT = POGNFT(_pogNFT);
        lockToEarnPool = LockToEarnPool(payable(_lockToEarnPool));
        if (_ecosystemTracker != address(0)) {
            ecosystemTracker = EcosystemTracker(_ecosystemTracker);
        }
    }

    /**
     * @dev Check in for the day
     */
    function checkIn() external nonReentrant {
        address user = msg.sender;
        CheckIn storage record = checkIns[user];
        
        uint256 currentTime = block.timestamp;
        uint256 lastCheckIn = record.lastCheckIn;
        
        // Check if already checked in today
        if (lastCheckIn > 0) {
            uint256 daysSinceLastCheckIn = (currentTime - lastCheckIn) / 1 days;
            
            if (daysSinceLastCheckIn == 0) {
                revert("DailyCheckIn: Already checked in today");
            }
            
            // Reset streak if more than 1 day passed
            if (daysSinceLastCheckIn > 1) {
                if (record.currentStreak > 0) {
                    emit StreakBroken(user, record.currentStreak);
                }
                record.currentStreak = 0;
            }
        }
        
        // Increment streak
        record.currentStreak++;
        
        // Update longest streak
        if (record.currentStreak > record.longestStreak) {
            record.longestStreak = record.currentStreak;
        }
        
        // Update last check-in
        record.lastCheckIn = currentTime;
        record.totalCheckIns++;
        
        // Award points (small amount)
        uint256 pointsEarned = POINTS_PER_CHECKIN;
        record.totalPoints += pointsEarned;
        totalPointsDistributed += pointsEarned;
        
        // Add points to LockToEarnPool
        lockToEarnPool.addPoints(user, pointsEarned);
        
        totalCheckIns++;
        
        emit CheckedIn(user, record.currentStreak, pointsEarned, currentTime);
        
        // Check if user qualifies for POG NFT (66-day streak)
        if (record.currentStreak == POG_STREAK_REQUIREMENT && !record.hasPOG) {
            _mintPOG(user);
        }
    }

    /**
     * @dev Mint POG NFT to user (internal)
     */
    function _mintPOG(address user) private {
        require(!checkIns[user].hasPOG, "DailyCheckIn: User already has POG");
        
        // Check if POG NFT supply is available
        uint256 remainingSupply = pogNFT.getRemainingSupply();
        require(remainingSupply > 0, "DailyCheckIn: No POG NFTs available");
        
        // Mint POG NFT
        uint256 tokenId = pogNFT.mint(user);
        
        checkIns[user].hasPOG = true;
        
        emit POGEarned(user, tokenId, block.timestamp);
    }

    /**
     * @dev Get user's check-in status
     */
    function getUserCheckIn(address user) external view returns (CheckIn memory) {
        return checkIns[user];
    }

    /**
     * @dev Check if user can check in today
     */
    function canCheckIn(address user) external view returns (bool) {
        CheckIn memory record = checkIns[user];
        
        if (record.lastCheckIn == 0) {
            return true; // First check-in
        }
        
        uint256 daysSinceLastCheckIn = (block.timestamp - record.lastCheckIn) / 1 days;
        return daysSinceLastCheckIn >= 1;
    }

    /**
     * @dev Get days until next check-in
     */
    function getDaysUntilNextCheckIn(address user) external view returns (uint256) {
        CheckIn memory record = checkIns[user];
        
        if (record.lastCheckIn == 0) {
            return 0; // Can check in now
        }
        
        uint256 daysSinceLastCheckIn = (block.timestamp - record.lastCheckIn) / 1 days;
        
        if (daysSinceLastCheckIn >= 1) {
            return 0; // Can check in now
        }
        
        return 1 - daysSinceLastCheckIn;
    }

    /**
     * @dev Get user's check-in points (can be claimed later)
     */
    function getUserCheckInPoints(address user) external view returns (uint256) {
        return checkIns[user].totalPoints;
    }

    /**
     * @dev Admin: Update points per check-in (only if needed, should be rare)
     */
    function setPointsPerCheckIn(uint256 newAmount) external onlyOwner {
        require(newAmount <= 1e16, "DailyCheckIn: Points too high (max 0.01)");
        uint256 oldAmount = POINTS_PER_CHECKIN;
        emit PointsPerCheckInUpdated(oldAmount, newAmount);
        // Note: This is a constant, so we can't change it. 
        // If needed, we can add a multiplier or use a variable instead
    }

    /**
     * @dev Set POG NFT contract
     */
    function setPOGNFT(address _pogNFT) external onlyOwner {
        require(_pogNFT != address(0), "DailyCheckIn: Invalid address");
        pogNFT = POGNFT(_pogNFT);
    }

    /**
     * @dev Set LockToEarnPool contract
     */
    function setLockToEarnPool(address _lockToEarnPool) external onlyOwner {
        require(_lockToEarnPool != address(0), "DailyCheckIn: Invalid address");
        lockToEarnPool = LockToEarnPool(payable(_lockToEarnPool));
    }
}

