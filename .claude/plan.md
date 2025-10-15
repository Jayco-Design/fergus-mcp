# Fergus MCP Server – Status Snapshot

## Completed
- Remote HTTP transport with OAuth 2.0 (Claude Desktop/Web compatible) alongside existing stdio mode
- 20 MCP tools (10 read, 10 action) covering jobs, quotes, customers, sites, users, plus supporting structured content flows
- Prompt library (job creation, quote generation, weekly report) validated in Claude clients
- Redis-backed token/session manager with graceful shutdown; auto-selects memory vs Redis via config
- Production docs: `DEPLOYMENT.md`, `RENDER_QUICKSTART.md`, `render.yaml`, README deployment guidance
- OAuth refresh-token rotation, session persistence (7-day timeout), and end-to-end manual verification in Claude Desktop

## Outstanding (Senior Engineer Notes)
- Finish production guardrails: rate limiting, input validation, HTTPS/TLS guidance, token encryption & CSRF/state hygiene
- Introduce structured logging + metrics (pino, health/readiness endpoints, session/request counters)
- Harden error handling: top-level JSON-RPC mapping, retry/backoff for Fergus API, graceful shutdown for HTTP workers
- Build test coverage: integration tests for OAuth + refresh, resilience scenarios, load test scripts, Claude Desktop E2E checklist
- Execute Render launch checklist in `.claude/remote-mcp-plan.md` (provision Redis/service, configure Cognito callbacks, smoke test, update URLs)
- Track Fergus OAuth documentation source and confirm long-term maintenance contacts
- Review new Fergus API endpoints (`/enquiries`, `/favourites`) and scope follow-on tools or prompts as needed

## New Fergus API Surface (2025-10-15 spec scan)
- `/enquiries` (GET, POST) and `/enquiries/{enquiryId}` (GET) for managing inbound enquiries
- `/favourites` (GET) and `/favourites/{sectionId}` (GET) exposing catalogue folders/sections
- Confirmed existing tools already cover `/jobs/{jobId}/quotes` (POST) plus quote update endpoints (`/jobs/{jobId}/quotes/{quoteId}`, `/jobs/{jobId}/quotes/version/{versionNumber}`)

## References
- For full roadmap and task detail, see `.claude/remote-mcp-plan.md`
