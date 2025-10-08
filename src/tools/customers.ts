/**
 * Customer Tools
 * All customer-related operations (get, list, create, update)
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { FergusClient } from '../fergus-client.js';
import { formatResponse, isChatGPT } from '../utils/format-response.js';
import { addressSchema, contactSchema } from './schemas.js';

// ===== GET CUSTOMER =====

export const getCustomerToolDefinition = {
  name: 'get-customer',
  description: 'Get details of a specific customer by ID',
  annotations: {
    readOnlyHint: true
  },
  _meta: {
    'openai/outputTemplate': 'ui://customers/customer-detail.html',
    'openai/toolInvocation/invoking': 'Loading customer details...',
    'openai/toolInvocation/invoked': 'Customer details loaded'
  },
  inputSchema: {
    type: 'object',
    properties: {
      customerId: {
        type: 'string',
        description: 'The ID of the customer to retrieve',
      },
    },
    required: ['customerId'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      customer: {
        type: 'object',
        properties: {
          id: { type: ['number', 'string'] },
          name: { type: 'string' },
          customerFullName: { type: 'string' },
          email: { type: ['string', 'null'] },
          phone: { type: ['string', 'null'] },
          mainContact: {
            type: ['object', 'null'],
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
              phone: { type: 'string' },
              position: { type: 'string' },
            },
          },
          physicalAddress: {
            type: ['object', 'null'],
            properties: {
              line1: { type: 'string' },
              line2: { type: 'string' },
              city: { type: 'string' },
              state: { type: 'string' },
              postalCode: { type: 'string' },
              country: { type: 'string' },
            },
          },
          postalAddress: {
            type: ['object', 'null'],
            properties: {
              line1: { type: 'string' },
              line2: { type: 'string' },
              city: { type: 'string' },
              state: { type: 'string' },
              postalCode: { type: 'string' },
              country: { type: 'string' },
            },
          },
        },
      },
    },
  },
};

export async function handleGetCustomer(
  fergusClient: FergusClient,
  args: { customerId: string },
  meta?: Record<string, any>
): Promise<CallToolResult> {
  // Log client detection
  const isChatGPTClient = isChatGPT(meta);
  console.log('[get-customer] Client detected:', isChatGPTClient ? 'ChatGPT' : 'Claude', meta?.['openai/userAgent'] || 'unknown');

  const { customerId } = args;

  if (!customerId) {
    throw new Error('customerId is required');
  }

  const customer = await fergusClient.get(`/customers/${customerId}`) as any;

  // Create structured customer data
  const structuredCustomer = {
    id: customer.id || customer.customerId,
    name: customer.customerFullName || customer.name,
    email: customer.mainContact?.email || customer.email,
    phone: customer.mainContact?.phone || customer.phone,
    mainContact: customer.mainContact,
    physicalAddress: customer.physicalAddress,
    postalAddress: customer.postalAddress,
    customerFullName: customer.customerFullName,
  };

  // Build structured content
  const structuredContent = {
    customer: structuredCustomer,
  };

  // Format response based on client type
  return formatResponse(structuredContent, meta);
}

// ===== LIST CUSTOMERS =====

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

// ===== CREATE CUSTOMER =====

export const createCustomerToolDefinition = {
  name: 'create-customer',
  description: 'Create a new customer with required customerFullName and mainContact information.',
  inputSchema: {
    type: 'object',
    properties: {
      customerFullName: {
        type: 'string',
        description: 'Full name of the customer (must not be empty)',
      },
      mainContact: {
        ...contactSchema,
        description: 'Main contact information for the customer',
        required: ['firstName'],
      },
      physicalAddress: {
        ...addressSchema,
        description: 'Physical address (optional)',
      },
      postalAddress: {
        ...addressSchema,
        description: 'Postal address (optional, same structure as physicalAddress)',
      },
    },
    required: ['customerFullName', 'mainContact'],
  },
};

export async function handleCreateCustomer(
  fergusClient: FergusClient,
  args: {
    customerFullName: string;
    mainContact: {
      firstName: string;
      lastName?: string;
      position?: string;
      company?: string;
      contactItems?: Array<{
        contactType: 'email' | 'phone' | 'mobile' | 'other' | 'fax' | 'website';
        contactValue: string;
      }>;
    };
    physicalAddress?: any;
    postalAddress?: any;
  }
) {
  const { customerFullName, mainContact, physicalAddress, postalAddress } = args;

  const requestBody: any = {
    customerFullName,
    mainContact,
  };

  if (physicalAddress) {
    requestBody.physicalAddress = physicalAddress;
  }

  if (postalAddress) {
    requestBody.postalAddress = postalAddress;
  }

  const customer = await fergusClient.post('/customers', requestBody);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(customer, null, 2),
      },
    ],
  };
}

// ===== UPDATE CUSTOMER =====

export const updateCustomerToolDefinition = {
  name: 'update-customer',
  description: 'Update an existing customer. Requires customerId, customerFullName, and mainContact.',
  inputSchema: {
    type: 'object',
    properties: {
      customerId: {
        type: 'number',
        description: 'The ID of the customer to update',
      },
      customerFullName: {
        type: 'string',
        description: 'Full name of the customer (must not be empty)',
      },
      mainContact: {
        ...contactSchema,
        description: 'Main contact information for the customer',
        required: ['firstName'],
      },
      physicalAddress: {
        ...addressSchema,
        description: 'Physical address (optional)',
      },
      postalAddress: {
        ...addressSchema,
        description: 'Postal address (optional, same structure as physicalAddress)',
      },
    },
    required: ['customerId', 'customerFullName', 'mainContact'],
  },
};

export async function handleUpdateCustomer(
  fergusClient: FergusClient,
  args: {
    customerId: number;
    customerFullName: string;
    mainContact: {
      firstName: string;
      lastName?: string;
      position?: string;
      company?: string;
      contactItems?: Array<{
        contactType: 'email' | 'phone' | 'mobile' | 'other' | 'fax' | 'website';
        contactValue: string;
      }>;
    };
    physicalAddress?: any;
    postalAddress?: any;
  }
) {
  const { customerId, customerFullName, mainContact, physicalAddress, postalAddress } = args;

  const requestBody: any = {
    customerFullName,
    mainContact,
  };

  if (physicalAddress) {
    requestBody.physicalAddress = physicalAddress;
  }

  if (postalAddress) {
    requestBody.postalAddress = postalAddress;
  }

  const customer = await fergusClient.put(`/customers/${customerId}`, requestBody);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(customer, null, 2),
      },
    ],
  };
}
