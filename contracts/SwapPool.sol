// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./PUSD.sol";
import "./OraclePriceFeed.sol";

contract SwapPool is Ownable, ReentrancyGuard {
    PUSDToken public pusdToken;
    OraclePriceFeed public oracle;
    
    // Total POL reserves in pool
    uint256 public totalPOLReserves;
    
    // Swap fee (basis points, default 0.3% = 30)
    uint256 public swapFeeBPS = 30;
    uint256 public constant BPS_DENOMINATOR = 10000;
    
    // Fee recipient (can be RewardDistributor or treasury)
    address public feeRecipient;
    
    event SwappedPOLtoPUSD(
        address indexed user,
        uint256 polAmount,
        uint256 pusdAmount,
        uint256 fee
    );
    
    event SwappedPUSDtoPOL(
        address indexed user,
        uint256 pusdAmount,
        uint256 polAmount,
        uint256 fee
    );
    
    event SwapFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeRecipientUpdated(address oldRecipient, address newRecipient);
    event POLDeposited(address indexed depositor, uint256 amount);

    constructor(
        address _pusdToken,
        address _oracle,
        address _feeRecipient,
        address initialOwner
    ) Ownable(initialOwner) {
        require(_pusdToken != address(0), "SwapPool: Invalid PUSD token");
        require(_oracle != address(0), "SwapPool: Invalid oracle");
        require(initialOwner != address(0), "SwapPool: Invalid owner");
        pusdToken = PUSDToken(_pusdToken);
        oracle = OraclePriceFeed(_oracle);
        feeRecipient = _feeRecipient;
    }

    receive() external payable {
        // Accept POL for swapping
        // Note: Direct POL transfers are accepted but not tracked.
        // Use depositPOL() to properly deposit POL into the pool.
    }

    function depositPOL() external payable nonReentrant {
        require(msg.value > 0, "SwapPool: Must send POL");
        totalPOLReserves += msg.value;
        emit POLDeposited(msg.sender, msg.value);
    }

    function swapPOLtoPUSD(uint256 minPusdOut) external payable nonReentrant {
        require(msg.value > 0, "SwapPool: Must send POL");
        
        uint256 polAmount = msg.value;
        uint256 polPrice = oracle.getPOLPrice();
        uint256 pusdAmount = (polAmount * polPrice) / 1e8;
        uint256 fee = (pusdAmount * swapFeeBPS) / BPS_DENOMINATOR;
        uint256 pusdToUser = pusdAmount - fee;
        
        require(pusdToUser >= minPusdOut, "SwapPool: Slippage too high");
        
        pusdToken.mint(msg.sender, pusdToUser);
        
        if (fee > 0 && feeRecipient != address(0)) {
            uint256 feePol = (fee * 1e8) / polPrice;
            (bool feeSuccess, ) = payable(feeRecipient).call{value: feePol}("");
            require(feeSuccess, "SwapPool: Fee transfer failed");
            totalPOLReserves += polAmount - feePol;
        } else {
            totalPOLReserves += polAmount;
        }
        
        emit SwappedPOLtoPUSD(msg.sender, polAmount, pusdToUser, fee);
    }

    function swapPUSDtoPOL(uint256 pusdAmount, uint256 minPolOut) external nonReentrant {
        require(pusdAmount > 0, "SwapPool: Amount must be > 0");
        
        uint256 polPrice = oracle.getPOLPrice();
        uint256 polAmount = (pusdAmount * 1e8) / polPrice;
        
        require(
            address(this).balance >= polAmount,
            "SwapPool: Insufficient POL in pool"
        );
        
        uint256 fee = (polAmount * swapFeeBPS) / BPS_DENOMINATOR;
        uint256 polToUser = polAmount - fee;
        
        require(polToUser >= minPolOut, "SwapPool: Slippage too high");
        
        pusdToken.burnFrom(msg.sender, pusdAmount);
        
        if (fee > 0 && feeRecipient != address(0)) {
            (bool feeSuccess, ) = payable(feeRecipient).call{value: fee}("");
            require(feeSuccess, "SwapPool: Fee transfer failed");
        }
        
        totalPOLReserves -= polAmount;
        (bool success, ) = payable(msg.sender).call{value: polToUser}("");
        require(success, "SwapPool: Transfer failed");
        
        emit SwappedPUSDtoPOL(msg.sender, pusdAmount, polToUser, fee);
    }

    function getPOLtoPUSDQuote(uint256 polAmount) external view returns (uint256 pusdAmount, uint256 fee) {
        uint256 polPrice = oracle.getPOLPrice();
        pusdAmount = (polAmount * polPrice) / 1e8;
        fee = (pusdAmount * swapFeeBPS) / BPS_DENOMINATOR;
        pusdAmount = pusdAmount - fee;
    }

    function getPUSDtoPOLQuote(uint256 pusdAmount) external view returns (uint256 polAmount, uint256 fee) {
        uint256 polPrice = oracle.getPOLPrice();
        polAmount = (pusdAmount * 1e8) / polPrice;
        fee = (polAmount * swapFeeBPS) / BPS_DENOMINATOR;
        polAmount = polAmount - fee;
    }

    function setSwapFee(uint256 _feeBPS) external onlyOwner {
        require(_feeBPS <= 1000, "SwapPool: Fee too high (max 10%)");
        uint256 oldFee = swapFeeBPS;
        swapFeeBPS = _feeBPS;
        emit SwapFeeUpdated(oldFee, _feeBPS);
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        address oldRecipient = feeRecipient;
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(oldRecipient, _feeRecipient);
    }

    function setPUSDToken(address _pusdToken) external onlyOwner {
        require(_pusdToken != address(0), "SwapPool: Invalid address");
        pusdToken = PUSDToken(_pusdToken);
    }

    function setOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "SwapPool: Invalid address");
        oracle = OraclePriceFeed(_oracle);
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}

