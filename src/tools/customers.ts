/**
 * Customer Tools (consolidated)
 * manage-customers: get, list, create, update, delete
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { FergusClient } from '../fergus-client.js';
import { formatResponse, isChatGPT } from '../utils/format-response.js';
import { addressSchema, contactSchema } from './schemas.js';

export const manageCustomersToolDefinition = {
  name: 'manage-customers',
  description: 'Manage customers. Actions: get, list, create, update, delete',
  _meta: {
    'openai/outputTemplate': 'ui://customers/customer-detail.html',
    'openai/toolInvocation/invoking': 'Loading customer data...',
    'openai/toolInvocation/invoked': 'Customer data loaded'
  },
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['get', 'list', 'create', 'update', 'delete'],
        description: 'The action to perform',
      },
      customerId: {
        type: 'string',
        description: 'Customer ID (required for: get, update)',
      },
      // list params
      filterSearchText: {
        type: 'string',
        description: 'Search text to filter customers (for: list)',
      },
      pageSize: {
        type: 'number',
        description: 'Max results per page (for: list, default: 10)',
        default: 10,
      },
      sortField: {
        type: 'string',
        description: 'Field to sort by (for: list, default: createdAt)',
        default: 'createdAt',
      },
      sortOrder: {
        type: 'string',
        description: 'Sort order: asc or desc (for: list)',
        enum: ['asc', 'desc'],
        default: 'asc',
      },
      pageCursor: {
        type: 'string',
        description: 'Pagination cursor (for: list)',
        default: '0',
      },
      // create/update params
      customerFullName: {
        type: 'string',
        description: 'Full name of the customer (required for: create, update)',
      },
      mainContact: {
        ...contactSchema,
        description: 'Main contact information (required for: create, update)',
        required: ['firstName'],
      },
      physicalAddress: {
        ...addressSchema,
        description: 'Physical address (for: create, update)',
      },
      postalAddress: {
        ...addressSchema,
        description: 'Postal address (for: create, update)',
      },
    },
    required: ['action'],
  },
};

export async function handleManageCustomers(
  fergusClient: FergusClient,
  args: Record<string, any>,
  meta?: Record<string, any>
): Promise<CallToolResult> {
  switch (args.action) {
    case 'get':
      return handleGetCustomer(fergusClient, args, meta);
    case 'list':
      return handleListCustomers(fergusClient, args, meta);
    case 'create':
      return handleCreateCustomer(fergusClient, args);
    case 'update':
      return handleUpdateCustomer(fergusClient, args);
    case 'delete':
      return handleDeleteCustomer(fergusClient, args);
    default:
      throw new Error(`Unknown action: ${args.action}. Valid actions: get, list, create, update, delete`);
  }
}

// ===== GET CUSTOMER =====

async function handleGetCustomer(
  fergusClient: FergusClient,
  args: Record<string, any>,
  meta?: Record<string, any>
): Promise<CallToolResult> {
  const isChatGPTClient = isChatGPT(meta);
  console.log('[manage-customers:get] Client detected:', isChatGPTClient ? 'ChatGPT' : 'Claude');

  const { customerId } = args;
  if (!customerId) {
    throw new Error('customerId is required for get action');
  }

  const response = await fergusClient.get(`/customers/${customerId}`) as any;
  const customer = response.data || response;

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

  return formatResponse({ customer: structuredCustomer }, meta);
}

// ===== LIST CUSTOMERS =====

async function handleListCustomers(
  fergusClient: FergusClient,
  args: Record<string, any>,
  meta?: Record<string, any>
): Promise<CallToolResult> {
  const isChatGPTClient = isChatGPT(meta);
  console.log('[manage-customers:list] Client detected:', isChatGPTClient ? 'ChatGPT' : 'Claude');

  const {
    filterSearchText,
    pageSize = 10,
    sortField = 'createdAt',
    sortOrder = 'asc',
    pageCursor = '0',
  } = args;

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  params.append('sortField', sortField);
  params.append('sortOrder', sortOrder);
  params.append('pageCursor', pageCursor);
  if (filterSearchText) params.append('filterSearchText', filterSearchText);

  const response = await fergusClient.get(`/customers?${params.toString()}`) as any;
  const customers = Array.isArray(response) ? response : (response.data || response.customers || []);
  const totalCount = response.total || response.totalCount || customers.length;
  const nextCursor = response.nextCursor || response.pageCursor || null;

  const structuredCustomers = customers.map((customer: any) => {
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

  return formatResponse({
    customers: structuredCustomers,
    pagination: { count: customers.length, total: totalCount, nextCursor },
  }, meta);
}

// ===== CREATE CUSTOMER =====

async function handleCreateCustomer(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { customerFullName, mainContact, physicalAddress, postalAddress } = args;
  if (!customerFullName || !mainContact) {
    throw new Error('customerFullName and mainContact are required for create action');
  }

  const requestBody: any = { customerFullName, mainContact };
  if (physicalAddress) requestBody.physicalAddress = physicalAddress;
  if (postalAddress) requestBody.postalAddress = postalAddress;

  const customer = await fergusClient.post('/customers', requestBody);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(customer, null, 2) }],
  };
}

// ===== UPDATE CUSTOMER =====

async function handleUpdateCustomer(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { customerId, customerFullName, mainContact, physicalAddress, postalAddress } = args;
  if (!customerId || !customerFullName || !mainContact) {
    throw new Error('customerId, customerFullName, and mainContact are required for update action');
  }

  const requestBody: any = { customerFullName, mainContact };
  if (physicalAddress) requestBody.physicalAddress = physicalAddress;
  if (postalAddress) requestBody.postalAddress = postalAddress;

  const customer = await fergusClient.put(`/customers/${customerId}`, requestBody);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(customer, null, 2) }],
  };
}

// ===== DELETE CUSTOMER =====

async function handleDeleteCustomer(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { customerId } = args;
  if (!customerId) {
    throw new Error('customerId is required for delete action');
  }

  const result = await fergusClient.delete(`/customers/${customerId}`);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }, null, 2) }],
  };
}
