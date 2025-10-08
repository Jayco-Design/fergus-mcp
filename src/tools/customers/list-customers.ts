/**
 * List Customers Tool
 * Lists customers with optional search and pagination
 */

import { FergusClient } from '../../fergus-client.js';
import { formatResponse, isChatGPT } from '../../utils/format-response.js';

export const listCustomersToolDefinition = {
  name: 'list-customers',
  description: 'Display an interactive visual list of customers with optional search filtering. Returns a widget with customer cards.',
  annotations: {
    readOnlyHint: true
  },
  _meta: {
    'openai/outputTemplate': 'ui://customers/list-customers.html',
    'openai/toolInvocation/invoking': 'Loading customers...',
    'openai/toolInvocation/invoked': 'Got customers'
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
  outputSchema: {
    type: 'object',
    properties: {
      customers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: ['number', 'string'] },
            name: { type: 'string' },
            email: { type: ['string', 'null'] },
            phone: { type: ['string', 'null'] },
            address: {
              type: ['object', 'null'],
              properties: {
                line1: { type: 'string' },
                city: { type: 'string' },
                postalCode: { type: 'string' },
                country: { type: 'string' },
              },
            },
          },
        },
      },
      pagination: {
        type: 'object',
        properties: {
          count: { type: 'number' },
          total: { type: 'number' },
          nextCursor: { type: ['string', 'null'] },
        },
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
  },
  meta?: Record<string, any>
) {
  // Log client detection
  const isChatGPTClient = isChatGPT(meta);
  console.log('[list-customers] Client detected:', isChatGPTClient ? 'ChatGPT' : 'Claude', meta?.['openai/userAgent'] || 'unknown');

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

  // Structure the data for better ChatGPT consumption
  const structuredCustomers = customers.map((customer: any) => {
    // Extract email and phone from mainContact.contactItems
    const contactItems = customer.mainContact?.contactItems || [];
    const emailItem = contactItems.find((c: any) => c.contactType === 'email');
    const phoneItem = contactItems.find((c: any) => c.contactType === 'phone' || c.contactType === 'mobile');

    return {
      id: customer.id || customer.customerId,
      name: customer.customerFullName || customer.name,
      email: emailItem?.contactValue || customer.email,
      phone: phoneItem?.contactValue || customer.phone,
      address: customer.physicalAddress ? {
        line1: customer.physicalAddress.address1,
        line2: customer.physicalAddress.address2,
        suburb: customer.physicalAddress.addressSuburb,
        city: customer.physicalAddress.addressCity,
        region: customer.physicalAddress.addressRegion,
        postalCode: customer.physicalAddress.addressPostcode,
        country: customer.physicalAddress.addressCountry,
      } : null,
    };
  });

  // Build structured content
  const structuredContent = {
    customers: structuredCustomers,
    pagination: {
      count: customers.length,
      total: totalCount,
      nextCursor,
    },
  };

  // Format response based on client type
  return formatResponse(structuredContent, meta);
}
