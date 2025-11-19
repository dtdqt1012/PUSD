// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract PGOLDToken is ERC20, Ownable, ReentrancyGuard {
    // Minter role - only PGOLDVault can mint
    mapping(address => bool) public minters;
    
    // Burner role - only PGOLDVault can burn
    mapping(address => bool) public burners;
    
    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);
    event BurnerAdded(address indexed burner);
    event BurnerRemoved(address indexed burner);

    constructor(address initialOwner) ERC20("POLYGON GOLD", "PGOLD") Ownable(initialOwner) {
        require(initialOwner != address(0), "PGOLD: Invalid owner");
    }

    function mint(address to, uint256 amount) external {
        require(minters[msg.sender], "PGOLD: Only minters can mint");
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    function burnFrom(address from, uint256 amount) external {
        require(burners[msg.sender] || from == msg.sender, "PGOLD: Cannot burn");
        _spendAllowance(from, msg.sender, amount);
        _burn(from, amount);
    }

    function addMinter(address minter) external onlyOwner {
        require(minter != address(0), "PGOLD: Invalid address");
        minters[minter] = true;
        emit MinterAdded(minter);
    }

    function removeMinter(address minter) external onlyOwner {
        require(minter != address(0), "PGOLD: Invalid address");
        minters[minter] = false;
        emit MinterRemoved(minter);
    }

    function addBurner(address burner) external onlyOwner {
        require(burner != address(0), "PGOLD: Invalid address");
        burners[burner] = true;
        emit BurnerAdded(burner);
    }

    function removeBurner(address burner) external onlyOwner {
        require(burner != address(0), "PGOLD: Invalid address");
        burners[burner] = false;
        emit BurnerRemoved(burner);
    }
}

