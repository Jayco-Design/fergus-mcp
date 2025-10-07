/**
 * List Quotes Tool
 * Lists quotes with optional filtering by status, job, and date range
 */

import { FergusClient } from '../fergus-client.js';

export const listQuotesToolDefinition = {
  name: 'list-quotes',
  description: 'List quotes across all jobs with optional filtering',
  inputSchema: {
    type: 'object',
    properties: {
      filterStatus: {
        type: 'string',
        description: 'Filter by quote status',
      },
      createdAfter: {
        type: 'string',
        description: 'Filter quotes created after this date (ISO 8601)',
      },
      modifiedAfter: {
        type: 'string',
        description: 'Filter quotes modified after this date (ISO 8601)',
      },
      pageSize: {
        type: 'number',
        description: 'Maximum number of quotes to return per page',
        default: 50,
      },
      sortField: {
        type: 'string',
        description: 'Field to sort by',
      },
      sortOrder: {
        type: 'string',
        description: 'Sort order: asc or desc',
        enum: ['asc', 'desc'],
      },
      pageCursor: {
        type: 'string',
        description: 'Pagination cursor for next page',
      },
    },
  },
};

export async function handleListQuotes(
  fergusClient: FergusClient,
  args: {
    filterStatus?: string;
    createdAfter?: string;
    modifiedAfter?: string;
    pageSize?: number;
    sortField?: string;
    sortOrder?: string;
    pageCursor?: string;
  }
) {
  const {
    filterStatus,
    createdAfter,
    modifiedAfter,
    pageSize = 50,
    sortField,
    sortOrder,
    pageCursor,
  } = args || {};

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());

  if (filterStatus) params.append('filterStatus', filterStatus);
  if (createdAfter) params.append('createdAfter', createdAfter);
  if (modifiedAfter) params.append('modifiedAfter', modifiedAfter);
  if (sortField) params.append('sortField', sortField);
  if (sortOrder) params.append('sortOrder', sortOrder);
  if (pageCursor) params.append('pageCursor', pageCursor);

  const endpoint = `/jobs/quotes?${params.toString()}`;
  const quotes = await fergusClient.get(endpoint);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(quotes, null, 2),
      },
    ],
  };
}
