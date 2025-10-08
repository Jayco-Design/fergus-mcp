# ChatGPT Apps Integration Plan

## Overview

This plan outlines the refactoring and enhancement of the Fergus MCP server to provide a rich, structured experience for ChatGPT Apps with visual UI components.

**Created**: 2025-10-08
**Status**: Draft for Discussion

---

## Current State

- ✅ 26 tools in flat `src/tools/` directory (24 tool files)
- ✅ All tools functional via stdio and HTTP transports
- ✅ Read-only annotations added to 13 read-only tools
- ✅ `list-users` and `list-sites` return `structuredContent`
- ❌ No UI templates or visual components
- ❌ Large tool files (up to 214 lines)
- ❌ No grouping by entity type
- ❌ Inconsistent structured response patterns

---

## Goals

1. **Organize tools by entity type** - Group related tools into subdirectories
2. **Add UI templates** - Create visual components for ChatGPT Apps
3. **Standardize structured responses** - All list tools return `structuredContent`
4. **Improve maintainability** - Smaller, focused files with shared utilities
5. **Enable rich UX** - Interactive tables, cards, and widgets in ChatGPT

---

## Proposed Structure

```
fergus-mcp/
├── src/
│   ├── tools/
│   │   ├── index.ts                    # Tool registry/exports
│   │   ├── shared/                     # Shared utilities
│   │   │   ├── response-builder.ts    # Helper to build structured responses
│   │   │   ├── template-paths.ts      # Template URI constants
│   │   │   └── types.ts                # Shared TypeScript types
│   │   ├── jobs/
│   │   │   ├── get-job.ts
│   │   │   ├── list-jobs.ts
│   │   │   ├── create-job.ts
│   │   │   ├── update-job.ts
│   │   │   ├── finalize-job.ts
│   │   │   └── index.ts                # Export all job tools
│   │   ├── quotes/
│   │   │   ├── get-quote.ts
│   │   │   ├── get-quote-detail.ts
│   │   │   ├── list-quotes.ts
│   │   │   ├── create-quote.ts
│   │   │   ├── update-quote.ts
│   │   │   ├── update-quote-version.ts
│   │   │   └── index.ts
│   │   ├── customers/
│   │   │   ├── get-customer.ts
│   │   │   ├── list-customers.ts
│   │   │   ├── create-customer.ts
│   │   │   ├── update-customer.ts
│   │   │   └── index.ts
│   │   ├── sites/
│   │   │   ├── get-site.ts
│   │   │   ├── list-sites.ts
│   │   │   ├── create-site.ts
│   │   │   ├── update-site.ts
│   │   │   └── index.ts
│   │   ├── users/
│   │   │   ├── get-user.ts
│   │   │   ├── list-users.ts
│   │   │   ├── update-user.ts
│   │   │   └── index.ts
│   │   └── time-entries/
│   │       ├── get-time-entry.ts
│   │       ├── list-time-entries.ts
│   │       └── index.ts
│   ├── templates/                      # UI templates for ChatGPT Apps
│   │   ├── customers/
│   │   │   ├── list-customers.html     # Table/card view
│   │   │   └── customer-detail.html    # Single customer view
│   │   ├── sites/
│   │   │   ├── list-sites.html         # Map/table view
│   │   │   └── site-detail.html        # Single site view
│   │   ├── users/
│   │   │   ├── list-users.html         # Team roster view
│   │   │   └── user-detail.html
│   │   ├── jobs/
│   │   │   ├── list-jobs.html          # Kanban/table view
│   │   │   └── job-detail.html
│   │   ├── quotes/
│   │   │   ├── list-quotes.html
│   │   │   └── quote-detail.html       # Itemized quote view
│   │   ├── shared/
│   │   │   ├── styles.css              # Shared CSS
│   │   │   └── utils.js                # Shared JS utilities
│   │   └── index.ts                    # Template resource server
│   └── server.ts                       # Update imports
```

