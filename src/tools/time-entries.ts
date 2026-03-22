/**
 * Time Entry Tools (consolidated)
 * manage-time-entries: list
 */

import { FergusClient } from '../fergus-client.js';
import { extractJobNo } from './job-resolver.js';

export const manageTimeEntriesToolDefinition = {
  name: 'manage-time-entries',
  description: 'Manage time entries. Actions: list',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list'],
        description: 'The action to perform',
      },
      // list params
      filterUserId: {
        type: 'string',
        description: 'Filter by user ID (for: list)',
      },
      filterJobNo: {
        type: 'string',
        description: 'Filter by job number. Accepts "Job-500", "500", etc. Returns time entries across all phases of the job. (for: list)',
      },
      filterJobPhaseId: {
        type: 'string',
        description: 'Filter by job phase (works order) ID. Get phase IDs from manage-jobs action list-phases. (for: list)',
      },
      filterDateFrom: {
        type: 'string',
        description: 'Filter by start date YYYY-MM-DD (for: list). Defaults to 12 months ago if not provided.',
      },
      filterDateTo: {
        type: 'string',
        description: 'Filter by end date YYYY-MM-DD (for: list). Defaults to today if not provided.',
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
        enum: ['timeEntryDate', 'jobNo', 'user'],
        description: 'Field to sort by (for: list, default: timeEntryDate)',
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
    case 'list':
      return handleListTimeEntries(fergusClient, args);
    default:
      throw new Error(`Unknown action: ${args.action}. Valid actions: list`);
  }
}

// ===== LIST TIME ENTRIES =====

async function handleListTimeEntries(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const {
    filterUserId,
    filterJobNo: filterJob,
    filterJobPhaseId,
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

  // Extract job number and pass directly to filterJobNo
  // The time entries API does exact match on internal_job_id (user-facing number)
  if (filterJob) {
    const jobNo = extractJobNo(String(filterJob));
    if (!jobNo) {
      throw new Error(`Cannot parse job reference: "${filterJob}". Use a job number like "500" or "Job-500".`);
    }
    params.append('filterJobNo', jobNo);
  }

  if (filterJobPhaseId) params.append('filterJobPhaseId', filterJobPhaseId.toString());
  if (filterUserId) params.append('filterUserId', filterUserId);

  // The API defaults to last week only if dates aren't provided.
  // Send a wide range so results aren't silently hidden.
  if (filterDateFrom && filterDateTo) {
    params.append('filterDateFrom', filterDateFrom);
    params.append('filterDateTo', filterDateTo);
  } else if (filterDateFrom) {
    params.append('filterDateFrom', filterDateFrom);
    params.append('filterDateTo', new Date().toISOString().slice(0, 10));
  } else if (filterDateTo) {
    params.append('filterDateFrom', '2020-01-01');
    params.append('filterDateTo', filterDateTo);
  } else {
    // Default to last 12 months instead of the API's default of last week
    const now = new Date();
    const yearAgo = new Date(now);
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    params.append('filterDateFrom', yearAgo.toISOString().slice(0, 10));
    params.append('filterDateTo', now.toISOString().slice(0, 10));
  }
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
