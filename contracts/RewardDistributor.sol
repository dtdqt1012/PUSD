// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./PUSD.sol";
import "./StakingPool.sol";

contract RewardDistributor is Ownable, ReentrancyGuard {
    PUSDToken public pusdToken;
    StakingPool public stakingPool;
    
    // Conversion rate: 1 point = X PUSD (with 18 decimals)
    // Default = 0 (not set, admin must set after deployment)
    uint256 public pointsToPusdRate = 0;
    
    // Total PUSD available for distribution
    uint256 public totalRewardPool;
    
    // Track claimed rewards per user
    mapping(address => uint256) public claimedRewards;
    
    // Whitelist for external projects that can deposit
    mapping(address => bool) public whitelistedProjects;
    
    // Total claimed rewards
    uint256 public totalClaimedRewards;
    
    event RewardsClaimed(address indexed user, uint256 amount);
    event RewardDeposited(address indexed depositor, uint256 amount, string project);
    event RateUpdated(uint256 oldRate, uint256 newRate);
    event ProjectWhitelisted(address indexed project, bool status);

    constructor(
        address _pusdToken,
        address _stakingPool,
        address initialOwner
    ) Ownable(initialOwner) {
        require(_pusdToken != address(0), "RewardDistributor: Invalid PUSD token");
        require(_stakingPool != address(0), "RewardDistributor: Invalid staking pool");
        require(initialOwner != address(0), "RewardDistributor: Invalid owner");
        pusdToken = PUSDToken(_pusdToken);
        stakingPool = StakingPool(payable(_stakingPool));
    }

    function depositRewards(string memory projectName) external nonReentrant {
        require(
            whitelistedProjects[msg.sender] || msg.sender == owner(),
            "RewardDistributor: Not whitelisted or owner"
        );
        
        uint256 balance = pusdToken.balanceOf(msg.sender);
        require(balance > 0, "RewardDistributor: No balance");
        
        // Transfer PUSD from project to contract
        pusdToken.transferFrom(msg.sender, address(this), balance);
        
        totalRewardPool += balance;
        
        emit RewardDeposited(msg.sender, balance, projectName);
    }

    function depositRewardsAmount(uint256 amount, string memory projectName) external nonReentrant {
        require(
            whitelistedProjects[msg.sender] || msg.sender == owner(),
            "RewardDistributor: Not whitelisted or owner"
        );
        
        require(amount > 0, "RewardDistributor: Amount must be > 0");
        
        pusdToken.transferFrom(msg.sender, address(this), amount);
        
        totalRewardPool += amount;
        
        emit RewardDeposited(msg.sender, amount, projectName);
    }

    function claimRewards() external nonReentrant {
        require(pointsToPusdRate > 0, "RewardDistributor: Rate not set by admin");
        
        uint256 userPoints = stakingPool.getUserTotalPoints(msg.sender);
        require(userPoints > 0, "RewardDistributor: No points to claim");
        
        // Calculate total rewards based on current rate on contract
        // totalRewards = userPoints * pointsToPusdRate / 1e18
        uint256 totalRewards = (userPoints * pointsToPusdRate) / 1e18;
        
        // Calculate claimable (subtract already claimed)
        uint256 claimable = totalRewards - claimedRewards[msg.sender];
        
        require(claimable > 0, "RewardDistributor: No claimable rewards");
        require(
            claimable <= totalRewardPool,
            "RewardDistributor: Insufficient reward pool"
        );
        
        // Update tracking
        claimedRewards[msg.sender] = totalRewards;
        totalClaimedRewards += claimable;
        totalRewardPool -= claimable;
        
        // Transfer PUSD
        pusdToken.transfer(msg.sender, claimable);
        
        emit RewardsClaimed(msg.sender, claimable);
    }

    function getClaimableRewards(address user) external view returns (uint256) {
        // If rate not set, return 0
        if (pointsToPusdRate == 0) return 0;
        
        uint256 userPoints = stakingPool.getUserTotalPoints(user);
        if (userPoints == 0) return 0;
        
        uint256 totalRewards = (userPoints * pointsToPusdRate) / 1e18;
        uint256 claimable = totalRewards - claimedRewards[user];
        
        // If claimable > totalRewardPool, only return available amount
        return claimable > totalRewardPool ? totalRewardPool : claimable;
    }

    function setPointsToPusdRate(uint256 newRate) external onlyOwner {
        require(newRate > 0, "RewardDistributor: Rate must be > 0");
        
        uint256 oldRate = pointsToPusdRate;
        pointsToPusdRate = newRate;
        
        emit RateUpdated(oldRate, newRate);
    }

    function getPointsToPusdRate() external view returns (uint256) {
        return pointsToPusdRate;
    }

    function setWhitelistedProject(address project, bool status) external onlyOwner {
        whitelistedProjects[project] = status;
        emit ProjectWhitelisted(project, status);
    }

    function batchWhitelistProjects(address[] calldata projects, bool[] calldata statuses) external onlyOwner {
        require(projects.length == statuses.length, "RewardDistributor: Array length mismatch");
        
        for (uint256 i = 0; i < projects.length; i++) {
            whitelistedProjects[projects[i]] = statuses[i];
            emit ProjectWhitelisted(projects[i], statuses[i]);
        }
    }

    function emergencyWithdraw(uint256 amount) external onlyOwner {
        require(amount <= totalRewardPool, "RewardDistributor: Insufficient balance");
        
        totalRewardPool -= amount;
        pusdToken.transfer(owner(), amount);
    }

    receive() external payable {
        // Accept POL/ETH transfers (e.g., from SwapPool fees)
        // Owner can convert to PUSD and deposit as rewards later
    }
}

