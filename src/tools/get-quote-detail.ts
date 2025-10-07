/**
 * Get Quote Detail Tool
 * Retrieves comprehensive quote details including sections and line items
 */

import { FergusClient } from '../fergus-client.js';

export const getQuoteDetailToolDefinition = {
  name: 'get-quote-detail',
  description: 'Get comprehensive details of a specific quote including sections and line items',
  inputSchema: {
    type: 'object',
    properties: {
      jobId: {
        type: 'string',
        description: 'The ID of the job',
      },
      quoteId: {
        type: 'string',
        description: 'The ID of the quote to retrieve',
      },
    },
    required: ['jobId', 'quoteId'],
  },
};

export async function handleGetQuoteDetail(
  fergusClient: FergusClient,
  args: { jobId: string; quoteId: string }
) {
  const { jobId, quoteId } = args;

  if (!jobId) {
    throw new Error('jobId is required');
  }

  if (!quoteId) {
    throw new Error('quoteId is required');
  }

  const quoteDetail = await fergusClient.get(`/jobs/${jobId}/quotes/${quoteId}`);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(quoteDetail, null, 2),
      },
    ],
  };
}
