# Remote MCP Server Implementation Plan

## Overview

This plan outlines the steps to extend the existing Fergus MCP server to support **remote HTTP transport** with **OAuth authentication**, enabling usage in Claude Web and other browser-based MCP clients while maintaining backward compatibility with the existing stdio transport for local CLI usage.

## Current State

- ✅ Fully functional stdio-based MCP server
- ✅ 16 action tools + 10 read-only tools implemented
- ✅ 3 MCP prompts implemented
- ✅ Tools-only architecture (no resources)
- ✅ PAT-based authentication via environment variables/CLI args
- ✅ Using `@modelcontextprotocol/sdk` TypeScript SDK

## Target State

- 🎯 Dual-mode server: stdio (local) + HTTP (remote)
- 🎯 OAuth 2.0 authentication with Fergus API
- 🎯 Stateful sessions with SSE support for notifications
- 🎯 Session management and secure token storage
- 🎯 Production-ready deployment (CORS, security, rate limiting)
- 🎯 Backward compatible with existing CLI usage

## Technical Architecture

### Transport Modes

**1. Stdio Transport (Existing)**
- For local CLI usage (Claude Desktop local mode)
- Uses `StdioServerTransport`
- Authentication via environment variables or CLI args
- No changes to existing functionality

**2. HTTP Transport (New)**
- For remote web access (Claude Web, Claude Desktop remote)
- Uses `StreamableHTTPServerTransport`
- OAuth 2.0 authentication with Fergus
- Stateful sessions with SSE notifications
- REST endpoints: POST/GET/DELETE `/mcp`

### OAuth Flow

```
┌─────────┐                 ┌─────────────┐                 ┌───────────┐
│ Claude  │                 │  MCP Server │                 │  Fergus   │
│  Web    │                 │  (Remote)   │                 │    API    │
└────┬────┘                 └──────┬──────┘                 └─────┬─────┘
     │                             │                              │
     │ 1. Add MCP Server           │                              │
     ├────────────────────────────>│                              │
     │                             │                              │
     │ 2. Redirect to /authorize   │                              │
     │<────────────────────────────┤                              │
     │                             │                              │
     │ 3. Redirect to Fergus OAuth │                              │
     ├─────────────────────────────┼─────────────────────────────>│
     │                             │                              │
     │ 4. User authorizes          │                              │
     │                             │                              │
     │ 5. Callback with auth code  │                              │
     │<────────────────────────────┼──────────────────────────────┤
     │                             │                              │
     │ 6. Forward to /callback     │                              │
     ├────────────────────────────>│                              │
     │                             │                              │
     │                             │ 7. Exchange code for tokens  │
     │                             ├─────────────────────────────>│
     │                             │                              │
     │                             │ 8. Return access/refresh     │
     │                             │<─────────────────────────────┤
     │                             │                              │
     │                             │ 9. Store tokens with session │
     │                             │                              │
     │ 10. Redirect to Claude      │                              │
     │<────────────────────────────┤                              │
     │                             │                              │
     │ 11. MCP requests w/ tokens  │                              │
     ├────────────────────────────>│                              │
     │                             │                              │
     │                             │ 12. API calls with user's    │
     │                             │     access token             │
     │                             ├─────────────────────────────>│
     │                             │                              │
```

### Session Management

- **Session ID**: UUIDv4 generated on first request
- **Session Storage**: In-memory Map (Phase 1), Redis/database (Phase 2)
- **Session Data**:
  - Access token (from Fergus OAuth)
  - Refresh token (for token renewal)
  - Token expiry timestamp
  - User metadata (optional: user ID, email)
  - Transport instance reference

### Project Structure (New Files)

```
fergus-mcp/
├── src/
│   ├── index.ts                    # Main entry point (existing)
│   ├── server.ts                   # NEW: Shared server setup
│   ├── transports/                 # NEW: Transport implementations
│   │   ├── stdio.ts               # Stdio transport setup
│   │   └── http.ts                # HTTP transport setup
│   ├── auth/                       # NEW: OAuth implementation
│   │   ├── oauth-handler.ts       # OAuth flow logic
│   │   ├── token-manager.ts       # Token storage and refresh
│   │   └── session-manager.ts     # Session lifecycle management
│   ├── config.ts                   # UPDATE: Add OAuth config
│   ├── fergus-client.ts            # UPDATE: Accept tokens per request
│   └── tools/                      # Existing (no changes)
├── .env.example                    # UPDATE: Add OAuth variables
├── package.json                    # UPDATE: Add Express, session deps
└── README.md                       # UPDATE: Document remote usage
```

