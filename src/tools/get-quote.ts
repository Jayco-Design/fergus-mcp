/**
 * Get Quote Tool
 * Retrieves a specific quote by ID
 */

import { FergusClient } from '../fergus-client.js';

export const getQuoteToolDefinition = {
  name: 'get-quote',
  description: 'Get details of a specific quote by ID',
  annotations: {
    readOnlyHint: true
  },
  inputSchema: {
    type: 'object',
    properties: {
      quoteId: {
        type: 'string',
        description: 'The ID of the quote to retrieve',
      },
    },
    required: ['quoteId'],
  },
};

export async function handleGetQuote(
  fergusClient: FergusClient,
  args: { quoteId: string }
) {
  const { quoteId } = args;

  if (!quoteId) {
    throw new Error('quoteId is required');
  }

  const quote = await fergusClient.get(`/jobs/quotes/${quoteId}`);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(quote, null, 2),
      },
    ],
  };
}
