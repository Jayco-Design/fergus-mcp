/**
 * Calendar Event Tools
 * manage-calendar-events: list, get, create, update, delete
 */

import { FergusClient } from '../fergus-client.js';
import { normalizeListResponse } from '../utils/format-response.js';

const eventTypeOptions = ['JOB_PHASE', 'QUOTE', 'ESTIMATE', 'OTHER'] as const;
const frequencyOptions = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'NEVER'] as const;
const repeatEndTypeOptions = ['NEVER', 'ON_DATE', 'AFTER'] as const;

export const manageCalendarEventsToolDefinition = {
  name: 'manage-calendar-events',
  description: 'Manage calendar events. Actions: list, get, create, update, delete. Event times (startTime, endTime) are in UTC. For list: send filterDateFrom as the local date with the company\'s UTC offset (e.g. 2026-03-27T00:00:00+13:00); day boundaries are taken in that offset. The company\'s time zone is in get-company-info, under settings, company_timezone. Use filterCalendarRange to control the date window (DAY, WEEK, etc.). List returns every event in the range at once, with no paging. Note: filterDateTo is not supported by the partner API and will be ignored. Updating: each person on an event has their own linked copy of it. When updating, first get the event and send back its current eventTitle (the title from get), startTime, endTime, userId and description along with the change. Take startTime and endTime from get, not from list: list shows each repeat of a repeating event at its own time. To put another person on an existing booking, find the people with manage-users (search by name) and the booking with list (by date, and user or job), then get it and update it with userId set to the userId from get (or, if the booking is unassigned, one of the people being added), linkedUserIds set to everyone who should be on it (including that person), and updateAllGrouped "TRUE". On a repeating event, also send updateAllRecurring "TRUE" (without repeatSplitOnDate) and its current repeat settings.',
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
        description: 'Start of the range: the local date with the company\'s UTC offset, in ISO 8601 (e.g. 2026-03-27T00:00:00+13:00 for NZDT). Day boundaries are taken in that offset; without an offset the date is treated as UTC, which can give the wrong local day. The company\'s time zone is in get-company-info, under settings, company_timezone. (for: list)',
      },
      filterUserId: {
        type: 'string',
        description: 'Filter by user ID (for: list)',
      },
      filterCalendarRange: {
        type: 'string',
        enum: ['DAY', 'THREE_DAY', 'WEEK', 'FORTNIGHT', 'MONTH'],
        description: 'Date range period. DAY/THREE_DAY use the exact filterDateFrom date. WEEK/MONTH use the week or month containing that date (weeks run Monday–Sunday). FORTNIGHT starts at the Monday of the containing week. Defaults to WEEK. (for: list)',
      },
      filterCalendarEventType: {
        type: 'string',
        enum: ['JOB_PHASE', 'QUOTE', 'ESTIMATE', 'OTHER'],
        description: 'Filter by event type. (for: list)',
      },
      filterJobId: {
        type: 'number',
        description: 'Filter events for a specific job. (for: list)',
      },
      filterJobPhaseId: {
        type: 'number',
        description: 'Filter events for a specific job phase. (for: list)',
      },
      filterJobEventsOnly: {
        type: 'boolean',
        description: 'Only return job-related events (JOB_PHASE, QUOTE, ESTIMATE). (for: list)',
      },
      filterNonJobEventsOnly: {
        type: 'boolean',
        description: 'Only return non-job events (OTHER). (for: list)',
      },
      filterUnassignedEventsOnly: {
        type: 'boolean',
        description: 'Only return events with no assigned user. (for: list)',
      },
      filterActiveOnly: {
        type: 'boolean',
        description: 'Only return active events. (for: list)',
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
        description: 'Event description (for: create, update). On update, send the current description from get to keep it.',
      },
      userId: {
        type: 'number',
        description: 'User ID of the person the event is assigned to (for: create, update). On update, send the assignee the event should have; to keep the current one, send the userId from get.',
      },
      linkedUserIds: {
        type: 'array',
        items: { type: 'number' },
        description: 'The complete list of user IDs who should be on the event, including userId, not just the people being added. Each person gets their own linked copy of the event, and anyone already on it who is left out is taken off it. On update, send it with updateAllGrouped "TRUE". (for: create, update)',
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
        description: 'Recurrence frequency. Default: NEVER. On update to a repeating event, send its current repeat settings (frequency, interval, and repeatEndType with repeatEndDate or repeatCount), read from recurringEventDetails.rRule, to keep it repeating; NEVER stops it repeating. (for: create, update)',
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
        description: 'Whether to update all future recurring occurrences. Required when updating a recurring event. To change the series, including who is on it, send "TRUE" without repeatSplitOnDate, with startTime and endTime from get. (for: update)',
      },
      repeatSplitOnDate: {
        type: 'string',
        description: 'ISO 8601 date to split the recurring event on when updateAllRecurring is FALSE (for: update)',
      },
      updateAllGrouped: {
        type: 'string',
        enum: ['TRUE', 'FALSE'],
        description: 'Whether to update every linked copy of the event (one per person on it). Required when updating a grouped event. Send "TRUE" whenever linkedUserIds is sent. (for: update)',
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
  const {
    filterDateFrom, filterUserId, filterCalendarRange,
    filterCalendarEventType, filterJobId, filterJobPhaseId,
    filterJobEventsOnly, filterNonJobEventsOnly, filterUnassignedEventsOnly,
    filterActiveOnly,
  } = args;

  // The API has no paging for calendar events: it returns every event in the range.
  const params = new URLSearchParams();
  if (filterDateFrom) params.append('filterDateFrom', filterDateFrom);
  if (filterUserId) params.append('filterUserId', filterUserId);
  if (filterCalendarRange) params.append('filterCalendarRange', filterCalendarRange);
  if (filterCalendarEventType) params.append('filterCalendarEventType', filterCalendarEventType);
  if (filterJobId) params.append('filterJobId', filterJobId.toString());
  if (filterJobPhaseId) params.append('filterJobPhaseId', filterJobPhaseId.toString());
  if (filterJobEventsOnly !== undefined) params.append('filterJobEventsOnly', filterJobEventsOnly.toString());
  if (filterNonJobEventsOnly !== undefined) params.append('filterNonJobEventsOnly', filterNonJobEventsOnly.toString());
  if (filterUnassignedEventsOnly !== undefined) params.append('filterUnassignedEventsOnly', filterUnassignedEventsOnly.toString());
  if (filterActiveOnly !== undefined) params.append('filterActiveOnly', filterActiveOnly.toString());

  const events = await fergusClient.get(`/calendarEvents?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(normalizeListResponse(events), null, 2) }] };
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

  // The API requires a JSON object body, so send {} when there are no flags.
  const result = await fergusClient.delete(`/calendarEvents/${eventId}`, requestBody);
  // A successful delete has no content, which the client returns as {}.
  const empty = result == null || (typeof result === 'object' && Object.keys(result as object).length === 0);
  return { content: [{ type: 'text' as const, text: JSON.stringify(empty ? { success: true } : result, null, 2) }] };
}
