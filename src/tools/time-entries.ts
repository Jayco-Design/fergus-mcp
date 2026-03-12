/**
 * Time Entry Tools (consolidated)
 * manage-time-entries: get, list
 */

import { FergusClient } from '../fergus-client.js';
import { resolveJobId, extractJobNo } from './job-resolver.js';

export const manageTimeEntriesToolDefinition = {
  name: 'manage-time-entries',
  description: 'Manage time entries. Actions: get, list',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['get', 'list'],
        description: 'The action to perform',
      },
      timeEntryId: {
        type: 'string',
        description: 'Time entry ID (required for: get)',
      },
      // list params
      filterUserId: {
        type: 'string',
        description: 'Filter by user ID (for: list)',
      },
      filterJob: {
        type: 'string',
        description: 'Filter by job number or ID. Accepts "Job-500", "500", or API IDs. Automatically resolves to the correct internal ID. (for: list)',
      },
      filterDateFrom: {
        type: 'string',
        description: 'Filter by start date YYYY-MM-DD (for: list)',
      },
      filterDateTo: {
        type: 'string',
        description: 'Filter by end date YYYY-MM-DD (for: list)',
      },
      filterSearchText: {
        type: 'string',
        description: 'Search text to filter (for: list)',
      },
      filterLockedOnly: {
        type: 'boolean',
        description: 'Show only locked entries (for: list)',
      },
      pageSize: {
        type: 'number',
        description: 'Max results per page (for: list, default: 50)',
        default: 50,
      },
      sortField: {
        type: 'string',
        description: 'Field to sort by (for: list)',
      },
      sortOrder: {
        type: 'string',
        description: 'Sort order: asc or desc (for: list)',
        enum: ['asc', 'desc'],
      },
      pageCursor: {
        type: 'string',
        description: 'Pagination cursor (for: list)',
      },
    },
    required: ['action'],
  },
};

export async function handleManageTimeEntries(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  switch (args.action) {
    case 'get':
      return handleGetTimeEntry(fergusClient, args);
    case 'list':
      return handleListTimeEntries(fergusClient, args);
    default:
      throw new Error(`Unknown action: ${args.action}. Valid actions: get, list`);
  }
}

// ===== GET TIME ENTRY =====

async function handleGetTimeEntry(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { timeEntryId } = args;
  if (!timeEntryId) {
    throw new Error('timeEntryId is required for get action');
  }

  const timeEntry = await fergusClient.get(`/timeEntries/${timeEntryId}`);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(timeEntry, null, 2) }],
  };
}

// ===== LIST TIME ENTRIES =====

async function handleListTimeEntries(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const {
    filterUserId,
    filterJob,
    filterDateFrom,
    filterDateTo,
    filterSearchText,
    filterLockedOnly,
    pageSize = 50,
    sortField,
    sortOrder,
    pageCursor,
  } = args;

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());

  // Resolve job reference to API ID for filtering
  if (filterJob) {
    const { id: jobId } = await resolveJobId(fergusClient, String(filterJob));
    params.append('filterJobId', jobId.toString());
  }

  if (filterUserId) params.append('filterUserId', filterUserId);
  if (filterDateFrom) params.append('filterDateFrom', filterDateFrom);
  if (filterDateTo) params.append('filterDateTo', filterDateTo);
  if (filterSearchText) params.append('filterSearchText', filterSearchText);
  if (filterLockedOnly !== undefined) params.append('filterLockedOnly', filterLockedOnly.toString());
  if (sortField) params.append('sortField', sortField);
  if (sortOrder) params.append('sortOrder', sortOrder);
  if (pageCursor) params.append('pageCursor', pageCursor);

  const timeEntries = await fergusClient.get(`/timeEntries?${params.toString()}`);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(timeEntries, null, 2) }],
  };
}