## Implementation Phases

---

## Phase 1: HTTP Transport Foundation ✅ COMPLETED
**Goal**: Add HTTP server with basic Streamable HTTP transport (no auth yet)

### Tasks:

#### 1.1: Add Dependencies
- [x] Install Express.js: `pnpm add express`
- [x] Install types: `pnpm add -D @types/express`
- [x] Install CORS middleware: `pnpm add cors @types/cors`
- [x] Install UUID: `pnpm add uuid @types/uuid` (if not already present)

#### 1.2: Create Shared Server Setup
- [x] Create `src/server.ts` - Extract shared MCP server setup from `index.ts`
  - Export `createMcpServer()` function
  - Include all tool registrations
  - Include all prompt registrations
  - Accept `FergusClient` instance as parameter
  - Return configured `McpServer` instance
- [x] Update `src/index.ts` to use `createMcpServer()`
- [x] Test stdio transport still works: `pnpm build && pnpm start --api-token=<token>`

#### 1.3: Implement HTTP Transport (Stateful, No Auth)
- [x] Create `src/transports/http.ts`
  - Set up Express app
  - Configure CORS with proper headers (`Mcp-Session-Id`)
  - Implement in-memory session storage: `Map<string, { transport: StreamableHTTPServerTransport, fergusClient: FergusClient }>`
  - Implement POST `/mcp` endpoint
    - Check for `mcp-session-id` header
    - Create new session if missing (on initialize request)
    - Reuse existing session if present
    - Store transport by session ID
    - Call `transport.handleRequest(req, res, req.body)`
  - Implement GET `/mcp` endpoint (SSE notifications)
    - Validate session ID from header
    - Retrieve transport from session storage
    - Call `transport.handleRequest(req, res)`
  - Implement DELETE `/mcp` endpoint (session termination)
    - Validate session ID from header
    - Cleanup session storage
    - Call `transport.handleRequest(req, res)`
  - Implement health check: GET `/health`
  - Enable DNS rebinding protection:
    ```typescript
    enableDnsRebindingProtection: true,
    allowedHosts: ['127.0.0.1', 'localhost', process.env.ALLOWED_HOSTS?.split(',') || []],
    allowedOrigins: [process.env.ALLOWED_ORIGINS?.split(',') || []]
    ```

#### 1.4: Add HTTP Server Entry Point
- [x] Create `src/http-server.ts` - Main entry for HTTP mode
  - Import config (port, Fergus API token from env)
  - Create FergusClient with static PAT (temporary, for testing)
  - Import and start HTTP transport
  - Add graceful shutdown handling
- [x] Update `package.json` scripts:
  - Add `"start:http": "node dist/http-server.js"`
  - Add `"dev:http": "tsx src/http-server.ts"`

#### 1.5: Test HTTP Transport (Authless)
- [x] Set environment variable: `FERGUS_API_TOKEN=<test-token>`
- [x] Start HTTP server: `pnpm dev:http`
- [x] Test with curl - Discovered port 3000 conflict with OrbStack, changed default to 3100
- [x] Verify all tools are listed (26 tools successfully listed)
- [x] Test calling tools with session ID
- [x] Verify stdio transport still works independently

**Success Criteria**: ✅ HTTP server runs on port 3100, accepts MCP requests, all tools functional (using static PAT)

**Notes**:
- Port changed from 3000 to 3100 to avoid OrbStack conflict
- DNS rebinding protection configured with `localhost:${port}` to allow local testing
- Session management working with in-memory storage
- All 26 tools successfully registered and accessible

---

## Phase 2: OAuth Integration ✅ COMPLETED
**Goal**: Implement OAuth 2.0 authentication with AWS Cognito compatible with Claude Desktop

### Tasks:

#### 2.1: Research Cognito OAuth and MCP Spec
- [x] Access Cognito API documentation for OAuth endpoints
- [x] Review MCP specification for OAuth implementation
- [x] Research Claude Desktop OAuth requirements
- [x] Document the following:
  - Authorization URL: `https://auth.fergus.com/oauth2/authorize`
  - Token exchange URL: `https://auth.fergus.com/oauth2/token`
  - Revocation URL: `https://auth.fergus.com/oauth2/revoke`
  - Required scopes: openid, email, profile
  - Token refresh mechanism via refresh token
  - Token expiry behavior: expires_in seconds
  - Callback URL requirements: Must redirect to Claude's callback
