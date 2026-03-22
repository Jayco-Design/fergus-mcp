# Fergus Partner API — Improvement Recommendations

*Generated from MCP integration analysis, 18 March 2026*
*These items cannot be resolved in the MCP layer — they require Partner API or Core changes.*

---

## Priority 1: Breaks Workflows

### 1. Draft jobs are invisible to GET and list endpoints

**Location:** `fergus-Partner-api/src/routes/jobs/data.access.ts` line 309
**Issue:** The job DAO query includes `.where("job.is_draft", "=", false)`, which means:
- `GET /api/partner/jobs/:jobId` returns 404 for draft jobs
- `GET /api/partner/jobs` (list) never returns drafts
- No `filterIsDraft` or `filterJobStatus: "Draft"` option exists

This means any API consumer that creates a draft job (the default via `POST /api/partner/jobs` with `isDraft: true`) cannot retrieve, update, or finalize it — the job is effectively orphaned.

**Recommended fix:**
- Remove the `is_draft = false` filter from the GET/list queries
- Add a `filterIsDraft` boolean query parameter (default: `false` for backwards compatibility)
- Alternatively, add `"Draft"` to the `filterJobStatus` enum

**Impact:** High — breaks the core draft-to-finalized job workflow for all API consumers.

---

### 2. No JOB-level calendar event type

**Location:** `fergus-Partner-api/src/routes/calendarEvents/schema.ts` line 30-35
**Issue:** `CalendarEventTypesEnum` supports `JOB_PHASE`, `QUOTE`, `ESTIMATE`, `OTHER` — but not `JOB`. There is no way to link a calendar event to a job that doesn't yet have phases.

The most common reactive workflow ("blocked sink tomorrow" — create job, schedule it) requires either using `OTHER` (losing job linkage) or creating a phase first (unnecessary complexity).

**Recommended fix:** Add `JOB` to `CalendarEventTypesEnum` with an associated `jobId` field requirement, similar to how `JOB_PHASE` requires `jobPhaseId`.

**Impact:** Medium-high — forces workaround for the most natural scheduling workflow.

---

## Priority 2: Friction and Inconsistency

### 3. Inconsistent address schemas between entities

**Location:**
- Users: `fergus-Partner-api/src/routes/users/schema.ts` — `address1, addressSuburb, addressCity, addressRegion, addressPostcode, addressCountry`
- Sites/Customers: Use `address1, city, state, postalCode, country` (via Core proxy response mapping)

**Issue:** Same concept, different field names. `addressSuburb` vs no suburb. `addressRegion` vs `state`. `addressPostcode` vs `postalCode`. API consumers cannot reuse address objects across entities.

**Recommended fix:** Standardise to a single address schema. The sites/customers format (`city`, `state`, `postalCode`, `country`) is cleaner. Map user addresses to match.

**Impact:** Medium — forces field mapping when composing cross-entity workflows.

---

### 4. User contactItems intentionally excludes email

**Location:** `fergus-Partner-api/src/routes/users/schema.ts` lines 171-173
**Issue:** The schema explicitly filters `ContactItemTypes.EMAIL` from the user contactType enum. There's a test confirming this is intentional. But it's inconsistent with contacts and customers which support `email`.

**Recommendation:** If email is managed separately on the user record, document this clearly in the API docs. Consider adding a top-level `email` field to the user response/update schema for discoverability.

**Impact:** Low — documented in MCP prompts as a workaround.

---

### 5. Inconsistent deletion patterns

**Location:**
- Customers: `DELETE /api/partner/customers/:customerId` — proxies to Core's `delete_customer` (soft delete via `is_dummy` flag, irreversible via API)
- Sites: `POST /api/partner/sites/:siteId/archive` + `POST /api/partner/sites/:siteId/restore` — reversible

**Issue:** Closely related entities have different deletion strategies. Customer delete is irreversible via API while site deletion is recoverable.

