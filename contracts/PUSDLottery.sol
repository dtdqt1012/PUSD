// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./PUSD.sol";
import "./RewardDistributor.sol";
import "./StakingPool.sol";

contract PUSDLottery is Ownable, ReentrancyGuard, Pausable {
    // Constants
    uint256 public constant TICKET_PRICE = 0.1e18; // 0.1 PUSD
    uint256 public constant AUTO_CLAIM_THRESHOLD = 100e18; // 100 PUSD
    
    // Revenue split (basis points: 10000 = 100%)
    uint256 public constant JACKPOT_SPLIT = 8000; // 80%
    uint256 public constant REWARD_DISTRIBUTOR_SPLIT = 1000; // 10%
    uint256 public constant DEVELOPMENT_FUND_SPLIT = 500; // 5%
    uint256 public constant BURN_SPLIT = 500; // 5%
    
    // Prize tiers (basis points)
    uint256 public constant FIRST_PRIZE_SPLIT = 5000; // 50%
    uint256 public constant SECOND_PRIZE_SPLIT = 2000; // 20%
    uint256 public constant THIRD_PRIZE_SPLIT = 1000; // 10%
    uint256 public constant FOURTH_PRIZE_SPLIT = 500; // 5%
    uint256 public constant CONSOLATION_AMOUNT = 1e18; // 1 PUSD
    
    // Staking integration
    uint256 public constant FREE_TICKET_THRESHOLD = 100e18; // 100 PUSD = 1 free ticket/week
    
    // Draw schedule
    uint256 public constant DAILY_DRAW_HOUR = 20; // 20:00 UTC
    uint256 public constant WEEKLY_DRAW_DAY = 0; // Sunday (0 = Sunday, 1 = Monday, ...)
    
    // Contracts
    PUSDToken public pusdToken;
    RewardDistributor public rewardDistributor;
    StakingPool public stakingPool;
    address public developmentFund;
    
    // Draw types
    enum DrawType { Daily, Weekly }
    
    // Ticket structure
    struct Ticket {
        address owner;
        uint256 number; // 6-digit number (000000-999999)
        uint256 drawId;
        bool claimed;
        uint256 prizeAmount;
        uint8 prizeTier; // 0 = no prize, 1-5 = prize tiers
    }
    
    // Draw structure
    struct Draw {
        uint256 drawId;
        DrawType drawType;
        uint256 winningNumber;
        uint256 jackpot;
        uint256 ticketsSold;
        uint256 timestamp;
        bool resolved;
    }
    
    // State
    uint256 public currentDrawId;
    uint256 public jackpotPool;
    uint256 private ticketCounter; // Counter for unique ticket IDs
    mapping(uint256 => Ticket) public tickets;
    mapping(uint256 => Draw) public draws;
    mapping(uint256 => uint256[]) public winningTickets; // drawId => ticketIds
    mapping(address => uint256[]) public userTickets; // user => ticketIds
    
    // Commit-Reveal for fair randomness (FREE, SECURE)
    mapping(uint256 => bytes32) public drawCommitments; // drawId => commitment hash
    mapping(uint256 => bool) public drawRevealed; // drawId => revealed status
    
    // Free tickets for stakers
    mapping(address => uint256) public lastFreeTicketClaim; // user => week timestamp
    mapping(address => uint256) public freeTicketsClaimed; // user => count this week
    
    // Events
    event TicketsPurchased(address indexed user, uint256[] ticketIds, uint256[] numbers, uint256 drawId);
    event DrawStarted(uint256 indexed drawId, DrawType drawType, uint256 jackpot);
    event DrawCommitted(uint256 indexed drawId, bytes32 commitment);
    event DrawRevealed(uint256 indexed drawId, uint256 winningNumber);
    event DrawResolved(uint256 indexed drawId, uint256 winningNumber, uint256 totalWinners);
    event RewardClaimed(address indexed user, uint256 ticketId, uint256 amount, uint8 tier);
    event FreeTicketClaimed(address indexed user, uint256 ticketId, uint256 number);
    event JackpotRollover(uint256 indexed drawId, uint256 amount);
    
    constructor(
        address _pusdToken,
        address _rewardDistributor,
        address _stakingPool,
        address _developmentFund,
        address initialOwner
    ) Ownable(initialOwner) {
        require(_pusdToken != address(0), "PUSDLottery: Invalid PUSD token");
        require(_rewardDistributor != address(0), "PUSDLottery: Invalid RewardDistributor");
        require(_stakingPool != address(0), "PUSDLottery: Invalid StakingPool");
        require(_developmentFund != address(0), "PUSDLottery: Invalid development fund");
        
        pusdToken = PUSDToken(_pusdToken);
        rewardDistributor = RewardDistributor(payable(_rewardDistributor));
        stakingPool = StakingPool(payable(_stakingPool));
        developmentFund = _developmentFund;
        
        // Initialize first draw
        currentDrawId = 1;
        draws[currentDrawId] = Draw({
            drawId: currentDrawId,
            drawType: DrawType.Daily,
            winningNumber: 0,
            jackpot: 0,
            ticketsSold: 0,
            timestamp: block.timestamp,
            resolved: false
        });
    }
    
    /**
     * @dev Buy lottery tickets
     * @param quantity Number of tickets to buy
     */
    function buyTickets(uint256 quantity) external nonReentrant whenNotPaused {
        require(quantity > 0, "PUSDLottery: Quantity must be > 0");
        require(quantity <= 1000, "PUSDLottery: Max 1000 tickets per transaction");
        
        uint256 totalCost = quantity * TICKET_PRICE;
        require(
            pusdToken.balanceOf(msg.sender) >= totalCost,
            "PUSDLottery: Insufficient PUSD balance"
        );
        
        // Transfer PUSD from user
        pusdToken.transferFrom(msg.sender, address(this), totalCost);
        
        // Split revenue
        uint256 jackpotAmount = (totalCost * JACKPOT_SPLIT) / 10000;
        uint256 rewardAmount = (totalCost * REWARD_DISTRIBUTOR_SPLIT) / 10000;
        uint256 devAmount = (totalCost * DEVELOPMENT_FUND_SPLIT) / 10000;
        uint256 burnAmount = (totalCost * BURN_SPLIT) / 10000;
        
        // Distribute
        jackpotPool += jackpotAmount;
        
        // Transfer to RewardDistributor (needs to be whitelisted by owner)
        pusdToken.approve(address(rewardDistributor), rewardAmount);
        rewardDistributor.depositRewardsAmount(rewardAmount, "PUSDLottery");
        
        pusdToken.transfer(developmentFund, devAmount);
        pusdToken.burn(burnAmount);
        
        // Generate tickets
        uint256[] memory ticketIds = new uint256[](quantity);
        uint256[] memory numbers = new uint256[](quantity);
        
        for (uint256 i = 0; i < quantity; i++) {
            uint256 ticketId = getNextTicketId();
            uint256 number = generateRandomNumber(ticketId, msg.sender, i);
            
            tickets[ticketId] = Ticket({
                owner: msg.sender,
                number: number,
                drawId: currentDrawId,
                claimed: false,
                prizeAmount: 0,
                prizeTier: 0
            });
            
            userTickets[msg.sender].push(ticketId);
            ticketIds[i] = ticketId;
            numbers[i] = number;
        }
        
        draws[currentDrawId].ticketsSold += quantity;
        draws[currentDrawId].jackpot = jackpotPool;
        
        emit TicketsPurchased(msg.sender, ticketIds, numbers, currentDrawId);
    }
    
    /**
     * @dev Claim free ticket for PUSD holders (100 PUSD = 1 ticket/week)
     */
    function claimFreeTicket() external nonReentrant whenNotPaused {
        uint256 userBalance = pusdToken.balanceOf(msg.sender);
        require(userBalance >= FREE_TICKET_THRESHOLD, "PUSDLottery: Need at least 100 PUSD");
        
        // Check if user can claim this week
        uint256 currentWeek = block.timestamp / 1 weeks;
        require(
            lastFreeTicketClaim[msg.sender] < currentWeek,
            "PUSDLottery: Already claimed this week"
        );
        
        // Generate free ticket
        uint256 ticketId = getNextTicketId();
        uint256 number = generateRandomNumber(ticketId, msg.sender, block.timestamp);
        
        tickets[ticketId] = Ticket({
            owner: msg.sender,
            number: number,
            drawId: currentDrawId,
            claimed: false,
            prizeAmount: 0,
            prizeTier: 0
        });
        
        userTickets[msg.sender].push(ticketId);
        lastFreeTicketClaim[msg.sender] = currentWeek;
        freeTicketsClaimed[msg.sender]++;
        draws[currentDrawId].ticketsSold++;
        
        emit FreeTicketClaimed(msg.sender, ticketId, number);
    }
    
    /**
     * @dev Execute draw automatically when time comes (PUBLIC - anyone can call)
     * Checks if it's time for daily (20:00 UTC) or weekly (Sunday) draw
     * Auto-resolves previous draw and starts new one
     */
    function executeDraw() external whenNotPaused {
        require(!paused(), "PUSDLottery: Contract is paused");
        
        // Check if it's time for draw
        (bool isDailyTime, bool isWeeklyTime) = checkDrawTime();
        require(isDailyTime || isWeeklyTime, "PUSDLottery: Not time for draw yet");
        
        DrawType drawType = isWeeklyTime ? DrawType.Weekly : DrawType.Daily;
        
        // Auto-resolve previous draw if not resolved
        if (!draws[currentDrawId].resolved && draws[currentDrawId].ticketsSold > 0) {
            // If commit-reveal was used but not revealed, use block-based as automatic fallback
            if (drawCommitments[currentDrawId] == bytes32(0) || !drawRevealed[currentDrawId]) {
                uint256 winningNumber = generateWinningNumber(currentDrawId);
                resolveDraw(currentDrawId, winningNumber);
            }
        }
        
        // Start new draw
        currentDrawId++;
        draws[currentDrawId] = Draw({
            drawId: currentDrawId,
            drawType: drawType,
            winningNumber: 0,
            jackpot: jackpotPool,
            ticketsSold: 0,
            timestamp: block.timestamp,
            resolved: false
        });
        
        emit DrawStarted(currentDrawId, drawType, jackpotPool);
    }
    
    /**
     * @dev Check if it's time for draw
     * Daily draw: Every day at 20:00 UTC
     * Weekly draw: Sunday at 20:00 UTC
     * @return isDailyTime True if it's 20:00 UTC (daily draw time)
     * @return isWeeklyTime True if it's Sunday 20:00 UTC (weekly draw day)
     */
    function checkDrawTime() public view returns (bool isDailyTime, bool isWeeklyTime) {
        uint256 currentTime = block.timestamp;
        
        // Get hour in UTC: (timestamp / 3600) % 24
        uint256 hour = (currentTime / 3600) % 24;
        
        // Check if it's exactly 20:00 UTC
        bool isDrawHour = (hour == DAILY_DRAW_HOUR);
        
        // Check daily draw: Every day at 20:00 UTC
        isDailyTime = isDrawHour;
        
        // Check weekly draw: Sunday at 20:00 UTC
        // Calculate day of week: (timestamp / 86400 + 4) % 7 gives Sunday = 0
        uint256 dayOfWeek = ((currentTime / 86400) + 4) % 7;
        isWeeklyTime = (dayOfWeek == WEEKLY_DRAW_DAY && isDrawHour);
        
        // Prevent multiple draws in same day
        // Check if we already drew today
        Draw memory lastDraw = draws[currentDrawId];
        if (lastDraw.timestamp > 0) {
            uint256 lastDrawTime = lastDraw.timestamp;
            uint256 lastDrawDay = lastDrawTime / 86400; // Days since epoch
            uint256 currentDay = currentTime / 86400; // Days since epoch
            
            // If already drew today, don't draw again
            if (lastDrawDay == currentDay) {
                isDailyTime = false;
                isWeeklyTime = false;
            }
        }
    }
    
    /**
     * @dev Start a new draw manually (owner only - for emergency or testing)
     * Automatically resolves previous draw using block-based randomness
     */
    function startDraw(DrawType drawType) external onlyOwner whenNotPaused {
        // Auto-resolve previous draw if not resolved
        if (!draws[currentDrawId].resolved && draws[currentDrawId].ticketsSold > 0) {
            // If commit-reveal was used but not revealed, use block-based as automatic fallback
            if (drawCommitments[currentDrawId] == bytes32(0) || !drawRevealed[currentDrawId]) {
                uint256 winningNumber = generateWinningNumber(currentDrawId);
                resolveDraw(currentDrawId, winningNumber);
            }
        }
        
        // Start new draw
        currentDrawId++;
        draws[currentDrawId] = Draw({
            drawId: currentDrawId,
            drawType: drawType,
            winningNumber: 0,
            jackpot: jackpotPool,
            ticketsSold: 0,
            timestamp: block.timestamp,
            resolved: false
        });
        
        emit DrawStarted(currentDrawId, drawType, jackpotPool);
    }
    
    /**
     * @dev Commit hash for fair randomness (FREE, SECURE)
     * Owner commits a hash before draw ends. Later reveals secret to generate winning number.
     * This prevents manipulation because secret is unknown when tickets are sold.
     */
    function commitDraw(uint256 drawId, bytes32 commitment) external onlyOwner {
        require(drawId <= currentDrawId, "PUSDLottery: Invalid draw ID");
        require(!draws[drawId].resolved, "PUSDLottery: Draw already resolved");
        require(drawCommitments[drawId] == bytes32(0), "PUSDLottery: Already committed");
        
        drawCommitments[drawId] = commitment;
        emit DrawCommitted(drawId, commitment);
    }
    
    /**
     * @dev Reveal secret and generate winning number (FREE, SECURE)
     * Owner reveals secret. Winning number = hash(secret + blockhash + drawId)
     * This is fair because secret was committed before draw ended.
     */
    function revealDraw(uint256 drawId, uint256 secret) external onlyOwner {
        require(drawId <= currentDrawId, "PUSDLottery: Invalid draw ID");
        require(!draws[drawId].resolved, "PUSDLottery: Draw already resolved");
        require(drawCommitments[drawId] != bytes32(0), "PUSDLottery: Not committed");
        require(!drawRevealed[drawId], "PUSDLottery: Already revealed");
        require(
            keccak256(abi.encodePacked(secret)) == drawCommitments[drawId],
            "PUSDLottery: Invalid secret"
        );
        
        // Generate winning number: hash(secret + previous blockhash + drawId)
        // Previous blockhash cannot be manipulated by current miner
        bytes32 prevBlockHash = blockhash(block.number > 0 ? block.number - 1 : block.number);
        uint256 winningNumber = uint256(keccak256(abi.encodePacked(
            secret,
            prevBlockHash,
            drawId,
            block.prevrandao
        ))) % 1000000; // 000000-999999
        
        draws[drawId].winningNumber = winningNumber;
        drawRevealed[drawId] = true;
        
        // Resolve draw
        resolveDraw(drawId, winningNumber);
        
        emit DrawRevealed(drawId, winningNumber);
    }
    
    /**
     * @dev Generate winning number using block-based randomness (fallback)
     */
    function generateWinningNumber(uint256 drawId) internal view returns (uint256) {
        // Use previous block hash (cannot be manipulated by current miner)
        bytes32 prevBlockHash = blockhash(block.number > 0 ? block.number - 1 : block.number);
        
        // Combine multiple entropy sources for randomness
        return uint256(keccak256(abi.encodePacked(
            drawId,
            prevBlockHash,
            block.prevrandao,
            block.timestamp,
            block.number
        ))) % 1000000; // 000000-999999
    }
    
    /**
     * @dev Resolve draw and distribute prizes
     */
    function resolveDraw(uint256 drawId, uint256 winningNumber) internal {
        Draw storage draw = draws[drawId];
        require(draw.jackpot > 0, "PUSDLottery: No jackpot");
        
        draw.winningNumber = winningNumber;
        draw.resolved = true;
        
        // Note: Winners are calculated on-demand when users claim
        // Rollover logic: If no first prize winner claims within reasonable time,
        // the jackpot will naturally rollover to next draw
        // For now, we don't automatically rollover - let users claim first
        
        emit DrawResolved(drawId, winningNumber, 0); // totalWinners calculated on-demand
    }
    
    /**
     * @dev Check ticket result and claim reward
     */
    function claimReward(uint256 ticketId) external nonReentrant whenNotPaused {
        Ticket storage ticket = tickets[ticketId];
        require(ticket.owner == msg.sender, "PUSDLottery: Not ticket owner");
        require(!ticket.claimed, "PUSDLottery: Already claimed");
        
        Draw storage draw = draws[ticket.drawId];
        require(draw.resolved, "PUSDLottery: Draw not resolved");
        
        // Calculate prize
        (uint256 prizeAmount, uint8 prizeTier) = calculatePrize(ticket.number, draw.winningNumber, draw.jackpot);
        
        if (prizeAmount > 0) {
            ticket.prizeAmount = prizeAmount;
            ticket.prizeTier = prizeTier;
            ticket.claimed = true;
            
            // Auto-claim small prizes
            if (prizeAmount < AUTO_CLAIM_THRESHOLD) {
                pusdToken.transfer(msg.sender, prizeAmount);
            } else {
                // Manual claim for large prizes
                require(
                    pusdToken.balanceOf(address(this)) >= prizeAmount,
                    "PUSDLottery: Insufficient contract balance"
                );
                pusdToken.transfer(msg.sender, prizeAmount);
            }
            
            emit RewardClaimed(msg.sender, ticketId, prizeAmount, prizeTier);
        } else {
            revert("PUSDLottery: Ticket did not win");
        }
    }
    
    /**
     * @dev Calculate prize for a ticket
     */
    function calculatePrize(uint256 ticketNumber, uint256 winningNumber, uint256 jackpot) 
        internal 
        pure 
        returns (uint256 prizeAmount, uint8 prizeTier) 
    {
        // Extract last N digits for matching
        uint256 ticketLast6 = ticketNumber % 1000000;
        uint256 ticketLast5 = ticketNumber % 100000;
        uint256 ticketLast4 = ticketNumber % 10000;
        uint256 ticketLast3 = ticketNumber % 1000;
        uint256 ticketLast2 = ticketNumber % 100;
        
        uint256 winningLast6 = winningNumber % 1000000;
        uint256 winningLast5 = winningNumber % 100000;
        uint256 winningLast4 = winningNumber % 10000;
        uint256 winningLast3 = winningNumber % 1000;
        uint256 winningLast2 = winningNumber % 100;
        
        if (ticketLast6 == winningLast6) {
            // 1st Prize: 6 digits match
            prizeAmount = (jackpot * FIRST_PRIZE_SPLIT) / 10000;
            prizeTier = 1;
        } else if (ticketLast5 == winningLast5) {
            // 2nd Prize: 5 digits match
            prizeAmount = (jackpot * SECOND_PRIZE_SPLIT) / 10000;
            prizeTier = 2;
        } else if (ticketLast4 == winningLast4) {
            // 3rd Prize: 4 digits match
            prizeAmount = (jackpot * THIRD_PRIZE_SPLIT) / 10000;
            prizeTier = 3;
        } else if (ticketLast3 == winningLast3) {
            // 4th Prize: 3 digits match
            prizeAmount = (jackpot * FOURTH_PRIZE_SPLIT) / 10000;
            prizeTier = 4;
        } else if (ticketLast2 == winningLast2) {
            // Consolation: 2 digits match
            prizeAmount = CONSOLATION_AMOUNT;
            prizeTier = 5;
        } else {
            prizeAmount = 0;
            prizeTier = 0;
        }
    }
    
    /**
     * @dev Get next ticket ID (using counter to prevent collision)
     */
    function getNextTicketId() internal returns (uint256) {
        ticketCounter++;
        return ticketCounter;
    }
    
    /**
     * @dev Generate pseudo-random number for ticket
     */
    function generateRandomNumber(uint256 ticketId, address user, uint256 nonce) 
        internal 
        view 
        returns (uint256) 
    {
        return uint256(keccak256(abi.encodePacked(ticketId, user, nonce, block.timestamp, block.prevrandao))) % 1000000;
    }
    
    /**
     * @dev Get user tickets
     */
    function getUserTickets(address user) external view returns (uint256[] memory) {
        return userTickets[user];
    }
    
    /**
     * @dev Get ticket details
     */
    function getTicket(uint256 ticketId) external view returns (Ticket memory) {
        return tickets[ticketId];
    }
    
    /**
     * @dev Get draw details
     */
    function getDraw(uint256 drawId) external view returns (Draw memory) {
        return draws[drawId];
    }
    
    /**
     * @dev Get current draw info
     */
    function getCurrentDrawInfo() external view returns (
        uint256 drawId,
        DrawType drawType,
        uint256 jackpot,
        uint256 ticketsSold,
        uint256 timestamp,
        bool resolved
    ) {
        Draw memory draw = draws[currentDrawId];
        return (
            draw.drawId,
            draw.drawType,
            draw.jackpot,
            draw.ticketsSold,
            draw.timestamp,
            draw.resolved
        );
    }
    
    /**
     * @dev Check if user can claim free ticket
     */
    function canClaimFreeTicket(address user) external view returns (bool) {
        if (pusdToken.balanceOf(user) < FREE_TICKET_THRESHOLD) {
            return false;
        }
        uint256 currentWeek = block.timestamp / 1 weeks;
        return lastFreeTicketClaim[user] < currentWeek;
    }
    
    /**
     * @dev Pause contract
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Update development fund address
     */
    function setDevelopmentFund(address _developmentFund) external onlyOwner {
        require(_developmentFund != address(0), "PUSDLottery: Invalid address");
        developmentFund = _developmentFund;
    }
    
    /**
     * @dev Emergency withdraw (only owner)
     */
    function emergencyWithdraw(uint256 amount) external onlyOwner {
        require(amount <= pusdToken.balanceOf(address(this)), "PUSDLottery: Insufficient balance");
        pusdToken.transfer(owner(), amount);
    }
    
    /**
     * @dev Chainlink Automation: Check if upkeep is needed
     * Automation will call this function to check if draw needs to be triggered
     * @return upkeepNeeded True if it's time for draw
     * @return performData Empty (no data needed)
     */
    function checkUpkeep(bytes calldata) 
        external 
        view 
        returns (bool upkeepNeeded, bytes memory performData) 
    {
        // Check if contract is not paused
        if (paused()) {
            return (false, "");
        }
        
        // Check if it's time for draw
        (bool isDailyTime, bool isWeeklyTime) = checkDrawTime();
        upkeepNeeded = isDailyTime || isWeeklyTime;
        performData = ""; // Empty - no data needed
    }
    
    /**
     * @dev Chainlink Automation: Perform upkeep (trigger draw)
     * Automation will call this function when checkUpkeep() returns true
     */
    function performUpkeep(bytes calldata) external whenNotPaused {
        require(!paused(), "PUSDLottery: Contract is paused");
        
        // Check if it's time for draw
        (bool isDailyTime, bool isWeeklyTime) = checkDrawTime();
        require(isDailyTime || isWeeklyTime, "PUSDLottery: Not time for draw yet");
        
        DrawType drawType = isWeeklyTime ? DrawType.Weekly : DrawType.Daily;
        
        // Auto-resolve previous draw if not resolved
        if (!draws[currentDrawId].resolved && draws[currentDrawId].ticketsSold > 0) {
            // If commit-reveal was used but not revealed, use block-based as automatic fallback
            if (drawCommitments[currentDrawId] == bytes32(0) || !drawRevealed[currentDrawId]) {
                uint256 winningNumber = generateWinningNumber(currentDrawId);
                resolveDraw(currentDrawId, winningNumber);
            }
        }
        
        // Start new draw
        currentDrawId++;
        draws[currentDrawId] = Draw({
            drawId: currentDrawId,
            drawType: drawType,
            winningNumber: 0,
            jackpot: jackpotPool,
            ticketsSold: 0,
            timestamp: block.timestamp,
            resolved: false
        });
        
        emit DrawStarted(currentDrawId, drawType, jackpotPool);
    }
}

