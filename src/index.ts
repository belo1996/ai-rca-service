import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { handleWebhook } from './handlers/webhook';
import { getLogs } from './services/logService';
import { getAllConfig, setConfig } from './services/configService';
import session from 'express-session';
import passport from 'passport';
import { configurePassport } from './services/authService';

dotenv.config();
console.log('Loaded Env Vars:', {
  AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID,
  AZURE_TENANT_ID: process.env.AZURE_TENANT_ID,
  HasSecret: !!process.env.AZURE_CLIENT_SECRET
});

configurePassport();

const app = express();
const PORT = process.env.PORT || 3000;

import fs from 'fs';

// Global Request Logger (Must be first)
app.use((req, res, next) => {
  const log = `[${new Date().toISOString()}] [${req.method}] ${req.url}\n`;
  fs.appendFileSync('debug.log', log);
  console.log(log.trim());
  next();
});

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // Required for Azure AD OIDC form_post
const SESSION_SECRET = process.env.SESSION_SECRET || 'keyboard cat';
app.use(cookieParser(SESSION_SECRET));
app.use(express.static(path.join(__dirname, '../public')));

import SQLiteStore from 'connect-sqlite3';

const SQLiteSessionStore = SQLiteStore(session);

// Session middleware
app.use(session({
  store: new SQLiteSessionStore({ db: 'sessions.db', dir: '.' }) as any,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
    secure: false, // Allow HTTP (localhost)
    sameSite: 'lax' // Allow cookie to be sent on navigation from external site
  }
}));

app.use(passport.initialize());
app.use(passport.session());

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Auth Routes
import { registerUser, loginUser } from './services/localAuthService';

app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).send('Missing fields');
    
    const user = await registerUser(email, password, name);
    req.login(user, (err) => {
      if (err) return res.status(500).send(err);
      res.json({ success: true, user });
    });
  } catch (err: any) {
    res.status(400).send(err.message);
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await loginUser(email, password);
    if (!user) return res.status(401).send('Invalid credentials');
    
    req.login(user, (err) => {
      if (err) return res.status(500).send(err);
      res.json({ success: true, user });
    });
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

app.get('/auth/azure', (req, res, next) => {
  if (!process.env.AZURE_CLIENT_ID || !process.env.AZURE_CLIENT_SECRET || !process.env.AZURE_TENANT_ID) {
    return res.status(500).send('Azure AD OAuth not configured. Please set AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, and AZURE_TENANT_ID in .env');
  }
  passport.authenticate('azuread-openidconnect', { failureRedirect: '/' })(req, res, next);
});

app.post('/auth/azure/callback', 
  (req, res, next) => {
    const log = `[${new Date().toISOString()}] Received Azure Callback. SessionID: ${req.sessionID}. Cookies: ${JSON.stringify(req.cookies)}. Body: ${JSON.stringify(req.body)}\n`;
    fs.appendFileSync('debug.log', log);
    console.log('Received Azure Callback');
    
    passport.authenticate('azuread-openidconnect', { 
      failureRedirect: '/',
      failureMessage: true 
    }, (err: any, user: any, info: any) => {
      if (err) {
        const log = `[${new Date().toISOString()}] Passport Auth Error: ${JSON.stringify(err)}\n`;
        fs.appendFileSync('debug.log', log);
        console.error('Passport Auth Error:', err);
        return res.redirect('/');
      }
      if (!user) {
        const log = `[${new Date().toISOString()}] Passport Auth Failed (No User): ${JSON.stringify(info)}\n`;
        fs.appendFileSync('debug.log', log);
        console.error('Passport Auth Failed (No User):', info);
        return res.redirect('/');
      }
      
      req.logIn(user, (err) => {
        if (err) {
          const log = `[${new Date().toISOString()}] req.logIn Error: ${JSON.stringify(err)}\n`;
          fs.appendFileSync('debug.log', log);
          console.error('req.logIn Error:', err);
          return res.redirect('/');
        }
        
        const log = `[${new Date().toISOString()}] Authentication successful for user: ${user.name}\n`;
        fs.appendFileSync('debug.log', log);
        console.log('Authentication successful for user:', user.name);
        
        // Manually save session before redirecting
        req.session.save((err) => {
          if (err) {
            const log = `[${new Date().toISOString()}] Session save error: ${JSON.stringify(err)}\n`;
            fs.appendFileSync('debug.log', log);
            console.error('Session save error:', err);
            return res.redirect('/');
          }
          res.redirect('/');
        });
      });
    })(req, res, next);
  }
);

app.get('/auth/status', (req, res) => {
  if (req.isAuthenticated()) {
    const user = req.user as any;
    res.json({
      isAuthenticated: true,
      isAzureConnected: !!user.azure_id, // Check if linked to Azure
      user: user,
      isActive: user.is_active !== 0, // Default to true if undefined or 1
      method: 'oauth'
    });
  } else {
    res.json({ isAuthenticated: false, isAzureConnected: false });
  }
});

app.get('/auth/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) { return next(err); }
    req.session.destroy((err) => {
      if (err) console.error('Session destroy error:', err);
      res.redirect('/');
    });
  });
});