**Recommendation:** Align strategies — ideally both support archive/restore. If customer delete must remain, consider adding a `restore` endpoint.

**Impact:** Medium — customer deletion is a potentially dangerous irreversible action.

---

### 6. Stock Used has no job/phase filter

**Location:** `fergus-Partner-api/src/routes/stockUsed/schema.ts`
**Issue:** The `GET /api/partner/stockUsed` endpoint only supports `filterDateFrom` and `pageCursor`. There is no way to filter by job or phase. The underlying SQL query joins across all invoiced line items for the company.

**Recommended fix:** Add `filterJobId` and/or `filterJobPhaseId` query parameters to enable job-level material cost analysis.

**Impact:** Medium — limits job cost reconciliation and material tracking workflows.

---

## Priority 3: Feature Requests

### 7. Notes: Add create endpoint

**Current state:** `GET /api/partner/notes` only (list)
**Request:** Add `POST /api/partner/notes` supporting note creation on all entity types (JOB, CUSTOMER, CUSTOMER_INVOICE, QUOTE, SITE, TASK, ENQUIRY, JOB_PHASE).

**Use case:** AI agents need to record decisions, log conversation summaries, and add context back to jobs. Currently they can observe but not contribute.

**Impact:** Medium — significant for "AI as office admin" use cases.

---

### 8. Time entries: Add create endpoint

**Current state:** `GET /api/partner/timeEntries` only (list)
**Request:** Add `POST /api/partner/timeEntries` with validation for:
- Preventing double-entry
- Respecting lock status (locked entries cannot be modified)
- Required fields: jobPhaseId, userId, date, duration

**Use case:** AI-assisted time logging, bulk time entry from mobile workers.

**Impact:** Medium — lower if time entry is expected to remain mobile-app-only.

---

### 9. Contacts: Add delete endpoint

**Current state:** GET, POST, PUT only
**Request:** Add `DELETE /api/partner/contacts/:contactId` (or archive/restore pattern).

**Use case:** Cleanup of orphaned contacts. Low urgency but improves data hygiene.

**Impact:** Low.

---

### 10. Invoices: Consider create and send endpoints

**Current state:** GET list and GET by ID only
**Request:** Consider adding:
- `POST /api/partner/customerInvoices` — create invoice
- `POST /api/partner/customerInvoices/:id/send` — send to customer

**Use case:** End-to-end job lifecycle automation (job → quote → work → invoice → payment).

**Note:** Invoice creation is high-stakes. If added, include appropriate safeguards (draft-first workflow, confirmation flags). This may be an intentional design boundary.

**Impact:** Low-medium.

---

## Already Fixed in MCP Layer

The following items from the original review have been resolved in the MCP server (`fergus-mcp`) without requiring Partner API changes:

| # | Fix | What was done |
|---|-----|---------------|
| 2 | Inconsistent ID types | Standardised all entity ID params to `type: 'string'` |
| 3 | Calendar eventType undocumented | Added enum `['JOB_PHASE', 'QUOTE', 'ESTIMATE', 'OTHER']` with conditional field docs |
| 6 | Inconsistent pageSize defaults | Standardised to 50 across all tools |
| 7 | User email exclusion | Documented in domain guide prompt |
| 8 | Enquiry filterStatus unvalidated | Added enum `['TODO', 'CONTACTED', 'JOBCREATED', 'REJECTED']` |
| 9 | sortField free strings | Added enums matching Partner API validation for all tools |
| 10 | Deletion asymmetry | Documented in domain guide prompt |
| 13 | Invoices read-only | Documented as intentional in domain guide prompt |

---

## Acceptable As-Is

| # | Item | Rationale |
|---|------|-----------|
| 16 | MCP compensates for read/write model mismatches | Pragmatic workaround, no consumer impact |
| 17 | Favourites and pricing tiers read-only | Reference data — read-only access is appropriate |
| 18 | `get-company-info` naming inconsistency | Cosmetic, zero functional impact |
