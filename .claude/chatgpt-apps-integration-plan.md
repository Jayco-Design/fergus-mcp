# ChatGPT Apps Integration Plan

## Overview

This plan outlines the refactoring and enhancement of the Fergus MCP server to provide a rich, structured experience for ChatGPT Apps with visual UI components.

**Created**: 2025-10-08
**Last Updated**: 2025-10-09
**Status**: ✅ Phase 1 Complete - Code Refactoring Done

---

## Current State

### Functionality
- ✅ 20 tools functional via stdio and HTTP transports (10 read, 10 action)
- ✅ Unauthenticated tool discovery enabled for ChatGPT
- ✅ Read-only annotations (`readOnlyHint: true`) added to read-only tools
- ✅ Structured content implemented for:
  - `list-users` (users array + pagination)
  - `list-sites` (sites array + pagination)
  - `list-customers` (customers array + pagination)
  - `get-customer` (customer detail object)
- ✅ ChatGPT App templates created for customers:
  - `templates/customers/list-customers.html` (grid/card view)
  - `templates/customers/customer-detail.html` (detail card)
  - `templates/shared/styles.css` (design system)
- ✅ MCP resource server serving templates via `ui://` protocol
- ✅ Build process copies templates to `dist/` folder
- ✅ Client detection working (`isChatGPT()` checks for `openai/userAgent`)
- ✅ Template rendering issues fixed

### Code Organization Issues (To Be Addressed in Phase 1)
- ⚠️ **Significant schema duplication** (~240+ lines):
  - `addressSchema` duplicated in: `create-customer.ts`, `update-customer.ts`, `create-site.ts`, `update-site.ts`
  - `contactSchema` duplicated in: `create-customer.ts`, `update-customer.ts`, `create-site.ts`, `update-site.ts`
  - Each schema: ~60 lines × 4 files = 240 lines of duplication
- ⚠️ **Customer tools split across 4 files** in `src/tools/customers/` subdirectory
- ⚠️ **Using barrel exports** (`customers/index.ts`) - poor practice for build performance
- ⚠️ **19 other tools** still in flat `src/tools/` directory structure

---

## Goals

1. **Organize tools by entity type** - Group related tools into subdirectories
2. **Add UI templates** - Create visual components for ChatGPT Apps
3. **Standardize structured responses** - All list tools return `structuredContent`
4. **Improve maintainability** - Smaller, focused files with shared utilities
5. **Enable rich UX** - Interactive tables, cards, and widgets in ChatGPT

---

## Proposed Structure

**Key Architecture Decisions:**
1. **One file per entity** - All operations for an entity (get, list, create, update) in a single file
2. **Shared schemas** - Common schemas (address, contact, etc.) extracted to `schemas.ts`
3. **No barrel exports** - Direct imports from entity files (better tree-shaking, clearer dependencies)

```
fergus-mcp/
├── src/
│   ├── tools/
│   │   ├── schemas.ts                  # Shared JSON schemas (address, contact, etc.)
│   │   ├── customers.ts                # All customer tools (get, list, create, update)
│   │   ├── sites.ts                    # All site tools (get, list, create, update)
│   │   ├── jobs.ts                     # All job tools (get, list, create, update, finalize)
│   │   ├── quotes.ts                   # All quote tools (get, get-detail, list, create, update, update-version)
│   │   ├── users.ts                    # All user tools (get, list, update)
│   │   └── time-entries.ts             # All time entry tools (get, list)
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

### Example: `src/tools/schemas.ts`

```typescript
/**
 * Shared JSON schemas used across multiple tools
 * Eliminates duplication and ensures consistency
 */

export const addressSchema = {
  type: 'object',
  description: 'Physical or postal address',
  properties: {
    address1: { type: 'string', description: 'Address line 1' },
    address2: { type: 'string', description: 'Address line 2' },
    city: { type: 'string', description: 'City' },
    state: { type: 'string', description: 'State/province' },
    postalCode: { type: 'string', description: 'Postal/ZIP code' },
    country: { type: 'string', description: 'Country' },
  },
};

