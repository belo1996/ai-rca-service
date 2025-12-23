import Database from 'better-sqlite3';
import path from 'path';
import { encrypt, decrypt } from '../utils/encryption';

const dbPath = path.join(__dirname, '../../config.db');
const db = new Database(dbPath);

// Initialize Config Table (Legacy/System)
db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT,
    is_encrypted INTEGER DEFAULT 0
  )
`);

export const setConfig = (key: string, value: string, encrypted: boolean = false) => {
  const valToStore = encrypted ? encrypt(value) : value;
  const stmt = db.prepare('INSERT OR REPLACE INTO config (key, value, is_encrypted) VALUES (?, ?, ?)');
  stmt.run(key, valToStore, encrypted ? 1 : 0);
};

export const getConfig = (key: string): string | null => {
  const stmt = db.prepare('SELECT value, is_encrypted FROM config WHERE key = ?');
  const row = stmt.get(key) as { value: string; is_encrypted: number } | undefined;

  if (!row) return null;

  if (row.is_encrypted) {
    try {
      return decrypt(row.value);
    } catch (e) {
      console.error(`Failed to decrypt config for key ${key}`, e);
      return null;
    }
  }
  return row.value;
};

export const getAllConfig = () => {
  const stmt = db.prepare('SELECT key, value, is_encrypted FROM config');
  const rows = stmt.all() as { key: string; value: string; is_encrypted: number }[];
  
  // Return masked values for encrypted keys
  return rows.map(row => ({
    key: row.key,
    value: row.is_encrypted ? '********' : row.value,
    isEncrypted: !!row.is_encrypted
  }));
};
