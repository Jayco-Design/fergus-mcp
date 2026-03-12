/**
 * Note Tools
 * manage-notes: list
 */

import { FergusClient } from '../fergus-client.js';

export const manageNotesToolDefinition = {
  name: 'manage-notes',
  description: 'Manage notes. Actions: list',
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
      filterJobId: {
        type: 'string',
        description: 'Filter by job ID (for: list)',
      },
      filterSearchText: {
        type: 'string',
        description: 'Search text (for: list)',
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

export async function handleManageNotes(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  switch (args.action) {
    case 'list':
      return handleListNotes(fergusClient, args);
    default:
      throw new Error(`Unknown action: ${args.action}. Valid actions: list`);
  }
}

async function handleListNotes(fergusClient: FergusClient, args: Record<string, any>) {
  const { filterJobId, filterSearchText, pageSize = 50, pageCursor } = args;

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  if (filterJobId) params.append('filterJobId', filterJobId);
  if (filterSearchText) params.append('filterSearchText', filterSearchText);
  if (pageCursor) params.append('pageCursor', pageCursor);

  const notes = await fergusClient.get(`/notes?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(notes, null, 2) }] };
}
