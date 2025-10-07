/**
 * List Time Entries Tool
 * Lists time entries with optional filtering by user, job, and date range
 */

import { FergusClient } from '../fergus-client.js';

export const listTimeEntriesToolDefinition = {
  name: 'list-time-entries',
  description: 'List time entries with optional filtering by user, job, and date range',
  inputSchema: {
    type: 'object',
    properties: {
      filterUserId: {
        type: 'string',
        description: 'Filter by user ID',
      },
      filterJobNo: {
        type: 'string',
        description: 'Filter by job number',
      },
      filterDateFrom: {
        type: 'string',
        description: 'Filter by start date (ISO 8601 format: YYYY-MM-DD)',
      },
      filterDateTo: {
        type: 'string',
        description: 'Filter by end date (ISO 8601 format: YYYY-MM-DD)',
      },
      filterSearchText: {
        type: 'string',
        description: 'Search text to filter time entries',
      },
      filterLockedOnly: {
        type: 'boolean',
        description: 'Filter to show only locked time entries',
      },
      pageSize: {
        type: 'number',
        description: 'Maximum number of time entries to return per page',
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

export async function handleListTimeEntries(
  fergusClient: FergusClient,
  args: {
    filterUserId?: string;
    filterJobNo?: string;
    filterDateFrom?: string;
    filterDateTo?: string;
    filterSearchText?: string;
    filterLockedOnly?: boolean;
    pageSize?: number;
    sortField?: string;
    sortOrder?: string;
    pageCursor?: string;
  }
) {
  const {
    filterUserId,
    filterJobNo,
    filterDateFrom,
    filterDateTo,
    filterSearchText,
    filterLockedOnly,
    pageSize = 50,
    sortField,
    sortOrder,
    pageCursor,
  } = args || {};

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());

  if (filterUserId) params.append('filterUserId', filterUserId);
  if (filterJobNo) params.append('filterJobNo', filterJobNo);
  if (filterDateFrom) params.append('filterDateFrom', filterDateFrom);
  if (filterDateTo) params.append('filterDateTo', filterDateTo);
  if (filterSearchText) params.append('filterSearchText', filterSearchText);
  if (filterLockedOnly !== undefined) params.append('filterLockedOnly', filterLockedOnly.toString());
  if (sortField) params.append('sortField', sortField);
  if (sortOrder) params.append('sortOrder', sortOrder);
  if (pageCursor) params.append('pageCursor', pageCursor);

  const endpoint = `/timeEntries?${params.toString()}`;
  const timeEntries = await fergusClient.get(endpoint);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(timeEntries, null, 2),
      },
    ],
  };
}
