import { getPullRequestDiff, getCommitHistory } from '../src/services/gitService';
import { setConfig } from '../src/services/configService';
import * as azdev from 'azure-devops-node-api';

// Mock Azure DevOps API
// jest.mock('azure-devops-node-api');

const runTest = async () => {
  try {
    console.log('1. Setting mock Azure config...');
    setConfig('AZURE_ORG_URL', 'https://dev.azure.com/mock-org', false);
    setConfig('AZURE_DEVOPS_PAT', 'mock_pat', true);
    console.log('Config set.');

    console.log('2. Testing getPullRequestDiff (expecting error due to mock connection)...');
    try {
      await getPullRequestDiff('repo-id', 1, 'project');
    } catch (error: any) {
      // We expect an error because we can't actually connect to the mock URL
      // But if it fails with "Azure DevOps Org URL or PAT not configured", that's a fail.
      if (error.message.includes('Azure DevOps Org URL or PAT not configured')) {
        console.error('FAIL: Config not picked up.');
      } else {
        console.log('PASS: Config picked up, connection attempted.');
      }
    }

  } catch (error: any) {
    console.error('Test failed:', error.message);
  }
};

runTest();
