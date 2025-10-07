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
 * HTTP transport configuration options
 */
export interface HttpTransportConfig {
  port: number;
  host: string;
  allowedOrigins?: string[];
  allowedHosts?: string[];
  enableDnsRebindingProtection?: boolean;
  apiToken?: string;  // Optional: for backward compatibility with non-OAuth mode
  fergusBaseUrl?: string;
}

/**
 * Create and start HTTP transport server with OAuth support
 */
export async function startHttpOAuthServer(config: HttpOAuthConfig): Promise<void> {
  const app = express();
  const sessionManager = new SessionManager(config.session);
  const tokenManager = new TokenManager(config.oauth);

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

      console.error(`[OAuth] Exchanging authorization code for tokens`);

      // Exchange code for tokens from Cognito
      const tokens = await exchangeCodeForTokens(config.oauth, code, stateData.codeVerifier);

      // Generate our own session ID
      const sessionId = randomUUID();

      // Store Cognito tokens
      tokenManager.storeTokens(sessionId, tokens);

      console.error(`[OAuth] Successfully obtained tokens for session ${sessionId}`);

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
   * POST /oauth/token - Exchange authorization code for access token
   * Called by Claude after user completes authorization
   * The "code" here is our session ID that we sent to Claude's callback
   */
  app.post('/oauth/token', async (req: Request, res: Response) => {
    try {
      const { code, grant_type, code_verifier } = req.body;

      console.error(`[OAuth] Token exchange request for code: ${code?.substring(0, 8)}...`);

      // Validate required parameters
      if (!code || grant_type !== 'authorization_code') {
        console.error('[OAuth] Invalid token request');
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      // The "code" is actually our session ID that we gave to Claude
      const sessionId = code;

      // Verify we have tokens for this session
      if (!tokenManager.hasTokens(sessionId)) {
        console.error(`[OAuth] Invalid or expired authorization code: ${sessionId.substring(0, 8)}...`);
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }

      // Get token expiry info
      const accessToken = await tokenManager.getAccessToken(sessionId);
      if (!accessToken) {
        console.error(`[OAuth] Failed to retrieve access token for session: ${sessionId.substring(0, 8)}...`);
        res.status(500).json({ error: 'server_error' });
        return;
      }

      console.error(`[OAuth] Successfully exchanged code for token, session: ${sessionId.substring(0, 8)}...`);

      // Return our session ID as the access token
      // Claude will use this as a Bearer token in all subsequent MCP requests
      res.json({
        access_token: sessionId,
        token_type: 'Bearer',
        expires_in: 3600, // 1 hour
      });
    } catch (error) {
      console.error('[OAuth] Error exchanging code for token:', error);
      res.status(500).json({ error: 'server_error' });
    }
  });

  /**
   * POST /mcp - Handle MCP requests with OAuth authentication
   */
  app.post('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

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
      // Check for Bearer token in Authorization header
      const authHeader = req.headers.authorization;
      let oauthSessionId: string | undefined;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        oauthSessionId = authHeader.substring(7);
      }

      if (!oauthSessionId || !tokenManager.hasTokens(oauthSessionId)) {
        // No OAuth tokens available - need authentication
        const baseUrl = config.publicUrl || `https://${req.get('host')}`;
        const authUrl = `${baseUrl}/oauth/authorize`;

        res.status(401).json({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Authentication required',
            data: {
              authorizationUrl: authUrl,
            },
          },
          id: (req.body as any).id || null,
        });
        return;
      }

      console.error(`[MCP] Initializing new session using OAuth session ${oauthSessionId}`);

      try {
        // Create FergusClient with token provider using OAuth session
        const fergusClient = new FergusClient({
          tokenProvider: async () => {
            const token = await tokenManager.getAccessToken(oauthSessionId);
            return token;
          },
          baseUrl: config.fergusBaseUrl,
        });

        // Generate new MCP session ID (different from OAuth session)
        const mcpSessionId = randomUUID();

        // Create transport
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => mcpSessionId,
          onsessioninitialized: (newSessionId) => {
            sessionManager.createSession(newSessionId, transport, fergusClient);
            console.error(`[MCP] Session initialized successfully: ${newSessionId}`);
          },
          // Disable DNS rebinding protection for remote OAuth connections
          // Claude Desktop doesn't always send Origin headers
          enableDnsRebindingProtection: false,
          allowedHosts: config.allowedHosts,
          allowedOrigins: config.allowedOrigins,
        });

        // Clean up MCP session on transport close
        // Note: We don't delete OAuth tokens here as they should persist across MCP sessions
        transport.onclose = () => {
          if (transport.sessionId) {
            console.error(`[MCP] Closing transport for session ${transport.sessionId}`);
            sessionManager.deleteSession(transport.sessionId);
          }
        };

        // Create and connect MCP server
        const server = createMcpServer(fergusClient);
        await server.connect(transport);
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

    // Handle the request
    await transport.handleRequest(req, res, req.body);
  });

  /**
   * GET /mcp - Handle SSE notifications or preflight checks
   */
  app.get('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // If no session ID, this might be a preflight check - return OAuth info
    if (!sessionId) {
      const baseUrl = config.publicUrl || `https://${req.get('host')}`;
      res.status(401).json({
        error: 'Authentication required',
        authorizationUrl: `${baseUrl}/oauth/authorize`,
      });
      return;
    }

    if (!sessionManager.hasSession(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      res.status(400).send('Session not found');
      return;
    }

    sessionManager.updateLastAccessed(sessionId);
    await session.transport.handleRequest(req, res);
  });

  /**
   * DELETE /mcp - Handle session termination
   */
  app.delete('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !sessionManager.hasSession(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      res.status(400).send('Session not found');
      return;
    }

    await session.transport.handleRequest(req, res);
    // Session will be cleaned up by transport.onclose
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
    app.listen(config.httpPort, config.httpHost, () => {
      console.error(`MCP HTTP server (OAuth) listening on http://${config.httpHost}:${config.httpPort}`);
      console.error(`OAuth authorization URL: http://${config.httpHost}:${config.httpPort}/oauth/authorize`);
      resolve();
    });
  });
}