export const contactSchema = {
  type: 'object',
  description: 'Contact person information',
  properties: {
    firstName: { type: 'string', description: 'First name of the contact' },
    lastName: { type: 'string', description: 'Last name of the contact' },
    position: { type: 'string', description: 'Position/title of the contact' },
    company: { type: 'string', description: 'Company name' },
    contactItems: {
      type: 'array',
      description: 'Contact methods (email, phone, mobile, etc.)',
      items: {
        type: 'object',
        properties: {
          contactType: {
            type: 'string',
            enum: ['email', 'phone', 'mobile', 'other', 'fax', 'website'],
            description: 'Type of contact',
          },
          contactValue: {
            type: 'string',
            description: 'Contact value (email address, phone number, etc.)',
          },
        },
        required: ['contactType', 'contactValue'],
      },
    },
  },
};
```

### Example: `src/tools/customers.ts`

```typescript
import { FergusClient } from '../fergus-client.js';
import { formatResponse, isChatGPT } from '../utils/format-response.js';
import { addressSchema, contactSchema } from './schemas.js';

// ===== GET CUSTOMER =====
export const getCustomerToolDefinition = {
  name: 'get-customer',
  description: 'Get details of a specific customer by ID',
  // ... definition
};

export async function handleGetCustomer(...) { ... }

// ===== LIST CUSTOMERS =====
export const listCustomersToolDefinition = {
  name: 'list-customers',
  description: 'List customers with optional search',
  inputSchema: {
    properties: {
      // ... pagination, search params
    }
  },
  // ... definition
};

export async function handleListCustomers(...) { ... }

// ===== CREATE CUSTOMER =====
export const createCustomerToolDefinition = {
  name: 'create-customer',
  description: 'Create a new customer',
  inputSchema: {
    properties: {
      customerFullName: { type: 'string' },
      mainContact: contactSchema,        // ← Reused!
      physicalAddress: addressSchema,    // ← Reused!
      postalAddress: addressSchema,      // ← Reused!
    },
    required: ['customerFullName', 'mainContact'],
  },
};

export async function handleCreateCustomer(...) { ... }

// ===== UPDATE CUSTOMER =====
export const updateCustomerToolDefinition = {
  name: 'update-customer',
  description: 'Update an existing customer',
  inputSchema: {
    properties: {
      customerId: { type: 'number' },
      customerFullName: { type: 'string' },
      mainContact: contactSchema,        // ← Reused!
      physicalAddress: addressSchema,    // ← Reused!
      postalAddress: addressSchema,      // ← Reused!
    },
    required: ['customerId', 'customerFullName', 'mainContact'],
  },
};

export async function handleUpdateCustomer(...) { ... }
```

### Example: `src/server.ts`

```typescript
// Direct imports (no barrel exports)
import {
  getCustomerToolDefinition,
  listCustomersToolDefinition,
  createCustomerToolDefinition,
  updateCustomerToolDefinition,
  handleGetCustomer,
  handleListCustomers,
  handleCreateCustomer,
  handleUpdateCustomer,
} from './tools/customers.js';

import {
  getSiteToolDefinition,
  listSitesToolDefinition,
  createSiteToolDefinition,
  updateSiteToolDefinition,
  handleGetSite,
  handleListSites,
  handleCreateSite,
  handleUpdateSite,
} from './tools/sites.js';

// ... other imports

