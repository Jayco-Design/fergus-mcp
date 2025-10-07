/**
 * Update Quote Version Tool
 * Updates an existing quote by version number
 */

import { FergusClient } from '../fergus-client.js';

export const updateQuoteVersionToolDefinition = {
  name: 'update-quote-version',
  description: 'Update an existing DRAFT quote by version number. WARNING: This operation REPLACES ALL EXISTING SECTIONS with the sections you provide. If you only want to modify one section, you MUST first fetch the quote using get-quote-detail to get ALL existing sections, then include ALL sections (both modified and unmodified) in your update. The quote must be in draft status (not sent, accepted, or locked) to be updated. To modify a sent/locked quote, create a new quote version instead. IMPORTANT: Line items must include EITHER isLabour OR salesAccountId, but NOT BOTH.',
  inputSchema: {
    type: 'object',
    properties: {
      jobId: {
        type: 'number',
        description: 'The ID of the job',
      },
      versionNumber: {
        type: 'number',
        description: 'The version number of the quote to update',
      },
      sections: {
        type: 'array',
        description: 'Array of quote sections containing line items. WARNING: This array REPLACES ALL existing sections - you must include ALL sections (both modified and unmodified) or data will be lost. Use get-quote-detail first to fetch all existing sections.',
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
    required: ['jobId', 'versionNumber', 'sections'],
  },
};

export async function handleUpdateQuoteVersion(
  fergusClient: FergusClient,
  args: {
    jobId: number;
    versionNumber: number;
    sections: any[];
  }
) {
  const { jobId, versionNumber, sections } = args;

  try {
    // First, fetch all quotes for the job to find the one with matching version number
    const quotesResponse: any = await fergusClient.get(`/jobs/${jobId}/quotes`);
    const targetQuote = quotesResponse.data.find((q: any) => q.versionNumber === versionNumber);

    if (!targetQuote) {
      throw new Error(`Quote version ${versionNumber} not found for job ${jobId}`);
    }

    // Fetch the full quote details to preserve title and description
    // (API bug workaround: the DAO fails if title/description are undefined)
    const existingQuote: any = await fergusClient.get(`/jobs/${jobId}/quotes/${targetQuote.id}`);

    const requestBody = {
      title: existingQuote.data.title || '',
      description: existingQuote.data.description || null,
      sections,
    };

    const quote = await fergusClient.put(
      `/jobs/${jobId}/quotes/version/${versionNumber}`,
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
  } catch (error: any) {
    // Provide clearer error message for draft-only restriction
    if (error.message?.includes('must be a draft')) {
      throw new Error(
        `Cannot update quote version ${versionNumber}: The quote must be in DRAFT status to be updated. ` +
        `This quote has been sent, accepted, or locked. To make changes, create a new quote version using create-quote instead.`
      );
    }
    throw error;
  }
}
