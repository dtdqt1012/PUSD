// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title POG NFT (Proof of Genesis)
 * @dev Soulbound NFT - Cannot be transferred except by dev/admin
 * Limited to 66 NFTs total - for users who complete 66-day check-in streak
 */
contract POGNFT is ERC721, Ownable, ReentrancyGuard {
    // Maximum supply: 66 NFTs
    uint256 public constant MAX_SUPPLY = 66;
    
    // Current supply
    uint256 public totalSupply;
    
    // Token counter
    uint256 private _tokenIdCounter;
    
    // Mapping: tokenId => minted timestamp
    mapping(uint256 => uint256) public mintedAt;
    
    // Mapping: user => tokenId (1 user = 1 POG NFT)
    mapping(address => uint256) public userToTokenId;
    
    // Mapping: tokenId => user
    mapping(uint256 => address) public tokenIdToUser;
    
    // Dev/Admin addresses that can transfer NFTs
    mapping(address => bool) public authorizedTransferrers;
    
    event POGMinted(address indexed user, uint256 indexed tokenId, uint256 timestamp);
    event POGTransferred(address indexed from, address indexed to, uint256 indexed tokenId);
    event AuthorizedTransferrerUpdated(address indexed account, bool authorized);

    constructor(address initialOwner) ERC721("Proof of Genesis", "POG") Ownable(initialOwner) {
        require(initialOwner != address(0), "POGNFT: Invalid owner");
        authorizedTransferrers[initialOwner] = true;
    }

    /**
     * @dev Mint POG NFT to user (only callable by DailyCheckIn contract)
     */
    function mint(address to) external onlyOwner nonReentrant returns (uint256) {
        require(totalSupply < MAX_SUPPLY, "POGNFT: Max supply reached");
        require(userToTokenId[to] == 0, "POGNFT: User already has POG NFT");
        require(to != address(0), "POGNFT: Invalid address");
        
        _tokenIdCounter++;
        uint256 tokenId = _tokenIdCounter;
        
        _safeMint(to, tokenId);
        
        totalSupply++;
        mintedAt[tokenId] = block.timestamp;
        userToTokenId[to] = tokenId;
        tokenIdToUser[tokenId] = to;
        
        emit POGMinted(to, tokenId, block.timestamp);
        
        return tokenId;
    }

    /**
     * @dev Override _update to prevent normal transfers
     * Only authorized transferrers (dev/admin) can transfer
     * OpenZeppelin ERC721 v5.0.0 uses _update(address to, uint256 tokenId, address auth)
     */
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        
        // Allow minting (from == address(0))
        if (from == address(0)) {
            return super._update(to, tokenId, auth);
        }
        
        // Allow transfers by authorized transferrers only
        require(
            authorizedTransferrers[msg.sender] || msg.sender == owner(),
            "POGNFT: Transfer not allowed (soulbound)"
        );
        
        // Update mappings
        if (to != address(0)) {
            require(userToTokenId[to] == 0, "POGNFT: Recipient already has POG NFT");
            userToTokenId[from] = 0;
            userToTokenId[to] = tokenId;
            tokenIdToUser[tokenId] = to;
        }
        
        address result = super._update(to, tokenId, auth);
        
        if (to != address(0) && from != address(0)) {
            emit POGTransferred(from, to, tokenId);
        }
        
        return result;
    }

    /**
     * @dev Transfer NFT from one user to another (dev/admin only)
     */
    function adminTransfer(address from, address to, uint256 tokenId) external {
        require(
            authorizedTransferrers[msg.sender] || msg.sender == owner(),
            "POGNFT: Not authorized"
        );
        require(ownerOf(tokenId) == from, "POGNFT: Token not owned by from");
        require(to != address(0), "POGNFT: Invalid recipient");
        require(userToTokenId[to] == 0, "POGNFT: Recipient already has POG NFT");
        
        // Update mappings
        userToTokenId[from] = 0;
        userToTokenId[to] = tokenId;
        tokenIdToUser[tokenId] = to;
        
        // Transfer
        _transfer(from, to, tokenId);
        
        emit POGTransferred(from, to, tokenId);
    }

    /**
     * @dev Set authorized transferrer (dev/admin)
     */
    function setAuthorizedTransferrer(address account, bool authorized) external onlyOwner {
        authorizedTransferrers[account] = authorized;
        emit AuthorizedTransferrerUpdated(account, authorized);
    }

    /**
     * @dev Get user's POG NFT token ID
     */
    function getUserPOGTokenId(address user) external view returns (uint256) {
        return userToTokenId[user];
    }

    /**
     * @dev Check if user has POG NFT
     */
    function hasPOG(address user) external view returns (bool) {
        return userToTokenId[user] != 0 && ownerOf(userToTokenId[user]) == user;
    }

    /**
     * @dev Get remaining supply
     */
    function getRemainingSupply() external view returns (uint256) {
        return MAX_SUPPLY - totalSupply;
    }
}

