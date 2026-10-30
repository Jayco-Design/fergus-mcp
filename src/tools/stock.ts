/**
 * Stock Tools (consolidated)
 * manage-stock: list-used, list-on-hand, list-on-hand-by-phase, create-on-hand, update-on-hand, delete-on-hand
 */

import { FergusClient } from '../fergus-client.js';
import { normalizeListResponse } from '../utils/format-response.js';
import { checkOneOf, checkPageSize } from '../utils/list-params.js';

/** sortField values the Partner API accepts for stock on hand. */
const STOCK_ON_HAND_SORT_FIELDS = ['dateEntered', 'lastModified'] as const;

export const manageStockToolDefinition = {
  name: 'manage-stock',
  description: 'Manage stock. Actions: list-used (stock used on jobs), list-on-hand (all stock on hand), list-on-hand-by-phase (stock on hand for a specific phase), create-on-hand, update-on-hand, delete-on-hand. Stock on hand can be created from a pricebook item or with manual details. list-used returns stock used from filterDateFrom (default 90 days ago) in pages of up to 5000 rows, so use a recent start date where possible; it has no search or page size.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list-used', 'list-on-hand', 'list-on-hand-by-phase', 'create-on-hand', 'update-on-hand', 'delete-on-hand'],
        description: 'The action to perform',
      },
      jobPhaseId: {
        type: 'string',
        description: 'Job phase ID (required for: list-on-hand-by-phase, create-on-hand, update-on-hand, delete-on-hand)',
      },
      stockOnHandId: {
        type: 'string',
        description: 'Stock on hand item ID (required for: update-on-hand, delete-on-hand)',
      },
      // list params
      filterSearchText: {
        type: 'string',
        description: 'Search text, matched on the item description (for: list-on-hand, list-on-hand-by-phase)',
      },
      filterDateFrom: {
        type: 'string',
        description: 'Only stock used on or after this date, yyyy-mm-dd, at most 180 days ago. Default: 90 days ago. (for: list-used)',
      },
      dateEntered: {
        type: 'string',
        description: 'ISO 8601 date-time. With sortField dateEntered (the default), start the list at this time: items entered at or after it when sortOrder is asc, at or before it when desc. Applies to the first page only. (for: list-on-hand, list-on-hand-by-phase)',
      },
      lastModified: {
        type: 'string',
        description: 'ISO 8601 date-time. With sortField lastModified, start the list at this time: items modified at or after it when sortOrder is asc, at or before it when desc. Applies to the first page only. (for: list-on-hand, list-on-hand-by-phase)',
      },
      sortField: {
        type: 'string',
        enum: [...STOCK_ON_HAND_SORT_FIELDS],
        description: 'Field to sort by (for: list-on-hand, list-on-hand-by-phase, default: dateEntered)',
        default: 'dateEntered',
      },
      sortOrder: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort order (for: list-on-hand, list-on-hand-by-phase)',
        default: 'asc',
      },
      pageSize: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        description: 'Max results per page, 1-100 (for: list-on-hand, list-on-hand-by-phase, default: 50)',
        default: 50,
      },
      pageCursor: {
        type: 'string',
        description: 'Pagination cursor (for: list-used, list-on-hand, list-on-hand-by-phase)',
      },
      // create params - pricebook item
      priceBookLineItemId: {
        type: 'number',
        description: 'Pricebook line item ID. When provided, only itemQuantity is needed — description, price, and cost come from the pricebook. (for: create-on-hand)',
      },
      // create/update params - manual
      itemDescription: {
        type: 'string',
        description: 'Item description (required for create-on-hand without priceBookLineItemId; for: create-on-hand, update-on-hand)',
      },
      itemPrice: {
        type: 'number',
        description: 'Price per unit (required for create-on-hand without priceBookLineItemId; for: create-on-hand, update-on-hand)',
      },
      itemCost: {
        type: 'number',
        description: 'Cost per unit (required for create-on-hand without priceBookLineItemId; for: create-on-hand, update-on-hand)',
      },
      itemQuantity: {
        type: 'number',
        description: 'Quantity (required for: create-on-hand; for: update-on-hand)',
      },
      salesAccountId: {
        type: 'number',
        description: 'Sales account ID override (for: create-on-hand, update-on-hand)',
      },
      isLabour: {
        type: 'boolean',
        description: 'Whether this is a labour item (for: update-on-hand)',
      },
    },
    required: ['action'],
  },
};

export async function handleManageStock(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  switch (args.action) {
    case 'list-used':
      return handleListStockUsed(fergusClient, args);
    case 'list-on-hand':
      return handleListAllStockOnHand(fergusClient, args);
    case 'list-on-hand-by-phase':
      return handleListStockOnHandByPhase(fergusClient, args);
    case 'create-on-hand':
      return handleCreateStockOnHand(fergusClient, args);
    case 'update-on-hand':
      return handleUpdateStockOnHand(fergusClient, args);
    case 'delete-on-hand':
      return handleDeleteStockOnHand(fergusClient, args);
    default:
      throw new Error(`Unknown action: ${args.action}. Valid actions: list-used, list-on-hand, list-on-hand-by-phase, create-on-hand, update-on-hand, delete-on-hand`);
  }
}

// ===== LIST STOCK USED =====

