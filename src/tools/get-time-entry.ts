/**
 * Get Time Entry Tool
 * Retrieves a specific time entry by ID
 */

import { FergusClient } from '../fergus-client.js';

export const getTimeEntryToolDefinition = {
  name: 'get-time-entry',
  description: 'Get details of a specific time entry by ID',
  inputSchema: {
    type: 'object',
    properties: {
      timeEntryId: {
        type: 'string',
        description: 'The ID of the time entry to retrieve',
      },
    },
    required: ['timeEntryId'],
  },
};

export async function handleGetTimeEntry(
  fergusClient: FergusClient,
  args: { timeEntryId: string }
) {
  const { timeEntryId } = args;

  if (!timeEntryId) {
    throw new Error('timeEntryId is required');
  }

  const timeEntry = await fergusClient.get(`/timeEntries/${timeEntryId}`);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(timeEntry, null, 2),
      },
    ],
  };
}
