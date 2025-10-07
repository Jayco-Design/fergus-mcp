# Fergus MCP Server - Project Plan

## Overview

This project will create a Model Context Protocol (MCP) server that integrates with the Fergus API, enabling AI assistants like Claude to interact with Fergus's job management platform. The server will expose Fergus's business operations data and functionality through MCP's standardized interface.

## About Fergus

Fergus is a job management platform for trade businesses, providing features for managing jobs, quotes, customers, sites, time tracking, and more. The API provides comprehensive access to these resources.

### API Documentation

The Fergus API documentation is available at:
- **Interactive Docs**: https://api.fergus.com/docs
- **OpenAPI JSON**: https://api.fergus.com/docs/json

The OpenAPI specification provides complete endpoint details including paths, methods, parameters, request/response schemas, and authentication requirements. You should only need to fetch this once per session.

## About Model Context Protocol (MCP)

MCP is an open protocol that standardizes how AI applications connect to external data sources and tools. It enables:
- **Tools**: Enable AI to perform actions with parameters (similar to API endpoints)
- **Prompts**: Provide templated interactions for common workflows
- **Resources**: Expose subscribable data (not used in this implementation)

### Architecture Decision: Tools-Only Approach

This MCP server **only implements Tools**, not Resources. This decision was made because:
- All Fergus API interactions benefit from parameterization (filtering, sorting, IDs)
- Tools provide more flexibility than static resources
- The Fergus API is action-oriented rather than subscription-oriented

**Tool Examples**:
- `list-jobs` - List jobs with optional filtering (status, limit, sorting)
- `get-job` - Get specific job by ID
- `create-job` - Create a new job
- `update-job` - Update an existing job

## Technical Architecture

### Technology Stack
- **Language**: TypeScript
- **Package Manager**: pnpm
- **SDK**: `@modelcontextprotocol/sdk` (official TypeScript SDK)
- **Transport**: StdioServerTransport (for CLI integration)
- **HTTP Client**: Native fetch for Fergus API calls
- **Schema Validation**: JSON Schema (MCP standard)
- **Authentication**: Personal Access Token (PAT) via HTTP Bearer token

### Project Structure
```
fergus-mcp/
├── src/
│   ├── index.ts              # Main server entry point
│   ├── config.ts             # Configuration management
│   ├── fergus-client.ts      # Fergus API client wrapper
│   └── tools/                # MCP tool handlers (definitions + logic)
│       ├── get-job.ts        # Get specific job by ID
│       ├── list-jobs.ts      # List jobs with filtering/sorting
│       ├── create-job.ts     # Create new job
│       ├── create-quote.ts   # Create new quote
│       ├── create-customer.ts # Create new customer
│       └── update-job.ts     # Update existing job
├── package.json
├── tsconfig.json
├── README.md
└── .env.example
```

**Architecture Notes**:
- Tools-only architecture (no MCP resources)
- Tool files contain both definitions and handler logic
- Tools use `fergusClient` directly for API calls
- All operations are parameterized for maximum flexibility

## MCP Implementation Plan

### Phase 1: Core Infrastructure ✅ COMPLETED
**Goal**: Set up basic MCP server with authentication

#### Tasks:
1. **Project Setup** ✅
   - ✅ Initialize TypeScript project with proper configuration
   - ✅ Install dependencies using pnpm: `@modelcontextprotocol/sdk`, `zod`, `dotenv`
   - ✅ Set up build and development scripts
   - ✅ Configure package.json with bin entry for npx support

2. **Authentication Layer** ✅
   - ✅ Create Fergus API client wrapper (src/fergus-client.ts)
   - ✅ Implement Personal Access Token (PAT) authentication via HTTP Bearer header
   - ✅ Support CLI arguments (--api-token) and environment variables (FERGUS_API_TOKEN)
   - ✅ Handle authentication errors gracefully (401, 403 responses)

3. **Basic Server Setup** ✅
   - ✅ Initialize McpServer instance
   - ✅ Set up StdioServerTransport
   - ✅ Implement error handling and logging
   - ✅ Create health check mechanism
   - ✅ Implement basic tools (get-job, list-jobs)
   - ✅ Modular tool structure (definitions + handlers)

