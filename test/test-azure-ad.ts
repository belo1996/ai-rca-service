import axios from 'axios';

const runTest = async () => {
  try {
    console.log('1. Checking Azure AD auth endpoint...');
    // We expect a 500 because env vars are not set in the test environment usually,
    // or a redirect if they are.
    // We just want to ensure the route exists and handles the request.
    
    try {
      await axios.get('http://localhost:3000/auth/azure');
    } catch (error: any) {
      if (error.response && error.response.status === 500 && error.response.data.includes('Azure AD OAuth not configured')) {
        console.log('PASS: Endpoint reachable, correctly identified missing config.');
      } else if (error.response && error.response.status === 302) {
        console.log('PASS: Endpoint reachable, redirected to Azure.');
      } else {
        console.log('Response:', error.response ? error.response.status : error.message);
      }
    }

    console.log('2. Checking Auth Status endpoint...');
    const statusRes = await axios.get('http://localhost:3000/auth/status');
    console.log('Auth Status:', statusRes.data);

  } catch (error: any) {
    console.error('Test failed:', error.message);
    if (error.code) console.error('Error code:', error.code);
  }
};

runTest();