- [x] Obtain OAuth client ID and secret from Fergus (configured in Cognito)

#### 2.2: Update Configuration
- [x] Update `.env.example` with OAuth variables:
  - Updated redirect URI to Claude's callback: `https://claude.ai/api/mcp/auth_callback`
  - Added all Cognito configuration variables
  - Updated port to 3100 (to avoid OrbStack conflict)
  - Added session storage configuration
- [x] Update `src/config.ts`:
  - Added OAuth config interface (OAuthConfig)
  - Added environment variable parsing for OAuth settings
  - Exported OAuth configuration via loadOAuthConfig()
  - Added HTTP OAuth config (HttpOAuthConfig)
  - Kept existing PAT config for stdio mode

#### 2.3: Implement OAuth Handler
- [x] Create `src/auth/oauth-handler.ts` (already implemented in Phase 1)
  - ✅ Implemented `generateAuthUrl(state: string): string`
  - ✅ Implemented `exchangeCodeForTokens(code: string): Promise<OAuthTokens>`
  - ✅ Implemented `refreshAccessToken(refreshToken: string): Promise<OAuthTokens>`
  - ✅ Added error handling for OAuth failures
  - ✅ Added TypeScript interfaces (OAuthTokens, OAuthError)
  - ✅ Implemented PKCE support (generatePKCE function)
  - ✅ Implemented state generation (generateState function)

#### 2.4: Implement Token Manager
- [x] Create `src/auth/token-manager.ts` (already implemented in Phase 1)
  - ✅ Implemented `storeTokens(sessionId: string, tokens: OAuthTokens): void`
  - ✅ Implemented `getAccessToken(sessionId: string): Promise<string | null>`
  - ✅ Implemented automatic token refresh when expired
  - ✅ Implemented `deleteTokens(sessionId: string): void`
  - ✅ Added token expiry tracking

#### 2.5: Implement Session Manager
- [x] Create `src/auth/session-manager.ts` (already implemented in Phase 1)
  - ✅ Implemented session storage with SessionData interface
  - ✅ Implemented `createSession()`, `getSession()`, `updateLastAccessed()`, `deleteSession()`
  - ✅ Implemented automatic session cleanup for inactive sessions
  - ✅ Added session lifecycle logging

#### 2.6: Update FergusClient for Per-Request Tokens
- [x] Update `src/fergus-client.ts` (already implemented in Phase 1)
  - ✅ Added constructor overload with tokenProvider
  - ✅ Modified request() method to support dynamic token retrieval
  - ✅ Maintained backward compatibility with static token
  - ✅ Added error handling for expired tokens

#### 2.7: Add OAuth Endpoints to HTTP Transport (FIXED FOR CLAUDE DESKTOP)
- [x] Update `src/transports/http.ts`
  - ✅ Added `/.well-known/oauth-authorization-server` metadata endpoint (RFC8414)
  - ✅ Added `GET /authorize` endpoint - returns authorization URL as JSON
  - ✅ Added `POST /authorize` endpoint - exchanges code for tokens, returns session as access_token
  - ✅ Updated POST `/mcp` endpoint to use Bearer token authentication (not cookies)
  - ✅ Removed cookie-based session management
  - ✅ Changed redirect URI to Claude's callback: `https://claude.ai/api/mcp/auth_callback`
  - ✅ Added proper CORS headers including Authorization header
  - ✅ Added automatic token refresh via TokenManager

#### 2.8: Test OAuth Flow
- [x] OAuth endpoints implemented and ready for testing
- [x] Start HTTP server with OAuth enabled: `pnpm dev:http`
- [x] Test OAuth metadata discovery: `curl http://localhost:3100/.well-known/oauth-authorization-server`
- [x] Configure server URL in AWS Cognito allowed callback URLs
- [x] Test MCP requests with OAuth session:
  - ✅ Add server to Claude Desktop (remote mode)
  - ✅ OAuth discovery and registration working
  - ✅ Complete authorization via Cognito
  - ✅ Test calling tools (list-jobs successfully called)
  - ✅ User-specific data isolation working

**Success Criteria**: ✅ **COMPLETE** - OAuth flow working end-to-end with Claude Desktop

