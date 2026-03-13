/**
 * Pricebook Tools
 * manage-pricebooks: list, get, list-items, get-item, search
 */

import { FergusClient } from '../fergus-client.js';

export const managePricebooksToolDefinition = {
  name: 'manage-pricebooks',
  description: 'Manage pricebooks. Actions: list, get, list-items, get-item, search',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'get', 'list-items', 'get-item', 'search'],
        description: 'The action to perform',
      },
      pricebookId: {
        type: 'string',
        description: 'Pricebook ID (required for: get, list-items, get-item)',
      },
      itemId: {
        type: 'string',
        description: 'Pricebook item ID (required for: get-item)',
      },
      // list/search params
      searchText: {
        type: 'string',
        description: 'Search text, min 3 chars. Searches name, productCode, supplierSku. (required for: search)',
      },
      pricingTierId: {
        type: 'number',
        description: 'Pricing tier ID to filter results (for: search). Defaults to the default tier if omitted.',
      },
      allSuppliers: {
        type: 'boolean',
        description: 'Search all supplier pricebooks (for: search, default: true). Set false to search specific suppliers via supplierIds.',
      },
      supplierIds: {
        type: 'array',
        items: { type: 'number' },
        description: 'Array of supplier/pricebook IDs to search (for: search). Only used when allSuppliers is false.',
      },
      pageSize: {
        type: 'number',
        description: 'Max results per page (for: list, list-items, search, default: 50)',
        default: 50,
      },
      pageCursor: {
        type: 'string',
        description: 'Pagination cursor (for: list, list-items, search)',
      },
    },
    required: ['action'],
  },
};

export async function handleManagePricebooks(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  switch (args.action) {
    case 'list':
      return handleListPricebooks(fergusClient, args);
    case 'get':
      return handleGetPricebook(fergusClient, args);
    case 'list-items':
      return handleListPricebookItems(fergusClient, args);
    case 'get-item':
      return handleGetPricebookItem(fergusClient, args);
    case 'search':
      return handleSearchPricebooks(fergusClient, args);
    default:
      throw new Error(`Unknown action: ${args.action}. Valid actions: list, get, list-items, get-item, search`);
  }
}

async function handleListPricebooks(fergusClient: FergusClient, args: Record<string, any>) {
  const { pageSize = 50, pageCursor } = args;
  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  if (pageCursor) params.append('pageCursor', pageCursor);

  const pricebooks = await fergusClient.get(`/pricebooks?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(pricebooks, null, 2) }] };
}

async function handleGetPricebook(fergusClient: FergusClient, args: Record<string, any>) {
  const { pricebookId } = args;
  if (!pricebookId) throw new Error('pricebookId is required for get action');

  const pricebook = await fergusClient.get(`/pricebooks/${pricebookId}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(pricebook, null, 2) }] };
}

async function handleListPricebookItems(fergusClient: FergusClient, args: Record<string, any>) {
  const { pricebookId, pageSize = 50, pageCursor } = args;
  if (!pricebookId) throw new Error('pricebookId is required for list-items action');

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  if (pageCursor) params.append('pageCursor', pageCursor);

  const items = await fergusClient.get(`/pricebooks/${pricebookId}/pricebookItems?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(items, null, 2) }] };
}

async function handleGetPricebookItem(fergusClient: FergusClient, args: Record<string, any>) {
  const { pricebookId, itemId } = args;
  if (!pricebookId || !itemId) throw new Error('pricebookId and itemId are required for get-item action');

  const item = await fergusClient.get(`/pricebooks/${pricebookId}/pricebookItems/${itemId}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(item, null, 2) }] };
}

async function handleSearchPricebooks(fergusClient: FergusClient, args: Record<string, any>) {
  const { searchText, pricingTierId, allSuppliers, supplierIds, pageSize = 50, pageCursor } = args;
  if (!searchText) throw new Error('searchText is required for search action');

  const requestBody: any = { search: searchText };
  if (pricingTierId !== undefined) requestBody.pricingTierId = pricingTierId;
  if (allSuppliers !== undefined) requestBody.allSuppliers = allSuppliers;
  if (supplierIds) requestBody.supplierIds = supplierIds;

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  if (pageCursor) params.append('pageCursor', pageCursor);

  const results = await fergusClient.post(`/pricebooks/search?${params.toString()}`, requestBody);
  return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
}
