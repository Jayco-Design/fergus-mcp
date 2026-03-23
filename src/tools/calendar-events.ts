/**
 * Calendar Event Tools
 * manage-calendar-events: list, get, create, update, delete
 */

import { FergusClient } from '../fergus-client.js';

const eventTypeOptions = ['JOB_PHASE', 'QUOTE', 'ESTIMATE', 'OTHER'] as const;
const frequencyOptions = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'NEVER'] as const;
const repeatEndTypeOptions = ['NEVER', 'ON_DATE', 'AFTER'] as const;

export const manageCalendarEventsToolDefinition = {
  name: 'manage-calendar-events',
  description: 'Manage calendar events. Actions: list, get, create, update, delete. All times are stored in UTC — when querying for a local date range, offset filterDateFrom/filterDateTo to account for the company timezone (e.g. for NZDT/UTC+13, subtract 13 hours from the local start/end).',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'get', 'create', 'update', 'delete'],
        description: 'The action to perform',
      },
      eventId: {
        type: 'string',
        description: 'Calendar event ID (required for: get, update, delete)',
      },
      // list params
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
      // create/update params
      eventTitle: {
        type: 'string',
        description: 'Event title (required for: create, update)',
      },
      eventType: {
        type: 'string',
        enum: [...eventTypeOptions],
        description: 'Event type. JOB_PHASE requires jobPhaseId, QUOTE/ESTIMATE require jobId. (required for: create)',
      },
      startTime: {
        type: 'string',
        description: 'Start time in ISO 8601 UTC format, in 15-minute intervals (required for: create, update)',
      },
      endTime: {
        type: 'string',
        description: 'End time in ISO 8601 UTC format, in 15-minute intervals (required for: create, update)',
      },
      description: {
        type: 'string',
        description: 'Event description (for: create, update)',
      },
      userId: {
        type: 'number',
        description: 'User ID to assign the event to (for: create, update)',
      },
      linkedUserIds: {
        type: 'array',
        items: { type: 'number' },
        description: 'Array of user IDs to assign to a group event (for: create, update)',
      },
      jobId: {
        type: 'number',
        description: 'Job ID (required when eventType is QUOTE or ESTIMATE) (for: create)',
      },
      jobPhaseId: {
        type: 'number',
        description: 'Job phase ID (required when eventType is JOB_PHASE) (for: create)',
      },
      // recurring event params
      frequency: {
        type: 'string',
        enum: [...frequencyOptions],
        description: 'Recurrence frequency. Default: NEVER. (for: create, update)',
      },
      interval: {
        type: 'number',
        description: 'Recurrence interval, e.g. 2 with WEEKLY = every 2 weeks. Default: 1. (for: create, update)',
      },
      repeatEndType: {
        type: 'string',
        enum: [...repeatEndTypeOptions],
        description: 'How the recurrence ends. ON_DATE requires repeatEndDate, AFTER requires repeatCount. (for: create, update)',
      },
      repeatEndDate: {
        type: 'string',
        description: 'End date for recurrence in YYYY-MM-DD format (required when repeatEndType is ON_DATE) (for: create, update)',
      },
      repeatCount: {
        type: 'number',
        description: 'Number of occurrences (required when repeatEndType is AFTER) (for: create, update)',
      },
      // update-specific recurring params
      updateAllRecurring: {
        type: 'string',
        enum: ['TRUE', 'FALSE'],
        description: 'Whether to update all future recurring occurrences. Required when updating a recurring event. (for: update)',
      },
      repeatSplitOnDate: {
        type: 'string',
        description: 'ISO 8601 date to split the recurring event on when updateAllRecurring is FALSE (for: update)',
      },
      updateAllGrouped: {
        type: 'string',
        enum: ['TRUE', 'FALSE'],
        description: 'Whether to update all events in a group. Required when updating a grouped event. (for: update)',
      },
      // delete-specific params
      deleteAllRecurring: {
        type: 'string',
        enum: ['TRUE', 'FALSE'],
        description: 'Whether to delete all future recurring occurrences. Required when deleting a recurring event. (for: delete)',
      },
      deleteOnDate: {
        type: 'string',
        description: 'ISO 8601 date to delete the event on when deleteAllRecurring is FALSE (for: delete)',
      },
      deleteAllGrouped: {
        type: 'string',
        enum: ['TRUE', 'FALSE'],
        description: 'Whether to delete all events in a group. Required when deleting a grouped event. (for: delete)',
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
    case 'create':
      return handleCreateCalendarEvent(fergusClient, args);
    case 'update':
      return handleUpdateCalendarEvent(fergusClient, args);
    case 'delete':
      return handleDeleteCalendarEvent(fergusClient, args);
    default:
      throw new Error(`Unknown action: ${args.action}. Valid actions: list, get, create, update, delete`);
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

async function handleCreateCalendarEvent(fergusClient: FergusClient, args: Record<string, any>) {
  const { eventTitle, eventType, startTime, endTime } = args;
  if (!eventTitle || !eventType || !startTime || !endTime) {
    throw new Error('eventTitle, eventType, startTime, and endTime are required for create action');
  }

  const requestBody: any = { eventTitle, eventType, startTime, endTime };
  if (args.description) requestBody.description = args.description;
  if (args.userId !== undefined) requestBody.userId = args.userId;
  if (args.linkedUserIds) requestBody.linkedUserIds = args.linkedUserIds;
  if (args.jobId !== undefined) requestBody.jobId = args.jobId;
  if (args.jobPhaseId !== undefined) requestBody.jobPhaseId = args.jobPhaseId;
  if (args.frequency) requestBody.frequency = args.frequency;
  if (args.interval !== undefined) requestBody.interval = args.interval;
  if (args.repeatEndType) requestBody.repeatEndType = args.repeatEndType;
  if (args.repeatEndDate) requestBody.repeatEndDate = args.repeatEndDate;
  if (args.repeatCount !== undefined) requestBody.repeatCount = args.repeatCount;

  const event = await fergusClient.post('/calendarEvents', requestBody);
  return { content: [{ type: 'text' as const, text: JSON.stringify(event, null, 2) }] };
}

async function handleUpdateCalendarEvent(fergusClient: FergusClient, args: Record<string, any>) {
  const { eventId, eventTitle, startTime, endTime } = args;
  if (!eventId) throw new Error('eventId is required for update action');
  if (!eventTitle || !startTime || !endTime) {
    throw new Error('eventTitle, startTime, and endTime are required for update action');
  }

  const requestBody: any = { eventTitle, startTime, endTime };
  if (args.description) requestBody.description = args.description;
  if (args.userId !== undefined) requestBody.userId = args.userId;
  if (args.linkedUserIds) requestBody.linkedUserIds = args.linkedUserIds;
  if (args.frequency) requestBody.frequency = args.frequency;
  if (args.interval !== undefined) requestBody.interval = args.interval;
  if (args.repeatEndType) requestBody.repeatEndType = args.repeatEndType;
  if (args.repeatEndDate) requestBody.repeatEndDate = args.repeatEndDate;
  if (args.repeatCount !== undefined) requestBody.repeatCount = args.repeatCount;
  if (args.updateAllRecurring) requestBody.updateAllRecurring = args.updateAllRecurring;
  if (args.repeatSplitOnDate) requestBody.repeatSplitOnDate = args.repeatSplitOnDate;
  if (args.updateAllGrouped) requestBody.updateAllGrouped = args.updateAllGrouped;

  const event = await fergusClient.post(`/calendarEvents/${eventId}`, requestBody);
  return { content: [{ type: 'text' as const, text: JSON.stringify(event, null, 2) }] };
}

async function handleDeleteCalendarEvent(fergusClient: FergusClient, args: Record<string, any>) {
  const { eventId } = args;
  if (!eventId) throw new Error('eventId is required for delete action');

  const requestBody: any = {};
  if (args.deleteOnDate) requestBody.deleteOnDate = args.deleteOnDate;
  if (args.deleteAllRecurring) requestBody.deleteAllRecurring = args.deleteAllRecurring;
  if (args.deleteAllGrouped) requestBody.deleteAllGrouped = args.deleteAllGrouped;

  const hasBody = Object.keys(requestBody).length > 0;
  const result = await fergusClient.delete(`/calendarEvents/${eventId}`, hasBody ? requestBody : undefined);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }, null, 2) }] };
}
