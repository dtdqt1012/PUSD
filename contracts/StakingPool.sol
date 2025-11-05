// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./OraclePriceFeed.sol";
import "./PUSD.sol";

contract StakingPool is Ownable, ReentrancyGuard {
    OraclePriceFeed public oracle;
    PUSDToken public pusdToken;
    
    // Native POL (native token of Polygon)
    address public constant NATIVE_POL = address(0);
    
    // Minimum lock period: 30 days
    uint256 public constant MIN_LOCK_DAYS = 30;
    
    // Whitelist for contracts allowed to stake on behalf of user (like MintingVault)
    mapping(address => bool) public authorizedStakers;
    
    // Stake record for POL
    struct Stake {
        uint256 amount;        // Amount POL staked (wei)
        uint256 lockUntil;     // Timestamp when unlock
        uint256 points;        // Points earned
        uint256 createdAt;     // Timestamp when staked
        bool active;           // Still active
    }
    
    // Stake record for PUSD
    struct PUSDStake {
        uint256 amount;        // Amount PUSD staked (wei)
        uint256 lockUntil;     // Timestamp when unlock
        uint256 points;        // Points earned
        uint256 createdAt;     // Timestamp when staked
        bool active;           // Still active
    }
    
    // User stakes
    mapping(address => Stake[]) public userStakes;
    mapping(address => PUSDStake[]) public userPUSDStakes;
    
    // Total points per user
    mapping(address => uint256) public userTotalPoints;
    
    // Total POL staked
    uint256 public totalStaked;
    
    // Total PUSD staked
    uint256 public totalPUSDStaked;
    
    // Stake counter
    uint256 public totalStakes;
    uint256 public totalPUSDStakes;
    
    // Total points across all users
    uint256 public totalPoints;
    
    event Staked(
        address indexed user,
        uint256 indexed stakeId,
        uint256 amount,
        uint256 lockDays,
        uint256 points,
        uint256 unlockAt
    );
    
    event PUSDStaked(
        address indexed user,
        uint256 indexed stakeId,
        uint256 amount,
        uint256 lockDays,
        uint256 points,
        uint256 unlockAt
    );
    
    event Unstaked(
        address indexed user,
        uint256 indexed stakeId,
        uint256 amount
    );
    
    event PUSDUnstaked(
        address indexed user,
        uint256 indexed stakeId,
        uint256 amount
    );
    
    event LockExtended(
        address indexed user,
        uint256 indexed stakeId,
        uint256 newLockDays,
        uint256 newPoints
    );

    constructor(address _oracle, address _pusdToken, address initialOwner) Ownable(initialOwner) {
        require(_oracle != address(0), "StakingPool: Invalid oracle");
        require(_pusdToken != address(0), "StakingPool: Invalid PUSD token");
        require(initialOwner != address(0), "StakingPool: Invalid owner");
        oracle = OraclePriceFeed(_oracle);
        pusdToken = PUSDToken(_pusdToken);
    }

    function setAuthorizedStaker(address staker, bool authorized) external onlyOwner {
        authorizedStakers[staker] = authorized;
    }

    receive() external payable {
        // Accept POL transfers
    }

    function stake(uint256 lockDays) external payable nonReentrant {
        require(msg.value > 0, "StakingPool: Must stake > 0");
        require(lockDays >= MIN_LOCK_DAYS, "StakingPool: Lock period < 30 days");
        
        uint256 amount = msg.value;
        uint256 lockUntil = block.timestamp + (lockDays * 1 days);
        
        // Calculate points
        uint256 points = calculatePoints(amount, lockDays);
        
        // Create stake record
        uint256 stakeId = userStakes[msg.sender].length;
        userStakes[msg.sender].push(Stake({
            amount: amount,
            lockUntil: lockUntil,
            points: points,
            createdAt: block.timestamp,
            active: true
        }));
        
        // Update totals
        userTotalPoints[msg.sender] += points;
        totalPoints += points;
        totalStaked += amount;
        totalStakes++;
        
        emit Staked(msg.sender, stakeId, amount, lockDays, points, lockUntil);
    }

    function stakeFor(address user, uint256 lockDays) external payable nonReentrant {
        require(
            authorizedStakers[msg.sender] || msg.sender == owner(),
            "StakingPool: Not authorized"
        );
        require(msg.value > 0, "StakingPool: Must stake > 0");
        require(lockDays >= MIN_LOCK_DAYS, "StakingPool: Lock period < 30 days");
        require(user != address(0), "StakingPool: Invalid user");
        
        uint256 amount = msg.value;
        uint256 lockUntil = block.timestamp + (lockDays * 1 days);
        
        // Calculate points
        uint256 points = calculatePoints(amount, lockDays);
        
        // Create stake record for user
        uint256 stakeId = userStakes[user].length;
        userStakes[user].push(Stake({
            amount: amount,
            lockUntil: lockUntil,
            points: points,
            createdAt: block.timestamp,
            active: true
        }));
        
        // Update totals
        userTotalPoints[user] += points;
        totalPoints += points;
        totalStaked += amount;
        totalStakes++;
        
        emit Staked(user, stakeId, amount, lockDays, points, lockUntil);
    }

    function unstake(uint256 stakeId) external nonReentrant {
        require(stakeId < userStakes[msg.sender].length, "StakingPool: Invalid stakeId");
        
        Stake storage stakeRecord = userStakes[msg.sender][stakeId];
        require(stakeRecord.active, "StakingPool: Already unstaked");
        require(
            block.timestamp >= stakeRecord.lockUntil,
            "StakingPool: Still locked"
        );
        
        uint256 amount = stakeRecord.amount;
        
        // Update totals
        userTotalPoints[msg.sender] -= stakeRecord.points;
        totalPoints -= stakeRecord.points;
        totalStaked -= amount;
        stakeRecord.active = false;
        
        // Transfer POL back
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "StakingPool: Transfer failed");
        
        emit Unstaked(msg.sender, stakeId, amount);
    }

    function extendLock(uint256 stakeId, uint256 additionalDays) external nonReentrant {
        require(stakeId < userStakes[msg.sender].length, "StakingPool: Invalid stakeId");
        require(additionalDays > 0, "StakingPool: Additional days must be > 0");
        
        Stake storage stakeRecord = userStakes[msg.sender][stakeId];
        require(stakeRecord.active, "StakingPool: Stake not active");
        
        uint256 newLockUntil = stakeRecord.lockUntil + (additionalDays * 1 days);
        uint256 totalLockDays = (newLockUntil - stakeRecord.createdAt) / 1 days;
        
        // Recalculate points with new lock period
        uint256 newPoints = calculatePoints(stakeRecord.amount, totalLockDays);
        
        // Update
        uint256 oldPoints = stakeRecord.points;
        userTotalPoints[msg.sender] = userTotalPoints[msg.sender] - oldPoints + newPoints;
        totalPoints = totalPoints - oldPoints + newPoints;
        
        stakeRecord.points = newPoints;
        stakeRecord.lockUntil = newLockUntil;
        
        emit LockExtended(msg.sender, stakeId, totalLockDays, newPoints);
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

    function getUserStakeCount(address user) external view returns (uint256) {
        return userStakes[user].length;
    }

    function getUserStake(address user, uint256 stakeId) external view returns (Stake memory) {
        return userStakes[user][stakeId];
    }

    function getUserActiveStakes(address user) external view returns (Stake[] memory) {
        Stake[] memory allStakes = userStakes[user];
        uint256 activeCount = 0;
        
        // Count active stakes
        for (uint256 i = 0; i < allStakes.length; i++) {
            if (allStakes[i].active) activeCount++;
        }
        
        // Filter active stakes
        Stake[] memory activeStakes = new Stake[](activeCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < allStakes.length; i++) {
            if (allStakes[i].active) {
                activeStakes[idx] = allStakes[i];
                idx++;
            }
        }
        
        return activeStakes;
    }

    function stakePUSD(uint256 amount, uint256 lockDays) external nonReentrant {
        require(amount > 0, "StakingPool: Must stake > 0");
        require(lockDays >= MIN_LOCK_DAYS, "StakingPool: Lock period < 30 days");
        
        pusdToken.transferFrom(msg.sender, address(this), amount);
        uint256 lockUntil = block.timestamp + (lockDays * 1 days);
        
        uint256 points = calculatePUSDPoints(amount, lockDays);
        
        uint256 stakeId = userPUSDStakes[msg.sender].length;
        userPUSDStakes[msg.sender].push(PUSDStake({
            amount: amount,
            lockUntil: lockUntil,
            points: points,
            createdAt: block.timestamp,
            active: true
        }));
        
        userTotalPoints[msg.sender] += points;
        totalPoints += points;
        totalPUSDStaked += amount;
        totalPUSDStakes++;
        
        emit PUSDStaked(msg.sender, stakeId, amount, lockDays, points, lockUntil);
    }

    function stakePUSDFor(address user, uint256 amount, uint256 lockDays) external nonReentrant {
        require(
            authorizedStakers[msg.sender] || msg.sender == owner(),
            "StakingPool: Not authorized"
        );
        require(amount > 0, "StakingPool: Must stake > 0");
        require(lockDays >= MIN_LOCK_DAYS, "StakingPool: Lock period < 30 days");
        require(user != address(0), "StakingPool: Invalid user");
        
        pusdToken.transferFrom(msg.sender, address(this), amount);
        uint256 lockUntil = block.timestamp + (lockDays * 1 days);
        
        uint256 points = calculatePUSDPoints(amount, lockDays);
        
        uint256 stakeId = userPUSDStakes[user].length;
        userPUSDStakes[user].push(PUSDStake({
            amount: amount,
            lockUntil: lockUntil,
            points: points,
            createdAt: block.timestamp,
            active: true
        }));
        
        userTotalPoints[user] += points;
        totalPoints += points;
        totalPUSDStaked += amount;
        totalPUSDStakes++;
        
        emit PUSDStaked(user, stakeId, amount, lockDays, points, lockUntil);
    }

    function unstakePUSD(uint256 stakeId) external nonReentrant {
        require(stakeId < userPUSDStakes[msg.sender].length, "StakingPool: Invalid stakeId");
        
        PUSDStake storage stakeRecord = userPUSDStakes[msg.sender][stakeId];
        require(stakeRecord.active, "StakingPool: Already unstaked");
        require(
            block.timestamp >= stakeRecord.lockUntil,
            "StakingPool: Still locked"
        );
        
        uint256 amount = stakeRecord.amount;
        
        userTotalPoints[msg.sender] -= stakeRecord.points;
        totalPoints -= stakeRecord.points;
        totalPUSDStaked -= amount;
        stakeRecord.active = false;
        
        pusdToken.transfer(msg.sender, amount);
        
        emit PUSDUnstaked(msg.sender, stakeId, amount);
    }

    function calculatePUSDPoints(uint256 pusdAmount, uint256 lockDays) public pure returns (uint256) {
        // PUSD is already in USD value (1 PUSD = $1)
        // pusdAmount is 18 decimals, represents USD value
        uint256 usdValue = pusdAmount;
        
        uint256 multiplier = getMultiplier(lockDays);
        
        return (usdValue * multiplier) / (10 * 1e18);
    }

    function getUserPUSDStakeCount(address user) external view returns (uint256) {
        return userPUSDStakes[user].length;
    }

    function getUserPUSDStake(address user, uint256 stakeId) external view returns (PUSDStake memory) {
        return userPUSDStakes[user][stakeId];
    }

    function getUserActivePUSDStakes(address user) external view returns (PUSDStake[] memory) {
        PUSDStake[] memory allStakes = userPUSDStakes[user];
        uint256 activeCount = 0;
        
        for (uint256 i = 0; i < allStakes.length; i++) {
            if (allStakes[i].active) activeCount++;
        }
        
        PUSDStake[] memory activeStakes = new PUSDStake[](activeCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < allStakes.length; i++) {
            if (allStakes[i].active) {
                activeStakes[idx] = allStakes[i];
                idx++;
            }
        }
        
        return activeStakes;
    }

    function setOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "StakingPool: Invalid address");
        oracle = OraclePriceFeed(_oracle);
    }

    function setPUSDToken(address _pusdToken) external onlyOwner {
        require(_pusdToken != address(0), "StakingPool: Invalid address");
        pusdToken = PUSDToken(_pusdToken);
    }
}

