/**
 * Calendar Event Tools
 * manage-calendar-events: list, get
 */

import { FergusClient } from '../fergus-client.js';

export const manageCalendarEventsToolDefinition = {
  name: 'manage-calendar-events',
  description: 'Manage calendar events. Actions: list, get. All times are stored in UTC — when querying for a local date range, offset filterDateFrom/filterDateTo to account for the company timezone (e.g. for NZDT/UTC+13, subtract 13 hours from the local start/end).',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'get'],
        description: 'The action to perform',
      },
      eventId: {
        type: 'string',
        description: 'Calendar event ID (required for: get)',
      },
      filterDateFrom: {
        type: 'string',
        description: 'Filter by start date in ISO 8601 format e.g. 2026-03-16T00:00:00Z. Must be in UTC — offset from local time as needed (for: list)',
      },
      filterDateTo: {
        type: 'string',
        description: 'Filter by end date in ISO 8601 format e.g. 2026-03-17T23:59:59Z. Must be in UTC — offset from local time as needed (for: list)',
      },
      filterUserId: {
        type: 'string',
        description: 'Filter by user ID (for: list)',
      },
      pageSize: {
        type: 'number',
        description: 'Max results per page (for: list, default: 50)',
        default: 50,
      },
      pageCursor: {
        type: 'string',
        description: 'Pagination cursor (for: list)',
      },
    },
    required: ['action'],
  },
};

export async function handleManageCalendarEvents(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  switch (args.action) {
    case 'list':
      return handleListCalendarEvents(fergusClient, args);
    case 'get':
      return handleGetCalendarEvent(fergusClient, args);
    default:
      throw new Error(`Unknown action: ${args.action}. Valid actions: list, get`);
  }
}

async function handleListCalendarEvents(fergusClient: FergusClient, args: Record<string, any>) {
  const { filterDateFrom, filterDateTo, filterUserId, pageSize = 50, pageCursor } = args;

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  if (filterDateFrom) params.append('filterDateFrom', filterDateFrom);
  if (filterDateTo) params.append('filterDateTo', filterDateTo);
  if (filterUserId) params.append('filterUserId', filterUserId);
  if (pageCursor) params.append('pageCursor', pageCursor);

  const events = await fergusClient.get(`/calendarEvents?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(events, null, 2) }] };
}

async function handleGetCalendarEvent(fergusClient: FergusClient, args: Record<string, any>) {
  const { eventId } = args;
  if (!eventId) throw new Error('eventId is required for get action');

  const event = await fergusClient.get(`/calendarEvents/${eventId}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(event, null, 2) }] };
}