---

## Implementation Phases

### Phase 1: Refactor Tool Structure ⏳ NOT STARTED

**Goal**: Reorganize tools into entity-based subdirectories

#### Tasks:

1. **Create new directory structure**
   - [ ] Create subdirectories: `jobs/`, `quotes/`, `customers/`, `sites/`, `users/`, `time-entries/`, `shared/`
   - [ ] Create `index.ts` in each subdirectory

2. **Create shared utilities**
   - [ ] Create `src/tools/shared/types.ts`:
     ```typescript
     export interface StructuredResponse<T> {
       content: Array<{ type: 'text'; text: string }>;
       structuredContent?: T;
     }

     export interface PaginationInfo {
       count: number;
       total: number;
       nextCursor: string | null;
     }
     ```
   - [ ] Create `src/tools/shared/response-builder.ts`:
     ```typescript
     export function buildListResponse<T>(options: {
       items: T[];
       totalCount: number;
       nextCursor: string | null;
       entityName: string;
       itemKey: string;
       templateUri?: string;
     }): StructuredResponse<any>
     ```
   - [ ] Create `src/tools/shared/template-paths.ts`:
     ```typescript
     export const TEMPLATES = {
       CUSTOMERS: {
         LIST: 'ui://customers/list-customers.html',
         DETAIL: 'ui://customers/customer-detail.html'
       },
       // ... etc
     }
     ```

3. **Move tools to subdirectories** (use git mv to preserve history)
   - [ ] Move job tools to `jobs/`
   - [ ] Move quote tools to `quotes/`
   - [ ] Move customer tools to `customers/`
   - [ ] Move site tools to `sites/`
   - [ ] Move user tools to `users/`
   - [ ] Move time entry tools to `time-entries/`

4. **Update all tool files to use shared utilities**
   - [ ] Update imports in moved files
   - [ ] Refactor `list-users.ts` to use `buildListResponse()`
   - [ ] Refactor `list-sites.ts` to use `buildListResponse()`
   - [ ] Add `structuredContent` to remaining list tools

5. **Update `src/server.ts`**
   - [ ] Update imports to use new subdirectory paths
   - [ ] Consider using barrel exports from subdirectories

6. **Test refactored structure**
   - [ ] Build successfully: `pnpm build`
   - [ ] Test stdio mode still works
   - [ ] Test HTTP mode still works

**Success Criteria**:
- ✅ All tools organized by entity type
- ✅ Shared utilities reduce code duplication
- ✅ All imports working, builds successfully
- ✅ No functionality broken

---

### Phase 2: Add Structured Content to All List Tools ⏳ NOT STARTED

**Goal**: Standardize structured responses across all list endpoints

#### Tasks:

1. **Update list-jobs**
   - [ ] Return `structuredContent` with job array + pagination
   - [ ] Extract key fields: id, title, status, customer, site, dates

2. **Update list-quotes**
   - [ ] Return `structuredContent` with quote array + pagination
   - [ ] Extract key fields: id, title, jobId, status, total, dates

3. **Update list-customers**
   - [ ] Return `structuredContent` with customer array + pagination
   - [ ] Extract key fields: id, name, email, phone, address

4. **Update list-time-entries**
   - [ ] Return `structuredContent` with time entry array + pagination
   - [ ] Extract key fields: id, user, job, date, hours, description

5. **Update all get-* tools**
   - [ ] Consider adding `structuredContent` for consistency
   - [ ] Use shared response builder

**Success Criteria**:
- ✅ All list tools return `structuredContent`
- ✅ Consistent data structure across all tools
- ✅ Pagination info included where applicable

---

### Phase 3: Create UI Templates (Priority Entities) ⏳ NOT STARTED

**Goal**: Build visual components for high-value entities first