**Implementation Notes**:
- Initial implementation used cookies which don't work with Claude Desktop
- Fixed by using Bearer token pattern as per MCP OAuth spec
- Added RFC8414 metadata endpoints (both standard and `/mcp` suffixed paths)
- Added RFC7591 dynamic client registration endpoint (`/oauth/register`)
- Added OAuth protected resource metadata endpoint (`/.well-known/oauth-protected-resource`)
- Fixed token endpoint to accept `application/x-www-form-urlencoded` content type
- Disabled DNS rebinding protection for remote OAuth (Claude doesn't send Origin header)
- Complete flow: discovery → registration → authorize → Cognito auth → callback → token exchange → MCP requests
- Session ID returned as access_token is used in Authorization header for subsequent MCP requests

**Key Fixes Required for Claude Desktop**:
1. Added `/.well-known/oauth-protected-resource` and `/oauth/register` endpoints
2. Added `registration_endpoint` to authorization server metadata
3. Added URL-encoded body parser for OAuth token endpoint
4. Disabled DNS rebinding protection (conflicted with remote OAuth)
5. Redirect URI points to our server (`/oauth/callback`), then we redirect to Claude's callback with our session code

---

## Phase 3: Production Readiness ⏳ NOT STARTED
**Goal**: Prepare for production deployment with security, monitoring, and error handling

### Tasks:

#### 3.1: Enhanced Security
- [ ] Add rate limiting:
  - Install `express-rate-limit`: `pnpm add express-rate-limit`
  - Apply to all endpoints (e.g., 100 requests per 15 minutes per IP)
  - More restrictive on OAuth endpoints (e.g., 10 per hour)
- [ ] Add request validation middleware:
  - Validate JSON-RPC structure
  - Sanitize inputs
  - Reject malformed requests early
- [ ] Add HTTPS support (for production):
  - Document TLS certificate requirements
  - Add HTTPS server option via environment flag
- [ ] Token security:
  - Implement token encryption at rest (AES-256)
  - Use secure random state generation for OAuth
  - Add CSRF protection for OAuth flow
  - Implement token rotation policy
- [ ] Environment variable validation:
  - Verify all required OAuth vars are present on startup
  - Fail fast with clear error messages if missing

#### 3.2: Persistent Session Storage
- [ ] Implement Redis session storage (optional, for multi-instance deployments):
  - Install Redis client: `pnpm add ioredis @types/ioredis`
  - Create `src/auth/redis-token-manager.ts`
  - Implement same TokenManager interface backed by Redis
  - Use Redis for session data and tokens
  - Add automatic expiration (TTL) on keys
  - Add fallback to in-memory if Redis unavailable
- [ ] Update configuration to switch storage backends:
  - `SESSION_STORAGE=memory` (default) or `SESSION_STORAGE=redis`
  - `REDIS_URL` for connection string

#### 3.3: Monitoring and Logging
- [ ] Add structured logging:
  - Install logger: `pnpm add pino pino-pretty`
  - Create `src/utils/logger.ts`
  - Add log levels: debug, info, warn, error
  - Log all OAuth events (auth start, success, failure)
  - Log all MCP requests (with sanitized params)
  - Log token refresh attempts
  - Log session lifecycle events
- [ ] Add metrics collection:
  - Track active sessions count
  - Track requests per session
  - Track OAuth success/failure rates
  - Track token refresh rates
  - Track API errors by type
- [ ] Add health check improvements:
  - `GET /health` returns detailed status:
    - Active sessions count
    - Fergus API connectivity status
    - Token storage health
    - Memory usage
  - Add readiness check: `GET /ready`

#### 3.4: Error Handling and Resilience
- [ ] Implement comprehensive error handling:
  - Catch and log all errors at top level
  - Return proper JSON-RPC error responses
  - Map Fergus API errors to MCP error codes
  - Handle network failures gracefully
  - Implement retry logic for transient Fergus API failures
- [ ] Add graceful shutdown:
  - Handle SIGTERM/SIGINT signals
  - Close all active sessions
  - Drain in-flight requests
  - Close database connections (Redis)
  - Exit cleanly
- [ ] Token refresh resilience:
  - Retry refresh on transient failures
  - Fall back to re-authentication if refresh fails
  - Queue requests during token refresh
  - Notify client of re-auth requirement

#### 3.5: Testing Infrastructure
- [ ] Create integration test suite:
  - Test OAuth flow end-to-end (mock Fergus OAuth)
  - Test token refresh scenarios
  - Test session expiration
  - Test concurrent sessions from different users
  - Test rate limiting
  - Test error scenarios (invalid tokens, API failures)
- [ ] Create load testing scripts:
  - Simulate multiple concurrent users
  - Test session cleanup under load
  - Test memory leaks
- [ ] Add E2E test with Claude Desktop:
  - Document manual test steps
  - Create test checklist for releases

#### 3.6: Documentation Updates
- [ ] Update `README.md`:
  - Add "Remote Server" section
  - Document OAuth setup with Fergus
  - Document environment variables for remote mode
  - Add deployment guide
  - Add troubleshooting section for OAuth issues
  - Document security best practices
- [ ] Create `DEPLOYMENT.md`:
  - Document hosting options (Cloudflare, Vercel, AWS, etc.)
  - Provide example deployment configurations
  - Document SSL/TLS setup
  - Document Redis setup for production
  - Add monitoring recommendations
- [ ] Update API documentation:
  - Document OAuth endpoints
  - Document session management
  - Add sequence diagrams for OAuth flow

**Success Criteria**: Production-ready server with security hardening, monitoring, persistent storage option, comprehensive error handling

---

## Phase 4: Deployment and Release ⏳ NOT STARTED
**Goal**: Deploy to production and prepare for public use

### Tasks:

This phase will cover:
- Choosing and configuring hosting provider (Cloudflare Workers, Vercel, Railway, etc.)
- Setting up production environment (domain, SSL, OAuth credentials, Redis)
- Deploying to production
- Testing and validation (load testing, security audit)
- Documentation and release
- Monitoring and maintenance setup

**Success Criteria**: Production deployment running smoothly, monitoring in place, users can add and use remote Fergus MCP server

_Detailed tasks will be added when Phases 1-3 are complete._

---

## Architecture Decisions

### Why Stateful (vs Stateless)?
- **Chosen**: Stateful with session management
- **Reason**:
  - Support for SSE notifications (required for some MCP features)
  - Better token management (avoid re-auth on every request)
  - Richer feature set
  - Can add resumability later
- **Trade-off**: More complex, requires session storage

### Why OAuth (vs Authless)?
- **Chosen**: OAuth 2.0 with per-user authentication
- **Reason**:
  - Each user accesses their own Fergus data
  - No central PAT compromise risk
  - Follows OAuth best practices
  - User can revoke access from Fergus dashboard
- **Trade-off**: More complex implementation, OAuth flow friction

### Why Dual-Mode (vs Separate Package)?
- **Chosen**: Support both stdio and HTTP in same codebase
- **Reason**:
  - Code reuse (all tools, logic shared)
  - Easier maintenance
  - Single source of truth
  - Better testing (compare both modes)
- **Trade-off**: Slightly more complex entry points

### Session Storage Strategy
- **Phase 1-2**: In-memory Map (simple, good for single instance)
- **Phase 3+**: Redis (scalable, multi-instance support)
- **Fallback**: In-memory if Redis unavailable

### Token Security
- **Encryption**: AES-256 for tokens at rest
- **Transmission**: HTTPS only in production
- **Rotation**: Support refresh tokens
- **Expiry**: Honor Fergus token expiry
- **Scope**: Minimum required scopes only

---

## Testing Strategy

### Unit Tests
- OAuth handler methods (mock HTTP requests)
- Token manager (mock storage)
- Session manager (lifecycle, cleanup)
- FergusClient with token provider

### Integration Tests
- Full OAuth flow (mock Fergus endpoints)
- Token refresh scenarios
- Session persistence and cleanup
- Multi-user isolation
- Error handling paths

### E2E Tests
- Manual testing with Claude Web
- Manual testing with Claude Desktop
- Load testing with concurrent users
- Security testing (OWASP checks)

---

## Security Considerations

### OAuth Security
- Use PKCE (Proof Key for Code Exchange) if Fergus supports it
- Validate state parameter to prevent CSRF
- Secure state storage (encrypt, expire after 10 minutes)
- Validate redirect URI matches configured URI
- Never log tokens or sensitive data

### Token Management
- Encrypt tokens at rest
- Use secure random for session IDs (UUIDv4)
- Implement token rotation
- Clear tokens on logout/session end
- Set reasonable token expiry

### Transport Security
- HTTPS only in production (enforce)
- Proper CORS configuration (whitelist Claude domains only)
- DNS rebinding protection enabled
- Rate limiting on all endpoints
- Input validation and sanitization

### Session Security
- Session timeout (1 hour idle)
- Secure session ID generation
- Session hijacking protection
- Regular session cleanup
- Limit concurrent sessions per user (optional)

---

## Deployment Recommendations

### Recommended Stack
- **Hosting**: Cloudflare Workers or Vercel (easiest) or Railway/Render (more control)
- **Session Storage**: Redis Cloud (managed)
- **Monitoring**: Sentry (errors) + Datadog/New Relic (metrics)
- **Logging**: Structured JSON logs via Pino
- **Domain**: Use Fergus domain or custom domain with SSL

### Environment Variables (Production)
```bash
# Fergus OAuth
FERGUS_OAUTH_CLIENT_ID=<production-client-id>
FERGUS_OAUTH_CLIENT_SECRET=<production-secret>
FERGUS_OAUTH_REDIRECT_URI=https://mcp.fergus.com/oauth/callback

# Server
NODE_ENV=production
HTTP_PORT=443
HTTP_HOST=0.0.0.0
ALLOWED_ORIGINS=https://claude.ai,https://www.claude.ai
ALLOWED_HOSTS=mcp.fergus.com

# Session Storage
SESSION_STORAGE=redis
REDIS_URL=rediss://:<password>@<host>:<port>

# Logging
LOG_LEVEL=info

# Security
ENABLE_RATE_LIMITING=true
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=900000
```

---

## Migration Path for Existing Users

### For CLI Users (Stdio)
- **No changes required**
- Continue using existing setup
- PAT authentication still works
- All tools and prompts unchanged

### For New Remote Users
- Add Fergus MCP server in Claude Web
- Complete OAuth authorization flow
- Start using tools immediately

### For Transitioning Users
- Can use both modes simultaneously
- Local (stdio) for development/testing
- Remote (HTTP) for production Claude Web usage

---

## Success Metrics

### Technical Metrics
- OAuth success rate > 95%
- Token refresh success rate > 99%
- Response time < 500ms for 95% of requests
- Error rate < 1%
- Uptime > 99.5%
- Zero security incidents

### User Metrics
- Number of active OAuth sessions
- OAuth completion rate
- Tools called per session
- User retention (repeat usage)
- Support ticket volume

---

## Risks and Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Fergus OAuth changes | High | Low | Monitor API docs, version detection, fallback plan |
| Token storage breach | Critical | Low | Encrypt at rest, secure Redis, audit logs |
| OAuth flow friction | Medium | Medium | Clear UX, error messages, documentation |
| Session storage scaling | Medium | Medium | Use Redis, monitor metrics, auto-scaling |
| Rate limiting issues | Medium | Medium | Proper limits, user communication, allow overrides |
| MCP spec changes | Medium | Low | Use official SDK, monitor spec updates |
| Multi-region latency | Low | Medium | Edge deployment (Cloudflare), CDN |

---

## Timeline Estimate

- **Phase 1** (HTTP Foundation): 3-5 days
- **Phase 2** (OAuth Integration): 5-7 days
- **Phase 3** (Production Readiness): 5-7 days
- **Phase 4** (Deployment & Release): TBD
- **Total (Phases 1-3)**: 13-19 days (2-3 weeks)

---

## Next Steps

1. **Immediate**: Begin Phase 1 - HTTP Transport Foundation
2. **Week 1**: Complete HTTP transport, test with static PAT
3. **Week 2**: Implement OAuth integration, test with real tokens
4. **Week 3**: Production hardening, security, monitoring
5. **Phase 4**: Deployment planning will begin after Phase 3 completion

---

## Resources

### MCP Documentation
- Remote MCP Servers: https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers
- MCP Specification: https://modelcontextprotocol.io/specification
- TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Streamable HTTP Examples: SDK `src/examples/server/simpleStreamableHttp.ts`

### Fergus API
- API Documentation: https://api.fergus.com/docs
- OAuth Documentation: (TBD - need to locate in Fergus docs)

### Deployment Guides
- Cloudflare Workers MCP: https://blog.cloudflare.com/remote-model-context-protocol-servers-mcp/
- Vercel Deployment: (standard Node.js app deployment)

---

**Document Version**: 1.0
**Created**: 2025-10-07
**Status**: Ready for Implementation
**Next Engineer**: Start with Phase 1, Task 1.1 (Add Dependencies)

## Notes for Engineers

- Mark tasks as complete by changing `[ ]` to `[x]` as you finish them
- Update phase status from `⏳ NOT STARTED` to `⏳ IN PROGRESS` to `✅ COMPLETED`
- Add notes or blockers directly in this document under relevant tasks
- If you discover issues or need clarification, add a comment in the task
- Test thoroughly after each phase before proceeding to the next
- Keep the main `plan.md` updated if you add new tools/features
- Security is paramount - review all OAuth and token handling code carefully
- Ask Ben for Fergus OAuth credentials when needed for Phase 2
