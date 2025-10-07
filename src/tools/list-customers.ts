/**
 * List Customers Tool
 * Lists customers with optional search and pagination
 */

import { FergusClient } from '../fergus-client.js';

export const listCustomersToolDefinition = {
  name: 'list-customers',
  description: 'List customers with optional search filtering',
  inputSchema: {
    type: 'object',
    properties: {
      filterSearchText: {
        type: 'string',
        description: 'Search text to filter customers',
      },
      pageSize: {
        type: 'number',
        description: 'Maximum number of customers to return per page',
        default: 10,
      },
      sortField: {
        type: 'string',
        description: 'Field to sort by',
        default: 'createdAt',
      },
      sortOrder: {
        type: 'string',
        description: 'Sort order: asc or desc',
        enum: ['asc', 'desc'],
        default: 'asc',
      },
      pageCursor: {
        type: 'string',
        description: 'Pagination cursor for next page',
        default: '0',
      },
    },
  },
};

export async function handleListCustomers(
  fergusClient: FergusClient,
  args: {
    filterSearchText?: string;
    pageSize?: number;
    sortField?: string;
    sortOrder?: string;
    pageCursor?: string;
  }
) {
  const {
    filterSearchText,
    pageSize = 10,
    sortField = 'createdAt',
    sortOrder = 'asc',
    pageCursor = '0',
  } = args || {};

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  params.append('sortField', sortField);
  params.append('sortOrder', sortOrder);
  params.append('pageCursor', pageCursor);

  if (filterSearchText) params.append('filterSearchText', filterSearchText);

  const endpoint = `/customers?${params.toString()}`;
  const customers = await fergusClient.get(endpoint);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(customers, null, 2),
      },
    ],
  };
}
