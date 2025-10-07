/**
 * Update Quote Tool
 * Updates an existing quote for a job
 */

import { FergusClient } from '../fergus-client.js';

export const updateQuoteToolDefinition = {
  name: 'update-quote',
  description: 'Update an existing quote. Requires jobId, quoteId, and sections array to replace existing sections. IMPORTANT: Line items must include EITHER isLabour OR salesAccountId, but NOT BOTH.',
  inputSchema: {
    type: 'object',
    properties: {
      jobId: {
        type: 'number',
        description: 'The ID of the job',
      },
      quoteId: {
        type: 'number',
        description: 'The ID of the quote to update',
      },
      sections: {
        type: 'array',
        description: 'Array of quote sections containing line items (replaces all existing sections)',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Section name',
            },
            description: {
              type: 'string',
              description: 'Section description',
            },
            sortOrder: {
              type: 'number',
              description: 'Sort order for the section',
            },
            lineItems: {
              type: 'array',
              description: 'Line items in this section',
              items: {
                type: 'object',
                properties: {
                  itemName: {
                    type: 'string',
                    description: 'Name of the line item',
                  },
                  itemQuantity: {
                    type: 'number',
                    description: 'Quantity of the item (default: 1)',
                  },
                  itemPrice: {
                    type: 'number',
                    description: 'Price per unit',
                  },
                  itemCost: {
                    type: 'number',
                    description: 'Cost per unit (default: 0)',
                  },
                  salesAccountId: {
                    type: 'number',
                    description: 'Sales account ID (use EITHER this OR isLabour, not both)',
                  },
                  isLabour: {
                    type: 'boolean',
                    description: 'Whether this is a labour item (use EITHER this OR salesAccountId, not both)',
                  },
                  sortOrder: {
                    type: 'number',
                    description: 'Sort order for the line item',
                  },
                },
              },
            },
          },
        },
      },
    },
    required: ['jobId', 'quoteId', 'sections'],
  },
};

export async function handleUpdateQuote(
  fergusClient: FergusClient,
  args: {
    jobId: number;
    quoteId: number;
    sections: any[];
  }
) {
  const { jobId, quoteId, sections } = args;

  const requestBody = {
    sections,
  };

  const quote = await fergusClient.put(
    `/jobs/${jobId}/quotes/${quoteId}`,
    requestBody
  );

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(quote, null, 2),
      },
    ],
  };
}
