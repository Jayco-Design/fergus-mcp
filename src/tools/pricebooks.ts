/**
 * Pricebook Tools
 * manage-pricebooks: list, get, list-items, get-item, search
 */

import { FergusClient } from '../fergus-client.js';
import { normalizeListResponse } from '../utils/format-response.js';

const CACHE_TTL_MS = 5 * 60 * 1000;

interface PricebookEntry {
  id: number;
  supplierName: string;
  supplierId: number;
}

interface CacheEntry {
  pricebooks: PricebookEntry[];
  expiresAt: number;
}

const pricebookCache = new WeakMap<FergusClient, CacheEntry>();

async function getCachedPricebooks(fergusClient: FergusClient): Promise<PricebookEntry[]> {
  const cached = pricebookCache.get(fergusClient);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.pricebooks;
  }

  const response = await fergusClient.get<any>('/pricebooks?pageSize=100');
  const pricebooks: PricebookEntry[] = (response?.data ?? []).map((pb: any) => ({
    id: pb.id,
    supplierName: pb.supplierName,
    supplierId: pb.supplierId,
  }));

  pricebookCache.set(fergusClient, { pricebooks, expiresAt: Date.now() + CACHE_TTL_MS });
  return pricebooks;
}

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
        description: 'Search all supplier pricebooks (for: search, default: true). Set false to search specific suppliers via supplierIds or supplierNames.',
      },
      supplierNames: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of supplier names to search (for: search). Case-insensitive exact match. Prefer this over supplierIds when the supplier name is known — no ID lookup required. Unknown names throw a structured error listing all valid supplier names.',
      },
      supplierIds: {
        type: 'array',
        items: { type: 'number' },
        description: 'Array of merchant IDs (rp_price_book.merchant_id, exposed as `pricebook.supplierId` in list responses). NOT pricebook IDs (`pricebook.id`). Prefer `supplierNames` when the supplier name is known. Passing a pricebook ID instead of a merchant ID throws a structured error with the correct value.',
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
  return { content: [{ type: 'text' as const, text: JSON.stringify(normalizeListResponse(pricebooks), null, 2) }] };
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
  return { content: [{ type: 'text' as const, text: JSON.stringify(normalizeListResponse(items), null, 2) }] };
}

async function handleGetPricebookItem(fergusClient: FergusClient, args: Record<string, any>) {
  const { pricebookId, itemId } = args;
  if (!pricebookId || !itemId) throw new Error('pricebookId and itemId are required for get-item action');

  const item = await fergusClient.get(`/pricebooks/${pricebookId}/pricebookItems/${itemId}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(item, null, 2) }] };
}

async function handleSearchPricebooks(fergusClient: FergusClient, args: Record<string, any>) {
  const { searchText, pricingTierId, allSuppliers, supplierIds, supplierNames, pageSize = 50, pageCursor } = args;
  if (!searchText) throw new Error('searchText is required for search action');

  const requestBody: any = { search: searchText };
  if (pricingTierId !== undefined) requestBody.pricingTierId = pricingTierId;

  const hasSupplierFilter = supplierNames?.length > 0 || supplierIds?.length > 0;

  if (hasSupplierFilter) {
    const knownPricebooks = await getCachedPricebooks(fergusClient);
    const knownMerchantIdSet = new Set(knownPricebooks.map(pb => pb.supplierId));
    const resolvedIds: number[] = [];

    if (supplierNames?.length > 0) {
      const unknownNames: string[] = [];
      for (const name of supplierNames as string[]) {
        const match = knownPricebooks.find(pb => pb.supplierName.toLowerCase() === name.toLowerCase());
        if (match) {
          resolvedIds.push(match.supplierId);
        } else {
          unknownNames.push(name);
        }
      }
      if (unknownNames.length > 0) {
        const validNames = knownPricebooks.map(pb => pb.supplierName).sort().join(', ');
        throw new Error(
          `Unknown supplier names: [${unknownNames.map(n => `"${n}"`).join(', ')}].\n` +
          `Valid supplier names: ${validNames}`
        );
      }
    }

    if (supplierIds?.length > 0) {
      const invalidIds = (supplierIds as number[]).filter(id => !knownMerchantIdSet.has(id));
      if (invalidIds.length > 0) {
        const knownPricebookIdSet = new Set(knownPricebooks.map(pb => pb.id));
        const lines = [
          `supplierIds contains values that aren't merchant IDs: [${invalidIds.join(', ')}].`,
          `This looks like a pricebook ID (rp_price_book.id), not a supplier ID (rp_price_book.merchant_id).`,
        ];
        for (const id of invalidIds) {
          if (knownPricebookIdSet.has(id)) {
            const pb = knownPricebooks.find(p => p.id === id)!;
            lines.push(`  ${id} is the pricebook ID for "${pb.supplierName}" — use supplierId ${pb.supplierId} instead.`);
          }
        }
        lines.push(`Use pricebook.supplierId from manage-pricebooks list, or pass supplierNames instead.`);
        throw new Error(lines.join('\n'));
      }
      for (const id of supplierIds as number[]) {
        if (!resolvedIds.includes(id)) resolvedIds.push(id);
      }
    }

    requestBody.supplierIds = resolvedIds;
    requestBody.allSuppliers = false;
  } else {
    if (allSuppliers !== undefined) requestBody.allSuppliers = allSuppliers;
  }

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  if (pageCursor) params.append('pageCursor', pageCursor);

  const results = await fergusClient.post(`/pricebooks/search?${params.toString()}`, requestBody);
  return { content: [{ type: 'text' as const, text: JSON.stringify(normalizeListResponse(results), null, 2) }] };
}
