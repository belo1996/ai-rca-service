import axios from 'axios';
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '../config.db');

// We cannot easily automate full OAuth flow without a browser and real credentials.
// But we can verify that if we manually insert a token via the auth service logic (simulated), it works.
// Or we can verify the /auth/status endpoint.

const runTest = async () => {
  try {
    console.log('1. Checking initial auth status...');
    const response = await axios.get('http://localhost:3000/auth/status');
    console.log('Auth Status:', response.data);

    // Since we can't login via script without browser interaction for OAuth,
    // we will verify that the code compiles and the endpoint is reachable.
    
    if (response.status === 200) {
      console.log('Auth endpoint reachable: PASS');
    } else {
      console.error('Auth endpoint failed:', response.status);
    }

  } catch (error: any) {
    console.error('Test failed:', error.message);
  }
};

runTest();
