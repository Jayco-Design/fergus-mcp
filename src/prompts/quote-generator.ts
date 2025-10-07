/**
 * Quote Generator Prompt
 * Helps create comprehensive quotes with sections and line items
 */

export const quoteGeneratorPromptDefinition = {
  name: 'quote-generator',
  description: 'Create a detailed quote for a job with sections and line items',
  arguments: [
    {
      name: 'jobId',
      description: 'Job ID to create quote for',
      required: true,
    },
  ],
};

export function getQuoteGeneratorPrompt(args: { jobId: string }) {
  const jobId = args.jobId;

  return {
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `I need to create a quote for job ${jobId}. Help me structure it properly.`,
        },
      },
      {
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text: `I'll help you create a professional quote for job ${jobId}. Let me first fetch the job details to understand what we're quoting for.

## Quote Structure in Fergus

A quote consists of:
1. **Basic Information**
   - Title (descriptive name for the quote)
   - Description (optional details)
   - Due Days (validity period: 7-180 days, commonly 30 days)

2. **Sections** (organize your quote logically)
   - Each section has a name and description
   - Sections contain line items
   - Use sections to group related work (e.g., "Materials", "Labour", "Installation")

3. **Line Items** (the actual quote details)
   - Item Name
   - Quantity (default: 1)
   - Price per unit
   - Cost per unit (optional, for profit tracking)
   - **IMPORTANT**: Each line item must specify EITHER:
     - \`isLabour: true\` (for labour/time items) OR
     - \`salesAccountId: number\` (for materials/other items)
     - **Never use both on the same line item!**

## Example Quote Structure:

\`\`\`json
{
  "jobId": ${jobId},
  "title": "Kitchen Renovation Quote",
  "dueDays": 30,
  "sections": [
    {
      "name": "Materials",
      "description": "Required materials for the project",
      "sortOrder": 1,
      "lineItems": [
        {
          "itemName": "Cabinets - Premium Oak",
          "itemQuantity": 5,
          "itemPrice": 800,
          "itemCost": 500,
          "salesAccountId": 1,
          "sortOrder": 1
        }
      ]
    },
    {
      "name": "Labour",
      "description": "Installation and finishing work",
      "sortOrder": 2,
      "lineItems": [
        {
          "itemName": "Cabinet Installation",
          "itemQuantity": 8,
          "itemPrice": 120,
          "isLabour": true,
          "sortOrder": 1
        }
      ]
    }
  ]
}
\`\`\`

## Best Practices:
1. **Organize logically**: Group similar items into sections
2. **Be specific**: Clear item names help customers understand what they're paying for
3. **Set validity**: Use \`dueDays\` to set quote expiration (30 days is standard)
4. **Track costs**: Include \`itemCost\` to track profit margins
5. **Sort order**: Use \`sortOrder\` to control the display order

## Tools Available:
- \`get-job\`: Fetch job details to understand scope
- \`create-quote\`: Create the quote with sections and line items
- \`update-quote\`: Modify an existing quote (replaces all sections)

Let me fetch the job details for job ${jobId} so we can create an appropriate quote structure. What type of work is this quote for?`,
        },
      },
    ],
  };
}