/**
 * Session data for backward-compatible non-OAuth mode
 */
interface SessionDataCompat {
  transport: StreamableHTTPServerTransport;
  fergusClient: FergusClient;
  createdAt: Date;
  lastAccessedAt: Date;
}

/**
 * In-memory session storage for non-OAuth mode
 */
const sessions = new Map<string, SessionDataCompat>();

/**
 * Create and start HTTP transport server (backward compatible, non-OAuth)
 */
export async function startHttpServer(config: HttpTransportConfig): Promise<void> {
  if (!config.apiToken) {
    throw new Error('API token is required for non-OAuth HTTP server. Use startHttpOAuthServer for OAuth mode.');
  }

  const app = express();

  // Configure CORS
  app.use(cors({
    origin: config.allowedOrigins || '*',
    exposedHeaders: ['Mcp-Session-Id'],
    allowedHeaders: ['Content-Type', 'mcp-session-id'],
  }));

  // Parse JSON bodies
  app.use(express.json());

  /**
   * Health check endpoint
   */
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      activeSessions: sessions.size,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * POST /mcp - Handle MCP requests
   */
  app.post('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && sessions.has(sessionId)) {
      // Reuse existing session
      const session = sessions.get(sessionId)!;
      transport = session.transport;
      session.lastAccessedAt = new Date();
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New initialization request - create FergusClient and server first
      const fergusClient = new FergusClient({
        apiToken: config.apiToken,
        baseUrl: config.fergusBaseUrl,
      });

      // Create transport with session initialization callback
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          // Store session data
          sessions.set(newSessionId, {
            transport,
            fergusClient,
            createdAt: new Date(),
            lastAccessedAt: new Date(),
          });

          console.error(`Session initialized: ${newSessionId}`);
        },
        // DNS rebinding protection
        enableDnsRebindingProtection: config.enableDnsRebindingProtection ?? true,
        allowedHosts: config.allowedHosts || ['127.0.0.1', 'localhost', `localhost:${config.port}`, `127.0.0.1:${config.port}`],
        allowedOrigins: config.allowedOrigins || [],
      });

      // Clean up on transport close
      transport.onclose = () => {
        if (transport.sessionId && sessions.has(transport.sessionId)) {
          console.error(`Session closed: ${transport.sessionId}`);
          sessions.delete(transport.sessionId);
        }
      };

      // Create and connect MCP server
      const server = createMcpServer(fergusClient);
      await server.connect(transport);
    } else {
      // Invalid request - no session ID and not an initialize request
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

    // Handle the request
    await transport.handleRequest(req, res, req.body);
  });

  /**
   * GET /mcp - Handle SSE notifications
   */
  app.get('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const session = sessions.get(sessionId)!;
    session.lastAccessedAt = new Date();

    await session.transport.handleRequest(req, res);
  });

  /**
   * DELETE /mcp - Handle session termination
   */
  app.delete('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const session = sessions.get(sessionId)!;
    await session.transport.handleRequest(req, res);

    // Session will be cleaned up by transport.onclose
  });

  /**
   * Session cleanup - remove inactive sessions after 1 hour
   */
  const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
  setInterval(() => {
    const now = new Date();
    for (const [sessionId, session] of sessions.entries()) {
      const inactiveMs = now.getTime() - session.lastAccessedAt.getTime();
      if (inactiveMs > SESSION_TIMEOUT_MS) {
        console.error(`Cleaning up inactive session: ${sessionId}`);
        session.transport.close();
        sessions.delete(sessionId);
      }
    }
  }, 15 * 60 * 1000); // Check every 15 minutes

  // Start server
  return new Promise((resolve) => {
    app.listen(config.port, config.host, () => {
      console.error(`MCP HTTP server listening on http://${config.host}:${config.port}`);
      resolve();
    });
  });
}