app.get('/api/logs', (req, res) => {
  res.json(getLogs());
});

app.get('/api/config', (req, res) => {
  res.json(getAllConfig());
});

app.post('/api/config', (req, res) => {
  const { key, value, encrypted } = req.body;
  if (!key || value === undefined) {
    return res.status(400).send('Missing key or value');
  }
  setConfig(key, value, encrypted);
  res.status(200).send('Config saved');
});

import { listAzureRepositories, connectRepository, disconnectRepository } from './services/repoService';
import { getUserRepositories, getSubscription, toggleUserStatus } from './services/dbService';
import { upgradePlan } from './services/subscriptionService';

// ... (existing imports)

// SaaS Endpoints

// 0. Toggle User Status
app.post('/api/user/toggle', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).send('Unauthorized');
  const { isActive } = req.body;
  if (typeof isActive !== 'boolean') return res.status(400).send('Invalid status');
  
  toggleUserStatus((req.user as any).id, isActive);
  res.json({ success: true, isActive });
});

// 1. List Connected Repos
app.get('/api/repos', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).send('Unauthorized');
  const repos = getUserRepositories((req.user as any).id);
  res.json(repos);
});

// 2. List Available Azure Repos (for selection)
app.get('/api/azure/repos', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).send('Unauthorized');
  try {
    // We need the Org URL. For now, assume it's stored or passed.
    // In SaaS, we might store it in the User profile or ask for it.
    // Let's assume we get it from query or config (if single tenant mode, but this is multi-tenant).
    // For MVP, let's ask user to provide it in settings or query param.
    const orgUrl = req.query.orgUrl as string;
    if (!orgUrl) return res.status(400).send('Org URL required');

    const repos = await listAzureRepositories((req.user as any).id, orgUrl);
    res.json(repos);
  } catch (error: any) {
    res.status(500).send(error.message);
  }
});

// 3. Connect a Repo
app.post('/api/repos', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).send('Unauthorized');
  const { orgUrl, repoId, repoName, projectId } = req.body;
  
  try {
    const result = await connectRepository((req.user as any).id, orgUrl, repoId, repoName, projectId);
    res.json(result);
  } catch (error: any) {
    res.status(400).send(error.message);
  }
});

// 3.5 Disconnect a Repo
app.delete('/api/repos/:id', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).send('Unauthorized');
  const repoId = req.params.id;
  
  try {
    await disconnectRepository((req.user as any).id, repoId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).send(error.message);
  }
});

// 4. Subscription Info
app.get('/api/subscription', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).send('Unauthorized');
  const sub = getSubscription((req.user as any).id);
  res.json(sub || { plan_id: 'free', status: 'active' });
});

// 5. Upgrade Plan
app.post('/api/subscription/upgrade', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).send('Unauthorized');
  const { planId } = req.body;
  if (!['free', 'standard', 'pro'].includes(planId)) return res.status(400).send('Invalid plan');
  
  upgradePlan((req.user as any).id, planId);
  res.json({ success: true });
});

// ... (existing config endpoints)

app.post('/api/webhooks/github', handleWebhook);

app.post('/api/reset', (req, res) => {
  const db = require('./services/dbService').default;
  db.exec('DELETE FROM repositories; DELETE FROM subscriptions; DELETE FROM settings; DELETE FROM users; DELETE FROM config;');
  res.json({ success: true });
});

import { discoverNgrokUrl } from './services/ngrokService';

const startServer = async () => {
  // Try to discover Ngrok URL
  const ngrokUrl = await discoverNgrokUrl();
  if (ngrokUrl) {
    process.env.WEBHOOK_URL = `${ngrokUrl}/api/webhooks/github`;
    console.log(`Updated WEBHOOK_URL to: ${process.env.WEBHOOK_URL}`);
  }

  app.listen(PORT, () => {
    console.log(`AI RCA Service running on port ${PORT}`);
  });
};

startServer();