async function handleListStockUsed(fergusClient: FergusClient, args: Record<string, any>) {
  // The API takes only a start date and a cursor here: no search or page size.
  const { filterDateFrom, pageCursor } = args;
  if (filterDateFrom !== undefined && filterDateFrom !== null && filterDateFrom !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(String(filterDateFrom))) {
    throw new Error('filterDateFrom must be a date in yyyy-mm-dd format, such as 2026-10-01. Nothing was listed.');
  }

  const params = new URLSearchParams();
  if (filterDateFrom) params.append('filterDateFrom', filterDateFrom);
  if (pageCursor) params.append('pageCursor', pageCursor);

  const stock = await fergusClient.get(`/stockUsed?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(normalizeListResponse(stock), null, 2) }] };
}

// ===== STOCK ON HAND =====

function buildStockOnHandParams(args: Record<string, any>): URLSearchParams {
  const { filterSearchText, sortField, sortOrder, pageSize = 50, pageCursor, dateEntered, lastModified } = args;
  checkPageSize(pageSize);
  checkOneOf('sortField', sortField, STOCK_ON_HAND_SORT_FIELDS);
  // The API applies each date only when it matches the sort field, and
  // ignores it otherwise; say so rather than silently dropping it.
  const activeSort = sortField || 'dateEntered';
  if (dateEntered && activeSort !== 'dateEntered') {
    throw new Error('dateEntered only applies when sortField is dateEntered. Nothing was listed.');
  }
  if (lastModified && activeSort !== 'lastModified') {
    throw new Error('lastModified only applies when sortField is lastModified. Nothing was listed.');
  }

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  if (filterSearchText) params.append('filterSearchText', filterSearchText);
  if (sortField) params.append('sortField', sortField);
  if (sortOrder) params.append('sortOrder', sortOrder);
  if (dateEntered) params.append('dateEntered', dateEntered);
  if (lastModified) params.append('lastModified', lastModified);
  if (pageCursor) params.append('pageCursor', pageCursor);

  return params;
}

async function handleListAllStockOnHand(fergusClient: FergusClient, args: Record<string, any>) {
  const params = buildStockOnHandParams(args);
  const result = await fergusClient.get(`/phases/stockOnHand?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(normalizeListResponse(result), null, 2) }] };
}

async function handleListStockOnHandByPhase(fergusClient: FergusClient, args: Record<string, any>) {
  const { jobPhaseId } = args;
  if (!jobPhaseId) throw new Error('jobPhaseId is required for list-on-hand-by-phase action');

  const params = buildStockOnHandParams(args);
  const result = await fergusClient.get(`/phases/${jobPhaseId}/stockOnHand?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(normalizeListResponse(result), null, 2) }] };
}

async function handleCreateStockOnHand(fergusClient: FergusClient, args: Record<string, any>) {
  const { jobPhaseId, priceBookLineItemId, itemDescription, itemPrice, itemCost, itemQuantity, salesAccountId } = args;
  if (!jobPhaseId) throw new Error('jobPhaseId is required for create-on-hand action');
  if (itemQuantity === undefined) throw new Error('itemQuantity is required for create-on-hand action');

  let requestBody: any;
  if (priceBookLineItemId) {
    requestBody = { priceBookLineItemId, itemQuantity };
    if (salesAccountId !== undefined) requestBody.salesAccountId = salesAccountId;
  } else {
    if (!itemDescription || itemPrice === undefined || itemCost === undefined) {
      throw new Error('When not using priceBookLineItemId, itemDescription, itemPrice, and itemCost are required for create-on-hand action');
    }
    requestBody = { itemDescription, itemPrice, itemCost, itemQuantity };
    if (salesAccountId !== undefined) requestBody.salesAccountId = salesAccountId;
  }

  const result = await fergusClient.post(`/phases/${jobPhaseId}/stockOnHand`, requestBody);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

async function handleUpdateStockOnHand(fergusClient: FergusClient, args: Record<string, any>) {
  const { jobPhaseId, stockOnHandId } = args;
  if (!jobPhaseId || !stockOnHandId) {
    throw new Error('jobPhaseId and stockOnHandId are required for update-on-hand action');
  }

  const requestBody: any = {};
  if (args.itemDescription !== undefined) requestBody.itemDescription = args.itemDescription;
  if (args.itemPrice !== undefined) requestBody.itemPrice = args.itemPrice;
  if (args.itemCost !== undefined) requestBody.itemCost = args.itemCost;
  if (args.itemQuantity !== undefined) requestBody.itemQuantity = args.itemQuantity;
  if (args.salesAccountId !== undefined) requestBody.salesAccountId = args.salesAccountId;
  if (args.isLabour !== undefined) requestBody.isLabour = args.isLabour;

  if (Object.keys(requestBody).length === 0) {
    throw new Error('At least one field must be provided to update stock on hand');
  }

  const result = await fergusClient.patch(`/phases/${jobPhaseId}/stockOnHand/${stockOnHandId}`, requestBody);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

async function handleDeleteStockOnHand(fergusClient: FergusClient, args: Record<string, any>) {
  const { jobPhaseId, stockOnHandId } = args;
  if (!jobPhaseId || !stockOnHandId) {
    throw new Error('jobPhaseId and stockOnHandId are required for delete-on-hand action');
  }

  const result = await fergusClient.delete(`/phases/${jobPhaseId}/stockOnHand/${stockOnHandId}`);
  // A successful delete has no content, which the client returns as {}.
  const empty = result == null || (typeof result === 'object' && Object.keys(result as object).length === 0);
  return { content: [{ type: 'text' as const, text: JSON.stringify(empty ? { success: true } : result, null, 2) }] };
}
