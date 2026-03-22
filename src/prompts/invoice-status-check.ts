/**
 * Invoice Status Check Prompt
 * Guides looking up invoices and explaining their statuses.
 */

export const invoiceStatusCheckPromptDefinition = {
  name: 'invoice-status-check',
  description: 'Look up invoices by customer, job, or invoice number and explain their current status',
  arguments: [
    {
      name: 'searchTerm',
      description: 'Customer name, job reference, or invoice number to search for',
      required: true,
    },
  ],
};

export function getInvoiceStatusCheckPrompt(args: { searchTerm: string }) {
  const { searchTerm } = args;

  return {
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Check the invoice status for "${searchTerm}".`,
        },
      },
      {
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text: `I'll look up invoices related to "${searchTerm}" and explain their current status.

## Workflow

### Step 1: Identify the Target
"${searchTerm}" could be a customer name, job reference, or invoice number. I'll search across multiple angles:

**If it looks like a job reference** (e.g., "500", "Job-500"):
- Use \`manage-jobs\` with action \`list\` and \`filterJobNo\` or \`filterSearchText\` to find the job.
- Then use \`manage-invoices\` with action \`list\` and \`jobId\` to get its invoices.

**If it looks like a customer name**:
- Use \`manage-customers\` with action \`list\` and \`filterSearchText: "${searchTerm}"\`.
- Then use \`manage-invoices\` with action \`list\` and \`customerId\` to get their invoices.

**If it looks like an invoice number**:
- Use \`manage-invoices\` with action \`list\` and \`filterInvoiceNumber: "${searchTerm}"\`.

### Step 2: Fetch Invoice Details
For each invoice found, use \`manage-invoices\` with action \`get\` and the \`invoiceId\` for full details.

### Step 3: Explain the Status
Interpret the invoice fields to determine the current status:

| Condition | Status | Meaning |
|-----------|--------|---------|
| \`isDraft = true\` | **Draft** | Being prepared, not yet sent |
| \`isToBeApproved = true\` | **Awaiting Approval** | Needs manager sign-off before sending |
| \`isSent = true\`, not paid | **Sent** | Delivered to customer, awaiting payment |
| \`isQueried = true\` | **Queried** | Customer raised an issue — needs attention |
| \`isDisputed = true\` | **Disputed** | Customer disputes the invoice |
| \`isFinal = true\` | **Final** | Locked, payment expected |
| \`isVoided = true\` | **Voided** | Cancelled |
| Paid amount = total | **Paid** | Fully paid |
| Paid amount > 0 | **Partially Paid** | Some payment received |

### Step 4: Financial Summary
For each invoice, highlight:
- **Amount**: Claim amount (excl. tax) and including tax
- **Due date**: When payment is expected
- **Overdue?**: Compare due date to today
- **Paid amount**: How much has been received
- **Outstanding**: Remaining balance

### Step 5: Cross-reference Job
Fetch the related job using \`manage-jobs\` action \`get\` to provide context:
- Job title and current status
- Customer name
- Whether the job has other outstanding invoices

## Output Format

For each invoice found:
- Invoice number, status, and amount
- Due date and whether overdue
- Related job and customer
- Recommended next action (e.g., "follow up on overdue", "resolve query", "awaiting approval")

**Note**: Invoices are read-only via MCP. Status changes must be made in Fergus directly.

Let me start searching for "${searchTerm}".`,
        },
      },
    ],
  };
}
