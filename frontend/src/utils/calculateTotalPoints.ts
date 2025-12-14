import { Contract, EventLog } from 'ethers';
import { formatBalance } from './format';

/**
 * Calculate total points by querying Staked events
 * Calculates total points by summing all points from Staked events
 * but doesn't subtract points from Unstaked events (because Unstaked event doesn't have points)
 * 
 * For accurate calculation, you need to either:
 * 1. Add totalPoints variable to contract (best solution)
 * 2. Use a subgraph/indexer to track all events
 * 3. Query all active stakes for all users (requires user list)
 */
export async function calculateTotalPoints(
  stakingContract: Contract,
  fromBlock: number = 0
): Promise<string> {
  try {
    // Get current block
    const provider = stakingContract.runner?.provider || (stakingContract as any).provider;
    if (!provider || typeof provider.getBlockNumber !== 'function') {
      throw new Error('Provider not available');
    }
    const currentBlock = await provider.getBlockNumber();
    const startBlock = fromBlock || 0;

    // Query all Staked events (points added)
    const stakedEvents = await stakingContract.queryFilter(
      stakingContract.filters.Staked(),
      startBlock,
      currentBlock
    );

    // Query all LockExtended events (points changed)
    const extendedEvents = await stakingContract.queryFilter(
      stakingContract.filters.LockExtended(),
      startBlock,
      currentBlock
    );

    // Track points per stake (user + stakeId)
    const stakePointsMap = new Map<string, bigint>();

    // Process Staked events
    for (const event of stakedEvents) {
      const log = event as EventLog;
      if (log.args && log.args.user && log.args.stakeId !== undefined && log.args.points) {
        const key = `${log.args.user.toString()}-${log.args.stakeId.toString()}`;
        stakePointsMap.set(key, BigInt(log.args.points.toString()));
      }
    }

    // Process LockExtended events (update points)
    for (const event of extendedEvents) {
      const log = event as EventLog;
      if (log.args && log.args.user && log.args.stakeId !== undefined && log.args.newPoints) {
        const key = `${log.args.user.toString()}-${log.args.stakeId.toString()}`;
        stakePointsMap.set(key, BigInt(log.args.newPoints.toString()));
      }
    }

    // Query Unstaked events to remove unstaked stakes
    const unstakedEvents = await stakingContract.queryFilter(
      stakingContract.filters.Unstaked(),
      startBlock,
      currentBlock
    );

    // Remove unstaked stakes from map
    for (const event of unstakedEvents) {
      const log = event as EventLog;
      if (log.args && log.args.user && log.args.stakeId !== undefined) {
        const key = `${log.args.user.toString()}-${log.args.stakeId.toString()}`;
        stakePointsMap.delete(key);
      }
    }

    // Sum all remaining (active) points
    let totalPoints = 0n;
    for (const points of stakePointsMap.values()) {
      totalPoints += points;
    }

    return formatBalance(totalPoints);
  } catch (error) {
    // Failed to calculate total points
    return '0';
  }
}

/**
 * Alternative: Calculate total points from active stakes
 * This requires iterating through all users, which is not practical
 * without an indexer or subgraph
 */
export async function calculateTotalPointsFromActiveStakes(
  stakingContract: Contract,
  users: string[]
): Promise<string> {
  try {
    let totalPoints = 0n;

    for (const user of users) {
      try {
        const userPoints = await stakingContract.getUserTotalPoints(user);
        totalPoints += BigInt(userPoints.toString());
      } catch (error) {
        // Skip if user doesn't exist or error
        continue;
      }
    }

    return formatBalance(totalPoints);
  } catch (error) {
    // Failed to calculate total points from active stakes
    return '0';
  }
}