### Phase 2: Read Operations (Tools) ✅ COMPLETED
**Goal**: Expand read-only tools to cover all major Fergus entities

**Status**: All 10 read-only tools implemented and tested successfully

#### Tools Implemented:

1. **Customer Tools** ✅
   - ✅ `list-customers` - List customers with search filtering and pagination
   - ✅ `get-customer` - Get specific customer by ID

2. **Quote Tools** ✅
   - ✅ `list-quotes` - List quotes with filtering (status, creation/modification dates)
   - ✅ `get-quote` - Get specific quote by ID

3. **Site Tools** ✅
   - ✅ `list-sites` - List sites with filtering (name, city, postal code)
   - ✅ `get-site` - Get specific site by ID

4. **User Tools** ✅
   - ✅ `list-users` - List all users/team members with filtering (name, email, user type, status)
     * Endpoint: GET /users
     * Parameters: filterSearchText, pageSize, sortOrder, sortField (firstName, lastName, createdAt), filterUserType (contractor, field_worker, apprentice, tradesman, advisor, full_user, time_sheet_only), filterStatus (active, disabled, invited)
   - ✅ `get-user` - Get specific user by ID
     * Endpoint: GET /users/{userId}

5. **Time Entry Tools** ✅
   - ✅ `list-time-entries` - List time entries with filtering (user, job, date range, locked status)
   - ✅ `get-time-entry` - Get specific time entry by ID

#### Technical Implementation:
- ✅ All endpoints verified against Fergus API documentation
- ✅ Pagination implemented using `pageSize` and `pageCursor`
- ✅ Consistent error handling across all tools
- ✅ Proper parameter naming matching Fergus API (e.g., `filterUserId`, `filterJobNo`)
- ✅ Return data in JSON format for AI consumption

### Phase 3: Action Tools ✅ COMPLETED
**Goal**: Enable AI to perform actions in Fergus

**Status**: All 16 action tools implemented and tested successfully (includes 3 quote detail/update tools)

#### Tools Implemented:

1. **Job Management** ✅
   - ✅ `create-job` - Create a new job (draft or finalized)
   - ✅ `update-job` - Update existing draft job
   - ✅ `finalize-job` - Convert draft job to active status

2. **Quote Management** ✅
   - ✅ `create-quote` - Create quote for a job with sections and line items
     * Important: Line items must use EITHER `isLabour` OR `salesAccountId`, but NOT BOTH
   - ✅ `get-quote-detail` - Get comprehensive quote details including all sections and line items
   - ✅ `update-quote` - Update existing DRAFT quote sections (by quote ID)
     * WARNING: Replaces ALL sections - must fetch all existing sections first to avoid data loss
     * Implements workaround for API bug (must preserve title/description)
   - ✅ `update-quote-version` - Update existing DRAFT quote sections (by version number)
     * WARNING: Replaces ALL sections - must fetch all existing sections first to avoid data loss
     * Implements workaround for API bug (must preserve title/description)
     * Note: No GET endpoint exists for version lookups, tool fetches all quotes and finds matching version

3. **Customer Management** ✅
   - ✅ `create-customer` - Add new customer with contact information
   - ✅ `update-customer` - Modify customer details

4. **Site Management** ✅
   - ✅ `create-site` - Add new site with address and contacts
   - ✅ `update-site` - Modify site details

5. **User Operations** ✅
   - ✅ `update-user` - Update user details (firstName, lastName, address, payRate, chargeOutRate, contactItems)
     * Endpoint: PATCH /users/{userId}
     * Status: Implemented and tested

#### Tool Design Principles:
- Use JSON Schema for input validation with TypeScript types for type safety
- Provide clear, descriptive error messages
- Return structured results with relevant details
- Include confirmation messages for successful actions
- Implement dry-run mode for destructive operations

### Phase 4: Advanced Features ⏳ IN PROGRESS

#### 1. Prompts for Common Workflows ✅ COMPLETED
Create templated prompts for frequent tasks:
- ✅ `job-creation-assistant`: Guide through job creation (draft → finalized workflow)
  * Prompts user through: create draft → find/create customer & site → update job → finalize
  * Optional jobType argument for customization
