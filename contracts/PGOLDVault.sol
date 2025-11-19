// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./PGOLDToken.sol";
import "./PUSD.sol";
import "./GoldOracle.sol";

contract PGOLDVault is Ownable, ReentrancyGuard {
    
    PGOLDToken public pgoldToken;
    PUSDToken public pusdToken;
    GoldOracle public oracle;
    
    // Fee in basis points (100 = 1%)
    uint256 public mintFeeBPS = 50; // 0.5%
    uint256 public redeemFeeBPS = 50; // 0.5%
    uint256 public constant BPS_DENOMINATOR = 10000;
    
    // Minimum amounts
    uint256 public minMintAmount = 10 * 1e18; // 10 PUSD minimum
    uint256 public minRedeemAmount = 1e15; // 0.001 PGOLD minimum
    
    // PUSD reserve for redeeming
    uint256 public totalPUSDReserve;
    
    // Circuit breaker
    bool public paused = false;
    uint256 public maxPriceChangeBPS = 500; // 5% max change per transaction
    
    event Minted(
        address indexed user,
        uint256 pusdAmount,
        uint256 pgoldMinted,
        uint256 fee,
        uint256 goldPrice
    );
    
    event Redeemed(
        address indexed user,
        uint256 pgoldAmount,
        uint256 pusdReturned,
        uint256 fee,
        uint256 goldPrice
    );
    
    event PUSDDeposited(
        address indexed depositor,
        uint256 amount,
        uint256 newReserve
    );
    
    event FeeUpdated(uint256 oldMintFee, uint256 newMintFee, uint256 oldRedeemFee, uint256 newRedeemFee);
    event MinAmountsUpdated(uint256 oldMinMint, uint256 newMinMint, uint256 oldMinRedeem, uint256 newMinRedeem);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event MaxPriceChangeUpdated(uint256 oldMax, uint256 newMax);

    constructor(
        address _pgoldToken,
        address _pusdToken,
        address _oracle,
        address initialOwner
    ) Ownable(initialOwner) {
        require(_pgoldToken != address(0), "PGOLDVault: Invalid PGOLD token");
        require(_pusdToken != address(0), "PGOLDVault: Invalid PUSD token");
        require(_oracle != address(0), "PGOLDVault: Invalid oracle");
        require(initialOwner != address(0), "PGOLDVault: Invalid owner");
        
        pgoldToken = PGOLDToken(_pgoldToken);
        pusdToken = PUSDToken(_pusdToken);
        oracle = GoldOracle(_oracle);
    }

    modifier whenNotPaused() {
        require(!paused, "PGOLDVault: Paused");
        _;
    }

    /**
     * @dev Mint PGOLD by sending PUSD
     * @param pusdAmount Amount of PUSD to send
     * @param minPGOLDOut Minimum PGOLD to receive (slippage protection)
     */
    function mintPGOLD(uint256 pusdAmount, uint256 minPGOLDOut) external nonReentrant whenNotPaused {
        require(pusdAmount >= minMintAmount, "PGOLDVault: Amount below minimum");
        
        // Get current gold price (8 decimals)
        uint256 goldPrice = oracle.getGoldPrice();
        
        // Calculate PGOLD amount: PUSD / Gold_Price
        // pusdAmount (18 decimals) / goldPrice (8 decimals) * 1e8 = PGOLD (18 decimals)
        uint256 pgoldAmount = (pusdAmount * 1e8) / goldPrice;
        
        require(pgoldAmount >= minPGOLDOut, "PGOLDVault: Slippage too high");
        
        // Calculate fee
        uint256 fee = (pusdAmount * mintFeeBPS) / BPS_DENOMINATOR;
        uint256 pusdAfterFee = pusdAmount - fee;
        
        // Recalculate PGOLD after fee
        uint256 pgoldToMint = (pusdAfterFee * 1e8) / goldPrice;
        
        // Transfer PUSD from user
        require(
            pusdToken.transferFrom(msg.sender, address(this), pusdAmount),
            "PGOLDVault: PUSD transfer failed"
        );
        
        // Add to reserve (including fee)
        totalPUSDReserve += pusdAmount;
        
        // Mint PGOLD to user
        pgoldToken.mint(msg.sender, pgoldToMint);
        
        emit Minted(msg.sender, pusdAmount, pgoldToMint, fee, goldPrice);
    }

    /**
     * @dev Redeem PGOLD to get PUSD back
     * @param pgoldAmount Amount of PGOLD to redeem
     * @param minPUSDOut Minimum PUSD to receive (slippage protection)
     */
    function redeemPGOLD(uint256 pgoldAmount, uint256 minPUSDOut) external nonReentrant whenNotPaused {
        require(pgoldAmount >= minRedeemAmount, "PGOLDVault: Amount below minimum");
        
        // Get current gold price (8 decimals)
        uint256 goldPrice = oracle.getGoldPrice();
        
        // Calculate PUSD amount: PGOLD * Gold_Price
        // pgoldAmount (18 decimals) * goldPrice (8 decimals) / 1e8 = PUSD (18 decimals)
        uint256 pusdAmount = (pgoldAmount * goldPrice) / 1e8;
        
        require(pusdAmount >= minPUSDOut, "PGOLDVault: Slippage too high");
        require(totalPUSDReserve >= pusdAmount, "PGOLDVault: Insufficient reserve");
        
        // Calculate fee
        uint256 fee = (pusdAmount * redeemFeeBPS) / BPS_DENOMINATOR;
        uint256 pusdToReturn = pusdAmount - fee;
        
        // Burn PGOLD from user
        pgoldToken.burnFrom(msg.sender, pgoldAmount);
        
        // Update reserve
        totalPUSDReserve -= pusdAmount;
        
        // Transfer PUSD to user
        require(
            pusdToken.transfer(msg.sender, pusdToReturn),
            "PGOLDVault: PUSD transfer failed"
        );
        
        emit Redeemed(msg.sender, pgoldAmount, pusdToReturn, fee, goldPrice);
    }

    /**
     * @dev Get amount of PGOLD that can be minted with given PUSD
     */
    function getMintablePGOLD(uint256 pusdAmount) external view returns (uint256) {
        uint256 goldPrice = oracle.getGoldPrice();
        uint256 pusdAfterFee = pusdAmount - ((pusdAmount * mintFeeBPS) / BPS_DENOMINATOR);
        return (pusdAfterFee * 1e8) / goldPrice;
    }

    /**
     * @dev Get amount of PUSD that can be redeemed with given PGOLD
     */
    function getRedeemablePUSD(uint256 pgoldAmount) external view returns (uint256) {
        uint256 goldPrice = oracle.getGoldPrice();
        uint256 pusdAmount = (pgoldAmount * goldPrice) / 1e8;
        uint256 fee = (pusdAmount * redeemFeeBPS) / BPS_DENOMINATOR;
        return pusdAmount - fee;
    }

    /**
     * @dev Get current gold price
     */
    function getGoldPrice() external view returns (uint256) {
        return oracle.getGoldPrice();
    }

    /**
     * @dev Get reserve ratio (PUSD Reserve / Total PGOLD Supply in USD)
     */
    function getReserveRatio() external view returns (uint256) {
        uint256 goldPrice = oracle.getGoldPrice();
        uint256 totalPGOLD = pgoldToken.totalSupply();
        if (totalPGOLD == 0) {
            return 0;
        }
        uint256 totalPGOLDValue = (totalPGOLD * goldPrice) / 1e8;
        if (totalPGOLDValue == 0) {
            return 0;
        }
        return (totalPUSDReserve * BPS_DENOMINATOR) / totalPGOLDValue;
    }

    /**
     * @dev Admin function to deposit PUSD into reserve
     * This allows admin to add liquidity to the reserve pool
     * @param amount Amount of PUSD to deposit
     */
    function depositPUSD(uint256 amount) external onlyOwner whenNotPaused {
        require(amount > 0, "PGOLDVault: Amount must be greater than 0");
        
        // Transfer PUSD from admin to vault
        require(
            pusdToken.transferFrom(msg.sender, address(this), amount),
            "PGOLDVault: PUSD transfer failed"
        );
        
        // Add to reserve
        totalPUSDReserve += amount;
        
        emit PUSDDeposited(msg.sender, amount, totalPUSDReserve);
    }

    /**
     * @dev Admin function to sync reserve with actual PUSD balance
     * Useful if PUSD was transferred directly to contract without using depositPUSD
     */
    function syncReserve() external onlyOwner {
        uint256 currentBalance = pusdToken.balanceOf(address(this));
        if (currentBalance > totalPUSDReserve) {
            uint256 difference = currentBalance - totalPUSDReserve;
            totalPUSDReserve = currentBalance;
            emit PUSDDeposited(msg.sender, difference, totalPUSDReserve);
        }
    }

    // Admin functions
    function setFees(uint256 _mintFeeBPS, uint256 _redeemFeeBPS) external onlyOwner {
        require(_mintFeeBPS <= 200, "PGOLDVault: Mint fee too high"); // Max 2%
        require(_redeemFeeBPS <= 200, "PGOLDVault: Redeem fee too high"); // Max 2%
        uint256 oldMintFee = mintFeeBPS;
        uint256 oldRedeemFee = redeemFeeBPS;
        mintFeeBPS = _mintFeeBPS;
        redeemFeeBPS = _redeemFeeBPS;
        emit FeeUpdated(oldMintFee, _mintFeeBPS, oldRedeemFee, _redeemFeeBPS);
    }

    function setMinAmounts(uint256 _minMint, uint256 _minRedeem) external onlyOwner {
        uint256 oldMinMint = minMintAmount;
        uint256 oldMinRedeem = minRedeemAmount;
        minMintAmount = _minMint;
        minRedeemAmount = _minRedeem;
        emit MinAmountsUpdated(oldMinMint, _minMint, oldMinRedeem, _minRedeem);
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setMaxPriceChange(uint256 _maxChangeBPS) external onlyOwner {
        require(_maxChangeBPS <= 1000, "PGOLDVault: Max change too high"); // Max 10%
        uint256 oldMax = maxPriceChangeBPS;
        maxPriceChangeBPS = _maxChangeBPS;
        emit MaxPriceChangeUpdated(oldMax, _maxChangeBPS);
    }

    function setPGOLDToken(address _pgoldToken) external onlyOwner {
        require(_pgoldToken != address(0), "PGOLDVault: Invalid address");
        pgoldToken = PGOLDToken(_pgoldToken);
    }

    function setPUSDToken(address _pusdToken) external onlyOwner {
        require(_pusdToken != address(0), "PGOLDVault: Invalid address");
        pusdToken = PUSDToken(_pusdToken);
    }

    function setOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "PGOLDVault: Invalid address");
        oracle = GoldOracle(_oracle);
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            (bool success, ) = payable(owner()).call{value: amount}("");
            require(success, "PGOLDVault: Transfer failed");
        } else {
            require(
                IERC20(token).transfer(owner(), amount),
                "PGOLDVault: Token transfer failed"
            );
        }
    }
}

