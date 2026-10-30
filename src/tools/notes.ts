/**
 * Note Tools
 * manage-notes: list, create, update
 */

import { FergusClient } from '../fergus-client.js';
import { resolveJobId } from './job-resolver.js';
import { normalizeListResponse } from '../utils/format-response.js';
import { checkPageSize } from '../utils/list-params.js';

export const manageNotesToolDefinition = {
  name: 'manage-notes',
  description: 'Manage notes. Actions: list, create, update. Notes are attached to entities (jobs, customers, quotes, sites, enquiries, invoices, job phases, tasks). Listing always requires an entity scope: pass filterEntityName + filterEntityId, or filterJobRef as a shortcut for job notes.',
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
        enum: ['JOB', 'CUSTOMER', 'CUSTOMER_INVOICE', 'QUOTE', 'SITE', 'TASK', 'ENQUIRY', 'JOB_PHASE'],
        description: 'Entity type to filter notes by (required for: list, unless filterJobRef is given). Must be paired with filterEntityId.',
      },
      filterEntityId: {
        type: 'number',
        description: 'Entity ID to filter notes by (required for: list, unless filterJobRef is given). Must be paired with filterEntityName.',
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
        description: 'Max results per page, 1-100 (for: list, default: 50)',
        default: 50,
        minimum: 1,
        maximum: 100,
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
        enum: ['JOB', 'CUSTOMER', 'CUSTOMER_INVOICE', 'QUOTE', 'SITE', 'TASK', 'ENQUIRY', 'JOB_PHASE'],
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
        description: 'Whether the note is pinned: true pins it, false unpins it. Defaults to false on create. (for: create, update)',
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

/**
 * Entity names the tool accepts. The API uses these uppercase keys everywhere:
 * GET /notes filters on them, responses use them, and POST /notes accepts
 * them (its older lowercase values, such as works_order, are deprecated).
 */
const NOTE_ENTITY_NAMES = ['JOB', 'CUSTOMER', 'CUSTOMER_INVOICE', 'QUOTE', 'SITE', 'TASK', 'ENQUIRY', 'JOB_PHASE'] as const;

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
  checkPageSize(pageSize);

  let entityName = filterEntityName;
  let entityId = filterEntityId;

  // Shortcut: resolve job reference to entity filter
  if (filterJobRef) {
    const { id: jobId } = await resolveJobId(fergusClient, String(filterJobRef));
    entityName = 'JOB';
    entityId = jobId;
  }

  // Notes are always scoped to a single entity. filterEntityName is required by
  // the API (a bare list is a 400); filterEntityId is optional there, but without
  // it the list spans every entity of that type, which is never what was meant.
  const missing = [
    !entityName && 'filterEntityName',
    entityId === undefined || entityId === null ? 'filterEntityId' : null,
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} required for list — ` +
        'notes must be scoped to a specific entity. Pass filterEntityName ' +
        `(one of: ${NOTE_ENTITY_NAMES.join(', ')}) together with ` +
        'filterEntityId, or pass filterJobRef as a shortcut for job notes.'
    );
  }

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  params.append('sortField', 'created_at');
  params.append('sortOrder', 'asc');
  params.append('filterEntityName', entityName);
  if (entityId) params.append('filterEntityId', entityId.toString());
  if (filterCreatedById) params.append('filterCreatedById', filterCreatedById.toString());
  if (pageCursor) params.append('pageCursor', pageCursor);

  const notes = await fergusClient.get(`/notes?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(normalizeListResponse(notes), null, 2) }] };
}

async function handleCreateNote(fergusClient: FergusClient, args: Record<string, any>) {
  const { text, entityName, entityId, parentId, isPinned } = args;

  if (!text) throw new Error('text is required for create');
  if (!entityName) throw new Error('entityName is required for create');
  if (entityId === undefined || entityId === null) throw new Error('entityId is required for create');

  if (!(NOTE_ENTITY_NAMES as readonly string[]).includes(entityName)) {
    throw new Error(
      `Unknown entityName: ${entityName}. One of: ${NOTE_ENTITY_NAMES.join(', ')}`
    );
  }

  const payload: Record<string, any> = {
    text,
    entityName,
    entityId,
    isPinned: isPinned ?? false,
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