#### Priority Order:
1. **Customers** (most important business entity)
2. **Sites** (can include map visualization)
3. **Jobs** (core workflow)
4. **Quotes** (complex data, benefits from visualization)
5. **Users** (team roster)
6. **Time Entries** (timesheet view)

#### Tasks for Each Entity:

**3.1: Customers UI Templates**

- [ ] Create `src/templates/customers/list-customers.html`:
  ```html
  <!DOCTYPE html>
  <html>
    <head>
      <link rel="stylesheet" href="../shared/styles.css">
      <style>
        .customer-grid { display: grid; gap: 1rem; }
        .customer-card { border: 1px solid #ddd; padding: 1rem; border-radius: 8px; }
      </style>
    </head>
    <body>
      <div id="customers" class="customer-grid"></div>
      <script>
        // Render customers from structuredContent.customers
        // Support search/filter
        // Show pagination
      </script>
    </body>
  </html>
  ```

- [ ] Create `src/templates/customers/customer-detail.html`:
  - Single customer card with all details
  - Contact information
  - Associated sites
  - Recent jobs

- [ ] Update `list-customers.ts` tool definition:
  ```typescript
  _meta: {
    'openai/outputTemplate': TEMPLATES.CUSTOMERS.LIST,
    'openai/toolInvocation/invoking': 'Loading customers...',
    'openai/toolInvocation/invoked': 'Showing {count} customers'
  }
  ```

**3.2: Sites UI Templates**

- [ ] Create `src/templates/sites/list-sites.html`:
  - Table view with address columns
  - Optional: Map view with pins (if we add coordinates)
  - Search/filter by location

- [ ] Create `src/templates/sites/site-detail.html`:
  - Site address with formatted display
  - Contact information
  - Associated jobs/customers

- [ ] Update `list-sites.ts` with template metadata

**3.3: Jobs UI Templates**

- [ ] Create `src/templates/jobs/list-jobs.html`:
  - Kanban board view (grouped by status)
  - Or table view with status badges
  - Date-based filtering

- [ ] Create `src/templates/jobs/job-detail.html`:
  - Job overview
  - Customer/site info
  - Timeline
  - Associated quotes/time entries

- [ ] Update `list-jobs.ts` with template metadata

**3.4: Quotes UI Templates**

- [ ] Create `src/templates/quotes/list-quotes.html`:
  - Table with quote number, customer, status, total
  - Status filtering

- [ ] Create `src/templates/quotes/quote-detail.html`:
  - **Most complex template**
  - Quote header (customer, dates)
  - Itemized sections table
  - Line items with quantities, rates, totals
  - Grand total calculation

- [ ] Update `list-quotes.ts` and `get-quote-detail.ts` with template metadata

**3.5: Users UI Templates**

- [ ] Create `src/templates/users/list-users.html`:
  - Team roster grid
  - User type badges
  - Status indicators
  - Charge-out rates

- [ ] Create `src/templates/users/user-detail.html`:
  - User profile
  - Contact info
  - Rates and role
  - Recent time entries

- [ ] Update `list-users.ts` with template metadata

**3.6: Time Entries UI Templates**

- [ ] Create `src/templates/time-entries/list-time-entries.html`:
  - Timesheet table view
  - Grouped by user or job
  - Date range selector
  - Total hours summary

- [ ] Update `list-time-entries.ts` with template metadata

**3.7: Shared Template Assets**

- [ ] Create `src/templates/shared/styles.css`:
  ```css
  /* Modern, clean design system */
  :root {
    --primary-color: #0066cc;
    --success-color: #28a745;
    --warning-color: #ffc107;
    --danger-color: #dc3545;
    --border-radius: 8px;
    --spacing-unit: 8px;
  }

  .card { /* ... */ }
  .table { /* ... */ }
  .badge { /* ... */ }
  .status-active { /* ... */ }
  /* etc */
  ```

