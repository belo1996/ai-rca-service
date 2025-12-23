import axios from 'axios';

const WEBHOOK_URL = 'http://localhost:3000/api/webhooks/github';

const mockPayload = {
  action: 'opened',
  number: 123,
  pull_request: {
    number: 123,
    title: 'Fix: Null pointer exception bug in login',
    body: 'This PR fixes a critical bug where login fails.',
    html_url: 'https://github.com/owner/repo/pull/123',
    user: {
      login: 'testuser',
    },
    head: {
      ref: 'fix/bug-login',
    },
  },
  repository: {
    name: 'repo',
    owner: {
      login: 'owner',
    },
  },
};

const runTest = async () => {
  try {
    console.log('Sending mock webhook payload...');
    const response = await axios.post(WEBHOOK_URL, mockPayload, {
      headers: {
        'x-github-event': 'pull_request',
      },
    });
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
  } catch (error: any) {
    console.error('Error sending webhook:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
};

runTest();
