import db from './services/dbService';
import { registerUser } from './services/localAuthService';

const run = async () => {
  try {
    console.log('Starting user update...');

    // 1. Delete old user if exists
    const deleteOld = db.prepare('DELETE FROM users WHERE email = ?');
    const resOld = deleteOld.run('m7mdezk@gmail.com');
    console.log(`Deleted old user (m7mdezk@gmail.com): ${resOld.changes} changes`);

    // 2. Delete target user if exists (to ensure fresh creation)
    const deleteTarget = db.prepare('DELETE FROM users WHERE email = ?');
    const resTarget = deleteTarget.run('vois@gmail.com');
    console.log(`Deleted target user (vois@gmail.com) to refresh: ${resTarget.changes} changes`);

    // 3. Register new user
    console.log('Registering new user: vois@gmail.com');
    const user = await registerUser('vois@gmail.com', 'vois 12345', 'vois');
    console.log('User created successfully:', user);

  } catch (error) {
    console.error('Error updating user:', error);
  }
};

run();