const tools = [
  getCustomerToolDefinition,
  listCustomersToolDefinition,
  createCustomerToolDefinition,
  updateCustomerToolDefinition,
  getSiteToolDefinition,
  listSitesToolDefinition,
  // ...
];
```

---

## Implementation Phases

### Phase 1: Refactor Tool Structure ✅ COMPLETED

**Goal**: Consolidate entity operations into single files and extract shared schemas

#### Tasks:

1. **Create shared schemas**
   - [x] ✅ Create `src/tools/schemas.ts`
   - [x] ✅ Extract `addressSchema` (used in customers, sites)
   - [x] ✅ Extract `contactSchema` (used in customers, sites)
   - [x] ✅ Extract `contactItemSchema` (used in contact arrays)

2. **Consolidate customer tools**
   - [x] ✅ Create `src/tools/customers.ts`
   - [x] ✅ Migrate `get-customer.ts` → `customers.ts`
   - [x] ✅ Migrate `list-customers.ts` → `customers.ts`
   - [x] ✅ Migrate `create-customer.ts` → `customers.ts`
   - [x] ✅ Migrate `update-customer.ts` → `customers.ts`
   - [x] ✅ Replace duplicated schemas with imports from `schemas.ts`
   - [x] ✅ Delete `src/tools/customers/` directory
   - [x] ✅ Update imports in `src/server.ts` to use direct imports (no barrel exports)

3. **Consolidate site tools**
   - [x] ✅ Create `src/tools/sites.ts`
   - [x] ✅ Migrate `get-site.ts` → `sites.ts`
   - [x] ✅ Migrate `list-sites.ts` → `sites.ts`
   - [x] ✅ Migrate `create-site.ts` → `sites.ts`
   - [x] ✅ Migrate `update-site.ts` → `sites.ts`
   - [x] ✅ Replace duplicated schemas with imports from `schemas.ts`
   - [x] ✅ Update imports in `src/server.ts`

4. **Consolidate job tools**
   - [x] ✅ Create `src/tools/jobs.ts`
   - [x] ✅ Migrate `get-job.ts` → `jobs.ts`
   - [x] ✅ Migrate `list-jobs.ts` → `jobs.ts`
   - [x] ✅ Migrate `create-job.ts` → `jobs.ts`
   - [x] ✅ Migrate `update-job.ts` → `jobs.ts`
   - [x] ✅ Migrate `finalize-job.ts` → `jobs.ts`
   - [x] ✅ Update imports in `src/server.ts`

5. **Consolidate quote tools**
   - [x] ✅ Create `src/tools/quotes.ts`
   - [x] ✅ Migrate `get-quote.ts` → `quotes.ts`
   - [x] ✅ Migrate `get-quote-detail.ts` → `quotes.ts`
   - [x] ✅ Migrate `list-quotes.ts` → `quotes.ts`
   - [x] ✅ Migrate `create-quote.ts` → `quotes.ts`
   - [x] ✅ Migrate `update-quote.ts` → `quotes.ts`
   - [x] ✅ Migrate `update-quote-version.ts` → `quotes.ts`
   - [x] ✅ Update imports in `src/server.ts`

6. **Consolidate user tools**
   - [x] ✅ Create `src/tools/users.ts`
   - [x] ✅ Migrate `get-user.ts` → `users.ts`
   - [x] ✅ Migrate `list-users.ts` → `users.ts`
   - [x] ✅ Migrate `update-user.ts` → `users.ts`
   - [x] ✅ Update imports in `src/server.ts`

7. **Consolidate time entry tools**
   - [x] ✅ Create `src/tools/time-entries.ts`
   - [x] ✅ Migrate `get-time-entry.ts` → `time-entries.ts`
   - [x] ✅ Migrate `list-time-entries.ts` → `time-entries.ts`
   - [x] ✅ Update imports in `src/server.ts`

8. **Test refactored structure**
   - [x] ✅ Build successfully: `pnpm build`
   - [x] ✅ All 20 tools still functional
   - [x] ✅ Verify reduced code duplication (eliminated ~240+ lines)

**Success Criteria**:
- ✅ All tools consolidated into entity files (customers.ts, sites.ts, etc.)
- ✅ Shared schemas extracted to `schemas.ts`
- ✅ No barrel exports (direct imports only)
- ✅ All imports working, builds successfully
- ✅ No functionality broken
- ✅ Reduced schema duplication by ~240+ lines

**Results**:
- **Files reduced**: 23 files → 7 files (6 entity files + 1 schema file)
- **Code eliminated**: ~240+ lines of schema duplication removed
- **Build**: ✅ Successful
- **Functionality**: ✅ All 20 tools working correctly

---

### Phase 2: Add Structured Content to All List Tools ✅ COMPLETED (Customers, Users, Sites)

**Goal**: Standardize structured responses across all list endpoints

#### Tasks:

1. **Update list-jobs**
   - [ ] Return `structuredContent` with job array + pagination
   - [ ] Extract key fields: id, title, status, customer, site, dates

2. **Update list-quotes**
   - [ ] Return `structuredContent` with quote array + pagination
   - [ ] Extract key fields: id, title, jobId, status, total, dates

3. **Update list-customers**
   - [x] ✅ Return `structuredContent` with customer array + pagination
   - [x] ✅ Extract key fields: id, name, email, phone, address

4. **Update list-time-entries**
   - [ ] Return `structuredContent` with time entry array + pagination
   - [ ] Extract key fields: id, user, job, date, hours, description

5. **Update all get-* tools**
   - [x] ✅ `get-customer` returns `structuredContent` with customer object
   - [x] ✅ `list-users` returns `structuredContent` (already implemented)
   - [x] ✅ `list-sites` returns `structuredContent` (already implemented)
   - [ ] Other get-* tools pending

**Success Criteria**:
- ✅ Customers, users, sites return `structuredContent`
- ✅ Consistent data structure for implemented entities
- ✅ Pagination info included for list tools

---

### Phase 3: Create UI Templates (Priority Entities) ✅ COMPLETED (Customers)

**Goal**: Build visual components for high-value entities first

#### Priority Order:
1. ✅ **Customers** (most important business entity) - COMPLETED
2. **Sites** (can include map visualization)
3. **Jobs** (core workflow)
4. **Quotes** (complex data, benefits from visualization)
5. **Users** (team roster)
6. **Time Entries** (timesheet view)

#### Tasks for Each Entity:

**3.1: Customers UI Templates** ✅ COMPLETED

- [x] ✅ Create `src/templates/customers/list-customers.html`:
  - Table view with customer name, contact, location columns
  - Reads from `window.structuredContent.customers`
  - Pagination info display
  - Empty state handling

- [x] ✅ Create `src/templates/customers/customer-detail.html`:
  - Single customer card with all details
  - Contact information (name, email, phone)
  - Physical and postal addresses
  - Formatted address display

- [x] ✅ Update `list-customers.ts` tool definition:
  ```typescript
  _meta: {
    'openai/outputTemplate': 'ui://customers/list-customers.html',
    'openai/toolInvocation/invoking': 'Loading customers...',
    'openai/toolInvocation/invoked': 'Showing customers'
  }
  ```

- [x] ✅ Update `get-customer.ts` tool definition with template metadata

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

**3.7: Shared Template Assets** ✅ COMPLETED

- [x] ✅ Create `src/templates/shared/styles.css`:
  - CSS variables for colors (primary, success, warning, danger)
  - Card component styles
  - Table styles with hover states
  - Badge styles (success, warning, danger, info)
  - Button styles
  - Text and spacing utilities
  - Empty state styling
  - Pagination components

- [ ] Create `src/templates/shared/utils.js` (deferred - not needed yet):
  - Currently using inline JavaScript in templates
  - Can extract shared utilities when more templates added

---

### Phase 4: Serve Templates as MCP Resources ✅ COMPLETED

**Goal**: Make HTML templates accessible to ChatGPT Apps

#### Tasks:

1. **Create template resource server**
   - [x] ✅ Create `src/templates/index.ts`:
     - `ListResourcesRequestSchema` handler lists all templates
     - `ReadResourceRequestSchema` handler serves template files from disk
     - Template registry with customers templates (list + detail)
     - Shared styles.css registered as resource
     - Proper error handling for missing templates

2. **Update server capabilities**
   - [x] ✅ Update `src/server.ts`:
     - Added `resources: {}` to server capabilities
     - Imported and called `registerTemplateResources(server)` (UNCOMMENTED - was causing "Method not found" errors)
     - Resources integrated alongside tools and prompts

3. **Update build process**
   - [x] ✅ Fixed template copying in `package.json`:
     - Added `copy-templates` script: `cp -r src/templates/customers src/templates/shared dist/templates/`
     - Updated build command to: `tsc && pnpm run copy-templates`
     - Templates now available at runtime in `dist/templates/`

4. **Test template serving**
   - [x] ✅ HTTP server running on Render
   - [x] ✅ Resource listing working
   - [x] ✅ Template content retrieval working
   - [x] ✅ Templates serving from `dist/templates/` after build
   - [x] ✅ ChatGPT successfully loading and rendering templates

5. **Fix template rendering issues**
   - [x] ✅ Fixed initial render condition (check `window.openai?.toolOutput` not just `window.openai`)
   - [x] ✅ Improved client detection (`isChatGPT()` checks for `openai/userAgent` presence)
   - [x] ✅ Templates now render on initial load when data is available

**Success Criteria**:
- ✅ Templates served as MCP resources
- ✅ ChatGPT can discover and load templates
- ✅ Templates available at `ui://` URIs
- ✅ Build process copies static files correctly
- ✅ Templates render correctly with customer data

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

