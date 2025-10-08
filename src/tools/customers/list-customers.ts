/**
 * List Customers Tool
 * Lists customers with optional search and pagination
 */

import { FergusClient } from '../../fergus-client.js';

export const listCustomersToolDefinition = {
  name: 'list-customers',
  description: 'List customers with optional search filtering',
  annotations: {
    readOnlyHint: true,
    'openai/outputTemplate': 'ui://customers/list-customers.html'
  },
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
  const response = await fergusClient.get(endpoint) as any;

  // Extract customers array from response
  const customers = Array.isArray(response) ? response : (response.data || response.customers || []);
  const totalCount = response.total || response.totalCount || customers.length;
  const nextCursor = response.nextCursor || response.pageCursor || null;

  // Create a concise text summary
  const summary = `Found ${customers.length} customer(s)${totalCount > customers.length ? ` of ${totalCount} total` : ''}`;

  // Structure the data for better ChatGPT consumption
  const structuredCustomers = customers.map((customer: any) => ({
    id: customer.id || customer.customerId,
    name: customer.customerFullName || customer.name,
    email: customer.mainContact?.email || customer.email,
    phone: customer.mainContact?.phone || customer.phone,
    address: customer.physicalAddress ? {
      line1: customer.physicalAddress.line1,
      city: customer.physicalAddress.city,
      postalCode: customer.physicalAddress.postalCode,
      country: customer.physicalAddress.country,
    } : null,
  }));

  return {
    content: [
      {
        type: 'text' as const,
        text: `${summary}\n\n${JSON.stringify(structuredCustomers, null, 2)}`,
      },
    ],
    // Structured content for ChatGPT Apps to consume
    structuredContent: {
      customers: structuredCustomers,
      pagination: {
        count: customers.length,
        total: totalCount,
        nextCursor,
      },
    },
  };
}