- [ ] Create `src/templates/shared/utils.js`:
  ```javascript
  // Format currency
  function formatCurrency(amount) { /* ... */ }

  // Format dates
  function formatDate(isoString) { /* ... */ }

  // Render table from array
  function renderTable(data, columns) { /* ... */ }

  // Pagination component
  function renderPagination(paginationInfo, onPageChange) { /* ... */ }
  ```

---

### Phase 4: Serve Templates as MCP Resources ⏳ NOT STARTED

**Goal**: Make HTML templates accessible to ChatGPT Apps

#### Tasks:

1. **Create template resource server**
   - [ ] Create `src/templates/index.ts`:
     ```typescript
     import { Server } from '@modelcontextprotocol/sdk/server/index.js';
     import { ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
     import fs from 'fs/promises';
     import path from 'path';

     export function registerTemplateResources(server: Server) {
       // List all available templates
       server.setRequestHandler(ListResourcesRequestSchema, async () => {
         return {
           resources: [
             {
               uri: 'ui://customers/list-customers.html',
               name: 'Customer List Template',
               mimeType: 'text/html'
             },
             // ... all templates
           ]
         };
       });

       // Serve template content
       server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
         const uri = request.params.uri;
         if (!uri.startsWith('ui://')) {
           throw new Error('Invalid template URI');
         }

         const filePath = uri.replace('ui://', '');
         const content = await fs.readFile(
           path.join(__dirname, filePath),
           'utf-8'
         );

         return {
           contents: [{
             uri,
             mimeType: 'text/html',
             text: content
           }]
         };
       });
     }
     ```

2. **Update server capabilities**
   - [ ] Update `src/server.ts`:
     ```typescript
     const server = new Server({
       name: 'fergus-mcp',
       version: '1.0.0'
     }, {
       capabilities: {
         tools: {},
         prompts: {},
         resources: {} // Add resources capability
       }
     });

     registerTemplateResources(server);
     ```

3. **Test template serving**
   - [ ] Start HTTP server: `pnpm dev:http`
   - [ ] Test resource listing via MCP protocol
   - [ ] Test template content retrieval

**Success Criteria**:
- ✅ Templates served as MCP resources
- ✅ ChatGPT can discover and load templates
- ✅ Templates render correctly in ChatGPT UI

---

### Phase 5: Testing & Polish ⏳ NOT STARTED

**Goal**: Ensure production-ready quality

#### Tasks:

1. **Manual Testing in ChatGPT**
   - [ ] Connect to updated MCP server
   - [ ] Verify read-only tools show as "READ"
   - [ ] Test each list tool shows visual component
   - [ ] Test detail tools render properly
   - [ ] Verify pagination works
   - [ ] Test search/filter in templates

2. **Error Handling**
   - [ ] Handle missing template files gracefully
   - [ ] Handle empty result sets in templates
   - [ ] Add loading states in templates
   - [ ] Add error states in templates

3. **Performance**
   - [ ] Optimize template size (minify CSS/JS)
   - [ ] Cache templates in memory
   - [ ] Measure response times

4. **Documentation**
   - [ ] Update README with ChatGPT Apps section
   - [ ] Document template customization
   - [ ] Add screenshots/examples
   - [ ] Create CHATGPT_APPS.md guide

**Success Criteria**:
- ✅ All tools work correctly in ChatGPT
- ✅ Templates provide clear, useful UI
- ✅ Performance acceptable (<500ms response times)
- ✅ Documentation complete

---

## Design Decisions & Discussion Points

### 1. Template Hosting Strategy

**Option A: Serve via MCP Resources (Recommended)**
- ✅ Templates bundled with server
- ✅ Version controlled with code
- ✅ Works offline (local testing)
- ✅ No external dependencies
- ❌ Slightly more complex setup

**Option B: External CDN/Static Host**
- ✅ Simpler server code
- ✅ Easy to update templates without redeploying
- ❌ External dependency
- ❌ Need separate deployment pipeline
- ❌ CORS considerations