## Implementation Notes & Key Learnings

### Critical Discoveries

1. **StructuredContent is Flattened** ⚠️
   - ❌ **Wrong**: `window.openai.toolOutput.structuredContent.customers`
   - ✅ **Correct**: `window.openai.toolOutput.customers`
   - ChatGPT takes properties from `structuredContent` and places them directly on `toolOutput`
   ```typescript
   // What we return:
   return {
     content: [...],
     structuredContent: {
       customers: [...],
       pagination: {...}
     }
   };

   // What ChatGPT provides to template:
   window.openai.toolOutput = {
     customers: [...],      // <- flattened!
     pagination: {...}      // <- flattened!
   };
   ```

2. **Event-Based Rendering Required**
   - Templates must listen for `openai:set_globals` event
   - Data may not be available when template first loads
   - Access from event: `event.detail.globals.toolOutput`
   - Fallback check: `window.openai.toolOutput` (for immediate availability)

3. **Minimal Text Content**
   - When using `outputTemplate`, keep `content` text minimal
   - ChatGPT shows BOTH the widget AND the text content
   - Return summary only, not full JSON dump
   - Example: "Found 5 customers" instead of "Found 5 customers\n\n[...JSON...]"

4. **Template Metadata Location**
   - ❌ **Wrong**: Template URIs in `annotations` field
   - ✅ **Correct**: Template URIs must be in `_meta` field
   ```typescript
   // Correct structure for ChatGPT Apps
   export const toolDefinition = {
     name: 'list-customers',
     annotations: {
       readOnlyHint: true  // MCP-level metadata
     },
     _meta: {
       'openai/outputTemplate': 'ui://customers/list-customers.html',
       'openai/toolInvocation/invoking': 'Loading customers...',
       'openai/toolInvocation/invoked': 'Showing customers'
     }
   };
   ```