- ✅ `quote-generator`: Help create comprehensive quotes with sections and line items
  * Requires jobId argument
  * Provides quote structure guidance with sections and line items
  * Explains isLabour vs salesAccountId requirement
- ✅ `weekly-report`: Generate job status summaries for a date range
  * Optional dateFrom/dateTo arguments (defaults to past 7 days)
  * Guides through comprehensive reporting: jobs, quotes, time entries, team productivity

#### 2. Smart Completions
Implement context-aware completions:
- Customer name suggestions
- Site address completions
- Job template suggestions
- User assignment recommendations

#### 3. Notifications & Webhooks
- Real-time updates for job status changes
- Quote acceptance notifications
- Time entry reminders

#### 4. Batch Operations
- Bulk job creation from spreadsheet data
- Mass quote generation
- Customer data import

## Security Considerations

### Authentication
- Store Personal Access Token securely (environment variables, not in code)
- Support credential rotation via configuration updates
- PAT tokens don't expire but handle revocation scenarios
- Never log the PAT or include it in error messages

### Authorization
- Respect Fergus API permission levels
- Validate user access before operations
- Provide clear error messages for permission denials

### Data Protection
- Don't cache sensitive customer data unnecessarily
- Implement data retention policies
- Sanitize error messages to avoid data leaks

### Rate Limiting
- Implement request throttling
- Handle Fergus API rate limits gracefully
- Use exponential backoff for retries

## Testing Strategy

### Unit Tests
- Test individual tool handlers
- Validate input schemas and TypeScript types
- Mock Fergus API responses

### Integration Tests
- Test full request/response cycles
- Validate error handling
- Test authentication with PAT (valid, invalid, and missing tokens)

### End-to-End Tests
- Test with actual MCP clients (Claude Desktop)
- Validate real Fergus API interactions (sandbox environment)
- Test common user workflows

## Documentation

### User Documentation
1. **Installation Guide**
   - Prerequisites
   - Installation steps
   - Configuration setup
   - Claude Desktop integration

2. **Authentication Guide**
   - How to obtain a Personal Access Token from Fergus
   - Environment variable configuration
   - Secure token storage best practices

3. **Usage Examples**
   - Common scenarios and how to accomplish them
   - Tool usage examples
   - Resource query patterns

4. **Troubleshooting**
   - Common errors and solutions
   - Debug mode instructions
   - Support contact information

### Developer Documentation
1. **Architecture Overview**
   - System design diagrams
   - Component interactions
   - Data flow explanations

2. **API Reference**
   - All available tools and their schemas
   - Resource URI patterns
   - Response formats

3. **Contributing Guide**
   - Code style guidelines
   - How to add new tools/resources
   - Testing requirements
   - Pull request process

## Deployment & Distribution

### Package Distribution
- Publish to npm as `@fergus/mcp-server` (or appropriate namespace)
- Semantic versioning (starting at 1.0.0)
- Include pre-built JavaScript for easy installation

### MCP Registry
- Submit to official MCP registry (modelcontextprotocol.io/registry)
- Include comprehensive metadata
- Maintain registry entry with updates

### Installation Methods
1. **NPX (Recommended)**
   ```bash
   npx @fergus/mcp-server
   ```

2. **Global Install with pnpm**
   ```bash
   pnpm add -g @fergus/mcp-server
   ```

3. **Local Project with pnpm**
   ```bash
   pnpm add @fergus/mcp-server
   ```

## Maintenance & Support

### Version Management
- Follow semantic versioning
- Maintain changelog
- Deprecation notices for breaking changes

### Monitoring
- Track API usage patterns
- Monitor error rates
- Collect anonymous usage statistics (opt-in)

### Community
- GitHub repository for issues and discussions
- Regular updates based on Fergus API changes
- Community contributions welcome

## Success Metrics

### Technical Metrics
- Response time < 500ms for 95% of requests
- Error rate < 1%
- Test coverage > 80%
- Zero critical security vulnerabilities

### Usage Metrics
- Number of active installations
- Most-used tools and resources
- User satisfaction ratings

## Timeline Estimate

