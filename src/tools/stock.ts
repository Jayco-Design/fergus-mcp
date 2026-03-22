/**
 * Stock Tools
 * manage-stock: list-used, list-on-hand, list-on-hand-by-phase, create-on-hand, update-on-hand, delete-on-hand
 */

import { FergusClient } from '../fergus-client.js';

export const manageStockToolDefinition = {
  name: 'manage-stock',
  description:
    'Manage stock. Actions: list-used (invoiced materials), list-on-hand (all SOH across phases), list-on-hand-by-phase (SOH for a specific job phase), create-on-hand (add SOH item to phase), update-on-hand (update SOH item), delete-on-hand (remove SOH item)',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'list-used',
          'list-on-hand',
          'list-on-hand-by-phase',
          'create-on-hand',
          'update-on-hand',
          'delete-on-hand',
        ],
        description: 'The action to perform',
      },
      // Common parameters
      pageSize: {
        type: 'number',
        description: 'Max results per page (for: list-used, list-on-hand, list-on-hand-by-phase; default: 50)',
        default: 50,
      },
      pageCursor: {
        type: 'string',
        description: 'Pagination cursor (for: list-used, list-on-hand, list-on-hand-by-phase)',
      },
      filterSearchText: {
        type: 'string',
        description: 'Search text to filter by description (for: list-used, list-on-hand, list-on-hand-by-phase)',
      },
      // SOH-specific parameters
      jobPhaseId: {
        type: 'string',
        description: 'Job phase ID (required for: list-on-hand-by-phase, create-on-hand, update-on-hand, delete-on-hand)',
      },
      stockOnHandId: {
        type: 'string',
        description: 'Stock on hand item ID (required for: update-on-hand, delete-on-hand)',
      },
      sortField: {
        type: 'string',
        enum: ['dateEntered', 'lastModified'],
        description: 'Sort field (for: list-on-hand, list-on-hand-by-phase; default: dateEntered)',
      },
      sortOrder: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort order (for: list-on-hand, list-on-hand-by-phase; default: asc)',
      },
      // Create parameters - pricebook mode
      priceBookLineItemId: {
        type: 'number',
        description: 'Pricebook line item ID to create SOH from (for: create-on-hand, use this OR manual fields)',
      },
      // Create/Update parameters - manual mode
      itemDescription: {
        type: 'string',
        description: 'Item description (for: create-on-hand manual mode, update-on-hand)',
      },
      itemPrice: {
        type: 'number',
        description: 'Charge price per unit (for: create-on-hand manual mode, update-on-hand)',
      },
      itemCost: {
        type: 'number',
        description: 'Cost price per unit (for: create-on-hand manual mode, update-on-hand)',
      },
      itemQuantity: {
        type: 'number',
        description: 'Quantity (for: create-on-hand, update-on-hand)',
      },
      salesAccountId: {
        type: 'number',
        description: 'Sales account ID (optional for: create-on-hand, update-on-hand)',
      },
      isLabour: {
        type: 'boolean',
        description: 'Whether this is a labour item (optional for: update-on-hand)',
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
      return handleListOnHand(fergusClient, args);
    case 'list-on-hand-by-phase':
      return handleListOnHandByPhase(fergusClient, args);
    case 'create-on-hand':
      return handleCreateOnHand(fergusClient, args);
    case 'update-on-hand':
      return handleUpdateOnHand(fergusClient, args);
    case 'delete-on-hand':
      return handleDeleteOnHand(fergusClient, args);
    default:
      throw new Error(
        `Unknown action: ${args.action}. Valid actions: list-used, list-on-hand, list-on-hand-by-phase, create-on-hand, update-on-hand, delete-on-hand`
      );
  }
}

// --- Stock Used (invoiced materials) ---