2. **Read-Only Tool Annotations**
   - ❌ **Wrong**: `annotations.openapi.readOnly = true`
   - ✅ **Correct**: `annotations.readOnlyHint = true`
   - Applied to all 13 read-only tools (list/get operations)

3. **Unauthenticated Tool Discovery**
   - ChatGPT needs to see available tools before user authenticates
   - Solution: Allow `initialize` requests without OAuth tokens
   - Tool execution still requires valid authentication
   ```typescript
   // In http.ts POST /mcp endpoint
   const fergusClient = (oauthSessionId && tokenManager.hasTokens(oauthSessionId))
     ? new FergusClient({ tokenProvider: async () => token })
     : new FergusClient({ tokenProvider: async () => null }); // Unauthenticated discovery
   ```

4. **Build Process for Static Assets**
   - TypeScript compiler (`tsc`) only outputs `.js` files
   - HTML/CSS templates must be manually copied to `dist/`
   - Solution: Post-compilation copy script
   ```json
   {
     "scripts": {
       "build": "tsc && pnpm run copy-templates",
       "copy-templates": "cp -r src/templates/customers src/templates/shared dist/templates/"
     }
   }
   ```

5. **Structured Content Pattern**
   - Tools return both `content` (text) and `structuredContent` (data)
   - `content`: Human-readable text (keep minimal when using templates!)
   - `structuredContent`: Clean data structure for ChatGPT rendering
   - **CRITICAL**: ChatGPT **flattens** `structuredContent` onto `toolOutput`
   - Templates access data via: `window.openai.toolOutput.customers` (NOT `window.openai.toolOutput.structuredContent.customers`)
   - Event access: `event.detail.globals.toolOutput.customers`

### Architecture Decisions Made

1. **One File Per Entity**: All operations for an entity in a single file (e.g., `customers.ts` contains get, list, create, update)
   - **Rationale**: Eliminates schema duplication (100+ lines saved), keeps related code together, reasonable file sizes (~400-500 lines)

2. **Shared Schemas File**: Common schemas (address, contact) extracted to `src/tools/schemas.ts`
   - **Rationale**: Address schema alone was duplicated 4+ times across customers/sites/jobs (60 lines × 4 = 240 lines saved)

3. **No Barrel Exports**: Direct imports from entity files
   - **Rationale**: Better tree-shaking, faster builds, clearer dependencies, avoids circular dependency risks

4. **Inline JavaScript in Templates**: Templates have embedded scripts, not extracted to separate files yet
   - **Rationale**: Simplicity for Phase 1-5, can extract to React components in Phase 6

5. **MCP Resources**: Using MCP protocol to serve templates (not external CDN)
   - **Rationale**: Templates bundled with server, version controlled, works offline, no external dependencies

---

## Phase 6: Modern Build System & Component Architecture 🎯 FUTURE

