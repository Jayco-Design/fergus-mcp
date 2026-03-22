/**
 * Calendar Event Tools
 * manage-calendar-events: list, get, create, update, delete
 */

import { FergusClient } from '../fergus-client.js';

export const manageCalendarEventsToolDefinition = {
  name: 'manage-calendar-events',
  description: 'Manage calendar events. Actions: list, get, create, update, delete. Supports recurring events. All times are stored in UTC — when querying for a local date range, offset filterDateFrom/filterDateTo to account for the company timezone (e.g. for NZDT/UTC+13, subtract 13 hours from the local start/end).',
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
        description: 'Filter by start date in ISO 8601 format e.g. 2026-03-16T00:00:00Z. Must be in UTC (for: list)',
      },
      filterDateTo: {
        type: 'string',
        description: 'Filter by end date in ISO 8601 format e.g. 2026-03-17T23:59:59Z. Must be in UTC (for: list)',
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
      startTime: {
        type: 'string',
        description: 'Event start time in ISO 8601 UTC format (required for: create, update)',
      },
      endTime: {
        type: 'string',
        description: 'Event end time in ISO 8601 UTC format (required for: create, update)',
      },
      eventTitle: {
        type: 'string',
        description: 'Event title (required for: create, update)',
      },
      eventType: {
        type: 'string',
        enum: ['JOB_PHASE', 'QUOTE', 'ESTIMATE', 'OTHER'],
        description: 'Event type (required for: create). JOB_PHASE requires jobPhaseId. QUOTE and ESTIMATE require jobId.',
      },
      jobId: {
        type: 'string',
        description: 'Job ID to link event to (required when eventType is QUOTE or ESTIMATE)',
      },
      jobPhaseId: {
        type: 'string',
        description: 'Job phase ID to link event to (required when eventType is JOB_PHASE)',
      },
      description: {
        type: 'string',
        description: 'Event description (for: create, update)',
      },
      userId: {
        type: 'string',
        description: 'User/employee ID to assign the event to (for: create, update)',
      },
      linkedUserIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Additional user IDs linked to this event (for: create, update)',
      },
      // recurring event params
      frequency: {
        type: 'string',
        description: 'Recurrence frequency: daily, weekly, monthly, yearly (for: create, update)',
      },
      interval: {
        type: 'number',
        description: 'Recurrence interval e.g. every 2 weeks (for: create, update)',
      },
      repeatEndType: {
        type: 'string',
        description: 'How recurrence ends: never, date, count (for: create, update)',
      },
      repeatEndDate: {
        type: 'string',
        description: 'End date for recurrence in ISO 8601 format (for: create, update when repeatEndType=date)',
      },
      repeatCount: {
        type: 'number',
        description: 'Number of occurrences (for: create, update when repeatEndType=count)',
      },
      // update/delete recurring params
      updateAllRecurring: {
        type: 'boolean',
        description: 'Apply change to all events in recurring series (for: update, delete)',
      },
      updateAllGrouped: {
        type: 'boolean',
        description: 'Apply change to all grouped events (for: update, delete)',
      },
      repeatSplitOnDate: {
        type: 'string',
        description: 'Date to split recurring series in ISO 8601 format (for: update, delete)',
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
  const { startTime, endTime, eventTitle, eventType, description, userId, linkedUserIds,
          frequency, interval, repeatEndType, repeatEndDate, repeatCount, jobId, jobPhaseId } = args;

  if (!startTime || !endTime || !eventTitle) {
    throw new Error('startTime, endTime, and eventTitle are required for create action');
  }

  const requestBody: Record<string, unknown> = { startTime, endTime, eventTitle };
  if (eventType) requestBody.eventType = eventType;
  if (description) requestBody.description = description;
  if (userId) requestBody.userId = userId;
  if (linkedUserIds) requestBody.linkedUserIds = linkedUserIds;
  if (jobId) requestBody.jobId = jobId;
  if (jobPhaseId) requestBody.jobPhaseId = jobPhaseId;
  if (frequency) requestBody.frequency = frequency;
  if (interval !== undefined) requestBody.interval = interval;
  if (repeatEndType) requestBody.repeatEndType = repeatEndType;
  if (repeatEndDate) requestBody.repeatEndDate = repeatEndDate;
  if (repeatCount !== undefined) requestBody.repeatCount = repeatCount;

  const event = await fergusClient.post('/calendarEvents', requestBody);
  return { content: [{ type: 'text' as const, text: JSON.stringify(event, null, 2) }] };
}

async function handleUpdateCalendarEvent(fergusClient: FergusClient, args: Record<string, any>) {
  const { eventId, startTime, endTime, eventTitle, description, userId, linkedUserIds,
          frequency, interval, repeatEndType, repeatEndDate, repeatCount,
          updateAllRecurring, updateAllGrouped, repeatSplitOnDate } = args;

  if (!eventId) throw new Error('eventId is required for update action');
  if (!startTime || !endTime || !eventTitle) {
    throw new Error('startTime, endTime, and eventTitle are required for update action');
  }

  const requestBody: Record<string, unknown> = { startTime, endTime, eventTitle };
  if (description !== undefined) requestBody.description = description;
  if (userId) requestBody.userId = userId;
  if (linkedUserIds) requestBody.linkedUserIds = linkedUserIds;
  if (frequency) requestBody.frequency = frequency;
  if (interval !== undefined) requestBody.interval = interval;
  if (repeatEndType) requestBody.repeatEndType = repeatEndType;
  if (repeatEndDate) requestBody.repeatEndDate = repeatEndDate;
  if (repeatCount !== undefined) requestBody.repeatCount = repeatCount;
  if (updateAllRecurring !== undefined) requestBody.updateAllRecurring = updateAllRecurring;
  if (updateAllGrouped !== undefined) requestBody.updateAllGrouped = updateAllGrouped;
  if (repeatSplitOnDate) requestBody.repeatSplitOnDate = repeatSplitOnDate;

  const event = await fergusClient.post(`/calendarEvents/${eventId}`, requestBody);
  return { content: [{ type: 'text' as const, text: JSON.stringify(event, null, 2) }] };
}

async function handleDeleteCalendarEvent(fergusClient: FergusClient, args: Record<string, any>) {
  const { eventId, updateAllRecurring, updateAllGrouped, repeatSplitOnDate } = args;
  if (!eventId) throw new Error('eventId is required for delete action');

  const params = new URLSearchParams();
  if (updateAllRecurring !== undefined) params.append('updateAllRecurring', String(updateAllRecurring));
  if (updateAllGrouped !== undefined) params.append('updateAllGrouped', String(updateAllGrouped));
  if (repeatSplitOnDate) params.append('repeatSplitOnDate', repeatSplitOnDate);

  const query = params.toString();
  await fergusClient.delete(`/calendarEvents/${eventId}${query ? `?${query}` : ''}`);
  return { content: [{ type: 'text' as const, text: 'Calendar event deleted successfully.' }] };
}
