/**
 * Stock Tools
 * manage-stock: list-used
 */

import { FergusClient } from '../fergus-client.js';

export const manageStockToolDefinition = {
  name: 'manage-stock',
  description: 'Manage stock. Actions: list-used',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list-used'],
        description: 'The action to perform',
      },
      filterSearchText: {
        type: 'string',
        description: 'Search text (for: list-used)',
      },
      pageSize: {
        type: 'number',
        description: 'Max results per page (for: list-used, default: 50)',
        default: 50,
      },
      pageCursor: {
        type: 'string',
        description: 'Pagination cursor (for: list-used)',
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
    default:
      throw new Error(`Unknown action: ${args.action}. Valid actions: list-used`);
  }
}

async function handleListStockUsed(fergusClient: FergusClient, args: Record<string, any>) {
  const { filterSearchText, pageSize = 50, pageCursor } = args;

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  if (filterSearchText) params.append('filterSearchText', filterSearchText);
  if (pageCursor) params.append('pageCursor', pageCursor);

  const stock = await fergusClient.get(`/stockUsed?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(stock, null, 2) }] };
}
