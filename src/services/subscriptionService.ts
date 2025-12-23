import { getSubscription, getRepositoryCount, upsertSubscription } from './dbService';

export const PLAN_LIMITS = {
  free: Infinity, // Unlimited for testing
  standard: Infinity,
  pro: Infinity
};

export const checkRepoLimit = (userId: string): boolean => {
  const subscription = getSubscription(userId);
  const currentCount = getRepositoryCount(userId);
  
  // Default to free if no subscription found (shouldn't happen with authService logic)
  const plan = subscription?.plan_id || 'free';
  const limit = PLAN_LIMITS[plan];

  return currentCount < limit;
};

export const upgradePlan = (userId: string, planId: 'free' | 'standard' | 'pro') => {
  upsertSubscription({
    user_id: userId,
    plan_id: planId,
    status: 'active'
  });
};
