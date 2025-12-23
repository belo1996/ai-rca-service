import { upsertUser, getUser, upsertSubscription, getSubscription, addRepository, getRepositoryCount } from '../src/services/dbService';
import { checkRepoLimit, upgradePlan } from '../src/services/subscriptionService';
import { connectRepository } from '../src/services/repoService';

// Mock Azure API for connectRepository
jest.mock('azure-devops-node-api', () => ({
  getPersonalAccessTokenHandler: () => ({}),
  WebApi: class {
    getServiceHooksApi() {
      return {
        createSubscription: async () => ({ id: 'mock-webhook-id' })
      };
    }
  }
}));

// Mock Auth Service
jest.mock('../src/services/authService', () => ({
  getValidAccessToken: async () => 'mock-access-token'
}));

const runTest = async () => {
  console.log('Starting SaaS Flow Verification...');

  const userId = 'mock-user-id';
  
  // 1. Create User
  console.log('1. Creating Mock User...');
  upsertUser({
    id: userId,
    azure_id: 'mock-azure-id',
    email: 'test@example.com',
    name: 'Test User',
    refresh_token: 'mock-refresh-token'
  });

  // 2. Initialize Subscription (Free)
  console.log('2. Initializing Subscription...');
  upsertSubscription({
    user_id: userId,
    plan_id: 'free',
    status: 'active'
  });

  const sub = getSubscription(userId);
  console.log('Current Plan:', sub?.plan_id);
  if (sub?.plan_id !== 'free') throw new Error('Expected free plan');

  // 3. Add Repo 1 (Should succeed)
  console.log('3. Adding Repo 1...');
  // We bypass connectRepository for DB check to avoid mocking everything perfectly, 
  // or we can mock connectRepository. Let's use the actual DB function for limits check.
  
  // Simulate connectRepository logic for limits
  if (!checkRepoLimit(userId)) throw new Error('Should allow 1st repo');
  addRepository({
    id: 'repo-1',
    user_id: userId,
    azure_repo_id: 'repo-1',
    name: 'Repo 1',
    webhook_id: 'hook-1'
  });
  console.log('Repo 1 added.');

  // 4. Add Repo 2 (Should fail on Free)
  console.log('4. Adding Repo 2 (Expected Failure)...');
  if (checkRepoLimit(userId)) {
    throw new Error('Should NOT allow 2nd repo on Free plan');
  } else {
    console.log('PASS: Limit enforced.');
  }

  // 5. Upgrade to Standard
  console.log('5. Upgrading to Standard...');
  upgradePlan(userId, 'standard');
  const upgradedSub = getSubscription(userId);
  console.log('New Plan:', upgradedSub?.plan_id);
  if (upgradedSub?.plan_id !== 'standard') throw new Error('Expected standard plan');

  // 6. Add Repo 2 (Should succeed now)
  console.log('6. Adding Repo 2 (Retry)...');
  if (!checkRepoLimit(userId)) throw new Error('Should allow 2nd repo on Standard plan');
  addRepository({
    id: 'repo-2',
    user_id: userId,
    azure_repo_id: 'repo-2',
    name: 'Repo 2',
    webhook_id: 'hook-2'
  });
  console.log('Repo 2 added.');

  console.log('SaaS Flow Verification Passed!');
};

runTest().catch(console.error);
