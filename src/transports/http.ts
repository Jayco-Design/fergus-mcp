/**
 * HTTP Transport for MCP Server
 * Implements Streamable HTTP transport with OAuth authentication and session management
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { FergusClient } from '../fergus-client.js';
import { createMcpServer } from '../server.js';
import { SessionManager, SessionData } from '../auth/session-manager.js';
import { TokenManager } from '../auth/token-manager.js';
import { RedisTokenManager } from '../auth/redis-token-manager.js';
import { FileTokenManager } from '../auth/file-token-manager.js';
import { ITokenManager } from '../auth/token-manager-interface.js';
import { generateAuthUrl, exchangeCodeForTokens, generateState, generatePKCE, OAuthTokens } from '../auth/oauth-handler.js';
import { HttpOAuthConfig } from '../config.js';
import { createRateLimiter } from './rate-limit.js';

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
 * The OAuth session ID the MCP request being handled was authenticated with. Tool calls
 * read it so each request uses its own token, even when requests on one MCP session overlap.
 */
const requestOAuthSession = new AsyncLocalStorage<string>();

/**
 * How long a rotated-out OAuth session keeps working as a bearer token, so requests already
 * in flight when the client refreshed still complete, including tools that make several
 * Fergus calls. It can't be refreshed again.
 */
const ROTATION_GRACE_MS = 5 * 60 * 1000;

function bearerToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  return authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
}

/**
 * Reads the Cognito user id (sub) from stored tokens. The tokens came straight from
 * Cognito's token endpoint, so the payload is read without verifying the signature.
 */
function cognitoSub(tokens: OAuthTokens | null): string | undefined {
  for (const jwt of [tokens?.accessToken, tokens?.idToken]) {
    const payload = jwt?.split('.')[1];
    if (!payload) continue;
    try {
      const sub = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).sub;
      if (typeof sub === 'string' && sub) return sub;
    } catch {
      // Not a JWT; try the next token
    }
  }
  return undefined;
}

