/**
 * HTTP Transport for MCP Server
 * Implements Streamable HTTP transport with OAuth authentication and session management
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { FergusClient } from '../fergus-client.js';
import { createMcpServer } from '../server.js';
import { SessionManager } from '../auth/session-manager.js';
import { TokenManager } from '../auth/token-manager.js';
import { RedisTokenManager } from '../auth/redis-token-manager.js';
import { FileTokenManager } from '../auth/file-token-manager.js';
import { generateAuthUrl, exchangeCodeForTokens, generateState, generatePKCE } from '../auth/oauth-handler.js';
import { HttpOAuthConfig } from '../config.js';

/**
 * Temporary storage for OAuth state parameters (CSRF protection)
 * In production, use Redis or encrypted session storage
 */
interface OAuthStateData {
  state: string;
  codeVerifier: string;
  createdAt: Date;
  clientState?: string;
  clientRedirectUri?: string;
  clientCodeChallenge?: string;
}
const oauthStates = new Map<string, OAuthStateData>();

/**
 * Create and start HTTP transport server with OAuth support
 */
export async function startHttpOAuthServer(config: HttpOAuthConfig): Promise<void> {
  const app = express();
  const sessionManager = new SessionManager(config.session);

  // Initialize token manager based on session storage type
  let tokenManager;
  if (config.session.storage === 'redis' && config.session.redisUrl) {
    tokenManager = new RedisTokenManager(config.oauth, config.session.redisUrl, config.session.timeoutMs);
    const ttlDays = Math.floor(config.session.timeoutMs / (1000 * 60 * 60 * 24));
    console.error(`[HTTP OAuth Server] Token storage: redis (TTL: ${ttlDays} days from SESSION_TIMEOUT_MS)`);
  } else if (config.session.storage === 'file' || process.env.NODE_ENV === 'development') {
    tokenManager = new FileTokenManager(config.oauth);
    console.error(`[HTTP OAuth Server] Token storage: file (persistent across restarts)`);
  } else {
    tokenManager = new TokenManager(config.oauth);
    console.error(`[HTTP OAuth Server] Token storage: memory (ephemeral)`);
  }

  // Configure CORS
  app.use(cors({
    origin: config.allowedOrigins || '*',
    exposedHeaders: ['Mcp-Session-Id'],
    allowedHeaders: ['Content-Type', 'mcp-session-id', 'Authorization'],
    credentials: true,
  }));

  // Parse JSON bodies
  app.use(express.json());

  // Parse URL-encoded bodies (OAuth token endpoint uses application/x-www-form-urlencoded)
  app.use(express.urlencoded({ extended: true }));

  // Request logging middleware (production: use structured logger like Pino)
  app.use((req, res, next) => {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });

  /**
   * Health check endpoint
   */
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      activeSessions: sessionManager.getSessionCount(),
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * OAuth 2.0 Authorization Server Metadata (RFC8414)
   * This endpoint allows MCP clients to discover OAuth configuration
   *
   * In proxy OAuth mode, we act as the authorization server to Claude,
   * but proxy authentication to Cognito behind the scenes.
   */
  const oauthMetadataHandler = (req: Request, res: Response) => {
    const baseUrl = config.publicUrl || `https://${req.get('host')}`;

    const metadata = {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      registration_endpoint: `${baseUrl}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['profile'],
    };

    res.json(metadata);
  };

  // Standard path
  app.get('/.well-known/oauth-authorization-server', oauthMetadataHandler);
  app.get('/oauth/token/.well-known/openid-configuration', oauthMetadataHandler);

  // Claude Desktop also tries with /mcp suffix
  app.get('/.well-known/oauth-authorization-server/mcp', oauthMetadataHandler);

  /**
   * OAuth 2.0 Protected Resource Metadata
   * Indicates this resource requires OAuth authentication
   */
  const protectedResourceHandler = (req: Request, res: Response) => {
    const baseUrl = config.publicUrl || `https://${req.get('host')}`;

    const metadata = {
      resource: `${baseUrl}/mcp`,
      authorization_servers: [baseUrl],
      bearer_methods_supported: ['header'],
      resource_documentation: baseUrl,
    };

    res.json(metadata);
  };

  app.get('/.well-known/oauth-protected-resource', protectedResourceHandler);
  app.get('/.well-known/oauth-protected-resource/mcp', protectedResourceHandler);

  /**
   * POST /oauth/register - Dynamic Client Registration (RFC 7591)
   * Claude may try to register itself dynamically
   */
  app.post('/oauth/register', (req: Request, res: Response) => {
    // Dynamic client registration - accept all registrations
    // In production, validate and store client registrations
    const clientId = randomUUID();

    res.json({
      client_id: clientId,
      client_secret: randomUUID(), // Not used with PKCE, but some clients expect it
      redirect_uris: req.body.redirect_uris || [],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    });
  });

  /**
   * GET /oauth/authorize - Initiate OAuth flow
   * Claude redirects user's browser here to start authorization
   * We then redirect to Cognito for actual authentication
   */
  app.get('/oauth/authorize', async (req: Request, res: Response) => {
    try {
      // Extract parameters from Claude's authorization request
      const {
        client_id,
        redirect_uri,
        state: clientState,
        code_challenge,
        code_challenge_method,
        response_type,
      } = req.query;

      console.error(`[OAuth] Authorization request from client ${client_id}`);

      // Generate our own state for Cognito (we'll map back to client state later)
      const ourState = generateState();
      const { verifier, challenge } = await generatePKCE();

      // Store state with client information for callback
      oauthStates.set(ourState, {
        state: ourState,
        codeVerifier: verifier,
        createdAt: new Date(),
        clientState: clientState as string,
        clientRedirectUri: redirect_uri as string,
        clientCodeChallenge: code_challenge as string,
      });

      // Clean up old states (older than 10 minutes)
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      for (const [key, value] of oauthStates.entries()) {
        if (value.createdAt < tenMinutesAgo) {
          oauthStates.delete(key);
        }
      }

      // Redirect user to Cognito for authentication
      const authUrl = generateAuthUrl(config.oauth, ourState, challenge);

      console.error(`[OAuth] Redirecting to Cognito: ${authUrl}`);
      res.redirect(authUrl);
    } catch (error) {
      console.error('[OAuth] Error initiating authorization:', error);
      res.status(500).send('Failed to initiate OAuth flow');
    }
  });

  /**
   * GET /oauth/callback - Handle OAuth callback from Cognito
   * User authorized on Cognito, now we exchange code for tokens and redirect to Claude
   */
  app.get('/oauth/callback', async (req: Request, res: Response) => {
    try {
      const { code, state, error, error_description } = req.query;

      // Check for OAuth errors
      if (error) {
        console.error(`[OAuth] Authorization error: ${error} - ${error_description}`);
        res.status(400).send(`OAuth error: ${error}${error_description ? ` - ${error_description}` : ''}`);
        return;
      }

      // Validate required parameters
      if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
        res.status(400).send('Invalid OAuth callback: missing code or state');
        return;
      }

      // Verify state parameter (CSRF protection)
      const stateData = oauthStates.get(state);
      if (!stateData) {
        console.error(`[OAuth] Invalid or expired state parameter: ${state}`);
        res.status(400).send('Invalid or expired state parameter');
        return;
      }

      // Remove used state
      oauthStates.delete(state);

      console.error(`[OAuth] 🔐 Exchanging Cognito authorization code for tokens`);

      // Exchange code for tokens from Cognito
      const tokens = await exchangeCodeForTokens(config.oauth, code, stateData.codeVerifier);

      // Generate our own session ID
      const sessionId = randomUUID();

      // Store Cognito tokens
      tokenManager.storeTokens(sessionId, tokens);

      console.error('[OAuth] ✅ Stored tokens in MCP session');

      // Redirect to Claude's callback with our authorization code
      const clientRedirectUri = stateData.clientRedirectUri || 'https://claude.ai/api/mcp/auth_callback';
      const claudeCallbackUrl = new URL(clientRedirectUri);
      claudeCallbackUrl.searchParams.set('code', sessionId); // Our session ID is the authorization code for Claude
      claudeCallbackUrl.searchParams.set('state', stateData.clientState || state); // Pass through the client's original state

      console.error(`[OAuth] Redirecting to client callback: ${claudeCallbackUrl.toString()}`);
      res.redirect(claudeCallbackUrl.toString());
    } catch (error) {
      console.error('[OAuth] Error in callback:', error);
      res.status(500).send('Failed to complete OAuth flow');
    }
  });

  /**
   * POST /oauth/token - Exchange authorization code for access token OR refresh tokens
   * Called by Claude after user completes authorization or to refresh an expired token
   * The "code" here is our session ID that we sent to Claude's callback
   */
  app.post('/oauth/token', async (req: Request, res: Response) => {
    try {
      const { code, grant_type, code_verifier, refresh_token } = req.body;

      console.error(`[OAuth] Token request: grant_type=${grant_type}`);

      // Handle refresh token grant
      if (grant_type === 'refresh_token') {
        if (!refresh_token) {
          console.error('[OAuth] Missing refresh_token parameter');
          res.status(400).json({ error: 'invalid_request', error_description: 'refresh_token is required' });
          return;
        }

        // The refresh_token is our old session ID
        const oldSessionId = refresh_token;

        console.error('[OAuth] 🔄 Handling refresh_token grant');

        // Verify we have tokens for this session
        const hasTokens = await tokenManager.hasTokens(oldSessionId);
        if (!hasTokens) {
          console.error('[OAuth] ❌ Invalid or expired refresh token');
          res.status(400).json({ error: 'invalid_grant', error_description: 'Refresh token is invalid or expired' });
          return;
        }

        // Get Cognito tokens before refresh
        // Get access token (this will auto-refresh Cognito tokens if needed)
        const accessToken = await tokenManager.getAccessToken(oldSessionId);
        if (!accessToken) {
          console.error('[OAuth] ❌ Failed to refresh Cognito access token for session');
          res.status(401).json({ error: 'invalid_grant', error_description: 'Failed to refresh token, please re-authenticate' });
          return;
        }

        // MCP Spec Requirement: For public clients, MUST rotate refresh tokens
        // Generate new session ID for token rotation
        const newSessionId = randomUUID();

        // Copy the Cognito tokens to the new session ID
        const cognitoTokens = await tokenManager.getTokens(oldSessionId);
        if (cognitoTokens) {
          await tokenManager.storeTokens(newSessionId, cognitoTokens);
          console.error('[OAuth] 🔄 Rotated MCP session after refresh');
        }

        // Invalidate the old refresh token to prevent reuse
        await tokenManager.deleteTokens(oldSessionId);

        // Return new session IDs (token rotation for public clients)
        res.json({
          access_token: newSessionId, // New access token
          refresh_token: newSessionId, // New refresh token (rotated)
          token_type: 'Bearer',
          expires_in: 3600, // 1 hour (Cognito access token lifetime)
        });
        return;
      }

      // Handle authorization code grant
      if (grant_type === 'authorization_code') {
        if (!code) {
          console.error('[OAuth] Missing code parameter');
          res.status(400).json({ error: 'invalid_request', error_description: 'code is required' });
          return;
        }

        // The "code" is actually our session ID that we gave to Claude
        const sessionId = code;

        console.error('[OAuth] 🎫 Handling authorization_code grant');

        // Verify we have tokens for this session
        const hasTokens = await tokenManager.hasTokens(sessionId);
        if (!hasTokens) {
          console.error('[OAuth] ❌ Invalid or expired authorization code');
          res.status(400).json({ error: 'invalid_grant' });
          return;
        }

        // Get token expiry info
        const accessToken = await tokenManager.getAccessToken(sessionId);
        if (!accessToken) {
          console.error('[OAuth] ❌ Failed to retrieve access token for session');
          res.status(500).json({ error: 'server_error' });
          return;
        }

        // Return our session ID as both access token and refresh token
        // Claude will use access_token as Bearer token and refresh_token to get new tokens
        res.json({
          access_token: sessionId,
          refresh_token: sessionId, // Same session ID can be used for refresh
          token_type: 'Bearer',
          expires_in: 3600, // 1 hour (Cognito access token lifetime)
        });
        return;
      }

      // Unsupported grant type
      console.error(`[OAuth] Unsupported grant_type: ${grant_type}`);
      res.status(400).json({ error: 'unsupported_grant_type' });
    } catch (error) {
      console.error('[OAuth] Error in token endpoint:', error);
      res.status(500).json({ error: 'server_error' });
    }
  });

  /**
   * POST /mcp - Handle MCP requests with OAuth authentication
   */
  app.post('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const authHeader = req.headers.authorization;
    const oauthSessionId = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : undefined;
    let transport: StreamableHTTPServerTransport | undefined;

    if (sessionId && sessionManager.hasSession(sessionId)) {
      // Reuse existing session
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Session not found',
          },
          id: null,
        });
        return;
      }
      transport = session.transport;
      sessionManager.updateLastAccessed(sessionId);
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New initialization request
      // ChatGPT needs unauthenticated access to discover tools
      // Check for Bearer token in Authorization header (optional for discovery)
      if (!oauthSessionId) {
        res.status(401).json({
          jsonrpc: '2.0',
          error: {
            code: 401,
            message: 'Authentication required',
          },
          id: null,
        });
        return;
      }

      // Create FergusClient - use OAuth if available, otherwise null (for discovery only)
      const fergusClient = (oauthSessionId && tokenManager.hasTokens(oauthSessionId))
        ? new FergusClient({
            tokenProvider: async () => {
              const token = await tokenManager.getAccessToken(oauthSessionId);
              return token;
            },
            baseUrl: config.fergusBaseUrl,
          })
        : new FergusClient({
            // Unauthenticated mode - will fail on actual tool calls
            tokenProvider: async () => null,
            baseUrl: config.fergusBaseUrl,
          });

      console.error(`[MCP] Initializing new session${oauthSessionId ? ` using OAuth session ${oauthSessionId}` : ' (unauthenticated discovery mode)'}`);

      try {
        // Generate new MCP session ID (different from OAuth session)
        const mcpSessionId = randomUUID();

        // Create transport
        const newTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => mcpSessionId,
          onsessioninitialized: (newSessionId) => {
            sessionManager.createSession(newSessionId, newTransport, fergusClient, oauthSessionId);
            console.error(`[MCP] Session initialized successfully: ${newSessionId}`);
          },
          // Disable DNS rebinding protection for remote OAuth connections
          // Claude Desktop doesn't always send Origin headers
          enableDnsRebindingProtection: false,
          allowedHosts: config.allowedHosts,
          allowedOrigins: config.allowedOrigins,
        });
        transport = newTransport;

        // Clean up MCP session on transport close
        // Note: We don't delete OAuth tokens here as they should persist across MCP sessions
        newTransport.onclose = () => {
          if (newTransport.sessionId) {
            console.error(`[MCP] Closing transport for session ${newTransport.sessionId}`);
            sessionManager.deleteSession(newTransport.sessionId);
          }
        };

        // Create and connect MCP server
        const server = createMcpServer(fergusClient);
        await server.connect(newTransport);
      } catch (error) {
        console.error(`[MCP] Error during initialization:`, error);
        throw error;
      }      
    } else {
      // Invalid request
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided or missing initialize request',
        },
        id: null,
      });
      return;
    }

    if (!transport) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Failed to resolve MCP transport',
        },
        id: null,
      });
      return;
    }

    // Handle the request
    await transport.handleRequest(req, res, req.body);
  });

  /**
   * GET /mcp - Handle SSE notifications or preflight checks
   */
  app.get('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const authHeader = req.headers.authorization;
    const oauthSessionId = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : undefined;
    let resolvedSessionId = sessionId;

    if (!resolvedSessionId && oauthSessionId) {
      const session = sessionManager.getSessionByOAuthSessionId(oauthSessionId);
      if (session) {
        resolvedSessionId = session.sessionId;
      }
    }

    // If no session ID, this might be a preflight check - return OAuth info
    if (!resolvedSessionId) {
      const baseUrl = config.publicUrl || `https://${req.get('host')}`;
      res.status(401).json({
        error: 'Authentication required',
        authorizationUrl: `${baseUrl}/oauth/authorize`,
      });
      return;
    }

    if (!sessionManager.hasSession(resolvedSessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const session = sessionManager.getSession(resolvedSessionId);
    if (!session) {
      res.status(400).send('Session not found');
      return;
    }

    sessionManager.updateLastAccessed(resolvedSessionId);
    await session.transport.handleRequest(req, res);
  });

  /**
   * DELETE /mcp - Handle session termination
   */
  app.delete('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const authHeader = req.headers.authorization;
    const oauthSessionId = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : undefined;
    let resolvedSessionId = sessionId;

    if (!resolvedSessionId && oauthSessionId) {
      const session = sessionManager.getSessionByOAuthSessionId(oauthSessionId);
      if (session) {
        resolvedSessionId = session.sessionId;
      }
    }

    if (!resolvedSessionId || !sessionManager.hasSession(resolvedSessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const session = sessionManager.getSession(resolvedSessionId);
    if (!session) {
      res.status(400).send('Session not found');
      return;
    }

    sessionManager.deleteSession(resolvedSessionId);
    res.status(200).send('Session deleted');
  });

  // Cleanup: periodically clean up expired OAuth states
  setInterval(() => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    let cleaned = 0;
    for (const [key, value] of oauthStates.entries()) {
      if (value.createdAt < tenMinutesAgo) {
        oauthStates.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.error(`[OAuth] Cleaned up ${cleaned} expired state(s)`);
    }
  }, 5 * 60 * 1000); // Every 5 minutes

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.error('[Server] SIGTERM received, shutting down gracefully...');
    sessionManager.shutdown();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.error('[Server] SIGINT received, shutting down gracefully...');
    sessionManager.shutdown();
    process.exit(0);
  });

  // Catch-all for debugging - log any unhandled routes
  app.use((req, res, next) => {
    console.error(`[404] Unhandled route: ${req.method} ${req.path}`);
    res.status(404).json({ error: 'Not found', path: req.path, method: req.method });
  });

  // Start server
  return new Promise((resolve) => {
    const server = app.listen(config.httpPort, config.httpHost, () => {
      console.error(`MCP HTTP server (OAuth) listening on http://${config.httpHost}:${config.httpPort}`);
      console.error(`OAuth authorization URL: http://${config.httpHost}:${config.httpPort}/oauth/authorize`);
      resolve();
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.error('[HTTP OAuth Server] Shutting down gracefully...');

      // Close HTTP server
      server.close(() => {
        console.error('[HTTP OAuth Server] HTTP server closed');
      });

      // Close Redis connection if using Redis
      if (tokenManager instanceof RedisTokenManager) {
        await tokenManager.close();
      }

      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  });
}
