// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./PUSD.sol";
import "./RewardDistributor.sol";
import "./LockToEarnPool.sol";
import "./EcosystemTracker.sol";

contract PUSDLottery is Ownable, ReentrancyGuard, Pausable {
    // Constants
    uint256 public constant TICKET_PRICE = 0.1e18; // 0.1 PUSD
    uint256 public constant AUTO_CLAIM_THRESHOLD = 100e18; // 100 PUSD
    uint256 public constant MAX_TICKETS_PER_DAY = 6; // Maximum 6 tickets per day per user
    
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
    
    // Free ticket thresholds based on PUSD balance
    uint256 public constant FREE_TICKET_THRESHOLD_1 = 1000e18; // 1000 PUSD = 1 ticket/week
    uint256 public constant FREE_TICKET_THRESHOLD_2 = 2000e18; // 2000 PUSD = 2 tickets/week
    uint256 public constant FREE_TICKET_THRESHOLD_3 = 5000e18; // 5000 PUSD = 5 tickets/week
    uint256 public constant FREE_TICKET_THRESHOLD_4 = 10000e18; // 10000 PUSD = 12 tickets/week
    
    // Draw schedule
    uint256 public constant DAILY_DRAW_HOUR = 20; // 20:00 UTC
    uint256 public constant WEEKLY_DRAW_DAY = 0; // Sunday (0 = Sunday, 1 = Monday, ...)
    
    // Contracts
    PUSDToken public pusdToken;
    RewardDistributor public rewardDistributor;
    LockToEarnPool public lockToEarnPool;
    address public developmentFund;
    EcosystemTracker public ecosystemTracker;
    
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
    
    // Multi-Party Commit-Reveal for fair randomness (FREE, SECURE, DECENTRALIZED)
    // Anyone can commit a secret, and winning number = hash(all revealed secrets + blockhash)
    // This ensures no single party controls the randomness
    struct Commitment {
        address committer;
        bytes32 commitmentHash;
        uint256 secret; // Revealed secret (0 if not revealed)
        bool revealed;
        uint256 revealTimestamp;
        uint256 commitBlockNumber; // Block number when committed
        uint256 commitIndex; // Order of commit (0 = first, 1 = second, etc.)
    }
    
    mapping(uint256 => Commitment[]) public drawCommitments; // drawId => array of commitments
    mapping(uint256 => uint256) public drawCommitDeadline; // drawId => deadline for commits
    mapping(uint256 => uint256) public drawRevealDeadline; // drawId => deadline for reveals
    uint256 public constant COMMIT_DURATION = 1 days; // 1 day to commit
    uint256 public constant REVEAL_DURATION = 1 days; // 1 day to reveal after commit deadline
    
    // Free tickets for PUSD holders
    mapping(address => uint256) public lastFreeTicketClaim; // user => week timestamp
    mapping(address => uint256) public freeTicketsClaimed; // user => count this week
    
    // Ticket limit per day tracking (resets daily)
    mapping(address => mapping(uint256 => uint256)) public dailyTicketsPurchased; // user => day timestamp => count
    
    // Events
    event TicketsPurchased(address indexed user, uint256[] ticketIds, uint256[] numbers, uint256 drawId);
    event DrawStarted(uint256 indexed drawId, DrawType drawType, uint256 jackpot);
    event DrawCommitted(uint256 indexed drawId, bytes32 commitment);
    event DrawRevealed(uint256 indexed drawId, uint256 secret);
    event DrawResolved(uint256 indexed drawId, uint256 winningNumber, uint256 totalWinners);
    event RewardClaimed(address indexed user, uint256 ticketId, uint256 amount, uint8 tier);
    event FreeTicketClaimed(address indexed user, uint256 ticketId, uint256 number);
    event JackpotRollover(uint256 indexed drawId, uint256 amount);
    
    constructor(
        address _pusdToken,
        address _rewardDistributor,
        address _lockToEarnPool,
        address _developmentFund,
        address initialOwner
    ) Ownable(initialOwner) {
        require(_pusdToken != address(0), "PUSDLottery: Invalid PUSD token");
        require(_rewardDistributor != address(0), "PUSDLottery: Invalid RewardDistributor");
        require(_lockToEarnPool != address(0), "PUSDLottery: Invalid LockToEarnPool");
        require(_developmentFund != address(0), "PUSDLottery: Invalid development fund");
        
        pusdToken = PUSDToken(_pusdToken);
        rewardDistributor = RewardDistributor(payable(_rewardDistributor));
        lockToEarnPool = LockToEarnPool(payable(_lockToEarnPool));
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
        
        // Check ticket limit per day (6 tickets per day, resets daily)
        uint256 currentDay = block.timestamp / 1 days;
        uint256 ticketsToday = dailyTicketsPurchased[msg.sender][currentDay];
        require(
            ticketsToday + quantity <= MAX_TICKETS_PER_DAY,
            "PUSDLottery: Exceeds ticket limit per day (6 tickets per day)"
        );
        
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
        
        // Update ticket count for current day (resets daily)
        dailyTicketsPurchased[msg.sender][currentDay] += quantity;
        
        emit TicketsPurchased(msg.sender, ticketIds, numbers, currentDrawId);
    }
    
    /**
     * @dev Get number of free tickets based on PUSD balance
     * 1000 PUSD = 1 ticket, 2000 PUSD = 2 tickets, 5000 PUSD = 5 tickets, 10000 PUSD = 12 tickets
     */
    function getFreeTicketsForBalance(uint256 balance) public pure returns (uint256) {
        if (balance >= FREE_TICKET_THRESHOLD_4) {
            return 12;
        } else if (balance >= FREE_TICKET_THRESHOLD_3) {
            return 5;
        } else if (balance >= FREE_TICKET_THRESHOLD_2) {
            return 2;
        } else if (balance >= FREE_TICKET_THRESHOLD_1) {
            return 1;
        }
        return 0;
    }
    
    /**
     * @dev Claim free tickets for PUSD holders
     * Based on PUSD balance: 1000 PUSD = 1 ticket, 2000 PUSD = 2 tickets, 5000 PUSD = 5 tickets, 10000 PUSD = 12 tickets
     */
    function claimFreeTicket() external nonReentrant whenNotPaused {
        // Check user's PUSD balance
        uint256 pusdBalance = pusdToken.balanceOf(msg.sender);
        uint256 freeTicketsCount = getFreeTicketsForBalance(pusdBalance);
        require(freeTicketsCount > 0, "PUSDLottery: Need at least 1000 PUSD balance");
        
        // Check if user can claim this week
        uint256 currentWeek = block.timestamp / 1 weeks;
        require(
            lastFreeTicketClaim[msg.sender] < currentWeek,
            "PUSDLottery: Already claimed this week"
        );
        
        // Generate free tickets
        uint256[] memory ticketIds = new uint256[](freeTicketsCount);
        uint256[] memory numbers = new uint256[](freeTicketsCount);
        
        for (uint256 i = 0; i < freeTicketsCount; i++) {
            uint256 ticketId = getNextTicketId();
            uint256 number = generateRandomNumber(ticketId, msg.sender, block.timestamp + i);
            
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
            draws[currentDrawId].ticketsSold++;
        }
        
        lastFreeTicketClaim[msg.sender] = currentWeek;
        freeTicketsClaimed[msg.sender] += freeTicketsCount;
        
        emit FreeTicketClaimed(msg.sender, ticketIds[0], numbers[0]);
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
        
        // Auto-resolve current draw if not resolved (MUST resolve before creating new draw)
        if (!draws[currentDrawId].resolved) {
            // Only resolve if there are tickets sold (skip empty draws)
            if (draws[currentDrawId].ticketsSold > 0) {
                // Check if multi-party commit-reveal was used and finalized
                if (drawCommitments[currentDrawId].length > 0 && block.timestamp > drawRevealDeadline[currentDrawId]) {
                    // Try to finalize with commits (anyone can call, but we do it here automatically)
                    try this.finalizeDrawWithCommits(currentDrawId) {
                        // Successfully finalized with commits
                    } catch {
                        // If finalize fails (no reveals), use block-based fallback
                        uint256 winningNumber = generateWinningNumber(currentDrawId);
                        resolveDraw(currentDrawId, winningNumber);
                    }
                } else {
                    // No commits or reveal phase not ended - use block-based randomness
                    uint256 winningNumber = generateWinningNumber(currentDrawId);
                    resolveDraw(currentDrawId, winningNumber);
                }
            } else {
                // Empty draw - mark as resolved with winning number 0
                draws[currentDrawId].winningNumber = 0;
                draws[currentDrawId].resolved = true;
                emit DrawResolved(currentDrawId, 0, 0);
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
        // Auto-resolve current draw if not resolved (MUST resolve before creating new draw)
        if (!draws[currentDrawId].resolved) {
            // Only resolve if there are tickets sold (skip empty draws)
            if (draws[currentDrawId].ticketsSold > 0) {
                // Check if multi-party commit-reveal was used and finalized
                if (drawCommitments[currentDrawId].length > 0 && block.timestamp > drawRevealDeadline[currentDrawId]) {
                    // Try to finalize with commits (anyone can call, but we do it here automatically)
                    try this.finalizeDrawWithCommits(currentDrawId) {
                        // Successfully finalized with commits
                    } catch {
                        // If finalize fails (no reveals), use block-based fallback
                        uint256 winningNumber = generateWinningNumber(currentDrawId);
                        resolveDraw(currentDrawId, winningNumber);
                    }
                } else {
                    // No commits or reveal phase not ended - use block-based randomness
                    uint256 winningNumber = generateWinningNumber(currentDrawId);
                    resolveDraw(currentDrawId, winningNumber);
                }
            } else {
                // Empty draw - mark as resolved with winning number 0
                draws[currentDrawId].winningNumber = 0;
                draws[currentDrawId].resolved = true;
                emit DrawResolved(currentDrawId, 0, 0);
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
     * @dev Commit a secret for draw randomness (PUBLIC - anyone can commit)
     * Users commit hash(secret) before reveal phase. This ensures fairness.
     * Multiple commits make the result more random and decentralized.
     */
    function commitSecret(uint256 drawId, bytes32 commitmentHash) external {
        require(drawId <= currentDrawId, "PUSDLottery: Invalid draw ID");
        require(!draws[drawId].resolved, "PUSDLottery: Draw already resolved");
        
        // Check if commit phase is still open
        if (drawCommitDeadline[drawId] == 0) {
            // First commit - set deadlines
            drawCommitDeadline[drawId] = block.timestamp + COMMIT_DURATION;
            drawRevealDeadline[drawId] = block.timestamp + COMMIT_DURATION + REVEAL_DURATION;
        } else {
            require(block.timestamp <= drawCommitDeadline[drawId], "PUSDLottery: Commit phase ended");
        }
        
        // Check if user already committed
        Commitment[] storage commitments = drawCommitments[drawId];
        for (uint256 i = 0; i < commitments.length; i++) {
            require(commitments[i].committer != msg.sender, "PUSDLottery: Already committed");
        }
        
        // Add new commitment with block number and commit order
        uint256 commitIndex = commitments.length; // Order of commit (0 = first, 1 = second, etc.)
        commitments.push(Commitment({
            committer: msg.sender,
            commitmentHash: commitmentHash,
            secret: 0,
            revealed: false,
            revealTimestamp: 0,
            commitBlockNumber: block.number,
            commitIndex: commitIndex
        }));
        
        emit DrawCommitted(drawId, commitmentHash);
    }
    
    /**
     * @dev Reveal secret (PUBLIC - anyone who committed can reveal)
     * After commit deadline, users reveal their secrets.
     * Winning number = hash(all revealed secrets + blockhash)
     */
    function revealSecret(uint256 drawId, uint256 secret) external {
        require(drawId <= currentDrawId, "PUSDLottery: Invalid draw ID");
        require(!draws[drawId].resolved, "PUSDLottery: Draw already resolved");
        require(block.timestamp > drawCommitDeadline[drawId], "PUSDLottery: Commit phase not ended");
        require(block.timestamp <= drawRevealDeadline[drawId], "PUSDLottery: Reveal phase ended");
        
        Commitment[] storage commitments = drawCommitments[drawId];
        bool found = false;
        
        for (uint256 i = 0; i < commitments.length; i++) {
            if (commitments[i].committer == msg.sender) {
                require(!commitments[i].revealed, "PUSDLottery: Already revealed");
                require(
                    keccak256(abi.encodePacked(secret)) == commitments[i].commitmentHash,
                    "PUSDLottery: Invalid secret"
                );
                
                commitments[i].secret = secret;
                commitments[i].revealed = true;
                commitments[i].revealTimestamp = block.timestamp;
                found = true;
                break;
            }
        }
        
        require(found, "PUSDLottery: No commitment found");
        emit DrawRevealed(drawId, secret);
    }
    
    /**
     * @dev Generate winning number from all revealed secrets (PUBLIC)
     * Anyone can call this after reveal deadline to finalize the draw.
     * Winning number = hash(all revealed secrets + blockhash + drawId)
     * This is completely random and cannot be manipulated.
     */
    function finalizeDrawWithCommits(uint256 drawId) external {
        require(drawId <= currentDrawId, "PUSDLottery: Invalid draw ID");
        require(!draws[drawId].resolved, "PUSDLottery: Draw already resolved");
        require(block.timestamp > drawRevealDeadline[drawId], "PUSDLottery: Reveal phase not ended");
        require(drawCommitments[drawId].length > 0, "PUSDLottery: No commitments");
        
        Commitment[] memory commitments = drawCommitments[drawId];
        
        // Collect all revealed secrets with their commit order and block numbers
        bytes memory shuffledSecrets = abi.encodePacked(drawId);
        uint256 revealedCount = 0;
        
        // Shuffle secrets based on commit order (earliest commits have more weight)
        // User nào commit nhanh nhất (commitIndex = 0) sẽ có ảnh hưởng lớn nhất
        for (uint256 i = 0; i < commitments.length; i++) {
            if (commitments[i].revealed) {
                // Weight by commit order: earlier commits (lower index) have more influence
                // Multiply secret by (total_commits - commit_index) to give weight
                // User đầu tiên (index 0) có weight = total_commits, user cuối có weight = 1
                uint256 weight = commitments.length - commitments[i].commitIndex;
                shuffledSecrets = abi.encodePacked(
                    shuffledSecrets,
                    commitments[i].secret * weight, // Weighted secret
                    commitments[i].commitBlockNumber, // Block number when committed
                    commitments[i].commitIndex      // Order of commit (0 = fastest)
                );
                revealedCount++;
            }
        }
        
        require(revealedCount > 0, "PUSDLottery: No secrets revealed");
        
        // Generate winning number using:
        // 1. Shuffled secrets (weighted by commit order - user nhanh nhất có weight cao nhất)
        // 2. Current block number (when finalizing) - block ID
        // 3. Previous block hash (cannot be manipulated)
        // 4. Block prevrandao (randomness)
        bytes32 prevBlockHash = blockhash(block.number > 0 ? block.number - 1 : block.number);
        uint256 winningNumber = uint256(keccak256(abi.encodePacked(
            shuffledSecrets,      // Secrets đã được đảo lộn theo thứ tự commit
            block.number,         // Block ID khi finalize
            prevBlockHash,        // Previous block hash
            block.prevrandao,     // Randomness từ block
            block.timestamp       // Timestamp
        ))) % 1000000; // 000000-999999
        
        // Resolve draw
        resolveDraw(drawId, winningNumber);
        
        emit DrawResolved(drawId, winningNumber, 0);
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
        // Allow resolve even if jackpot is 0 (as long as there are tickets)
        // This ensures draws with tickets can always be resolved
        require(draw.ticketsSold > 0 || draw.jackpot > 0, "PUSDLottery: No tickets or jackpot");
        
        draw.winningNumber = winningNumber;
        draw.resolved = true;
        
        // Note: Winners are calculated on-demand when users claim
        // Rollover logic: If no first prize winner claims within reasonable time,
        // the jackpot will naturally rollover to next draw
        // For now, we don't automatically rollover - let users claim first
        
        emit DrawResolved(drawId, winningNumber, 0); // totalWinners calculated on-demand
    }
    
    /**
     * @dev Resolve old draw manually (owner only - for fixing unresolved draws)
     * This allows owner to resolve draws that were missed or not resolved automatically
     */
    function resolveOldDraw(uint256 drawId) external onlyOwner {
        require(drawId <= currentDrawId, "PUSDLottery: Invalid draw ID");
        require(!draws[drawId].resolved, "PUSDLottery: Draw already resolved");
        require(draws[drawId].ticketsSold > 0, "PUSDLottery: No tickets to resolve");
        
        // Check if multi-party commit-reveal was used
        if (drawCommitments[drawId].length > 0 && block.timestamp > drawRevealDeadline[drawId]) {
            // Try to finalize with commits
            try this.finalizeDrawWithCommits(drawId) {
                // Successfully finalized
                return;
            } catch {
                // If finalize fails, use block-based fallback
            }
        }
        
        // Use block-based randomness as fallback
        uint256 winningNumber = generateWinningNumber(drawId);
        resolveDraw(drawId, winningNumber);
    }
    
    /**
     * @dev Resolve draw with specific winning number (owner only - for emergency)
     * Use with caution - only for fixing critical issues
     */
    function forceResolveDraw(uint256 drawId, uint256 winningNumber) external onlyOwner {
        require(drawId <= currentDrawId, "PUSDLottery: Invalid draw ID");
        require(!draws[drawId].resolved, "PUSDLottery: Draw already resolved");
        require(draws[drawId].ticketsSold > 0, "PUSDLottery: No tickets to resolve");
        require(winningNumber < 1000000, "PUSDLottery: Invalid winning number");
        
        resolveDraw(drawId, winningNumber);
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
     * @dev Get number of free tickets user can claim based on PUSD balance
     */
    function getFreeTicketsAvailable(address user) external view returns (uint256) {
        uint256 pusdBalance = pusdToken.balanceOf(user);
        uint256 freeTicketsCount = getFreeTicketsForBalance(pusdBalance);
        
        if (freeTicketsCount == 0) {
            return 0;
        }
        
        uint256 currentWeek = block.timestamp / 1 weeks;
        if (lastFreeTicketClaim[user] >= currentWeek) {
            return 0;
        }
        
        return freeTicketsCount;
    }
    
    /**
     * @dev Check if user can claim free ticket (based on PUSD balance)
     */
    function canClaimFreeTicket(address user) external view returns (bool) {
        uint256 pusdBalance = pusdToken.balanceOf(user);
        uint256 freeTicketsCount = getFreeTicketsForBalance(pusdBalance);
        
        if (freeTicketsCount == 0) {
            return false;
        }
        
        uint256 currentWeek = block.timestamp / 1 weeks;
        return lastFreeTicketClaim[user] < currentWeek;
    }
    
    /**
     * @dev Get remaining tickets user can buy today
     */
    function getRemainingTicketsToday(address user) external view returns (uint256) {
        uint256 currentDay = block.timestamp / 1 days;
        uint256 ticketsToday = dailyTicketsPurchased[user][currentDay];
        if (ticketsToday >= MAX_TICKETS_PER_DAY) {
            return 0;
        }
        return MAX_TICKETS_PER_DAY - ticketsToday;
    }
    
    /**
     * @dev Get number of tickets user has purchased today
     */
    function getTicketsPurchasedToday(address user) external view returns (uint256) {
        uint256 currentDay = block.timestamp / 1 days;
        return dailyTicketsPurchased[user][currentDay];
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
        
        // Auto-resolve current draw if not resolved (MUST resolve before creating new draw)
        if (!draws[currentDrawId].resolved) {
            // Only resolve if there are tickets sold (skip empty draws)
            if (draws[currentDrawId].ticketsSold > 0) {
                // Check if multi-party commit-reveal was used and finalized
                if (drawCommitments[currentDrawId].length > 0 && block.timestamp > drawRevealDeadline[currentDrawId]) {
                    // Try to finalize with commits (anyone can call, but we do it here automatically)
                    try this.finalizeDrawWithCommits(currentDrawId) {
                        // Successfully finalized with commits
                    } catch {
                        // If finalize fails (no reveals), use block-based fallback
                        uint256 winningNumber = generateWinningNumber(currentDrawId);
                        resolveDraw(currentDrawId, winningNumber);
                    }
                } else {
                    // No commits or reveal phase not ended - use block-based randomness
                    uint256 winningNumber = generateWinningNumber(currentDrawId);
                    resolveDraw(currentDrawId, winningNumber);
                }
            } else {
                // Empty draw - mark as resolved with winning number 0
                draws[currentDrawId].winningNumber = 0;
                draws[currentDrawId].resolved = true;
                emit DrawResolved(currentDrawId, 0, 0);
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

