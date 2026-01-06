import jwt from '@tsndr/cloudflare-worker-jwt';
import { logWithContext } from './log';

// ============================================================================
// Encryption Key Management
// ============================================================================

/**
 * Encryption key cache to avoid repeated derivation
 */
let cachedEncryptionKey: CryptoKey | null = null;

/**
 * Generate or retrieve encryption key from environment secret.
 *
 * IMPORTANT: The ENCRYPTION_KEY secret must be set using:
 *   wrangler secret put ENCRYPTION_KEY
 *
 * The key should be a 32-byte (64 hex chars) or 44-byte base64 string.
 * To generate: openssl rand -base64 32
 */
async function getEncryptionKey(secretKey?: string): Promise<CryptoKey> {
  // Return cached key if available
  if (cachedEncryptionKey) {
    return cachedEncryptionKey;
  }

  // Use provided secret from environment
  if (secretKey) {
    try {
      // Try to decode as base64 first
      const keyBytes = Uint8Array.from(atob(secretKey), c => c.charCodeAt(0));
      cachedEncryptionKey = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );
      logWithContext('ENCRYPTION', 'Encryption key loaded from secret');
      return cachedEncryptionKey;
    } catch (error) {
      logWithContext('ENCRYPTION', 'Failed to load encryption key from secret', {
        error: error instanceof Error ? error.message : String(error)
      });
      // Fall through to deriving a key
    }
  }

  // Fallback: derive a key from Web Crypto (better than static key)
  // Generate a random key material and cache it
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));

  cachedEncryptionKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );

  logWithContext('ENCRYPTION', 'Generated ephemeral encryption key (WARNING: not persisted across restarts)');
  return cachedEncryptionKey;
}

export function clearEncryptionKeyCache(): void {
  cachedEncryptionKey = null;
}

// Encryption utilities
export async function encrypt(text: string, secretKey?: string): Promise<string> {
  logWithContext('ENCRYPTION', 'Starting encryption process');

  const key = await getEncryptionKey(secretKey);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedText = new TextEncoder().encode(text);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodedText
  );

  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  logWithContext('ENCRYPTION', 'Encryption completed successfully');
  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(encryptedText: string, secretKey?: string): Promise<string> {
  logWithContext('DECRYPTION', 'Starting decryption process');

  const key = await getEncryptionKey(secretKey);

  const combined = new Uint8Array(
    atob(encryptedText)
      .split('')
      .map(char => char.charCodeAt(0))
  );

  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );

  const result = new TextDecoder().decode(decrypted);
  logWithContext('DECRYPTION', 'Decryption completed successfully');
  return result;
}

// JWT token generation for GitHub App authentication
async function generateAppJWT(appId: string, privateKey: string): Promise<string> {
  logWithContext('JWT', 'Generating App JWT token', { appId });

  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iss: appId,
    iat: now - 60, // Issue time (1 minute ago to account for clock skew)
    exp: now + 600, // Expiration time (10 minutes from now)
  };

  logWithContext('JWT', 'JWT payload prepared', { payload });

  // GitHub requires RS256 algorithm for App JWT tokens
  const token = await jwt.sign(payload, privateKey, { algorithm: 'RS256' });

  logWithContext('JWT', 'App JWT token generated successfully');
  return token;
}

// Generate installation access token for making GitHub API calls
export async function generateInstallationToken(
  appId: string,
  privateKey: string,
  installationId: string
): Promise<{ token: string; expires_at: string } | null> {
  logWithContext('INSTALLATION_TOKEN', 'Starting installation token generation', {
    appId,
    installationId
  });

  try {
    // First, generate App JWT
    const appJWT = await generateAppJWT(appId, privateKey);
    logWithContext('INSTALLATION_TOKEN', 'App JWT generated, exchanging for installation token');

    // Exchange for installation access token
    const apiUrl = `https://api.github.com/app/installations/${installationId}/access_tokens`;
    logWithContext('INSTALLATION_TOKEN', 'Calling GitHub API', { url: apiUrl });

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${appJWT}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Worker-GitHub-Integration'
      }
    });

    logWithContext('INSTALLATION_TOKEN', 'GitHub API response received', {
      status: response.status,
      statusText: response.statusText
    });

    if (!response.ok) {
      const errorText = await response.text();
      logWithContext('INSTALLATION_TOKEN', 'Failed to generate installation token', {
        status: response.status,
        error: errorText
      });
      return null;
    }

    const tokenData = await response.json() as { token: string; expires_at: string };
    logWithContext('INSTALLATION_TOKEN', 'Installation token generated successfully', {
      expires_at: tokenData.expires_at
    });

    return tokenData;
  } catch (error) {
    logWithContext('INSTALLATION_TOKEN', 'Error generating installation token', {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}