// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./OraclePriceFeed.sol";
import "./PUSD.sol";
import "./EcosystemTracker.sol";

contract LockToEarnPool is Ownable, ReentrancyGuard {
    OraclePriceFeed public oracle;
    PUSDToken public pusdToken;
    EcosystemTracker public ecosystemTracker;
    
    // Native POL (native token of Polygon)
    address public constant NATIVE_POL = address(0);
    
    // Minimum lock period: 30 days
    uint256 public constant MIN_LOCK_DAYS = 30;
    
    // Whitelist for contracts allowed to lock on behalf of user (like MintingVault)
    mapping(address => bool) public authorizedLockers;
    
    // Whitelist for contracts allowed to add points (like DailyCheckIn)
    mapping(address => bool) public authorizedPointAdders;
    
    // Lock record for POL
    struct Lock {
        uint256 amount;        // Amount POL locked (wei)
        uint256 lockUntil;     // Timestamp when unlock
        uint256 points;        // Points earned
        uint256 createdAt;     // Timestamp when locked
        bool active;           // Still active
    }
    
    // Lock record for PUSD
    struct PUSDLock {
        uint256 amount;        // Amount PUSD locked (wei)
        uint256 lockUntil;     // Timestamp when unlock
        uint256 points;        // Points earned
        uint256 createdAt;     // Timestamp when locked
        bool active;           // Still active
    }
    
    // User locks
    mapping(address => Lock[]) public userLocks;
    mapping(address => PUSDLock[]) public userPUSDLocks;
    
    // Total points per user
    mapping(address => uint256) public userTotalPoints;
    
    // Total POL locked
    uint256 public totalLocked;
    
    // Total PUSD locked
    uint256 public totalPUSDLocked;
    
    // Lock counter
    uint256 public totalLocks;
    uint256 public totalPUSDLocks;
    
    // Total points across all users
    uint256 public totalPoints;
    
    event Locked(
        address indexed user,
        uint256 indexed lockId,
        uint256 amount,
        uint256 lockDays,
        uint256 points,
        uint256 unlockAt
    );
    
    event PUSDLocked(
        address indexed user,
        uint256 indexed lockId,
        uint256 amount,
        uint256 lockDays,
        uint256 points,
        uint256 unlockAt
    );
    
    event Unlocked(
        address indexed user,
        uint256 indexed lockId,
        uint256 amount
    );
    
    event PUSDUnlocked(
        address indexed user,
        uint256 indexed lockId,
        uint256 amount
    );
    
    event LockExtended(
        address indexed user,
        uint256 indexed lockId,
        uint256 newLockDays,
        uint256 newPoints
    );

    constructor(
        address _oracle,
        address _pusdToken,
        address _ecosystemTracker,
        address initialOwner
    ) Ownable(initialOwner) {
        require(_oracle != address(0), "LockToEarnPool: Invalid oracle");
        require(_pusdToken != address(0), "LockToEarnPool: Invalid PUSD token");
        require(initialOwner != address(0), "LockToEarnPool: Invalid owner");
        oracle = OraclePriceFeed(_oracle);
        pusdToken = PUSDToken(_pusdToken);
        if (_ecosystemTracker != address(0)) {
            ecosystemTracker = EcosystemTracker(_ecosystemTracker);
        }
    }

    function setAuthorizedLocker(address locker, bool authorized) external onlyOwner {
        authorizedLockers[locker] = authorized;
    }
    
    function setAuthorizedPointAdder(address adder, bool authorized) external onlyOwner {
        authorizedPointAdders[adder] = authorized;
    }
    
    /**
     * @dev Add points to user (for DailyCheckIn rewards)
     * Only authorized contracts can call this
     */
    function addPoints(address user, uint256 points) external {
        require(
            authorizedPointAdders[msg.sender] || msg.sender == owner(),
            "LockToEarnPool: Not authorized to add points"
        );
        require(user != address(0), "LockToEarnPool: Invalid user");
        require(points > 0, "LockToEarnPool: Points must be > 0");
        
        userTotalPoints[user] += points;
        totalPoints += points;
    }

    receive() external payable {
        // Accept POL transfers
    }

    function lock(uint256 lockDays) external payable nonReentrant {
        require(msg.value > 0, "LockToEarnPool: Must lock > 0");
        require(lockDays >= MIN_LOCK_DAYS, "LockToEarnPool: Lock period < 30 days");
        
        uint256 amount = msg.value;
        uint256 lockUntil = block.timestamp + (lockDays * 1 days);
        
        // Calculate points
        uint256 points = calculatePoints(amount, lockDays);
        
        // Create lock record
        uint256 lockId = userLocks[msg.sender].length;
        userLocks[msg.sender].push(Lock({
            amount: amount,
            lockUntil: lockUntil,
            points: points,
            createdAt: block.timestamp,
            active: true
        }));
        
        // Update totals
        userTotalPoints[msg.sender] += points;
        totalPoints += points;
        totalLocked += amount;
        totalLocks++;
        
        emit Locked(msg.sender, lockId, amount, lockDays, points, lockUntil);
        
        // Track transaction
        if (address(ecosystemTracker) != address(0)) {
            ecosystemTracker.recordTransaction(
                msg.sender,
                EcosystemTracker.TransactionType.Lock,
                amount
            );
        }
    }

    function lockFor(address user, uint256 lockDays) external payable nonReentrant {
        require(
            authorizedLockers[msg.sender] || msg.sender == owner(),
            "LockToEarnPool: Not authorized"
        );
        require(msg.value > 0, "LockToEarnPool: Must lock > 0");
        require(lockDays >= MIN_LOCK_DAYS, "LockToEarnPool: Lock period < 30 days");
        require(user != address(0), "LockToEarnPool: Invalid user");
        
        uint256 amount = msg.value;
        uint256 lockUntil = block.timestamp + (lockDays * 1 days);
        
        // Calculate points
        uint256 points = calculatePoints(amount, lockDays);
        
        // Create lock record for user
        uint256 lockId = userLocks[user].length;
        userLocks[user].push(Lock({
            amount: amount,
            lockUntil: lockUntil,
            points: points,
            createdAt: block.timestamp,
            active: true
        }));
        
        // Update totals
        userTotalPoints[user] += points;
        totalPoints += points;
        totalLocked += amount;
        totalLocks++;
        
        emit Locked(user, lockId, amount, lockDays, points, lockUntil);
    }

    function unlock(uint256 lockId) external nonReentrant {
        require(lockId < userLocks[msg.sender].length, "LockToEarnPool: Invalid lockId");
        
        Lock storage lockRecord = userLocks[msg.sender][lockId];
        require(lockRecord.active, "LockToEarnPool: Already unlocked");
        require(
            block.timestamp >= lockRecord.lockUntil,
            "LockToEarnPool: Still locked"
        );
        
        uint256 amount = lockRecord.amount;
        
        // Update totals
        userTotalPoints[msg.sender] -= lockRecord.points;
        totalPoints -= lockRecord.points;
        totalLocked -= amount;
        lockRecord.active = false;
        
        // Transfer POL back
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "LockToEarnPool: Transfer failed");
        
        emit Unlocked(msg.sender, lockId, amount);
    }

    function extendLock(uint256 lockId, uint256 additionalDays) external nonReentrant {
        require(lockId < userLocks[msg.sender].length, "LockToEarnPool: Invalid lockId");
        require(additionalDays > 0, "LockToEarnPool: Additional days must be > 0");
        
        Lock storage lockRecord = userLocks[msg.sender][lockId];
        require(lockRecord.active, "LockToEarnPool: Lock not active");
        
        uint256 newLockUntil = lockRecord.lockUntil + (additionalDays * 1 days);
        uint256 totalLockDays = (newLockUntil - lockRecord.createdAt) / 1 days;
        
        // Recalculate points with new lock period
        uint256 newPoints = calculatePoints(lockRecord.amount, totalLockDays);
        
        // Update
        uint256 oldPoints = lockRecord.points;
        userTotalPoints[msg.sender] = userTotalPoints[msg.sender] - oldPoints + newPoints;
        totalPoints = totalPoints - oldPoints + newPoints;
        
        lockRecord.points = newPoints;
        lockRecord.lockUntil = newLockUntil;
        
        emit LockExtended(msg.sender, lockId, totalLockDays, newPoints);
    }

    function calculatePoints(uint256 polAmount, uint256 lockDays) public view returns (uint256) {
        // Get POL price in USD (8 decimals)
        uint256 polPrice = oracle.getPOLPrice();
        
        // Convert POL amount to USD (18 decimals POL -> 8 decimals price)
        // polAmount is wei (18 decimals), polPrice is 8 decimals
        // USD value = (polAmount * polPrice) / 1e8 → result is 18 decimals
        uint256 usdValue = (polAmount * polPrice) / 1e8;
        
        // Base: every $10 = 1 point base
        // usdValue / 10 with 18 decimals = usdValue / (10 * 1e18) * 1e18
        // Simplified: points = (usdValue * multiplier) / (10 * 1e18)
        
        // Calculate multiplier based on lock days
        uint256 multiplier = getMultiplier(lockDays);
        
        // Final points = (usdValue * multiplier) / (10 * 1e18)
        // Example: $10 with multiplier 1x = (10e18 * 1e18) / (10 * 1e18) = 1e18
        return (usdValue * multiplier) / (10 * 1e18);
    }

    function getMultiplier(uint256 lockDays) public pure returns (uint256) {
        if (lockDays < 30) {
            return 0; // Below minimum
        } else if (lockDays <= 60) {
            // 30-60 days: 1x to 2x (linear)
            // multiplier = 1 + (lockDays - 30) / 30
            return 1e18 + ((lockDays - 30) * 1e18) / 30;
        } else if (lockDays <= 120) {
            // 60-120 days: 2x to 3x (linear)
            // multiplier = 2 + (lockDays - 60) / 60
            return 2e18 + ((lockDays - 60) * 1e18) / 60;
        } else if (lockDays <= 365) {
            // 120-365 days: 3x to 10x (linear)
            // multiplier = 3 + (lockDays - 120) * 7 / 245
            return 3e18 + ((lockDays - 120) * 7e18) / 245;
        } else {
            // 365+ days: 10x (cap)
            return 10e18;
        }
    }

    function getUserTotalPoints(address user) external view returns (uint256) {
        return userTotalPoints[user];
    }

    function getUserLockCount(address user) external view returns (uint256) {
        return userLocks[user].length;
    }

    function getUserLock(address user, uint256 lockId) external view returns (Lock memory) {
        return userLocks[user][lockId];
    }

    function getUserPUSDLockCount(address user) external view returns (uint256) {
        return userPUSDLocks[user].length;
    }

    function getUserPUSDLock(address user, uint256 lockId) external view returns (PUSDLock memory) {
        return userPUSDLocks[user][lockId];
    }

    function lockPUSD(uint256 amount, uint256 lockDays) external nonReentrant {
        require(amount > 0, "LockToEarnPool: Must lock > 0");
        require(lockDays >= MIN_LOCK_DAYS, "LockToEarnPool: Lock period < 30 days");
        
        // Transfer PUSD from user to this contract
        require(
            pusdToken.transferFrom(msg.sender, address(this), amount),
            "LockToEarnPool: PUSD transfer failed"
        );
        
        uint256 lockUntil = block.timestamp + (lockDays * 1 days);
        
        // Calculate points (PUSD = $1, so usdValue = amount)
        uint256 usdValue = amount; // PUSD is 18 decimals, 1 PUSD = $1
        uint256 multiplier = getMultiplier(lockDays);
        uint256 points = (usdValue * multiplier) / (10 * 1e18);
        
        // Create lock record
        uint256 lockId = userPUSDLocks[msg.sender].length;
        userPUSDLocks[msg.sender].push(PUSDLock({
            amount: amount,
            lockUntil: lockUntil,
            points: points,
            createdAt: block.timestamp,
            active: true
        }));
        
        // Update totals
        userTotalPoints[msg.sender] += points;
        totalPoints += points;
        totalPUSDLocked += amount;
        totalPUSDLocks++;
        
        emit PUSDLocked(msg.sender, lockId, amount, lockDays, points, lockUntil);
        
        // Track transaction
        if (address(ecosystemTracker) != address(0)) {
            ecosystemTracker.recordTransaction(
                msg.sender,
                EcosystemTracker.TransactionType.Lock,
                amount
            );
        }
    }

    function lockPUSDFor(address user, uint256 amount, uint256 lockDays) external nonReentrant {
        require(
            authorizedLockers[msg.sender] || msg.sender == owner(),
            "LockToEarnPool: Not authorized"
        );
        require(amount > 0, "LockToEarnPool: Must lock > 0");
        require(lockDays >= MIN_LOCK_DAYS, "LockToEarnPool: Lock period < 30 days");
        require(user != address(0), "LockToEarnPool: Invalid user");
        
        // Transfer PUSD from caller to this contract
        require(
            pusdToken.transferFrom(msg.sender, address(this), amount),
            "LockToEarnPool: PUSD transfer failed"
        );
        
        uint256 lockUntil = block.timestamp + (lockDays * 1 days);
        
        // Calculate points
        uint256 usdValue = amount;
        uint256 multiplier = getMultiplier(lockDays);
        uint256 points = (usdValue * multiplier) / (10 * 1e18);
        
        // Create lock record for user
        uint256 lockId = userPUSDLocks[user].length;
        userPUSDLocks[user].push(PUSDLock({
            amount: amount,
            lockUntil: lockUntil,
            points: points,
            createdAt: block.timestamp,
            active: true
        }));
        
        userTotalPoints[user] += points;
        totalPoints += points;
        totalPUSDLocked += amount;
        totalPUSDLocks++;
        
        emit PUSDLocked(user, lockId, amount, lockDays, points, lockUntil);
    }

    function unlockPUSD(uint256 lockId) external nonReentrant {
        require(lockId < userPUSDLocks[msg.sender].length, "LockToEarnPool: Invalid lockId");
        
        PUSDLock storage lockRecord = userPUSDLocks[msg.sender][lockId];
        require(lockRecord.active, "LockToEarnPool: Already unlocked");
        require(
            block.timestamp >= lockRecord.lockUntil,
            "LockToEarnPool: Still locked"
        );
        
        uint256 amount = lockRecord.amount;
        
        userTotalPoints[msg.sender] -= lockRecord.points;
        totalPoints -= lockRecord.points;
        totalPUSDLocked -= amount;
        lockRecord.active = false;
        
        pusdToken.transfer(msg.sender, amount);
        
        emit PUSDUnlocked(msg.sender, lockId, amount);
        
        // Track transaction
        if (address(ecosystemTracker) != address(0)) {
            ecosystemTracker.recordTransaction(
                msg.sender,
                EcosystemTracker.TransactionType.Unlock,
                amount
            );
        }
    }

    function setOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "LockToEarnPool: Invalid address");
        oracle = OraclePriceFeed(_oracle);
    }

    function setPUSDToken(address _pusdToken) external onlyOwner {
        require(_pusdToken != address(0), "LockToEarnPool: Invalid address");
        pusdToken = PUSDToken(_pusdToken);
    }
}

