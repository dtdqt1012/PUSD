// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IChainlinkAggregator {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
    
    function decimals() external view returns (uint8);
}

contract GoldOracle is Ownable {
    // Chainlink aggregator for XAU/USD (Gold/USD)
    IChainlinkAggregator public chainlinkAggregator;
    bool public useChainlink;
    
    // Manual price fallback (admin can set)
    uint256 public manualPrice; // Price with 8 decimals
    bool public useManualPrice;
    
    uint256 public constant PRICE_DECIMALS = 8;
    uint256 public priceStaleness = 2 hours; // Reject price older than 2 hours
    
    event PriceUpdated(uint256 price, uint256 timestamp, string source);
    event ChainlinkSet(address indexed aggregator);
    event ManualPriceSet(uint256 price);
    event PriceStalenessUpdated(uint256 oldStaleness, uint256 newStaleness);

    constructor(address initialOwner) Ownable(initialOwner) {
        require(initialOwner != address(0), "GoldOracle: Invalid owner");
    }

    function setChainlinkOracle(address aggregator) external onlyOwner {
        require(aggregator != address(0), "GoldOracle: Invalid address");
        chainlinkAggregator = IChainlinkAggregator(aggregator);
        useChainlink = true;
        emit ChainlinkSet(aggregator);
    }

    function setManualPrice(uint256 priceInUsd8Decimals) external onlyOwner {
        require(priceInUsd8Decimals > 0, "GoldOracle: Price must be > 0");
        manualPrice = priceInUsd8Decimals;
        useManualPrice = true;
        emit ManualPriceSet(priceInUsd8Decimals);
        emit PriceUpdated(priceInUsd8Decimals, block.timestamp, "manual");
    }

    function disableChainlink() external onlyOwner {
        useChainlink = false;
    }

    function getGoldPrice() public view returns (uint256) {
        // Priority 1: Chainlink
        if (useChainlink && address(chainlinkAggregator) != address(0)) {
            try this._getChainlinkPrice() returns (uint256 price) {
                return price;
            } catch {
                // Fall through to manual
            }
        }
        
        // Priority 2: Manual price
        if (useManualPrice && manualPrice > 0) {
            return manualPrice;
        }
        
        revert("GoldOracle: No valid price source");
    }

    function _getChainlinkPrice() external view returns (uint256) {
        require(address(chainlinkAggregator) != address(0), "GoldOracle: Chainlink not set");
        
        (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = chainlinkAggregator.latestRoundData();
        
        require(answer > 0, "GoldOracle: Invalid Chainlink answer");
        require(updatedAt > 0, "GoldOracle: Round not complete");
        require(
            block.timestamp - updatedAt <= priceStaleness,
            "GoldOracle: Chainlink price too stale"
        );
        
        uint8 decimals = chainlinkAggregator.decimals();
        // Convert to 8 decimals
        uint256 price;
        if (decimals > PRICE_DECIMALS) {
            price = uint256(answer) / (10 ** (decimals - PRICE_DECIMALS));
        } else if (decimals < PRICE_DECIMALS) {
            price = uint256(answer) * (10 ** (PRICE_DECIMALS - decimals));
        } else {
            price = uint256(answer);
        }
        
        return price;
    }

    function setPriceStaleness(uint256 _staleness) external onlyOwner {
        require(_staleness > 0, "GoldOracle: Staleness must be > 0");
        uint256 oldStaleness = priceStaleness;
        priceStaleness = _staleness;
        emit PriceStalenessUpdated(oldStaleness, _staleness);
    }

    function getPriceWithTimestamp() external view returns (uint256 price, uint256 timestamp) {
        price = getGoldPrice();
        if (useChainlink && address(chainlinkAggregator) != address(0)) {
            try chainlinkAggregator.latestRoundData() returns (
                uint80,
                int256,
                uint256,
                uint256 updatedAt,
                uint80
            ) {
                timestamp = updatedAt;
            } catch {
                timestamp = block.timestamp;
            }
        } else {
            timestamp = block.timestamp;
        }
    }
}