**Goal**: Migrate from inline HTML/CSS/JS templates to a modern bundled component architecture like OpenAI's Apps SDK examples

**Reference**: https://github.com/nzben/openai-apps-sdk-examples (OpenAI's official examples)

### Current Architecture (Phase 1-5)
- ✅ Simple inline HTML templates with embedded CSS and JS
- ✅ Templates served as static HTML files via MCP resources
- ✅ Manual CSS inlining from `shared/styles.css`
- ✅ No build step for templates (just copy to dist)
- ⚠️ Limited interactivity (vanilla JS only)
- ⚠️ No React or modern framework support
- ⚠️ CSS duplication across templates

### OpenAI's Architecture (Vite + React + Bundling)

**Key Components**:

1. **Vite Build System**
   - Multi-entry point configuration (`vite.config.mts`)
   - Custom build orchestrator (`build-all.mts`)
   - Automatic entry discovery via `src/**/index.{tsx,jsx}` glob
   - Separate dev server (port 4444) for component development
   - Production builds with hashing and versioning

2. **Bundling Strategy**
   - Each widget is a separate entry point (e.g., `src/pizzaz/index.jsx`)
   - Build outputs self-contained HTML files with inlined CSS and JS
   - Versioned/hashed filenames (e.g., `pizzaz-a3f2.html`)
   - CSS collected from global + per-entry sources
   - All assets bundled into single HTML file per widget

3. **React + TypeScript**
   - React for interactive components
   - TypeScript/JSX for type safety
   - Shared hooks: `useOpenAiGlobal`, `useMaxHeight`, `useDisplayMode`, `useWidgetState`
   - Routing via `react-router-dom` for complex widgets
   - External libraries: Mapbox GL, Framer Motion, Lucide icons

4. **Component Structure**
   ```
   src/
   ├── pizzaz/              # Widget entry point
   │   ├── index.jsx       # Main component
   │   ├── Inspector.jsx   # Sub-component
   │   ├── Sidebar.jsx     # Sub-component
   │   ├── map.css         # Widget-specific CSS
   │   └── markers.json    # Data
   ├── use-openai-global.ts  # Shared hook
   ├── use-max-height.ts     # Shared hook
   └── index.css            # Global CSS (Tailwind)
   ```

5. **Build Output**
   ```
   assets/
   ├── pizzaz-a3f2.html    # Self-contained widget
   ├── pizzaz-a3f2.js      # (intermediate, inlined)
   ├── pizzaz-a3f2.css     # (intermediate, inlined)
   └── todo-b5e8.html      # Another widget
   ```

6. **MCP Server Integration**
   - Server references versioned HTML files: `ui://pizzaz-a3f2.html`
   - MCP resources endpoint serves built HTML from `assets/`
   - No separate CSS/JS files served (all inlined in HTML)
   - Build hash based on package.json version

### Migration Plan (Future Work)

**Phase 6.1: Setup Build Infrastructure**
- [ ] Install Vite and build dependencies:
  - `vite`, `@vitejs/plugin-react`, `fast-glob`
  - `react`, `react-dom` (if we want React)
  - `@tailwindcss/vite` (optional, for Tailwind)
- [ ] Create `vite.config.mts` based on OpenAI's multi-entry setup
- [ ] Create `build-all.mts` orchestrator script
- [ ] Configure Vite to auto-discover components in `src/templates/*/index.tsx`
- [ ] Update `package.json` scripts:
  - `"dev:templates": "vite --config vite.config.mts"`
  - `"build:templates": "tsx build-all.mts"`
  - `"build": "tsc && pnpm run build:templates"`

**Phase 6.2: Convert Customers Templates to React**
- [ ] Create `src/templates/customers/index.tsx` (React entry point)
- [ ] Convert `list-customers.html` logic to React component
- [ ] Convert `customer-detail.html` to React component
- [ ] Extract shared hooks:
  - `useToolOutput()` - access `window.openai.toolOutput`
  - `useOpenAiGlobal()` - access full `window.openai` object
