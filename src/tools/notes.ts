/**
 * Note Tools
 * manage-notes: list
 */

import { FergusClient } from '../fergus-client.js';
import { resolveJobId } from './job-resolver.js';

export const manageNotesToolDefinition = {
  name: 'manage-notes',
  description: 'Manage notes. Actions: list. Notes are attached to entities (jobs, customers, quotes, sites, enquiries, invoices, job phases, tasks). Use filterEntityName + filterEntityId to scope notes, or use filterJobRef as a shortcut for job notes.',
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
      filterEntityName: {
        type: 'string',
        enum: ['JOB', 'CUSTOMER', 'CUSTOMER_INVOICE', 'QUOTE', 'SITE', 'TASK', 'ENQUIRY', 'JOB_PHASE'],
        description: 'Entity type to filter notes by (for: list). Use with filterEntityId.',
      },
      filterEntityId: {
        type: 'number',
        description: 'Entity ID to filter notes by (for: list). Use with filterEntityName.',
      },
      filterJobRef: {
        type: 'string',
        description: 'Shortcut: filter notes for a job by job number e.g. "503" or "Job-503". Resolves to filterEntityName=JOB + filterEntityId automatically. (for: list)',
      },
      filterCreatedById: {
        type: 'number',
        description: 'Filter by the user ID who created the note (for: list)',
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
  const { filterEntityName, filterEntityId, filterJobRef, filterCreatedById, pageSize = 50, pageCursor } = args;

  let entityName = filterEntityName;
  let entityId = filterEntityId;

  // Shortcut: resolve job reference to entity filter
  if (filterJobRef) {
    const { id: jobId } = await resolveJobId(fergusClient, String(filterJobRef));
    entityName = 'JOB';
    entityId = jobId;
  }

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  params.append('sortField', 'created_at');
  params.append('sortOrder', 'asc');
  if (entityName) params.append('filterEntityName', entityName);
  if (entityId) params.append('filterEntityId', entityId.toString());
  if (filterCreatedById) params.append('filterCreatedById', filterCreatedById.toString());
  if (pageCursor) params.append('pageCursor', pageCursor);

  const notes = await fergusClient.get(`/notes?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(notes, null, 2) }] };
}
