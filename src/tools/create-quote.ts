/**
 * Create Quote Tool
 * Creates a new quote for a job
 */

import { FergusClient } from '../fergus-client.js';

export const createQuoteToolDefinition = {
  name: 'create-quote',
  description: 'Create a new quote for a job. Requires jobId, title, dueDays, and sections array. IMPORTANT: Line items must include EITHER isLabour OR salesAccountId, but NOT BOTH.',
  inputSchema: {
    type: 'object',
    properties: {
      jobId: {
        type: 'number',
        description: 'The ID of the job to create a quote for',
      },
      title: {
        type: 'string',
        description: 'Quote title (must not be empty)',
      },
      description: {
        type: 'string',
        description: 'Quote description (optional)',
      },
      dueDays: {
        type: 'number',
        description: 'Number of days until quote is due (minimum: 7, maximum: 180)',
        minimum: 7,
        maximum: 180,
      },
      sections: {
        type: 'array',
        description: 'Array of quote sections containing line items',
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
    required: ['jobId', 'title', 'dueDays', 'sections'],
  },
};

export async function handleCreateQuote(
  fergusClient: FergusClient,
  args: {
    jobId: number;
    title: string;
    description?: string;
    dueDays: number;
    sections: any[];
  }
) {
  const { jobId, title, description, dueDays, sections } = args;

  // Validate dueDays range
  if (dueDays < 7 || dueDays > 180) {
    throw new Error('dueDays must be between 7 and 180');
  }

  const requestBody: any = {
    title,
    dueDays,
    sections,
  };

  if (description) {
    requestBody.description = description;
  }

  const quote = await fergusClient.post(`/jobs/${jobId}/quotes`, requestBody);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(quote, null, 2),
      },
    ],
  };
}
