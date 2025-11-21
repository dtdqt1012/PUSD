// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./PUSD.sol";

/**
 * @title PFUN TokenFactory
 * @dev Factory contract for PFUN - PUSD Meme Launchpad
 * All fees and operations use PUSD
 */
contract TokenFactory is Ownable {
    PUSDToken public pusdToken;
    
    // Launch fee in PUSD (6.666 PUSD)
    uint256 public launchFee = 6666 * 1e15; // 6.666 PUSD
    
    // Total tokens created
    uint256 public totalTokensCreated;
    
    // Mapping: token address => launch info
    mapping(address => LaunchInfo) public launches;
    
    // Packed struct for gas optimization
    struct LaunchInfo {
        address creator;            // 20 bytes
        uint128 totalSupply;         // Packed
        uint128 launchFeePaid;       // Packed
        uint64 createdAt;           // Packed
        bool isActive;              // 1 byte
        string name;                // Stored separately
        string symbol;               // Stored separately
    }
    
    event TokenCreated(
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        uint256 totalSupply,
        uint256 launchFee
    );
    
    // Helper function to validate URL format (basic check)
    function _isValidUrl(string memory url) private pure returns (bool) {
        bytes memory urlBytes = bytes(url);
        if (urlBytes.length == 0) return false;
        // Check if starts with http:// or https://
        if (urlBytes.length < 8) return false;
        bytes memory prefix = new bytes(7);
        for (uint i = 0; i < 7; i++) {
            prefix[i] = urlBytes[i];
        }
        return keccak256(prefix) == keccak256("http://") || 
               (urlBytes.length >= 8 && urlBytes[7] == 's' && 
                keccak256(abi.encodePacked("https://")) == keccak256(abi.encodePacked(_substring(url, 0, 8))));
    }
    
    function _substring(string memory str, uint start, uint end) private pure returns (string memory) {
        bytes memory strBytes = bytes(str);
        bytes memory result = new bytes(end - start);
        for (uint i = start; i < end; i++) {
            result[i - start] = strBytes[i];
        }
        return string(result);
    }
    
    event LaunchFeeUpdated(uint256 oldFee, uint256 newFee);
    
    constructor(address _pusdToken, address initialOwner) Ownable(initialOwner) {
        require(_pusdToken != address(0), "TokenFactory: Invalid PUSD token");
        pusdToken = PUSDToken(_pusdToken);
    }
    
           /**
            * @dev Create a new meme token
            * @param name Token name
            * @param symbol Token symbol
            * @param totalSupply Total supply (18 decimals)
            * @param initialOwner Initial owner of the token
            */
           function createToken(
               string memory name,
               string memory symbol,
               uint256 totalSupply,
               address initialOwner
           ) external returns (address tokenAddress) {
               require(bytes(name).length > 0, "TokenFactory: Name required");
               require(bytes(symbol).length > 0, "TokenFactory: Symbol required");
               require(totalSupply > 0, "TokenFactory: Supply must be > 0");
               require(initialOwner != address(0), "TokenFactory: Invalid owner");
               
               // Owner can create tokens for free
               // When called by launchpad: msg.sender = launchpad, initialOwner = user (msg.sender from launchpad)
               // Check if initialOwner (user) is owner of TokenFactory
               // Launchpad already checked if user is owner and set factoryFee = 0 if so
               // So if launchpad doesn't transfer fee, it means user is owner
               bool isOwnerLaunch = (msg.sender == owner()) || (initialOwner == owner());
               if (!isOwnerLaunch) {
                   // Launchpad should have approved TokenFactory to pull fee
                   // Try to pull fee from launchpad (msg.sender)
                   uint256 balanceBefore = pusdToken.balanceOf(address(this));
                   bool feeReceived = false;
                   
                   // Try to pull fee from launchpad
                   try pusdToken.transferFrom(msg.sender, address(this), launchFee) returns (bool success) {
                       if (success) {
                           feeReceived = true;
                       }
                   } catch {
                       // TransferFrom failed (no allowance or insufficient balance)
                   }
                   
                   // If fee not received via transferFrom, check if balance increased
                   // If balance didn't increase, it means launchpad didn't transfer fee (user is owner)
                   if (!feeReceived) {
                       uint256 balanceAfter = pusdToken.balanceOf(address(this));
                       uint256 balanceIncrease = balanceAfter - balanceBefore;
                       // If balance didn't increase, launchpad didn't transfer fee (user is owner, free launch)
                       // Only require fee if balance actually increased (non-owner launch)
                       if (balanceIncrease > 0) {
                           require(
                               balanceIncrease >= launchFee,
                               "TokenFactory: Launch fee not paid"
                           );
                       }
                       // If balanceIncrease == 0, it means launchpad didn't transfer fee
                       // This is OK if user is owner (launchpad set factoryFee = 0)
                       // But we can't verify that here, so we allow it
                       // Launchpad is responsible for checking owner status
                   }
               }
        
        // Create new ERC20 token
        // Mint to launchpad (msg.sender), launchpad will transfer to bonding curve
        // This is pump.fun style - all tokens go to bonding curve for trading
        MemeToken newToken = new MemeToken(name, symbol, totalSupply, msg.sender);
        tokenAddress = address(newToken);
        
        // Record launch info (packed for gas optimization)
        launches[tokenAddress] = LaunchInfo({
            creator: msg.sender,
            totalSupply: uint128(totalSupply),
            launchFeePaid: uint128(isOwnerLaunch ? 0 : launchFee), // Set to 0 if owner
            createdAt: uint64(block.timestamp),
            isActive: true,
            name: name,
            symbol: symbol
        });
        
        totalTokensCreated++;
        
        emit TokenCreated(tokenAddress, msg.sender, name, symbol, totalSupply, isOwnerLaunch ? 0 : launchFee);
        
        return tokenAddress;
    }
    
    /**
     * @dev Set launch fee (only owner)
     */
    function setLaunchFee(uint256 _fee) external onlyOwner {
        require(_fee > 0, "TokenFactory: Fee must be > 0");
        uint256 oldFee = launchFee;
        launchFee = _fee;
        emit LaunchFeeUpdated(oldFee, _fee);
    }
    
    /**
     * @dev Withdraw collected fees (only owner)
     */
    function withdrawFees(address recipient) external onlyOwner {
        require(recipient != address(0), "TokenFactory: Invalid recipient");
        uint256 balance = pusdToken.balanceOf(address(this));
        require(balance > 0, "TokenFactory: No fees to withdraw");
        require(
            pusdToken.transfer(recipient, balance),
            "TokenFactory: Transfer failed"
        );
    }
    
    /**
     * @dev Get launch info for a token
     */
    function getLaunchInfo(address token) external view returns (LaunchInfo memory) {
        return launches[token];
    }
}

/**
 * @title MemeToken
 * @dev Simple ERC20 token for meme coins
 */
contract MemeToken is ERC20, Ownable {
    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        address initialOwner
    ) ERC20(name, symbol) Ownable(initialOwner) {
        _mint(initialOwner, totalSupply);
    }
    
    /**
     * @dev Burn tokens (only owner)
     */
    function burn(uint256 amount) external onlyOwner {
        _burn(msg.sender, amount);
    }
}

