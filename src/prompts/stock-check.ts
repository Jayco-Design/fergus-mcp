/**
 * Stock Check Prompt
 * Guides checking stock on hand and stock usage across jobs and phases.
 */

export const stockCheckPromptDefinition = {
  name: 'stock-check',
  description: 'Check stock on hand across job phases and review stock usage (invoiced materials)',
  arguments: [
    {
      name: 'jobRef',
      description: 'Job reference or ID to check stock for (optional — omit for company-wide view)',
      required: false,
    },
  ],
};

export function getStockCheckPrompt(args?: { jobRef?: string }) {
  const jobRef = args?.jobRef;
  const scopeText = jobRef ? `for job "${jobRef}"` : 'across all jobs';

  return {
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Check the stock status ${scopeText}.`,
        },
      },
      {
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text: `I'll check the stock status ${scopeText}.

## Two Types of Stock

1. **Stock On Hand (SOH)**: Materials allocated to a job phase but not yet invoiced. These are items that have been purchased or assigned for use on a job.
2. **Stock Used**: Materials that have been invoiced to customers (on sent or paid invoices). This represents consumed/billed stock.

## Workflow

### Step 1: ${jobRef ? 'Find the Job and Its Phases' : 'Get Company-Wide Stock Overview'}
${jobRef
  ? `First, resolve the job reference:
- Use \`manage-jobs\` with action \`list\` and \`filterJobNo\` or \`filterSearchText: "${jobRef}"\` to find the job.
- Then use \`manage-jobs\` with action \`list-phases\` and the \`jobId\` to get all phases.
- Note each \`jobPhaseId\` for the stock queries.`
  : `Get a broad view of stock across the company.`}

### Step 2: Check Stock On Hand
${jobRef
  ? `For each job phase, use \`manage-stock\` with action \`list-on-hand-by-phase\` and the \`jobPhaseId\`.

This returns items with:
- \`itemDescription\`: What the item is
- \`itemQuantity\`: How many units
- \`itemPrice\`: Charge price per unit
- \`itemCost\`: Cost price per unit
- \`itemTotal\`: Total charge value (quantity x price)
- \`itemCostTotal\`: Total cost value`
  : `Use \`manage-stock\` with action \`list-on-hand\` to see all stock on hand across the company.

Use \`filterSearchText\` to search by item description if looking for specific materials.
Use \`sortField: "lastModified"\` and \`sortOrder: "desc"\` to see recently updated items first.`}

### Step 3: Check Stock Used
Use \`manage-stock\` with action \`list-used\` to see materials that have been invoiced.
${jobRef ? `Filter or cross-reference results against the job to see what has been billed.` : ''}

Stock Used shows:
- Product name and code
- Pricebook reference (if from catalogue)
- Total quantity invoiced

### Step 4: Analyse & Report

**Stock On Hand Summary:**
| Item | Qty | Unit Price | Unit Cost | Total Value | Total Cost |
|------|-----|-----------|-----------|-------------|------------|

**Key Metrics:**
- Total SOH value (charge): Sum of all \`itemTotal\`
- Total SOH cost: Sum of all \`itemCostTotal\`
- Margin: (Total value - Total cost) / Total value

**Stock Used Summary:**
- Total materials invoiced
- Breakdown by product

${jobRef ? `**Job Context:**
- Compare SOH value against quoted materials
- Identify materials on hand but not yet invoiced
- Flag any items with zero quantity or zero price` : ''}

## Managing Stock On Hand

To **add** stock to a phase:
- \`manage-stock\` action \`create-on-hand\` with \`jobPhaseId\`
- Either reference a pricebook item (\`priceBookLineItemId\` + \`itemQuantity\`) for catalogue pricing
- Or specify manually: \`itemDescription\`, \`itemPrice\`, \`itemCost\`, \`itemQuantity\`

To **update** an item:
- \`manage-stock\` action \`update-on-hand\` with \`jobPhaseId\` and \`stockOnHandId\`
- Any combination of: \`itemDescription\`, \`itemPrice\`, \`itemCost\`, \`itemQuantity\`, \`salesAccountId\`, \`isLabour\`

To **remove** an item:
- \`manage-stock\` action \`delete-on-hand\` with \`jobPhaseId\` and \`stockOnHandId\`

Let me start checking the stock.`,
        },
      },
    ],
  };
}
