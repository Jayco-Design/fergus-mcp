/**
 * Time Entry Tools (consolidated)
 * manage-time-entries: list
 */

import { FergusClient } from '../fergus-client.js';
import { extractJobNo } from './job-resolver.js';
import { normalizeListResponse } from '../utils/format-response.js';

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
      filterJob: {
        type: 'string',
        description: 'Filter by job number. Accepts "Job-500", "500", etc. Returns time entries across all phases of the job. (for: list)',
      },
      filterJobPhaseId: {
        type: 'number',
        description: 'Filter by job phase (works order) ID. Get phase IDs from manage-jobs action list-phases. (for: list)',
      },
      filterDateFrom: {
        type: 'string',
        description: 'Start date YYYY-MM-DD; the range includes it (for: list). Defaults to 12 months ago, or to 2020-01-01 when only filterDateTo is given.',
      },
      filterDateTo: {
        type: 'string',
        description: 'End date YYYY-MM-DD; the range includes it (for: list). Defaults to today in the company\'s time zone. Must not be before filterDateFrom. The API\'s shortest range is two days, so a single day (filterDateFrom equal to filterDateTo) also returns the next day; the response says so in its note.',
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
        description: 'Pagination cursor (for: list). Send the same dates as the first page; if they were left out, send dateRange.from and dateRange.to from the first response as filterDateFrom and filterDateTo.',
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
    filterJob,
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

  // The API needs both dates (it defaults to last week otherwise), requires
  // filterDateFrom to be strictly before filterDateTo, and includes both dates.
  // Without dates, send the last 12 months so results aren't silently hidden.
  for (const [name, value] of [['filterDateFrom', filterDateFrom], ['filterDateTo', filterDateTo]] as const) {
    if (value !== undefined && value !== null && value !== '' && !isValidDate(value)) {
      throw new Error(`${name} must be a date in YYYY-MM-DD format, such as 2026-10-20. Nothing was listed.`);
    }
  }
  const dateTo = filterDateTo || (await companyToday(fergusClient));
  const dateFrom = filterDateFrom || (filterDateTo ? '2020-01-01' : yearBefore(dateTo));
  if (dateFrom > dateTo) {
    const toLabel = filterDateTo
      ? `filterDateTo (${dateTo})`
      : `today in the company's time zone (${dateTo}), which filterDateTo defaults to`;
    throw new Error(`filterDateFrom (${dateFrom}) is after ${toLabel}. Nothing was listed.`);
  }
  let note: string | undefined;
  let sentDateTo = dateTo;
  if (dateFrom === dateTo) {
    // The shortest range the API accepts is two days.
    sentDateTo = addDays(dateTo, 1);
    note = `The API's shortest range is two days, so these results cover ${dateFrom} and ${sentDateTo}. To keep only ${dateFrom}, compare each entry's start time in the company's time zone (start times are in UTC).`;
  }
  params.append('filterDateFrom', dateFrom);
  params.append('filterDateTo', sentDateTo);
  if (filterSearchText) params.append('filterSearchText', filterSearchText);
  if (filterLockedOnly !== undefined) params.append('filterLockedOnly', filterLockedOnly.toString());
  if (sortField) params.append('sortField', sortField);
  if (sortOrder) params.append('sortOrder', sortOrder);
  if (pageCursor) params.append('pageCursor', pageCursor);

  const timeEntries = await fergusClient.get(`/timeEntries?${params.toString()}`);
  const result = {
    ...normalizeListResponse(timeEntries),
    dateRange: { from: dateFrom, to: sentDateTo },
    ...(note ? { note } : {}),
  };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}

/** True for a real calendar date written as YYYY-MM-DD. */
function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** The same date a year earlier (29 February becomes 28 February). */
function yearBefore(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
  return `${year - 1}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

/** Adds days to a YYYY-MM-DD date. */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Today's date (YYYY-MM-DD) in the company's time zone, from get-company-info's
 * company_timezone setting. Falls back to UTC if it can't be read.
 */
async function companyToday(fergusClient: FergusClient, now: Date = new Date()): Promise<string> {
  let timeZone = 'UTC';
  try {
    const response: any = await fergusClient.get('/company');
    const company = response?.data ?? response;
    const setting = (company?.settings ?? []).find((s: any) => s?.settingKey === 'company_timezone');
    if (typeof setting?.settingValue === 'string' && setting.settingValue) timeZone = setting.settingValue;
  } catch {
    // Fall back to UTC.
  }
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const part = (type: string) => parts.find((p) => p.type === type)?.value;
    const date = `${part('year')}-${part('month')}-${part('day')}`;
    if (isValidDate(date)) return date;
  } catch {
    // Unknown time zone name.
  }
  return now.toISOString().slice(0, 10);
}