**Decision**: Use Option A (MCP Resources)

### 2. Template Complexity

**Simple Templates** (Phase 3, MVP):
- Basic HTML tables
- Minimal JavaScript
- Simple CSS styling
- No external libraries

**Rich Templates** (Future):
- Interactive components (sortable tables, filters)
- Charts/graphs (D3.js, Chart.js)
- Maps (Leaflet, Mapbox)
- Real-time updates

**Decision**: Start simple, iterate based on user feedback

### 3. Shared Utility Location

**Option A: `src/tools/shared/`**
- Tool-specific utilities
- Clearer separation

**Option B: `src/shared/` or `src/utils/`**
- Project-wide utilities
- Could be used by other parts of codebase

**Decision**: Use `src/tools/shared/` initially, can refactor later if needed

### 4. Barrel Exports vs Direct Imports

**Barrel Exports** (using `index.ts` in each subdirectory):
```typescript
// src/tools/customers/index.ts
export * from './get-customer.js';
export * from './list-customers.js';

// src/server.ts
import { getCustomerToolDefinition, listCustomersToolDefinition } from './tools/customers/index.js';
```

**Direct Imports**:
```typescript
// src/server.ts
import { getCustomerToolDefinition } from './tools/customers/get-customer.js';
import { listCustomersToolDefinition } from './tools/customers/list-customers.js';
```

**Decision**: Use barrel exports for cleaner imports, but document that they can slow down builds in very large codebases

---

## Migration Strategy

### Backward Compatibility

- All tool names remain unchanged
- All tool interfaces remain unchanged
- `structuredContent` is additive (doesn't break existing clients)
- Templates are optional enhancement

### Rollout Plan

1. **Phase 1-2**: Internal testing via local HTTP server
2. **Phase 3-4**: Deploy to staging, test with team
3. **Phase 5**: Production deployment
4. **Post-launch**: Monitor usage, gather feedback, iterate on templates

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Template rendering issues in ChatGPT | High | Medium | Extensive testing, fallback to text content |
| Performance degradation with templates | Medium | Low | Minify templates, cache in memory, measure performance |
| Breaking changes during refactor | High | Low | Git branching, comprehensive testing |
| Template maintenance overhead | Medium | Medium | Keep templates simple initially, shared utilities |
| MCP resource spec changes | Medium | Low | Monitor MCP SDK updates, use stable features |

---

## Timeline Estimate

- **Phase 1** (Refactor): 1-2 days
- **Phase 2** (Structured Content): 1 day
- **Phase 3** (Templates): 3-4 days (0.5 day per entity × 6 entities)
- **Phase 4** (Resource Server): 0.5 days
- **Phase 5** (Testing): 1 day

**Total**: 6.5-8.5 days (1-2 weeks with buffer)

---

## Questions for Discussion

1. **Priority**: Should we do all phases, or just Phase 1-2 first and see if structured content is enough?

2. **Template Scope**: Should we create templates for all 6 entity types, or focus on top 2-3 most valuable ones (customers, sites, jobs)?

3. **Visual Design**: Do you have existing Fergus branding/design system we should match?

4. **Interactivity**: How interactive should templates be? (e.g., click customer to see details, edit inline, etc.)

5. **Real-time**: Should templates support live updates, or are they static snapshots?

6. **Testing**: Do you want automated tests for template rendering, or is manual testing sufficient?

7. **Git Strategy**: Should this be done in a feature branch, or directly on main?

---

## Next Steps

1. **Discuss this plan** - Get your feedback on structure, priorities, scope
2. **Make decisions** - Answer the questions above
3. **Create feature branch** - `git checkout -b feature/chatgpt-apps-integration`
4. **Start Phase 1** - Begin refactoring tools into subdirectories

---

**Document Version**: 1.0
**Last Updated**: 2025-10-08
**Author**: Claude
**Status**: Awaiting feedback
