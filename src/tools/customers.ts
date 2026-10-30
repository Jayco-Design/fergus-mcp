/**
 * Customer Tools (consolidated)
 * manage-customers: get, list, create, update, delete
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { FergusClient } from '../fergus-client.js';
import { formatResponse, isChatGPT, extractPagination } from '../utils/format-response.js';
import { addressSchema, contactSchema, contactItemChangeProperties } from './schemas.js';
import { contactEmail, contactPhone, mapAddress } from '../utils/fergus-mappers.js';
import { applyContactItemChanges, assertContactItemInputs, hasContactItemChanges } from '../utils/contact-items.js';
import { existingRecordResult } from '../utils/existing-record.js';
import { checkOneOf, checkPageSize } from '../utils/list-params.js';

/** sortField values the Partner API accepts for this list. */
const CUSTOMER_SORT_FIELDS = ['name', 'createdAt'] as const;

export const manageCustomersToolDefinition = {
  name: 'manage-customers',
  description: 'Manage customers. Actions: get, list, create, update, delete. Create returns alreadyExists with the existing customer when a customer with that name already exists; nothing is created, so tell the user and offer to update it if their details differ. On update, anything not mentioned stays as it is. To add, change or remove a single phone number or email on the main contact, use addContactItems, updateContactItems or removeContactItems.',
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
        description: 'Customer ID (required for: get, update, delete)',
      },
      // list params
      filterSearchText: {
        type: 'string',
        description: 'Search text to filter customers (for: list)',
      },
      pageSize: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        description: 'Max results per page (for: list, default: 10)',
        default: 10,
      },
      sortField: {
        type: 'string',
        enum: [...CUSTOMER_SORT_FIELDS],
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
        description: 'Full name of the customer (required for: create; for update, kept if left out)',
      },
      mainContact: {
        ...contactSchema,
        description: 'Main contact information (required for: create). On update, fields left out are kept; mainContact.contactItems, if sent, replaces the list (keep existing items by their id from get).',
      },
      ...contactItemChangeProperties,
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
    email: contactEmail(customer.mainContact?.contactItems) || customer.email,
    phone: contactPhone(customer.mainContact?.contactItems) || customer.phone,
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
  checkPageSize(pageSize);
  checkOneOf('sortField', sortField, CUSTOMER_SORT_FIELDS);

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  params.append('sortField', sortField);
  params.append('sortOrder', sortOrder);
  params.append('pageCursor', pageCursor);
  if (filterSearchText) params.append('filterSearchText', filterSearchText);

  const response = await fergusClient.get(`/customers?${params.toString()}`) as any;
  const customers = Array.isArray(response) ? response : (response.data || response.customers || []);

  const structuredCustomers = customers.map((customer: any) => ({
    id: customer.id || customer.customerId,
    name: customer.customerFullName || customer.name,
    email: contactEmail(customer.mainContact?.contactItems) || customer.email,
    phone: contactPhone(customer.mainContact?.contactItems) || customer.phone,
    address: mapAddress(customer.physicalAddress),
  }));

  return formatResponse({
    customers: structuredCustomers,
    pagination: extractPagination(response),
  }, meta);
}

// ===== CREATE CUSTOMER =====

async function handleCreateCustomer(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { customerFullName, mainContact, physicalAddress, postalAddress } = args;
  if (!customerFullName || !mainContact?.firstName) {
    throw new Error('customerFullName and mainContact (with firstName) are required for create action');
  }

  const requestBody: any = { customerFullName, mainContact };
  if (physicalAddress) requestBody.physicalAddress = physicalAddress;
  if (postalAddress) requestBody.postalAddress = postalAddress;

  const result = await fergusClient.createOrFindExisting('/customers', requestBody);
  if (!result.created) {
    return existingRecordResult(
      fergusClient,
      result.location,
      `A customer named "${customerFullName}" already exists. Nothing was created; use update to change it.`
    );
  }
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result.body, null, 2) }],
  };
}

// ===== UPDATE CUSTOMER =====

async function handleUpdateCustomer(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { customerId, customerFullName, physicalAddress, postalAddress } = args;
  if (!customerId) {
    throw new Error('customerId is required for update action');
  }
  const mainContactArg = args.mainContact ?? {};
  assertContactItemInputs({ ...args, contactItems: mainContactArg.contactItems }, 'update');
  const changesItems = hasContactItemChanges(args);

  // PUT /customers/:id needs customerFullName and mainContact.firstName, so read
  // the customer for whatever the caller didn't send. Main contact fields left
  // out are kept by the API, and its contact items are only replaced when sent.
  let current: any;
  if (!customerFullName || !mainContactArg.firstName || changesItems) {
    const response: any = await fergusClient.get(`/customers/${customerId}`);
    current = response?.data ?? response;
  }

  const mainContact: any = { ...mainContactArg, firstName: mainContactArg.firstName || current?.mainContact?.firstName };
  if (!mainContact.firstName) {
    throw new Error(`Customer ${customerId}'s main contact has no first name on record; send mainContact.firstName. Nothing was changed.`);
  }
  if (changesItems) {
    mainContact.contactItems = applyContactItemChanges(current?.mainContact?.contactItems, args, 'update');
  }

  const requestBody: any = { customerFullName: customerFullName || current?.customerFullName, mainContact };
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
