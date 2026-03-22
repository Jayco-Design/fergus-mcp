/**
 * Pricebook Quote Builder Prompt
 * Guides searching pricebooks and building a quote with line items from catalogue.
 */

export const pricebookQuoteBuilderPromptDefinition = {
  name: 'pricebook-quote-builder',
  description: 'Search pricebooks for items and build a quote with catalogue pricing',
  arguments: [
    {
      name: 'jobId',
      description: 'Job ID to create the quote for',
      required: true,
    },
    {
      name: 'searchTerms',
      description: 'Comma-separated list of materials/items to search for (e.g., "copper pipe, solder, flux")',
      required: false,
    },
  ],
};

export function getPricebookQuoteBuilderPrompt(args: { jobId: string; searchTerms?: string }) {
  const { jobId, searchTerms } = args;
  const searchList = searchTerms
    ? searchTerms.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  return {
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `I need to build a quote for job ${jobId}${searchTerms ? ` using these items: ${searchTerms}` : ' from our pricebook'}.`,
        },
      },
      {
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text: `I'll help you build a quote for job ${jobId} using pricebook items for accurate catalogue pricing.

## Workflow

### Step 1: Get Job Context
Use \`manage-jobs\` with action \`get\` and \`jobId: "${jobId}"\` to understand:
- Job title and description (what work is being done)
- Customer (for pricing tier overrides)
- Job type (Quote, Estimate, or Charge Up)

### Step 2: Check Pricing Tiers
Use \`manage-pricing-tiers\` with action \`list\` to see available tiers.
If the customer has a specific pricing tier, pricebook items may have tier-specific pricing overrides.

### Step 3: Search Pricebooks for Items
${searchList.length > 0
  ? `Search for each item:\n${searchList.map(term => `- Use \`manage-pricebooks\` with action \`search\` and \`filterSearchText: "${term}"\` (minimum 3 characters)`).join('\n')}`
  : 'Use `manage-pricebooks` with action `search` and `filterSearchText` to find relevant items. Minimum 3 characters required.'}

You can also:
- Use \`manage-pricebooks\` action \`list\` to browse available pricebooks
- Use \`manage-pricebooks\` action \`list-items\` with a \`pricebookId\` to browse items in a specific pricebook
- Filter by supplier using \`supplierIds\` in the search

Each pricebook item will have: name, productCode, price, cost, and supplier info.

### Step 4: Build Quote Sections
Organize found items into logical sections:

**Materials Section:**
- Line items with \`salesAccountId\` (from the pricebook item)
- Set \`itemPrice\` from catalogue price, \`itemCost\` from catalogue cost
- Adjust \`itemQuantity\` based on job requirements

**Labour Section:**
- Line items with \`isLabour: true\`
- Estimate hours needed for installation/work
- Use the company or customer charge-out rate for pricing

**IMPORTANT**: Each line item must use EITHER \`isLabour: true\` OR \`salesAccountId\`. Never both.

### Step 5: Create the Quote
Use \`manage-quotes\` with action \`create\`:
\`\`\`json
{
  "action": "create",
  "jobId": "${jobId}",
  "title": "Quote title based on job scope",
  "dueDays": 30,
  "sections": [
    {
      "name": "Materials",
      "sortOrder": 1,
      "lineItems": [
        {
          "itemName": "Item from pricebook",
          "itemQuantity": 2,
          "itemPrice": 45.00,
          "itemCost": 30.00,
          "salesAccountId": 1,
          "sortOrder": 1
        }
      ]
    },
    {
      "name": "Labour",
      "sortOrder": 2,
      "lineItems": [
        {
          "itemName": "Installation labour",
          "itemQuantity": 4,
          "itemPrice": 95.00,
          "isLabour": true,
          "sortOrder": 1
        }
      ]
    }
  ]
}
\`\`\`

### Step 6: Verify Totals
Use \`manage-quotes\` with action \`get-totals\` and the new \`quoteId\` to verify the calculated totals match expectations.

## Tips
- Search with broad terms first (e.g., "pipe" not "15mm copper pipe elbow") then narrow down.
- Check \`itemCost\` vs \`itemPrice\` to ensure healthy margins.
- Use \`dueDays: 30\` as standard quote validity unless the customer requires different.
- After creating, the quote is in draft — it can be updated before sending.

Let me start by fetching the job details and searching for items.`,
        },
      },
    ],
  };
}