async function handleListStockUsed(fergusClient: FergusClient, args: Record<string, any>) {
  const { filterSearchText, pageSize = 50, pageCursor } = args;

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  if (filterSearchText) params.append('filterSearchText', filterSearchText);
  if (pageCursor) params.append('pageCursor', pageCursor);

  const stock = await fergusClient.get(`/stockUsed?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(stock, null, 2) }] };
}

// --- Stock On Hand ---

function buildSOHQueryParams(args: Record<string, any>): URLSearchParams {
  const { pageSize = 50, pageCursor, filterSearchText, sortField, sortOrder } = args;
  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  if (pageCursor) params.append('pageCursor', pageCursor);
  if (filterSearchText) params.append('filterSearchText', filterSearchText);
  if (sortField) params.append('sortField', sortField);
  if (sortOrder) params.append('sortOrder', sortOrder);
  return params;
}

async function handleListOnHand(fergusClient: FergusClient, args: Record<string, any>) {
  const params = buildSOHQueryParams(args);
  const result = await fergusClient.get(`/phases/stockOnHand?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

async function handleListOnHandByPhase(fergusClient: FergusClient, args: Record<string, any>) {
  const { jobPhaseId } = args;
  if (!jobPhaseId) {
    throw new Error('jobPhaseId is required for list-on-hand-by-phase');
  }
  const params = buildSOHQueryParams(args);
  const result = await fergusClient.get(`/phases/${jobPhaseId}/stockOnHand?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

async function handleCreateOnHand(fergusClient: FergusClient, args: Record<string, any>) {
  const { jobPhaseId, priceBookLineItemId, itemDescription, itemPrice, itemCost, itemQuantity, salesAccountId } = args;
  if (!jobPhaseId) {
    throw new Error('jobPhaseId is required for create-on-hand');
  }

  let requestBody: Record<string, any>;

  if (priceBookLineItemId) {
    // Pricebook mode
    if (!itemQuantity) {
      throw new Error('itemQuantity is required when using priceBookLineItemId');
    }
    requestBody = { priceBookLineItemId, itemQuantity };
  } else {
    // Manual mode
    if (!itemDescription || itemPrice === undefined || itemCost === undefined || !itemQuantity) {
      throw new Error(
        'Manual mode requires itemDescription, itemPrice, itemCost, and itemQuantity'
      );
    }
    requestBody = { itemDescription, itemPrice, itemCost, itemQuantity };
  }

  if (salesAccountId !== undefined) {
    requestBody.salesAccountId = salesAccountId;
  }

  const result = await fergusClient.post(`/phases/${jobPhaseId}/stockOnHand`, requestBody);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

async function handleUpdateOnHand(fergusClient: FergusClient, args: Record<string, any>) {
  const { jobPhaseId, stockOnHandId, itemDescription, itemPrice, itemCost, itemQuantity, salesAccountId, isLabour } = args;
  if (!jobPhaseId) {
    throw new Error('jobPhaseId is required for update-on-hand');
  }
  if (!stockOnHandId) {
    throw new Error('stockOnHandId is required for update-on-hand');
  }

  const requestBody: Record<string, any> = {};
  if (itemDescription !== undefined) requestBody.itemDescription = itemDescription;
  if (itemPrice !== undefined) requestBody.itemPrice = itemPrice;
  if (itemCost !== undefined) requestBody.itemCost = itemCost;
  if (itemQuantity !== undefined) requestBody.itemQuantity = itemQuantity;
  if (salesAccountId !== undefined) requestBody.salesAccountId = salesAccountId;
  if (isLabour !== undefined) requestBody.isLabour = isLabour;

  if (Object.keys(requestBody).length === 0) {
    throw new Error('At least one field must be provided for update-on-hand');
  }

  const result = await fergusClient.patch(`/phases/${jobPhaseId}/stockOnHand/${stockOnHandId}`, requestBody);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

async function handleDeleteOnHand(fergusClient: FergusClient, args: Record<string, any>) {
  const { jobPhaseId, stockOnHandId } = args;
  if (!jobPhaseId) {
    throw new Error('jobPhaseId is required for delete-on-hand');
  }
  if (!stockOnHandId) {
    throw new Error('stockOnHandId is required for delete-on-hand');
  }

  await fergusClient.delete(`/phases/${jobPhaseId}/stockOnHand/${stockOnHandId}`);
  return { content: [{ type: 'text' as const, text: 'Stock on hand item deleted successfully.' }] };
}
