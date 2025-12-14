// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Ecosystem Transaction Tracker
 * @dev Track total transactions across PUSD ecosystem
 */
contract EcosystemTracker is Ownable, ReentrancyGuard {
    // Total transactions across ecosystem
    uint256 public totalTransactions;
    
    // Transactions per user
    mapping(address => uint256) public userTransactions;
    
    // Transaction types
    enum TransactionType {
        Mint,           // Mint PUSD
        Redeem,         // Redeem PUSD
        Lock,           // Lock POL/PUSD
        Unlock,         // Unlock POL/PUSD
        Swap,           // Swap POL/PUSD
        Lottery,        // Buy lottery tickets
        ClaimReward,    // Claim rewards
        CheckIn,        // Daily check-in
        Other           // Other transactions
    }
    
    // Transactions per type
    mapping(TransactionType => uint256) public transactionsByType;
    
    // Authorized contracts that can record transactions
    mapping(address => bool) public authorizedRecorders;
    
    // Transaction record
    struct Transaction {
        address user;
        TransactionType txType;
        uint256 amount;
        uint256 timestamp;
    }
    
    // Recent transactions (last 1000)
    Transaction[] public recentTransactions;
    uint256 public constant MAX_RECENT_TRANSACTIONS = 1000;
    
    // Events
    event TransactionRecorded(
        address indexed user,
        TransactionType txType,
        uint256 amount,
        uint256 timestamp
    );
    event AuthorizedRecorderUpdated(address indexed account, bool authorized);

    constructor(address initialOwner) Ownable(initialOwner) {
        require(initialOwner != address(0), "EcosystemTracker: Invalid owner");
    }

    /**
     * @dev Record a transaction (only authorized contracts)
     */
    function recordTransaction(
        address user,
        TransactionType txType,
        uint256 amount
    ) external {
        require(
            authorizedRecorders[msg.sender] || msg.sender == owner(),
            "EcosystemTracker: Not authorized"
        );
        require(user != address(0), "EcosystemTracker: Invalid user");
        
        totalTransactions++;
        userTransactions[user]++;
        transactionsByType[txType]++;
        
        // Add to recent transactions
        if (recentTransactions.length >= MAX_RECENT_TRANSACTIONS) {
            // Remove oldest (shift array)
            for (uint256 i = 0; i < recentTransactions.length - 1; i++) {
                recentTransactions[i] = recentTransactions[i + 1];
            }
            recentTransactions.pop();
        }
        
        recentTransactions.push(Transaction({
            user: user,
            txType: txType,
            amount: amount,
            timestamp: block.timestamp
        }));
        
        emit TransactionRecorded(user, txType, amount, block.timestamp);
    }

    /**
     * @dev Get user's transaction count
     */
    function getUserTransactionCount(address user) external view returns (uint256) {
        return userTransactions[user];
    }

    /**
     * @dev Get transactions by type
     */
    function getTransactionsByType(TransactionType txType) external view returns (uint256) {
        return transactionsByType[txType];
    }

    /**
     * @dev Get recent transactions
     */
    function getRecentTransactions(uint256 count) external view returns (Transaction[] memory) {
        uint256 length = recentTransactions.length;
        if (count > length) {
            count = length;
        }
        
        Transaction[] memory result = new Transaction[](count);
        uint256 startIndex = length - count;
        
        for (uint256 i = 0; i < count; i++) {
            result[i] = recentTransactions[startIndex + i];
        }
        
        return result;
    }

    /**
     * @dev Set authorized recorder
     */
    function setAuthorizedRecorder(address account, bool authorized) external onlyOwner {
        authorizedRecorders[account] = authorized;
        emit AuthorizedRecorderUpdated(account, authorized);
    }

    /**
     * @dev Batch set authorized recorders
     */
    function batchSetAuthorizedRecorders(
        address[] calldata accounts,
        bool[] calldata authorizations
    ) external onlyOwner {
        require(
            accounts.length == authorizations.length,
            "EcosystemTracker: Array length mismatch"
        );
        
        for (uint256 i = 0; i < accounts.length; i++) {
            authorizedRecorders[accounts[i]] = authorizations[i];
            emit AuthorizedRecorderUpdated(accounts[i], authorizations[i]);
        }
    }
}

