import axios from 'axios';
import Database from 'better-sqlite3';
import path from 'path';

const API_URL = 'http://localhost:3000/api/config';
const DB_PATH = path.join(__dirname, '../config.db');

const runTest = async () => {
  try {
    console.log('1. Setting config...');
    await axios.post(API_URL, {
      key: 'TEST_KEY',
      value: 'secret_value',
      encrypted: true,
    });
    console.log('Config set.');

    console.log('2. Getting config from API...');
    const response = await axios.get(API_URL);
    const config = (response.data as any[]).find((c: any) => c.key === 'TEST_KEY');
    
    if (config && config.value === '********') {
      console.log('API returned masked value: PASS');
    } else {
      console.error('API did not return masked value:', config);
    }

    console.log('3. Verifying DB encryption...');
    const db = new Database(DB_PATH);
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get('TEST_KEY') as { value: string };
    
    if (row.value !== 'secret_value' && row.value.includes(':')) {
      console.log('DB value is encrypted: PASS');
    } else {
      console.error('DB value is NOT encrypted:', row.value);
    }

  } catch (error: any) {
    console.error('Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
};

runTest();
