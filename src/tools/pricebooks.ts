/**
 * Pricebook Tools
 * manage-pricebooks: list, get, list-items, get-item, search
 */

import { FergusClient } from '../fergus-client.js';
import { normalizeListResponse } from '../utils/format-response.js';
import { checkPageSize } from '../utils/list-params.js';

const CACHE_TTL_MS = 5 * 60 * 1000;

/** Supplier ID of the company's custom price book: items not from a supplier's price book. */
const CUSTOM_PRICE_BOOK_SUPPLIER_ID = 0;

/** Safety limit on price book pages read when resolving suppliers (100 per page). */
const MAX_PRICEBOOK_PAGES = 50;

interface PricebookEntry {
  id: number;
  supplierName: string;
  supplierId: number;
}

interface PricebookList {
  pricebooks: PricebookEntry[];
  /** False when not every page could be read, so a missing supplier may still exist. */
  complete: boolean;
}

interface CacheEntry extends PricebookList {
  expiresAt: number;
}

const pricebookCache = new WeakMap<FergusClient, CacheEntry>();

async function getCachedPricebooks(fergusClient: FergusClient): Promise<PricebookList> {
  const cached = pricebookCache.get(fergusClient);
  if (cached && Date.now() < cached.expiresAt) {
    return { pricebooks: cached.pricebooks, complete: cached.complete };
  }

  // Read every page: a company can have more than 100 price books.
  const pricebooks: PricebookEntry[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let complete = false;
  for (let page = 0; page < MAX_PRICEBOOK_PAGES; page++) {
    const params = new URLSearchParams({ pageSize: '100' });
    if (cursor) params.append('pageCursor', cursor);
    const response = await fergusClient.get<any>(`/pricebooks?${params.toString()}`);
    const { data, pagination } = normalizeListResponse(response);
    for (const pb of data) {
      pricebooks.push({ id: pb.id, supplierName: pb.supplierName, supplierId: pb.supplierId });
    }
    cursor = pagination.nextCursor;
    if (!cursor) {
      complete = true;
      break;
    }
    if (seenCursors.has(cursor)) break; // never loop on a repeated cursor
    seenCursors.add(cursor);
  }

  pricebookCache.set(fergusClient, { pricebooks, complete, expiresAt: Date.now() + CACHE_TTL_MS });
  return { pricebooks, complete };
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
        description: 'Search text, at least 3 characters. Searches name, productCode, supplierSku. (required for: search)',
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
        description: 'Array of supplier IDs, NOT pricebook IDs (`pricebook.id`). 0 is the company\'s custom price book: items that aren\'t from a supplier\'s price book. Prefer `supplierNames` when the supplier name is known. Passing a pricebook ID instead of a supplierID throws a structured error with the correct value.',
      },
      filterSupplierName: {
        type: 'string',
        description: 'Only price books whose supplier name contains this text (for: list)',
      },
      filterPricingTierId: {
        type: 'number',
        description: 'Pricing tier ID to price the item with (for: get-item). Defaults to the default tier if omitted.',
      },
      pageSize: {
        type: 'number',
        minimum: 1,
        maximum: 100,
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
  const { pageSize = 50, pageCursor, filterSupplierName } = args;
  checkPageSize(pageSize);
  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  if (filterSupplierName) params.append('filterSupplierName', filterSupplierName);
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
  checkPageSize(pageSize);
  if (!pricebookId) throw new Error('pricebookId is required for list-items action');

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  if (pageCursor) params.append('pageCursor', pageCursor);

  const items = await fergusClient.get(`/pricebooks/${pricebookId}/pricebookItems?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(normalizeListResponse(items), null, 2) }] };
}

async function handleGetPricebookItem(fergusClient: FergusClient, args: Record<string, any>) {
  const { pricebookId, itemId, filterPricingTierId } = args;
  if (!pricebookId || !itemId) throw new Error('pricebookId and itemId are required for get-item action');

  const query = filterPricingTierId !== undefined && filterPricingTierId !== null
    ? `?${new URLSearchParams({ filterPricingTierId: String(filterPricingTierId) }).toString()}`
    : '';
  const item = await fergusClient.get(`/pricebooks/${pricebookId}/pricebookItems/${itemId}${query}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(item, null, 2) }] };
}

async function handleSearchPricebooks(fergusClient: FergusClient, args: Record<string, any>) {
  const { searchText, pricingTierId, allSuppliers, supplierIds, supplierNames, pageSize = 50, pageCursor } = args;
  checkPageSize(pageSize);
  if (!searchText) throw new Error('searchText is required for search action');
  if (String(searchText).length < 3) {
    throw new Error('searchText must be at least 3 characters. Nothing was searched.');
  }

  const requestBody: any = { search: searchText };
  if (pricingTierId !== undefined) requestBody.pricingTierId = pricingTierId;

  const hasSupplierFilter = supplierNames?.length > 0 || supplierIds?.length > 0;

  if (hasSupplierFilter) {
    const { pricebooks: knownPricebooks, complete } = await getCachedPricebooks(fergusClient);
    const incompleteNote = complete
      ? ''
      : `\nOnly the first ${knownPricebooks.length} price books could be read, so this supplier may still exist; pass its supplierIds instead.`;
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
          `Valid supplier names: ${validNames}` + incompleteNote
        );
      }
    }

    if (supplierIds?.length > 0) {
      // 0 is the custom price book, which the price book list never includes.
      // When not every price book could be read, an unknown ID may still be a
      // real supplier, so pass it through rather than reject it.
      const invalidIds = complete
        ? (supplierIds as number[]).filter(id => id !== CUSTOM_PRICE_BOOK_SUPPLIER_ID && !knownMerchantIdSet.has(id))
        : [];
      if (invalidIds.length > 0) {
        const knownPricebookIdSet = new Set(knownPricebooks.map(pb => pb.id));
        const lines = [
          `supplierIds contains values that aren't supplier IDs: [${invalidIds.join(', ')}].`,
          `This looks like a pricebook ID (pricebook.id), not a supplier ID (pricebook.supplierId).`,
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
