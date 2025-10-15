# Remote MCP Server Plan (Concise)

_Last updated: 2025-10-15_

## Overview
- Fergus MCP server now runs in dual mode (stdio + remote HTTP) with full OAuth 2.0 integration for Claude Web/Desktop.
- GitHub main branch auto-deploys to Render (Node service + Redis). Deployment pipeline verified; environment variables populated.
- Existing stdio tooling remains compatible for local development and regression checks.

## Completed Milestones
- Remote transport: Express + `StreamableHTTPServerTransport`, RFC8414/7591 endpoints, token exchange, session persistence (7-day TTL).
- OAuth resilience: refresh-token rotation, Cognito integration, Bearer auth for Claude, session storage abstraction (memory/Redis) with graceful shutdown.
- Feature set: 20 tools (10 read, 10 action) plus structured content flows, 3 prompts, pagination fixes, bug workarounds documented.
- Docs + ops collateral: `DEPLOYMENT.md`, `RENDER_QUICKSTART.md`, `render.yaml`, README deployment section, internal testing notes.
- Manual validation: Claude Desktop remote flow exercised end-to-end, Redis-backed deployment smoke tested via Render preview.

## Current Deployment Footprint
- GitHub: `main` is the deployment branch; PR merges trigger Render auto-deploy.
- Render: Web service + managed Redis instance. Health endpoint exposed; environment configured with OAuth + Fergus secrets.
- Secrets Management: `.env.example` documents required variables; Render dashboard holds production secrets.

## Outstanding Work (High-Level)
- Production guardrails
  - Apply rate limiting (general + stricter OAuth endpoints), JSON Schema validation for incoming payloads, document TLS/HTTPS expectations for custom domains, and encrypt persisted tokens/state.
  - Ensure OAuth state/CSRF protections and rotate session secrets on deploys.
- Observability & diagnostics
  - Introduce structured logging (pino or equivalent), surface request/session metadata, redact tokens, wire logs to Render.
  - Add metrics/health endpoints (`/health`, `/ready`) exposing Redis status, Fergus API reachability, session counts;
    plan for dashboarding (Render, Datadog, etc.).
- Error handling & resilience
  - Normalize JSON-RPC error responses, map Fergus API errors, add retry/backoff for transient failures, queue requests around token refresh, and guarantee graceful shutdown for HTTP workers.
- Quality gates
  - Build integration tests covering OAuth + refresh rotation, concurrent sessions, rate limiting, and Fergus API error scenarios.
  - Create load test scripts and a Claude Desktop E2E checklist for release sign-off.
- Launch checklist
  - Follow `.claude/plan.md` and deployment docs: verify Render production deployment, update public URLs as needed, perform post-deploy smoke tests, notify stakeholders, and schedule monitoring/alerting.
  - Capture Fergus OAuth documentation references and long-term contact owners for credential management.

## References
- Detailed task context: `.claude/plan.md`
- Deployment/runbooks: `DEPLOYMENT.md`, `RENDER_QUICKSTART.md`
- MCP spec & SDK: https://modelcontextprotocol.io/specification, https://github.com/modelcontextprotocol/typescript-sdk
- Fergus API docs: https://api.fergus.com/docs
