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

    uint256 public launchFee = 1e18; 

    uint256 public totalTokensCreated;

    mapping(address => LaunchInfo) public launches;

    struct LaunchInfo {
        address creator;            
        uint128 totalSupply;         
        uint128 launchFeePaid;       
        uint64 createdAt;           
        bool isActive;              
        string name;                
        string symbol;               
    }
    
    event TokenCreated(
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        uint256 totalSupply,
        uint256 launchFee
    );

    function _isValidUrl(string memory url) private pure returns (bool) {
        bytes memory urlBytes = bytes(url);
        if (urlBytes.length == 0) return false;
        
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

        bool isOwnerLaunch = (msg.sender == owner()) || (initialOwner == owner());
        if (!isOwnerLaunch) {
            require(
                pusdToken.transferFrom(msg.sender, address(this), launchFee),
                "TokenFactory: Launch fee transfer failed"
            );
            pusdToken.burn(launchFee);
        }

        MemeToken newToken = new MemeToken(name, symbol, totalSupply, msg.sender);
        tokenAddress = address(newToken);

        launches[tokenAddress] = LaunchInfo({
            creator: msg.sender,
            totalSupply: uint128(totalSupply),
            launchFeePaid: uint128(isOwnerLaunch ? 0 : launchFee),
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

