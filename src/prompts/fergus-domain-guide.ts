/**
 * Fergus Domain Guide Prompt
 * Foundational prompt that teaches the LLM about Fergus concepts, entities,
 * statuses, relationships, and API quirks.
 */

export const fergusDomainGuidePromptDefinition = {
  name: 'fergus-domain-guide',
  description: 'Learn the Fergus domain model: entities, statuses, job types, financial model, and API quirks',
  arguments: [],
};

export function getFergusDomainGuidePrompt() {
  return {
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: 'Explain the Fergus domain model so I can use the MCP tools effectively.',
        },
      },
      {
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text: `Here is a comprehensive guide to the Fergus domain model and how the MCP tools map to it.

## What is Fergus?

Fergus is a job management platform for trade businesses (plumbers, electricians, builders, etc.). It manages the full lifecycle: enquiry → job → quote → schedule → work → invoice → payment.

## Core Entities & Relationships

\`\`\`
Enquiry → Job → Quote(s)
              → Job Phase(s) (aka Works Orders)
              → Invoice(s)
              → Time Entries
              → Stock On Hand
              → Notes

Customer → Site(s) → Job(s)
Contact (reusable across customers, sites, jobs)
Pricebook → Line Items (used in quotes and stock on hand)
\`\`\`

## Job Types

| Type | Description | Financial Model |
|------|-------------|-----------------|
| **Quote** | Work priced upfront via a formal quote | Customer accepts quote before work begins |
| **Estimate** | Similar to Quote but less formal | Same workflow as Quote |
| **Charge Up** | Time & materials, no upfront quote | Invoiced directly based on actuals |

## Job Statuses

| Status | Meaning |
|--------|---------|
| To Price | New job, awaiting quote/estimate |
| Quote Sent / Estimate Sent | Quote delivered to customer |
| Quote Rejected / Estimate Rejected | Customer declined |
| To Schedule | Quote accepted, needs scheduling |
| To Start | Scheduled but not yet started |
| In Progress | Work underway |
| Labour Complete | Fieldwork done, materials pending |
| To Invoice | Work complete, invoice needed |
| To Be Approved | Invoice awaiting manager approval |
| Invoiced | Invoice sent to customer |
| Invoice Approved | Manager approved |
| Invoice Queried | Customer raised a query |
| Invoice Paid | Payment received |
| Completed | Job finished |
| Inactive | No longer active |

**Active statuses**: To Price, To Schedule, In Progress, To Invoice, Quote Sent, To Start, Invoice Approved, Invoice Queried, Estimate Sent, Labour Complete, Invoiced, To Be Approved.

## Quote Lifecycle

1. **Draft** — Created, editable
2. **Published** — Pricing locked
3. **Sent** — Delivered to customer
4. **Accepted** — Customer approved
5. **Superseded** — Replaced by newer version
6. **Declined** — Customer rejected
7. **Voided** — Cancelled

Only **draft** quotes can be updated. Quotes are versioned — creating a new quote on a job with an existing quote creates a new version.

## Quote Line Item Rules

Each line item must use EITHER:
- \`isLabour: true\` — for labour/time charges
- \`salesAccountId: <number>\` — for materials/other

**Never set both on the same line item.**

## Invoice Statuses

| Status | Meaning |
|--------|---------|
| Draft | Being prepared |
| To Be Approved | Awaiting manager sign-off |
| Sent | Delivered to customer |
| Queried | Customer raised an issue |
| Final | Locked for payment |
| Voided | Cancelled |

Invoices are currently **read-only** via MCP.

## Job Phases (Works Orders)

A job can have multiple phases (e.g., "Phase A: Plumbing", "Phase B: Electrical"). Each phase:
- Has its own status, time entries, and stock on hand
- Gets a suffix appended to the job number (e.g., "FERG-500A", "FERG-500B")
- Tracks labour and materials independently

## Stock On Hand vs Stock Used

- **Stock On Hand**: Materials allocated to a job phase but not yet invoiced. Can be created from a pricebook item or manually. Supports create, update, delete.
- **Stock Used**: Materials that have been invoiced to customers (sent or paid invoices). Read-only.

## Financial Model

Jobs track financials across these dimensions:
- **Quoted**: Total value quoted to customer
- **Costs Incurred**: Actual labour + material costs
- **Chargeable**: Amounts to charge (after discounts)
- **Invoiced**: Amounts billed
- **Paid**: Amounts received
- **Profit**: Gross margin (chargeable minus costs)

Use \`manage-jobs\` action \`get-financial-summary\` for a complete breakdown.

## Customers & Sites

- A **Customer** has a name, main contact, billing contact, and addresses
- A **Site** is a physical location where work happens (a customer can have multiple sites)
- Jobs are linked to both a customer and a site
- **Contacts** are reusable — the same contact model is used across customers, sites, and jobs

## Job ID Resolution

Users refer to jobs in different ways:
- Job number: "500", "Job-500", "FERG-500"
- API ID: A large numeric ID (e.g., 20701539)

The MCP tools automatically resolve user-friendly references to API IDs. Numbers with 6 or fewer digits are treated as job numbers; 7+ digits as API IDs.

## Pricebooks

Pricebooks contain catalogued items with standard pricing. Items can be searched across suppliers. Pricing tiers allow customer-specific pricing overrides.

Use \`manage-pricebooks\` action \`search\` (minimum 3 characters) to find items.

## Key API Quirks

1. **Job title/description mismatch**: The Fergus API sometimes exposes the job title as \`description\` in GET responses. The MCP wrapper compensates for this.
2. **Quote update strictness**: Updates replace the entire \`sections\` array. The wrapper preserves title/description automatically.
3. **Validation errors as 500s**: Fergus sometimes returns HTTP 500 with a structured JSON error body for validation failures.
4. **is_sent is tinyint**: Stored as 0/1, not boolean.
5. **Calendar times are UTC**: You must offset \`filterDateFrom\`/\`filterDateTo\` for the company timezone.
6. **Time entry defaults**: The API defaults to last week if no dates given. The MCP wrapper extends this to 12 months.
7. **User email is separate**: User email is managed on the user record itself, not via \`contactItems\`. The user \`contactType\` enum excludes \`email\` — use phone, mobile, fax, other, website only.
8. **Deletion asymmetry**: Customers have a \`delete\` action (soft delete, irreversible via API). Sites have \`archive\`/\`restore\` (reversible). Be cautious with customer deletion.
9. **Read-only tools**: Invoices, time entries, and notes are read-only via MCP. Invoice creation and status changes must be done in Fergus directly. This is intentional given financial sensitivity.
10. **Calendar event types**: \`eventType\` must be one of: \`JOB_PHASE\` (requires \`jobPhaseId\`), \`QUOTE\` (requires \`jobId\`), \`ESTIMATE\` (requires \`jobId\`), \`OTHER\`. There is no \`JOB\` type — use \`OTHER\` for job-level events.
11. **Enquiry statuses**: Valid values are \`TODO\`, \`CONTACTED\`, \`JOBCREATED\`, \`REJECTED\`.

## Available MCP Tools

| Tool | Purpose | Key Actions |
|------|---------|-------------|
| \`manage-jobs\` | Job CRUD + phases + financials | get, list, create, update, get-financial-summary, list-phases, get-phase, create-phase, update-phase, void-phase, get-phase-financial-summary |
| \`manage-quotes\` | Quote lifecycle | get, get-detail, list, list-all, create, update, get-totals, publish, mark-as-sent, accept, decline, void |
| \`manage-customers\` | Customer CRUD | get, list, create, update, delete |
| \`manage-sites\` | Site CRUD | get, list, create, update, archive, restore |
| \`manage-contacts\` | Contact CRUD | get, list, create, update |
| \`manage-users\` | Team members | get, list, update |
| \`manage-invoices\` | Invoice lookup (read-only) | get, list |
| \`manage-enquiries\` | Enquiry management | get, list, create |
| \`manage-time-entries\` | Time tracking (read-only) | list |
| \`manage-pricebooks\` | Pricebook browsing (read-only) | list, get, list-items, get-item, search |
| \`manage-stock\` | Stock on hand + used | list-used, list-on-hand, list-on-hand-by-phase, create-on-hand, update-on-hand, delete-on-hand |
| \`manage-calendar-events\` | Calendar events | list, get, create, update, delete |
| \`manage-notes\` | Notes (read-only) | list |
| \`manage-pricing-tiers\` | Pricing tiers (read-only) | list, get |
| \`manage-favourites\` | Saved items (read-only) | list, get |
| \`get-company-info\` | Company settings | (no params) |

This guide should give you everything you need to use the Fergus MCP tools effectively. What would you like to do?`,
        },
      },
    ],
  };
}