- **Phase 1** (Core Infrastructure): 1 week
- **Phase 2** (Read-Only Resources): 2 weeks
- **Phase 3** (Action Tools): 2 weeks
- **Phase 4** (Advanced Features): 2-3 weeks
- **Documentation & Testing**: 1 week
- **Total**: 8-9 weeks

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Fergus API changes | High | Monitor API changelog, implement version detection |
| Rate limiting issues | Medium | Implement caching, request queuing |
| PAT token security | Medium | Clear security documentation, never log tokens |
| MCP spec changes | Low | Use official SDK, stay updated with releases |

## Future Enhancements

### Potential Features
- Web-based configuration UI
- Advanced analytics and reporting
- Integration with other trade business tools
- Mobile app support via MCP
- Custom field mapping
- Workflow automation triggers

### Community Requests
- Maintain public roadmap
- Accept feature requests via GitHub
- Regular community feedback sessions

## License

This is a public repository. Recommend **MIT License** for maximum accessibility and adoption.

## Getting Started (Next Steps)

1. ✅ Set up development environment
2. ✅ Create initial project structure
3. ✅ Implement basic Fergus API client
4. ✅ Build first MCP tool (read-only resource)
5. ✅ Test with Claude Desktop (requires Fergus API token)
6. ✅ Phase 2 Read Operations (customers, quotes, sites, time entries, users)
7. ✅ Phase 3 Action Tools (jobs, quotes, customers, sites, users)
8. ✅ Phase 4.1 MCP Prompts (job creation, quote generator, weekly report)
9. ✅ Remote HTTP Server with OAuth 2.0 (see remote-mcp-plan.md)
10. ✅ Render Deployment Configuration with Redis
11. 🚀 Ready for Production Deployment

---

**Document Version**: 2.9
**Last Updated**: 2025-10-08
**Status**: Production Ready - Render Deployment Configured

**Next Engineer: Deploy to Render following DEPLOYMENT.md, or continue Phase 4 Advanced Features (Smart Completions, Notifications, Batch Operations)**

## Known Issues

### Fergus API Bug: User Status Filtering
**Issue**: The `filterStatus=active` parameter returns users with `status="disabled"` in the response.

**Root Cause**: In `/fergus-partner-api/src/routes/users/data.access.ts:111`, the "active" filter only checks `activated=true` but doesn't exclude `banned=true`. Users can have both `activated=true` AND `banned=true`, which the response logic correctly shows as "disabled" status.

**Fix Required**: The active filter should check both conditions:
```typescript
default:  // "active"
  return query.where((eb) =>
    eb.and([
      eb("rp_employee.activated", "=", true),
      eb("rp_employee.banned", "=", false),
    ])
  );
```

**Status**: Reported to Fergus team for fix in partner API.

### Fergus API Bug: Update Quote Requires Title/Description
**Issue**: The PUT endpoints for updating quotes (`/jobs/{jobId}/quotes/{quoteId}` and `/jobs/{jobId}/quotes/version/{versionNumber}`) fail with SQL syntax error when `title` or `description` are undefined.

**Root Cause**: In `/fergus-partner-api/src/routes/quotes/dao/index.ts:59-68`, the update operation always tries to set `title` and `description` fields. When both are undefined, Kysely generates an empty SET clause: `UPDATE rp_quote SET  WHERE...` which is invalid SQL.

**Workaround Implemented**: The MCP tools (`update-quote` and `update-quote-version`) now fetch the existing quote first to preserve the title and description fields before updating.

**API Design Issue**: The schema allows `title` and `description` to be optional (`Type.Optional(Type.String())`), but the DAO code doesn't handle the case where they're not provided.

**Status**: Workaround implemented in MCP server. API should be fixed to only update fields that are actually provided in the request body.

### Missing API Endpoint: GET Quote by Version
**Issue**: The Swagger documentation shows `GET /jobs/{jobId}/quotes/version/{versionNumber}`, but this endpoint doesn't exist in the partner API code.

**Impact**: The `update-quote-version` tool must fetch all quotes for a job and find the matching version number, rather than directly fetching by version.

**Workaround Implemented**: The tool uses `GET /jobs/{jobId}/quotes` to fetch all quotes, then finds the quote with the matching version number.

**Status**: Endpoint should be implemented to match the PUT endpoint that exists at this path.

