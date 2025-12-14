// Shared utilities for staking-related operations
import { Contract } from 'ethers';
import { CONTRACTS } from '../config/contracts';
import { rpcBatchHandler } from './rpcHandler';

export interface Stake {
  amount: bigint;
  lockUntil: bigint;
  points: bigint;
  createdAt: bigint;
  active: boolean;
}

export interface PUSDStake {
  amount: bigint;
  lockUntil: bigint;
  points: bigint;
  createdAt: bigint;
  active: boolean;
}

/**
 * Get active POL locks for a user
 * Uses rpcBatchHandler to avoid rate limiting
 */
export async function getUserActiveStakes(
  stakingContract: Contract,
  userAddress: string
): Promise<Stake[]> {
  try {
    const lockCount = await rpcBatchHandler.add(() => 
      stakingContract.getUserLockCount(userAddress)
    );
    
    if (lockCount === 0n) return [];
    
    const activeStakes: Stake[] = [];
    const lockPromises: Promise<any>[] = [];
    
    // Batch all lock queries
    for (let i = 0; i < Number(lockCount); i++) {
      lockPromises.push(
        rpcBatchHandler.add(() => stakingContract.getUserLock(userAddress, i))
      );
    }
    
    const locks = await Promise.allSettled(lockPromises);
    
    for (const lockResult of locks) {
      if (lockResult.status === 'fulfilled') {
        const lock = lockResult.value;
        if (lock.active) {
          activeStakes.push({
            amount: lock.amount,
            lockUntil: lock.lockUntil,
            points: lock.points,
            createdAt: lock.createdAt,
            active: lock.active,
          });
        }
      }
    }
    
    return activeStakes;
  } catch {
    return [];
  }
}

/**
 * Get active PUSD locks for a user
 * Uses rpcBatchHandler to avoid rate limiting
 */
export async function getUserActivePUSDStakes(
  stakingContract: Contract,
  userAddress: string
): Promise<PUSDStake[]> {
  try {
    const lockCount = await rpcBatchHandler.add(() => 
      stakingContract.getUserPUSDLockCount(userAddress)
    );
    
    if (lockCount === 0n) return [];
    
    const activeStakes: PUSDStake[] = [];
    const lockPromises: Promise<any>[] = [];
    
    // Batch all lock queries
    for (let i = 0; i < Number(lockCount); i++) {
      lockPromises.push(
        rpcBatchHandler.add(() => stakingContract.getUserPUSDLock(userAddress, i))
      );
    }
    
    const locks = await Promise.allSettled(lockPromises);
    
    for (const lockResult of locks) {
      if (lockResult.status === 'fulfilled') {
        const lock = lockResult.value;
        if (lock.active) {
          activeStakes.push({
            amount: lock.amount,
            lockUntil: lock.lockUntil,
            points: lock.points,
            createdAt: lock.createdAt,
            active: lock.active,
          });
        }
      }
    }
    
    return activeStakes;
  } catch {
    return [];
  }
}

