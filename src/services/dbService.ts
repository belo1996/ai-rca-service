import Database from 'better-sqlite3';
import path from 'path';
import { encrypt, decrypt } from '../utils/encryption';

const dbPath = path.join(__dirname, '../../config.db');
const db = new Database(dbPath);

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    azure_id TEXT UNIQUE,
    email TEXT UNIQUE,
    name TEXT,
    password_hash TEXT, -- For local auth
    refresh_token TEXT, -- Encrypted
    access_token TEXT, -- Encrypted (Cached)
    expires_at INTEGER, -- Timestamp
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1 -- 1 = Active, 0 = Inactive
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    user_id TEXT PRIMARY KEY,
    plan_id TEXT, -- 'free', 'standard', 'pro'
    status TEXT, -- 'active', 'cancelled'
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS repositories (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    azure_repo_id TEXT,
    name TEXT,
    webhook_id TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    user_id TEXT PRIMARY KEY,
    notification_emails TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  
  -- Keep the old config table for backward compatibility or system-wide settings
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT,
    is_encrypted INTEGER DEFAULT 0
  );
`);

// Migration: Add is_active column if it doesn't exist
try {
  db.exec('ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1');
} catch (error: any) {
  // Column likely already exists, ignore
}

export interface User {
  id: string;
  azure_id?: string;
  email: string;
  name: string;
  password_hash?: string;
  refresh_token?: string;
  access_token?: string;
  expires_at?: number;
  is_active?: number;
}

export interface Subscription {
  user_id: string;
  plan_id: 'free' | 'standard' | 'pro';
  status: string;
}

export interface Repository {
  id: string;
  user_id: string;
  azure_repo_id: string;
  name: string;
  webhook_id?: string;
}

// User Operations
export const upsertUser = (user: User) => {
  const { id, azure_id, email, name, password_hash, refresh_token, access_token, expires_at, is_active } = user;
  const encryptedRefreshToken = refresh_token ? encrypt(refresh_token) : null;
  const encryptedAccessToken = access_token ? encrypt(access_token) : null;
  
  const stmt = db.prepare(`
    INSERT INTO users (id, azure_id, email, name, password_hash, refresh_token, access_token, expires_at, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 1))
    ON CONFLICT(id) DO UPDATE SET
      email = excluded.email,
      name = excluded.name,
      azure_id = COALESCE(excluded.azure_id, users.azure_id),
      password_hash = COALESCE(excluded.password_hash, users.password_hash),
      refresh_token = excluded.refresh_token,
      access_token = excluded.access_token,
      expires_at = excluded.expires_at
  `);
  stmt.run(id, azure_id, email, name, password_hash, encryptedRefreshToken, encryptedAccessToken, expires_at, is_active);
};

export const toggleUserStatus = (userId: string, isActive: boolean) => {
  const stmt = db.prepare('UPDATE users SET is_active = ? WHERE id = ?');
  stmt.run(isActive ? 1 : 0, userId);
};

export const getUser = (id: string): User | undefined => {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  const row = stmt.get(id) as any;
  if (!row) return undefined;
  
  return {
    ...row,
    refresh_token: row.refresh_token ? decrypt(row.refresh_token) : undefined,
    access_token: row.access_token ? decrypt(row.access_token) : undefined
  };
};

export const getUserByEmail = (email: string): User | undefined => {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  const row = stmt.get(email) as any;
  if (!row) return undefined;

  return {
    ...row,
    refresh_token: row.refresh_token ? decrypt(row.refresh_token) : undefined,
    access_token: row.access_token ? decrypt(row.access_token) : undefined
  };
};

export const getUserByAzureId = (azureId: string): User | undefined => {
  const stmt = db.prepare('SELECT * FROM users WHERE azure_id = ?');
  const row = stmt.get(azureId) as any;
  if (!row) return undefined;

  return {
    ...row,
    refresh_token: row.refresh_token ? decrypt(row.refresh_token) : undefined
  };
};

// Subscription Operations
export const upsertSubscription = (sub: Subscription) => {
  const stmt = db.prepare(`
    INSERT INTO subscriptions (user_id, plan_id, status)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      plan_id = excluded.plan_id,
      status = excluded.status
  `);
  stmt.run(sub.user_id, sub.plan_id, sub.status);
};

export const getSubscription = (userId: string): Subscription | undefined => {
  const stmt = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?');
  return stmt.get(userId) as Subscription | undefined;
};

// Repository Operations
export const addRepository = (repo: Repository) => {
  const stmt = db.prepare(`
    INSERT INTO repositories (id, user_id, azure_repo_id, name, webhook_id)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      webhook_id = excluded.webhook_id,
      name = excluded.name,
      user_id = excluded.user_id
  `);
  stmt.run(repo.id, repo.user_id, repo.azure_repo_id, repo.name, repo.webhook_id);
};

export const getUserRepositories = (userId: string): Repository[] => {
  const stmt = db.prepare('SELECT * FROM repositories WHERE user_id = ?');
  return stmt.all(userId) as Repository[];
};

export const getRepositoryCount = (userId: string): number => {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM repositories WHERE user_id = ?');
  const result = stmt.get(userId) as { count: number };
  return result.count;
};

export const getRepository = (repoId: string): Repository | undefined => {
  const stmt = db.prepare('SELECT * FROM repositories WHERE id = ?');
  return stmt.get(repoId) as Repository | undefined;
};

export const deleteRepository = (repoId: string) => {
  const stmt = db.prepare('DELETE FROM repositories WHERE id = ?');
  stmt.run(repoId);
};

export default db;
