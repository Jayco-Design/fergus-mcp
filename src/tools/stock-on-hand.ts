/**
 * Stock On Hand Tools
 * manage-stock-on-hand: list, list-by-phase, create, update, delete
 */

import { FergusClient } from '../fergus-client.js';

export const manageStockOnHandToolDefinition = {
  name: 'manage-stock-on-hand',
  description: 'Manage stock on hand for job phases. Actions: list (all stock on hand), list-by-phase (stock for a specific phase), create, update, delete. Stock on hand can be created from a pricebook item or with manual details.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'list-by-phase', 'create', 'update', 'delete'],
        description: 'The action to perform',
      },
      jobPhaseId: {
        type: 'string',
        description: 'Job phase ID (required for: list-by-phase, create, update, delete)',
      },
      stockOnHandId: {
        type: 'string',
        description: 'Stock on hand item ID (required for: update, delete)',
      },
      // list params
      filterSearchText: {
        type: 'string',
        description: 'Search text to filter by item description (for: list, list-by-phase)',
      },
      sortField: {
        type: 'string',
        enum: ['dateEntered', 'lastModified'],
        description: 'Field to sort by (for: list, list-by-phase, default: dateEntered)',
        default: 'dateEntered',
      },
      sortOrder: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort order (for: list, list-by-phase)',
        default: 'asc',
      },
      pageSize: {
        type: 'number',
        description: 'Max results per page (for: list, list-by-phase, default: 50)',
        default: 50,
      },
      pageCursor: {
        type: 'string',
        description: 'Pagination cursor (for: list, list-by-phase)',
      },
      // create params - pricebook item
      priceBookLineItemId: {
        type: 'number',
        description: 'Pricebook line item ID. When provided, only itemQuantity is needed — description, price, and cost come from the pricebook. (for: create)',
      },
      // create params - manual
      itemDescription: {
        type: 'string',
        description: 'Item description (required for create without priceBookLineItemId; for: create, update)',
      },
      itemPrice: {
        type: 'number',
        description: 'Price per unit (required for create without priceBookLineItemId; for: create, update)',
      },
      itemCost: {
        type: 'number',
        description: 'Cost per unit (required for create without priceBookLineItemId; for: create, update)',
      },
      itemQuantity: {
        type: 'number',
        description: 'Quantity (required for: create; for: update)',
      },
      salesAccountId: {
        type: 'number',
        description: 'Sales account ID override (for: create, update)',
      },
      // update params
      isLabour: {
        type: 'boolean',
        description: 'Whether this is a labour item (for: update)',
      },
    },
    required: ['action'],
  },
};

export async function handleManageStockOnHand(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  switch (args.action) {
    case 'list':
      return handleListAllStockOnHand(fergusClient, args);
    case 'list-by-phase':
      return handleListStockOnHandByPhase(fergusClient, args);
    case 'create':
      return handleCreateStockOnHand(fergusClient, args);
    case 'update':
      return handleUpdateStockOnHand(fergusClient, args);
    case 'delete':
      return handleDeleteStockOnHand(fergusClient, args);
    default:
      throw new Error(`Unknown action: ${args.action}. Valid actions: list, list-by-phase, create, update, delete`);
  }
}

function buildStockOnHandParams(args: Record<string, any>): URLSearchParams {
  const { filterSearchText, sortField, sortOrder, pageSize = 50, pageCursor } = args;

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  if (filterSearchText) params.append('filterSearchText', filterSearchText);
  if (sortField) params.append('sortField', sortField);
  if (sortOrder) params.append('sortOrder', sortOrder);
  if (pageCursor) params.append('pageCursor', pageCursor);

  return params;
}

async function handleListAllStockOnHand(fergusClient: FergusClient, args: Record<string, any>) {
  const params = buildStockOnHandParams(args);
  const result = await fergusClient.get(`/phases/stockOnHand?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

async function handleListStockOnHandByPhase(fergusClient: FergusClient, args: Record<string, any>) {
  const { jobPhaseId } = args;
  if (!jobPhaseId) throw new Error('jobPhaseId is required for list-by-phase action');

  const params = buildStockOnHandParams(args);
  const result = await fergusClient.get(`/phases/${jobPhaseId}/stockOnHand?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

async function handleCreateStockOnHand(fergusClient: FergusClient, args: Record<string, any>) {
  const { jobPhaseId, priceBookLineItemId, itemDescription, itemPrice, itemCost, itemQuantity, salesAccountId } = args;
  if (!jobPhaseId) throw new Error('jobPhaseId is required for create action');
  if (itemQuantity === undefined) throw new Error('itemQuantity is required for create action');

  let requestBody: any;
  if (priceBookLineItemId) {
    requestBody = { priceBookLineItemId, itemQuantity };
    if (salesAccountId !== undefined) requestBody.salesAccountId = salesAccountId;
  } else {
    if (!itemDescription || itemPrice === undefined || itemCost === undefined) {
      throw new Error('When not using priceBookLineItemId, itemDescription, itemPrice, and itemCost are required for create action');
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
    throw new Error('jobPhaseId and stockOnHandId are required for update action');
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
    throw new Error('jobPhaseId and stockOnHandId are required for delete action');
  }

  const result = await fergusClient.delete(`/phases/${jobPhaseId}/stockOnHand/${stockOnHandId}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }, null, 2) }] };
}
