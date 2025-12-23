import passport from 'passport';
import { OIDCStrategy } from 'passport-azure-ad';
import { upsertUser, getUser, User } from './dbService';
import { upsertSubscription } from './dbService';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

export const configurePassport = () => {
  const clientID = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const tenantID = process.env.AZURE_TENANT_ID;

  console.log(`[AuthService] Config: TenantID=${tenantID}, ClientID=${clientID ? 'Set' : 'Missing'}`);
  console.log(`[AuthService] Identity Metadata: https://login.microsoftonline.com/${tenantID}/v2.0/.well-known/openid-configuration`);

  if (!clientID || !clientSecret || !tenantID) {
    console.warn('AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, or AZURE_TENANT_ID not set. Azure AD OAuth will not work.');
    return;
  }

  passport.use(new OIDCStrategy({
      identityMetadata: `https://login.microsoftonline.com/${tenantID}/v2.0/.well-known/openid-configuration`,
      clientID: clientID,
      responseType: 'code',
      responseMode: 'form_post', // Revert to form_post (standard)
      redirectUrl: process.env.AZURE_REDIRECT_URL || 'http://localhost:3000/auth/azure/callback',
      allowHttpForRedirectUrl: true,
      clientSecret: clientSecret,
      validateIssuer: false,
      passReqToCallback: false,
      useCookieInsteadOfSession: true, // Use dedicated cookie for state
      cookieEncryptionKeys: [
        { 'key': '12345678901234567890123456789012', 'iv': '123456789012' },
        { 'key': '12345678901234567890123456789012', 'iv': '123456789012' }
      ],
      loggingLevel: 'info', // Enable logging
      loggingNoPII: false, // Show details (dev only)
      // Restore .default scope to request Azure DevOps access
      scope: ['openid', 'profile', 'email', 'offline_access', '499b84ac-1321-427f-aa17-267ca6975798/.default']
    },
    async (iss: any, sub: any, profile: any, accessToken: any, refreshToken: any, done: any) => {
      try {
        if (!accessToken) {
          return done(new Error('No access token received'));
        }

        console.log(`Authenticated Azure user: ${profile.displayName}`);
        
        // Calculate expiry (usually 1h)
        const expiresAt = Date.now() + 3500 * 1000; // 3500s safety buffer

        const user: User = {
          id: sub, // Azure AD Object ID
          azure_id: sub,
          // username: profile.displayName, // Removed as it's not in User interface
          name: profile.displayName,
          email: profile.upn || profile.email,
          refresh_token: refreshToken,
          access_token: accessToken,
          expires_at: expiresAt
        };

        // Save user to DB
        upsertUser(user);

        // Initialize default subscription if new
        if (!getUser(user.id)) {
           upsertSubscription({
             user_id: user.id,
             plan_id: 'free',
             status: 'active'
           });
        }

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  ));

  passport.serializeUser((user: any, done) => {
    console.log('Serialize User:', user.id);
    done(null, user.id);
  });

  passport.deserializeUser((id: string, done) => {
    console.log('Deserialize User:', id);
    const user = getUser(id);
    if (user) {
      console.log('User found in DB');
      done(null, user);
    } else {
      console.log('User NOT found in DB');
      done(null, null);
    }
  });
};

// Token Refresh Logic
export const getValidAccessToken = async (userId: string): Promise<string> => {
  const user = getUser(userId);
  if (!user || !user.refresh_token) {
    throw new Error('User not found or no refresh token available');
  }

  // Check if current access token is valid
  if (user.access_token && user.expires_at && user.expires_at > Date.now()) {
    return user.access_token;
  }

  console.log(`Refreshing token for user ${userId}...`);

  // Refresh Token
  try {
    const params = new URLSearchParams();
    params.append('client_id', process.env.AZURE_CLIENT_ID!);
    params.append('client_secret', process.env.AZURE_CLIENT_SECRET!);
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', user.refresh_token);
    params.append('scope', '499b84ac-1321-427f-aa17-267ca6975798/.default offline_access');

    const response = await axios.post(`https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`, params);
    
    const data = response.data as any; // Cast to any to avoid unknown error
    const newAccessToken = data.access_token;
    const newRefreshToken = data.refresh_token; // Might be new
    const expiresIn = data.expires_in;

    // Update DB
    upsertUser({
      ...user,
      access_token: newAccessToken,
      refresh_token: newRefreshToken || user.refresh_token,
      expires_at: Date.now() + (expiresIn - 300) * 1000 // Buffer
    });

    return newAccessToken;
  } catch (error: any) {
    console.error('Failed to refresh token:', error.response?.data || error.message);
    throw new Error('Failed to refresh access token');
  }
};
