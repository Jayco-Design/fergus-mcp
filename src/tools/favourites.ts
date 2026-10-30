/**
 * Favourite Tools
 * manage-favourites: list, get
 */

import { FergusClient } from '../fergus-client.js';
import { normalizeListResponse } from '../utils/format-response.js';
import { checkOneOf, checkPageSize } from '../utils/list-params.js';

/** sortField values the Partner API accepts for favourites. */
const FAVOURITE_SORT_FIELDS = ['name', 'createdAt', 'sortOrder'] as const;

export const manageFavouritesToolDefinition = {
  name: 'manage-favourites',
  description: 'Manage favourites/saved items. Actions: list, get',
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
      favouriteId: {
        type: 'string',
        description: 'Favourite ID (required for: get)',
      },
      representation: {
        type: 'string',
        enum: ['flat', 'tree'],
        description: 'flat (default) lists line items; tree groups them under their sections (for: list)',
      },
      filterSearchText: {
        type: 'string',
        description: 'Search text, matched on section and item names (for: list)',
      },
      filterSectionName: {
        type: 'string',
        description: 'Only favourites in sections whose name matches this text (for: list)',
      },
      sortField: {
        type: 'string',
        enum: [...FAVOURITE_SORT_FIELDS],
        description: 'Field to sort by (for: list). Default: createdAt in the flat view, sortOrder in the tree view.',
      },
      sortOrder: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort order: asc or desc (for: list)',
      },
      pageSize: {
        type: 'number',
        minimum: 1,
        maximum: 100,
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

export async function handleManageFavourites(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  switch (args.action) {
    case 'list':
      return handleListFavourites(fergusClient, args);
    case 'get':
      return handleGetFavourite(fergusClient, args);
    default:
      throw new Error(`Unknown action: ${args.action}. Valid actions: list, get`);
  }
}

async function handleListFavourites(fergusClient: FergusClient, args: Record<string, any>) {
  const { pageSize = 50, pageCursor, representation, filterSearchText, filterSectionName, sortField, sortOrder } = args;
  checkPageSize(pageSize);
  checkOneOf('sortField', sortField, FAVOURITE_SORT_FIELDS);
  checkOneOf('representation', representation, ['flat', 'tree']);
  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  if (representation) params.append('representation', representation);
  if (filterSearchText) params.append('filterSearchText', filterSearchText);
  if (filterSectionName) params.append('filterSectionName', filterSectionName);
  if (sortField) params.append('sortField', sortField);
  if (sortOrder) params.append('sortOrder', sortOrder);
  if (pageCursor) params.append('pageCursor', pageCursor);

  const favourites = await fergusClient.get(`/favourites?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(normalizeListResponse(favourites), null, 2) }] };
}

async function handleGetFavourite(fergusClient: FergusClient, args: Record<string, any>) {
  const { favouriteId } = args;
  if (!favouriteId) throw new Error('favouriteId is required for get action');

  const favourite = await fergusClient.get(`/favourites/${favouriteId}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(favourite, null, 2) }] };
}