- [ ] Move CSS to `src/templates/customers/styles.css`
- [ ] Test with Vite dev server (http://localhost:4444/customers.html)

**Phase 6.3: Build and Serve Bundled Templates**
- [ ] Run build: outputs `assets/customers-{hash}.html`
- [ ] Update `src/templates/index.ts` to serve from `assets/` directory
- [ ] Update tool `_meta` to reference hashed filenames:
  ```typescript
  _meta: {
    'openai/outputTemplate': 'ui://customers-a3f2.html'
  }
  ```
- [ ] Implement version detection (use package.json version for hash)
- [ ] Test end-to-end with ChatGPT

**Phase 6.4: Migrate Remaining Templates**
- [ ] Convert Sites templates to React components
- [ ] Convert Jobs templates to React components
- [ ] Convert Quotes templates to React components
- [ ] Convert Users templates to React components
- [ ] Extract shared components to `src/templates/shared/`

**Phase 6.5: Add Advanced Features**
- [ ] Add routing for detail views (react-router-dom)
- [ ] Add interactive filters and search
- [ ] Add animations (framer-motion)
- [ ] Add charts/graphs for analytics views
- [ ] Add map visualization for sites (Mapbox GL)
- [ ] Implement widget state persistence (`useWidgetState`)

### Benefits of Migration

**Developer Experience**:
- ✅ Modern React development with hot reload
- ✅ TypeScript type safety
- ✅ Component reusability
- ✅ Better code organization
- ✅ NPM ecosystem access (charts, maps, animations)

**User Experience**:
- ✅ Richer interactivity
- ✅ Better performance (optimized bundles)
- ✅ Smoother animations
- ✅ More sophisticated UI components

**Maintenance**:
- ✅ Smaller bundle sizes (tree shaking)
- ✅ Versioned assets (cache busting)
- ✅ Shared utilities across widgets
- ✅ Easier to add new widgets

### Trade-offs

**Complexity**:
- ❌ More complex build pipeline
- ❌ Additional dependencies (React, Vite)
- ❌ Longer build times
- ❌ Requires Node.js build step

**Bundle Size**:
- ❌ Larger initial downloads (React runtime)
- ✅ But offset by better code splitting and reuse

### Decision: Defer to Phase 6

**Recommendation**: Keep current simple HTML approach for Phase 1-5, migrate to bundled React components in Phase 6 when:
1. Customer templates are proven and stable
2. We have 3+ entity types using templates
3. We need interactive features beyond vanilla JS
4. Team is comfortable with React/Vite tooling

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

### 3. File Organization: One File Per Entity vs Multiple Files

**Option A: One File Per Entity** (Recommended):
```typescript
// src/tools/customers.ts (400-500 lines)
export const getCustomerToolDefinition = { ... };
export async function handleGetCustomer(...) { ... }

export const listCustomersToolDefinition = { ... };
export async function handleListCustomers(...) { ... }

export const createCustomerToolDefinition = {
  inputSchema: {
    properties: {
      mainContact: contactSchema,     // Reused from schemas.ts
      physicalAddress: addressSchema, // Reused from schemas.ts
    }
  }
};
export async function handleCreateCustomer(...) { ... }
```

**Pros:**
- ✅ Eliminates 100+ lines of schema duplication
- ✅ Related code stays together
- ✅ Single place to update entity-related schemas
- ✅ File sizes remain manageable (~400-500 lines)

**Option B: Separate Files Per Operation**:
```typescript
// src/tools/customers/get-customer.ts
// src/tools/customers/list-customers.ts
// src/tools/customers/create-customer.ts
// src/tools/customers/update-customer.ts
```

**Cons:**
- ❌ Schema duplication (60+ lines per file)
- ❌ More files to navigate
- ❌ Requires either barrel exports (slow builds) or verbose imports

**Decision**: Use Option A (One File Per Entity)

### 4. Import Strategy: Direct Imports vs Barrel Exports

**Direct Imports** (Recommended):
```typescript
// src/server.ts
import {
  getCustomerToolDefinition,
  listCustomersToolDefinition,
  createCustomerToolDefinition,
  updateCustomerToolDefinition,
} from './tools/customers.js';
```

**Pros:**
- ✅ Better tree-shaking (only imports what's used)
- ✅ Faster builds (TypeScript doesn't parse entire dependency trees)
- ✅ No circular dependency risk
- ✅ Clear dependency graph

**Barrel Exports** (Rejected):
```typescript
// src/tools/customers/index.ts
export * from './get-customer.js';
export * from './list-customers.js';

// Problems:
// - Slower builds (parses all files even if only one is used)
// - Can break tree-shaking in some bundlers
// - Obscures actual dependencies
```

**Decision**: Use Direct Imports (no barrel exports)

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
