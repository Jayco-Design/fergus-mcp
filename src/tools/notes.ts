/**
 * Note Tools
 * manage-notes: list, create, update
 */

import { FergusClient } from '../fergus-client.js';
import { resolveJobId } from './job-resolver.js';

export const manageNotesToolDefinition = {
  name: 'manage-notes',
  description: 'Manage notes. Actions: list, create, update. Notes are attached to entities (jobs, customers, quotes, sites, enquiries, invoices, job phases, tasks). Use filterEntityName + filterEntityId to scope notes, or use filterJobRef as a shortcut for job notes.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'create', 'update'],
        description: 'The action to perform',
      },

      // ── list ────────────────────────────────────────────────────────────────
      filterEntityName: {
        type: 'string',
        enum: ['job', 'customer', 'customer_invoice', 'quote', 'site', 'task', 'enquiry', 'job_phase'],
        description: 'Entity type to filter notes by (for: list). Use with filterEntityId.',
      },
      filterEntityId: {
        type: 'number',
        description: 'Entity ID to filter notes by (for: list). Use with filterEntityName.',
      },
      filterJobRef: {
        type: 'string',
        description: 'Shortcut: filter notes for a job by job number e.g. "503" or "Job-503". Resolves to filterEntityName=job + filterEntityId automatically. (for: list)',
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

      // ── create ──────────────────────────────────────────────────────────────
      text: {
        type: 'string',
        description: 'The body text of the note (for: create, update)',
      },
      entityName: {
        type: 'string',
        enum: ['job', 'customer', 'customer_invoice', 'quote', 'site', 'task', 'enquiry', 'job_phase'],
        description: 'The type of entity this note belongs to (for: create)',
      },
      entityId: {
        type: 'number',
        description: 'The ID of the entity this note belongs to (for: create)',
      },
      parentId: {
        type: 'number',
        description: 'Parent note ID to create a reply. Omit for a top-level note. (for: create)',
      },
      isPinned: {
        type: 'boolean',
        description: 'Pin or unpin the note (for: update only). To pin a note on creation, first create it then call update with isPinned: true.',
      },

      // ── update ──────────────────────────────────────────────────────────────
      noteId: {
        type: 'number',
        description: 'The ID of the note to update (for: update)',
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
    case 'create':
      return handleCreateNote(fergusClient, args);
    case 'update':
      return handleUpdateNote(fergusClient, args);
    default:
      throw new Error(`Unknown action: ${args.action}. Valid actions: list, create, update`);
  }
}

async function handleListNotes(fergusClient: FergusClient, args: Record<string, any>) {
  const { filterEntityName, filterEntityId, filterJobRef, filterCreatedById, pageSize = 50, pageCursor } = args;

  let entityName = filterEntityName;
  let entityId = filterEntityId;

  // Shortcut: resolve job reference to entity filter
  if (filterJobRef) {
    const { id: jobId } = await resolveJobId(fergusClient, String(filterJobRef));
    entityName = 'job';
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

async function handleCreateNote(fergusClient: FergusClient, args: Record<string, any>) {
  const { text, entityName, entityId, parentId } = args;

  if (!text) throw new Error('text is required for create');
  if (!entityName) throw new Error('entityName is required for create');
  if (entityId === undefined || entityId === null) throw new Error('entityId is required for create');

  // Note: isPinned is intentionally excluded from create — the underlying API does not
  // support pinning on creation and including it causes the text field to be silently
  // dropped. To pin a note, create it first then call update with isPinned: true.
  const payload: Record<string, any> = {
    text,
    entityName,
    entityId,
    parentId: parentId ?? null,
  };

  const note = await fergusClient.post('/notes', payload);
  return { content: [{ type: 'text' as const, text: JSON.stringify(note, null, 2) }] };
}

async function handleUpdateNote(fergusClient: FergusClient, args: Record<string, any>) {
  const { noteId, text, isPinned } = args;

  if (noteId === undefined || noteId === null) throw new Error('noteId is required for update');
  if (text === undefined && isPinned === undefined) {
    throw new Error('At least one of text or isPinned must be provided for update');
  }

  const payload: Record<string, any> = {};
  if (text !== undefined) payload.text = text;
  if (isPinned !== undefined) payload.isPinned = isPinned;

  const note = await fergusClient.patch(`/notes/${noteId}`, payload);
  return { content: [{ type: 'text' as const, text: JSON.stringify(note, null, 2) }] };
}
