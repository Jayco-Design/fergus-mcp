/**
 * Favourite Tools
 * manage-favourites: list, get
 */

import { FergusClient } from '../fergus-client.js';

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
  const { pageSize = 50, pageCursor } = args;
  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  if (pageCursor) params.append('pageCursor', pageCursor);

  const favourites = await fergusClient.get(`/favourites?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(favourites, null, 2) }] };
}

async function handleGetFavourite(fergusClient: FergusClient, args: Record<string, any>) {
  const { favouriteId } = args;
  if (!favouriteId) throw new Error('favouriteId is required for get action');

  const favourite = await fergusClient.get(`/favourites/${favouriteId}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(favourite, null, 2) }] };
}
