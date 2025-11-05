// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract ExtensionRegistry is Ownable {
    // Registered extensions
    mapping(address => bool) public registeredExtensions;
    
    // Extension metadata
    mapping(address => ExtensionInfo) public extensionInfo;
    
    struct ExtensionInfo {
        string name;
        string description;
        address owner;
        uint256 registeredAt;
        bool active;
    }
    
    // Events
    event ExtensionRegistered(
        address indexed extension,
        string name,
        address owner
    );
    
    event ExtensionActivated(address indexed extension, bool active);
    event ExtensionRemoved(address indexed extension);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function registerExtension(
        address extension,
        string memory name,
        string memory description
    ) external {
        require(
            !registeredExtensions[extension],
            "ExtensionRegistry: Already registered"
        );
        require(extension != address(0), "ExtensionRegistry: Invalid address");
        
        registeredExtensions[extension] = true;
        extensionInfo[extension] = ExtensionInfo({
            name: name,
            description: description,
            owner: msg.sender,
            registeredAt: block.timestamp,
            active: true
        });
        
        emit ExtensionRegistered(extension, name, msg.sender);
    }

    function setExtensionActive(address extension, bool active) external onlyOwner {
        require(
            registeredExtensions[extension],
            "ExtensionRegistry: Not registered"
        );
        
        extensionInfo[extension].active = active;
        emit ExtensionActivated(extension, active);
    }

    function removeExtension(address extension) external onlyOwner {
        require(
            registeredExtensions[extension],
            "ExtensionRegistry: Not registered"
        );
        
        registeredExtensions[extension] = false;
        delete extensionInfo[extension];
        
        emit ExtensionRemoved(extension);
    }

    function isValidExtension(address extension) external view returns (bool) {
        return registeredExtensions[extension] && extensionInfo[extension].active;
    }

    function getExtensionInfo(address extension)
        external
        view
        returns (ExtensionInfo memory)
    {
        return extensionInfo[extension];
    }
}

abstract contract PUSDIntegration {
    ExtensionRegistry public extensionRegistry;
    address public pusdToken;
    
    modifier onlyRegisteredExtension() {
        require(
            extensionRegistry.isValidExtension(address(this)),
            "PUSDIntegration: Not registered extension"
        );
        _;
    }
    
    constructor(address _extensionRegistry, address _pusdToken) {
        extensionRegistry = ExtensionRegistry(_extensionRegistry);
        pusdToken = _pusdToken;
    }
}