## Changelog
- v2.9: **Production Deployment Ready** - Implemented Redis session storage with `RedisTokenManager` and `ITokenManager` interface for swappable storage backends. Created complete Render deployment configuration with `render.yaml` (Infrastructure as Code). Added comprehensive documentation: `DEPLOYMENT.md` (step-by-step guide), `RENDER_QUICKSTART.md` (quick reference). Updated `README.md` with deployment section. Server automatically selects in-memory or Redis storage based on environment. Graceful shutdown for Redis connections. Added `ioredis` dependency (v5.8.1). Project now production-ready for Render deployment with free tier Redis + Node.js web service. See `remote-mcp-plan.md` for complete remote server implementation details.
- v2.8: **Phase 3 Enhanced - Quote Management Tools** - Added 3 new quote tools bringing total to 16 action tools: `get-quote-detail` (comprehensive quote data with all sections/line items), `update-quote` (update by quote ID), and `update-quote-version` (update by version number). Discovered and documented two Fergus API bugs: (1) update quote endpoints require title/description or generate invalid SQL, (2) missing GET endpoint for quote by version number. Implemented workarounds for both bugs. Added prominent warnings to update tools about replacing ALL sections to prevent data loss.
- v2.7: **Phase 4.1 COMPLETED** - Implemented MCP Prompts for common workflows: job-creation-assistant (guides through draft→finalized workflow), quote-generator (helps structure quotes with sections/line items), and weekly-report (generates comprehensive status reports). Prompts capability added to server with ListPromptsRequestSchema and GetPromptRequestSchema handlers.
- v2.6: **Phase 3 COMPLETED** - Implemented final action tool: update-user (PATCH /users/{userId}) with support for firstName, lastName, address (7 fields), payRate, chargeOutRate, and contactItems. All 13 action tools now complete. Ready for Phase 4.
- v2.5: **Phase 3 nearly complete** - Implemented 9 additional action tools: create-quote, update-quote (with correct schema requiring EITHER isLabour OR salesAccountId), create-customer, update-customer, create-site, update-site. Added PATCH method to FergusClient. All tools tested successfully via MCP. Only update-user remains unimplemented.
- v2.4: **Phase 3 job tools** - Implemented create-job, update-job, and finalize-job action tools. Discovered and documented Fergus API bug where filterStatus=active returns disabled users (requires API fix). MCP server implementation is correct.
- v2.3: **Pagination bug fix** - Fixed missing `pageCursor` parameter in list-users and list-jobs tools. Pagination now working correctly across all list endpoints. Tested with Fergus MCP server using its own tools (dogfooding).
- v2.2: **Phase 2 COMPLETED** - Implemented user tools (list-users, get-user). All 10 read-only tools now complete: jobs, time entries, quotes, customers, sites, and users. Full filtering support including user type (contractor, field_worker, apprentice, tradesman, advisor, full_user, time_sheet_only) and status (active, disabled, invited). Project successfully builds and is ready for Phase 3 Action Tools.
- v2.1: **Phase 2 mostly completed** - Implemented 8 new read-only tools: list-customers, get-customer, list-sites, get-site, list-quotes, get-quote, list-time-entries, get-time-entry. All endpoints verified against actual Fergus API documentation. Proper pagination implemented with pageSize/pageCursor. User tools remain to be implemented.
- v2.0: **BREAKING - Tools-only architecture** - Removed MCP Resources entirely. This server now only implements Tools, as all Fergus API operations benefit from parameterization. Simplified architecture with tools directly calling fergusClient. Updated Phase 2 to focus on read operation tools rather than resources.
- v1.4: **Architecture clarification** - Added Resources vs Tools guidance, simplified resource handlers (metadata only, logic in index.ts), kept tools modular (definitions + handlers). Clarified that resources are for browsing/subscribing while tools are for parameterized actions.
- v1.3: **Phase 1 enhancements** - Added sorting support to list-jobs (sortField, sortOrder), fixed Node.js compatibility (requires v18+), fixed healthCheck endpoint, suppressed dotenv output for MCP stdio compatibility, successfully tested with Claude Desktop
- v1.2: **Phase 1 completed** - Core infrastructure with CLI argument support, basic tools and resources implemented
- v1.1: Updated to use pnpm package manager, simplified authentication to PAT-only via HTTP Bearer
- v1.0: Initial plan created