function normalizeAcceptHeader(req: Request, requiredMediaTypes: string[]): void {
  const currentAccept = req.headers.accept;
  const mediaTypes = new Set(
    (Array.isArray(currentAccept) ? currentAccept.join(',') : currentAccept ?? '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
  );

  for (const mediaType of requiredMediaTypes) {
    mediaTypes.add(mediaType);
  }

  req.headers.accept = Array.from(mediaTypes).join(', ');
}

/**
 * Checks whether the authenticated user is permitted to use this integration.
 * Returns true if access should be granted, false otherwise.
 */
async function checkUserPermitted(fergusClient: FergusClient): Promise<boolean> {
  try {
    const response = await fergusClient.get('/users/me') as any;
    const user = response?.data ?? response;
    return user?.isOwner === true;
  } catch {
    return false;
  }
}

export interface HttpOAuthAppDependencies {
  /** Overrides the token manager chosen from config.session.storage (used by tests). */
  tokenManager?: ITokenManager;
}

export interface HttpOAuthApp {
  app: express.Express;
  sessionManager: SessionManager;
  tokenManager: ITokenManager;
}

/**
 * Builds the Express app for the HTTP transport with OAuth support, without starting it
 */
export function createHttpOAuthApp(config: HttpOAuthConfig, deps: HttpOAuthAppDependencies = {}): HttpOAuthApp {
  const app = express();
  const sessionManager = new SessionManager(config.session);

  // Initialize token manager based on session storage type
  let tokenManager: ITokenManager;
  if (deps.tokenManager) {
    tokenManager = deps.tokenManager;
  } else if (config.session.storage === 'redis' && config.session.redisUrl) {
    tokenManager = new RedisTokenManager(config.oauth, config.session.redisUrl, config.session.tokenTtlMs);
    const ttlDays = Math.floor(config.session.tokenTtlMs / (1000 * 60 * 60 * 24));
    console.error(`[HTTP OAuth Server] Token storage: redis (TTL: ${ttlDays} days from TOKEN_TTL_MS)`);
  } else if (config.session.storage === 'file' || process.env.NODE_ENV === 'development') {
    tokenManager = new FileTokenManager(config.oauth);
    console.error('[HTTP OAuth Server] Token storage: file (persistent across restarts)');
  } else {
    tokenManager = new TokenManager(config.oauth);
    console.error('[HTTP OAuth Server] Token storage: memory (ephemeral)');
  }

  if (config.trustProxy !== undefined) {
    app.set('trust proxy', config.trustProxy);
  }

  // Configure CORS
  app.use(cors({
    origin: config.allowedOrigins || '*',
    exposedHeaders: ['Mcp-Session-Id'],
    allowedHeaders: ['Content-Type', 'mcp-session-id', 'Authorization'],
    credentials: true,
  }));

  // Rate limit per client (bearer token, or IP when unauthenticated)
  app.use(createRateLimiter(
    config.rateLimit,
    config.session.storage === 'redis' ? config.session.redisUrl : undefined,
  ));

  // Parse JSON bodies
  app.use(express.json());

  // Parse URL-encoded bodies (OAuth token endpoint uses application/x-www-form-urlencoded)
  app.use(express.urlencoded({ extended: true }));

  // Request logging middleware (production: use structured logger like Pino)
  app.use((req, res, next) => {
    if (req.path !== '/health') {
      console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    }
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
   * The server's public base URL. Without PUBLIC_URL it comes from the Host header, which is
   * client-controlled, so anything that isn't a hostname, IP or port character is dropped
   * before it reaches a URL or a quoted header value.
   */
  const publicBaseUrl = (req: Request): string => {
    if (config.publicUrl) {
      return config.publicUrl;
    }
    const host = (req.get('host') ?? '').replace(/[^A-Za-z0-9.\-:[\]]/g, '');
    return `https://${host}`;
  };

  /**
   * OAuth 2.0 Authorization Server Metadata (RFC8414)
   * This endpoint allows MCP clients to discover OAuth configuration
   *
   * In proxy OAuth mode, we act as the authorization server to Claude,
   * but proxy authentication to Cognito behind the scenes.
   */
  const oauthMetadataHandler = (req: Request, res: Response) => {
    const baseUrl = publicBaseUrl(req);

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
    const baseUrl = publicBaseUrl(req);
    const resourcePath = req.path.endsWith('/mcp') ? '/mcp' : '';

    const metadata = {
      resource: `${baseUrl}${resourcePath}`,
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

      console.error('[OAuth] Redirecting to Cognito');
      res.redirect(authUrl);
    } catch (error) {
      console.error('[OAuth] Error initiating authorization');
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
        console.error('[OAuth] Authorization failed');
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
        console.error('[OAuth] Invalid or expired state parameter');
        res.status(400).send('Invalid or expired state parameter');
        return;
      }

      // Remove used state
      oauthStates.delete(state);

      console.error('[OAuth] 🔐 Exchanging Cognito authorization code for tokens');

      // Exchange code for tokens from Cognito
      const tokens = await exchangeCodeForTokens(config.oauth, code, stateData.codeVerifier);

      // Generate our own session ID
      const sessionId = randomUUID();

      // Store Cognito tokens
      await tokenManager.storeTokens(sessionId, tokens);

      console.error('[OAuth] ✅ Stored tokens in MCP session');

      // Redirect to Claude's callback with our authorization code
      const clientRedirectUri = stateData.clientRedirectUri || 'https://claude.ai/api/mcp/auth_callback';
      const claudeCallbackUrl = new URL(clientRedirectUri);
      claudeCallbackUrl.searchParams.set('code', sessionId); // Our session ID is the authorization code for Claude
      claudeCallbackUrl.searchParams.set('state', stateData.clientState || state); // Pass through the client's original state

      console.error('[OAuth] Redirecting to client callback');
      res.redirect(claudeCallbackUrl.toString());
    } catch (error) {
      console.error('[OAuth] Error in callback');
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

        // Verify we have tokens for this session, and that it hasn't already been rotated out
        const hasTokens = await tokenManager.hasTokens(oldSessionId);
        if (!hasTokens || await tokenManager.isRetired(oldSessionId)) {
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

        // MCP Spec Requirement: For public clients, MUST rotate refresh tokens.
        // Retire the old session first: only one refresh grant can, so two concurrent grants
        // can't both redeem it. MCP sessions pick up the new token from the client's next
        // request; until then the old one keeps working as a bearer token for a short grace
        // period, so requests already in flight complete.
        if (!(await tokenManager.retireTokens(oldSessionId, ROTATION_GRACE_MS))) {
          console.error('[OAuth] ❌ Refresh token was redeemed concurrently');
          res.status(400).json({ error: 'invalid_grant', error_description: 'Refresh token is invalid or expired' });
          return;
        }

        // Copy the Cognito tokens to a new session ID
        const cognitoTokens = await tokenManager.getTokens(oldSessionId);
        if (!cognitoTokens) {
          console.error('[OAuth] ❌ Tokens for session disappeared during refresh');
          res.status(400).json({ error: 'invalid_grant', error_description: 'Refresh token is invalid or expired' });
          return;
        }
        const newSessionId = randomUUID();
        await tokenManager.storeTokens(newSessionId, cognitoTokens);
        console.error('[OAuth] 🔄 Rotated OAuth session after refresh');

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

        // Verify we have tokens for this session, and that it isn't a rotated-out one
        const hasTokens = await tokenManager.hasTokens(sessionId);
        if (!hasTokens || await tokenManager.isRetired(sessionId)) {
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
      console.error('[OAuth] Error in token endpoint');
      res.status(500).json({ error: 'server_error' });
    }
  });

  /**
   * Sets a WWW-Authenticate header pointing at the protected resource metadata
   * (MCP authorization spec, RFC 9728 §5.1). error="invalid_token" only when a token was
   * presented and rejected (RFC 6750 §3.1).
   */
  const setAuthenticateHeader = (req: Request, res: Response, tokenRejected: boolean) => {
    const resourcePath = req.path.endsWith('/mcp') ? '/mcp' : '';
    const errorParam = tokenRejected ? 'error="invalid_token", ' : '';
    res.setHeader(
      'WWW-Authenticate',
      `Bearer ${errorParam}resource_metadata="${publicBaseUrl(req)}/.well-known/oauth-protected-resource${resourcePath}"`
    );
  };

  /**
   * Responds 401 so the client refreshes or re-authenticates.
   */
  const sendUnauthorized = (req: Request, res: Response, tokenPresented: boolean) => {
    setAuthenticateHeader(req, res, tokenPresented);
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Authentication required',
      },
      id: null,
    });
  };

  /**
   * Responds 404 for an MCP session we don't have (never created, closed, timed out, or lost
   * when the server restarted). The MCP spec has clients start a new session on a 404.
   */
  const sendSessionNotFound = (res: Response) => {
    res.status(404).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Session not found',
      },
      id: null,
    });
  };

  /**
   * Whether we hold a usable Fergus token for an OAuth session ID. Unlike hasTokens(), this
   * is false when the Cognito refresh behind it has failed.
   */
  const hasUsableToken = async (oauthSessionId: string | undefined): Promise<boolean> =>
    oauthSessionId ? (await tokenManager.getAccessToken(oauthSessionId)) !== null : false;

  /**
   * Checks the bearer token on a request to an existing MCP session. The MCP spec requires
   * one on every request, even within a session. It must be one we hold a usable token for,
   * belonging to the user who opened the session. Clients refresh on their own schedule and
   * then present the rotated token, so the session follows the latest one.
   * Sends the error response and returns undefined if the request is refused.
   */
  const authorizeSessionRequest = async (
    req: Request,
    res: Response,
    session: SessionData
  ): Promise<string | undefined> => {
    const oauthSessionId = bearerToken(req);
    if (!oauthSessionId || !(await hasUsableToken(oauthSessionId))) {
      sendUnauthorized(req, res, Boolean(oauthSessionId));
      return undefined;
    }

    if (oauthSessionId !== session.oauthSessionId) {
      const userId = cognitoSub(await tokenManager.getTokens(oauthSessionId));
      if (!session.userId || userId !== session.userId) {
        // 404 rather than 403: in the MCP spec 403 means insufficient scope, while 404 tells
        // the client to start a new session, which is the right recovery when the user has
        // signed in as someone else.
        console.error('[MCP] Request refused: token belongs to a different user than the session');
        sendSessionNotFound(res);
        return undefined;
      }
      sessionManager.bindOAuthSessionId(session.sessionId, oauthSessionId);
    }

    return oauthSessionId;
  };

  const handleMcpPost = async (req: Request, res: Response) => {
    // Some MCP clients omit one of the accepted streamable HTTP media types.
    // Normalize the header so the SDK transport does not reject otherwise-valid requests.
    normalizeAcceptHeader(req, ['application/json', 'text/event-stream']);

    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let oauthSessionId = bearerToken(req);
    let transport: StreamableHTTPServerTransport | undefined;

    if (sessionId && sessionManager.hasSession(sessionId)) {
      // Reuse existing session
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        sendSessionNotFound(res);
        return;
      }
      oauthSessionId = await authorizeSessionRequest(req, res, session);
      if (!oauthSessionId) {
        return;
      }
      transport = session.transport;
      sessionManager.updateLastAccessed(sessionId);
    } else if (isInitializeRequest(req.body)) {
      // New initialization request. A bearer token that we hold a usable token for is
      // required; anything else gets a 401 so the client knows to (re)authenticate. A stale
      // Mcp-Session-Id header (e.g. from before a server restart) is ignored, so a client
      // that keeps sending it can still reconnect.
      if (!oauthSessionId || !(await hasUsableToken(oauthSessionId))) {
        sendUnauthorized(req, res, Boolean(oauthSessionId));
        return;
      }
      const initialOAuthSessionId = oauthSessionId;
      // Every session is tied to one user. Without a user id, later requests on it couldn't be
      // checked and the session would lock itself out at the first refresh, so don't open it.
      const userId = cognitoSub(await tokenManager.getTokens(initialOAuthSessionId));
      if (!userId) {
        console.error('[MCP] Session init refused: stored token carries no user id');
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Could not identify the signed-in user. Please reconnect.',
          },
          id: null,
        });
        return;
      }

      // Generate the MCP session ID up front so the FergusClient's tokenProvider
      // can fall back to the session's latest OAuth session ID outside a request.
      const mcpSessionId = randomUUID();

      const fergusClient = new FergusClient({
        tokenProvider: async () => {
          // Use the token of the request being handled. Outside one, use the session's
          // latest binding, and before init completes (e.g. during checkUserPermitted)
          // the ID the session is being opened with.
          const liveOAuthSessionId =
            requestOAuthSession.getStore() ??
            sessionManager.getOAuthSessionId(mcpSessionId) ??
            initialOAuthSessionId;
          return await tokenManager.getAccessToken(liveOAuthSessionId);
        },
        baseUrl: config.fergusBaseUrl,
      });

      // Verify the authenticated user is permitted to use this integration
      const permitted = await checkUserPermitted(fergusClient);
      if (!permitted) {
        console.error('[MCP] Session init rejected: user does not meet access requirements');
        res.status(403).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Your account does not have access to this integration. Please contact your account administrator.',
          },
          id: null,
        });
        return;
      }

      console.error('[MCP] Initializing new authenticated session');

      try {
        // Create transport (mcpSessionId was generated above so the tokenProvider closure
        // could capture it).
        const newTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => mcpSessionId,
          onsessioninitialized: (newSessionId) => {
            sessionManager.createSession(newSessionId, newTransport, fergusClient, initialOAuthSessionId, userId);
            console.error('[MCP] Session initialized successfully');
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
            console.error('[MCP] Closing transport for session');
            sessionManager.deleteSession(newTransport.sessionId);
          }
        };

        // Create and connect MCP server
        const server = createMcpServer(fergusClient);
        await server.connect(newTransport);
      } catch (error) {
        console.error('[MCP] Error during initialization');
        throw error;
      }      
    } else if (sessionId) {
      // A session we don't have, e.g. one lost when the server restarted
      sendSessionNotFound(res);
      return;
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

    if (!transport || !oauthSessionId) {
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

    // Handle the request with its own token in scope for any Fergus API calls it makes
    const requestTransport = transport;
    await requestOAuthSession.run(oauthSessionId, () => requestTransport.handleRequest(req, res, req.body));
  };

  /**
   * POST / and /mcp - Handle MCP requests with OAuth authentication
   */
  app.post('/', handleMcpPost);
  app.post('/mcp', handleMcpPost);

  /**
   * GET / and /mcp - Handle SSE notifications or preflight checks
   */
  const handleMcpGet = async (req: Request, res: Response) => {
    normalizeAcceptHeader(req, ['text/event-stream']);

    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId) {
      // Without a usable token this might be a preflight check - return OAuth info. With
      // one, a 401 would wrongly send the client to refresh, so it's a plain bad request.
      const oauthSessionId = bearerToken(req);
      if (!(await hasUsableToken(oauthSessionId))) {
        setAuthenticateHeader(req, res, Boolean(oauthSessionId));
        res.status(401).json({
          error: 'Authentication required',
          authorizationUrl: `${publicBaseUrl(req)}/oauth/authorize`,
        });
        return;
      }
      res.status(400).send('Bad Request: Mcp-Session-Id header is required');
      return;
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      sendSessionNotFound(res);
      return;
    }

    const oauthSessionId = await authorizeSessionRequest(req, res, session);
    if (!oauthSessionId) {
      return;
    }

    sessionManager.updateLastAccessed(sessionId);
    await requestOAuthSession.run(oauthSessionId, () => session.transport.handleRequest(req, res));
  };

  app.get('/', handleMcpGet);
  app.get('/mcp', handleMcpGet);

  /**
   * DELETE / and /mcp - Handle session termination
   */
  const handleMcpDelete = async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId) {
      res.status(400).send('Bad Request: Mcp-Session-Id header is required');
      return;
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      sendSessionNotFound(res);
      return;
    }

    if (!(await authorizeSessionRequest(req, res, session))) {
      return;
    }

    sessionManager.deleteSession(sessionId);
    res.status(200).send('Session deleted');
  };

  app.delete('/', handleMcpDelete);
  app.delete('/mcp', handleMcpDelete);

  // Catch-all for debugging - log any unhandled routes
  app.use((req, res, next) => {
    console.error(`[404] Unhandled route: ${req.method} ${req.path}`);
    res.status(404).json({ error: 'Not found', path: req.path, method: req.method });
  });

  return { app, sessionManager, tokenManager };
}

/**
 * Create and start HTTP transport server with OAuth support
 */
export async function startHttpOAuthServer(config: HttpOAuthConfig): Promise<void> {
  const { app, sessionManager, tokenManager } = createHttpOAuthApp(config);

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
