/**
 * User Tools (consolidated)
 * manage-users: get, list, update
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { assertContactItemInputs, hasContactItemChanges, userContactItemChanges } from '../utils/contact-items.js';
import { FergusClient } from '../fergus-client.js';
import { formatResponse, isChatGPT, extractPagination } from '../utils/format-response.js';
import { checkPageSize } from '../utils/list-params.js';

export const manageUsersToolDefinition = {
  name: 'manage-users',
  description: 'Manage users/team members. Actions: get, list, update',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['get', 'list', 'update'],
        description: 'The action to perform',
      },
      userId: {
        type: 'string',
        description: 'User ID (required for: get, update)',
      },
      // list params
      filterSearchText: {
        type: 'string',
        description: 'Search by first name, last name, or email (for: list)',
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
        description: 'Field to sort by (for: list)',
        enum: ['firstName', 'lastName', 'createdAt'],
        default: 'firstName',
      },
      sortOrder: {
        type: 'string',
        description: 'Sort order: asc or desc (for: list)',
        enum: ['asc', 'desc'],
        default: 'asc',
      },
      filterUserType: {
        type: 'string',
        description: 'Filter by user type (for: list)',
        enum: ['contractor', 'field_worker', 'apprentice', 'tradesman', 'advisor', 'full_user', 'time_sheet_only'],
      },
      filterStatus: {
        type: 'string',
        description: 'Filter by user status (for: list)',
        enum: ['active', 'disabled', 'invited'],
      },
      pageCursor: {
        type: 'string',
        description: 'Pagination cursor (for: list)',
        default: '0',
      },
      // update params
      firstName: {
        type: 'string',
        description: 'First name (for: update)',
      },
      lastName: {
        type: 'string',
        description: 'Last name (for: update)',
      },
      address: {
        type: 'object',
        description: 'User address (for: update). Only address1 is required; fields left out keep their current values. Address fields can\'t be cleared: the API has no way to empty them, so leave a field out rather than sending it empty.',
        properties: {
          address1: { type: 'string', description: 'Address line 1' },
          address2: { type: 'string', description: 'Address line 2' },
          addressSuburb: { type: 'string', description: 'Suburb' },
          addressCity: { type: 'string', description: 'City' },
          addressRegion: { type: 'string', description: 'Region/State' },
          addressPostcode: { type: 'string', description: 'Postcode/ZIP' },
          addressCountry: { type: 'string', description: 'Country' },
        },
        required: ['address1'],
      },
      payRate: {
        type: 'number',
        description: 'Pay rate (for: update)',
      },
      chargeOutRate: {
        type: 'number',
        description: 'Charge out rate (for: update)',
      },
      contactItems: {
        type: 'array',
        description: 'Contact items to save (for: update). Items with an id (from get) are changed in place; items without an id are added. Existing items are never removed. Users can\'t have email items.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'Id of an existing item (from get) to change it; leave out to add a new item' },
            contactType: { type: 'string', enum: ['phone', 'mobile', 'other', 'fax', 'website'] },
            contactValue: { type: 'string' },
          },
          required: ['contactType', 'contactValue'],
        },
      },
      addContactItems: {
        type: 'array',
        description: 'Contact items to add, keeping the existing ones (for: update). Cannot be combined with contactItems.',
        items: {
          type: 'object',
          properties: {
            contactType: { type: 'string', enum: ['phone', 'mobile', 'other', 'fax', 'website'] },
            contactValue: { type: 'string' },
          },
          required: ['contactType', 'contactValue'],
        },
      },
      updateContactItems: {
        type: 'array',
        description: 'Existing contact items to change, by id from get (for: update). Cannot be combined with contactItems.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            contactType: { type: 'string', enum: ['phone', 'mobile', 'other', 'fax', 'website'] },
            contactValue: { type: 'string' },
          },
          required: ['id'],
        },
      },
      removeContactItems: {
        type: 'array',
        description: 'Not supported for users: the API never removes a user\'s contact items, so this returns an error (for: update)',
        items: { type: 'number' },
      },
    },
    required: ['action'],
  },
};

export async function handleManageUsers(
  fergusClient: FergusClient,
  args: Record<string, any>,
  meta?: Record<string, any>
): Promise<CallToolResult> {
  switch (args.action) {
    case 'get':
      return handleGetUser(fergusClient, args);
    case 'list':
      return handleListUsers(fergusClient, args, meta);
    case 'update':
      return handleUpdateUser(fergusClient, args);
    default:
      throw new Error(`Unknown action: ${args.action}. Valid actions: get, list, update`);
  }
}

// ===== GET USER =====

async function handleGetUser(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { userId } = args;
  if (!userId) {
    throw new Error('userId is required for get action');
  }

  const user = await fergusClient.get(`/users/${userId}`);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(user, null, 2) }],
  };
}

// ===== LIST USERS =====

async function handleListUsers(
  fergusClient: FergusClient,
  args: Record<string, any>,
  meta?: Record<string, any>
): Promise<CallToolResult> {
  const isChatGPTClient = isChatGPT(meta);
  console.log('[manage-users:list] Client detected:', isChatGPTClient ? 'ChatGPT' : 'Claude');

  const {
    filterSearchText,
    pageSize = 10,
    sortField = 'firstName',
    sortOrder = 'asc',
    filterUserType,
    filterStatus,
    pageCursor = '0',
  } = args;
  checkPageSize(pageSize);

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  params.append('sortField', sortField);
  params.append('sortOrder', sortOrder);
  params.append('pageCursor', pageCursor);
  if (filterSearchText) params.append('filterSearchText', filterSearchText);
  if (filterUserType) params.append('filterUserType', filterUserType);
  if (filterStatus) params.append('filterStatus', filterStatus);

  const response = await fergusClient.get(`/users?${params.toString()}`) as any;
  const users = Array.isArray(response) ? response : (response.data || response.users || []);

  const structuredUsers = users.map((user: any) => ({
    id: user.id || user.userId,
    name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    email: user.email || user.contactItems?.find((c: any) => c.type === 'email')?.value,
    userType: user.userType,
    status: user.status,
    chargeOutRate: user.chargeOutRate,
  }));

  return formatResponse({
    users: structuredUsers,
    pagination: extractPagination(response),
  }, meta);
}

// ===== UPDATE USER =====

async function handleUpdateUser(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { userId, firstName, lastName, address, payRate, chargeOutRate } = args;
  if (!userId) {
    throw new Error('userId is required for update action');
  }
  assertContactItemInputs(args, 'update');

  let contactItems = args.contactItems;
  if (hasContactItemChanges(args)) {
    let currentItems: any[] | null = [];
    if (args.updateContactItems?.length) {
      const response: any = await fergusClient.get(`/users/${userId}`);
      currentItems = (response?.data ?? response)?.contactItems;
    }
    contactItems = userContactItemChanges(currentItems, args, 'update');
  }

  const requestBody: any = {};
  if (firstName !== undefined) requestBody.firstName = firstName;
  if (lastName !== undefined) requestBody.lastName = lastName;
  if (address !== undefined) {
    if (address === null || typeof address !== 'object' || Array.isArray(address)) {
      throw new Error('address must be an object with at least address1. Nothing was changed.');
    }
    // The API keeps the current value of any field left out, and has no way to
    // clear one: it rejects empty strings. Refuse an attempt to clear rather
    // than dropping it and reporting success.
    const cleared = Object.entries(address).filter(
      ([, value]) => value === null || (typeof value === 'string' && value.trim() === '')
    );
    if (cleared.length > 0) {
      const names = cleared.map(([key]) => `address.${key}`).join(', ');
      throw new Error(
        `${names} can't be cleared: the API has no way to empty an address field. Leave it out to keep its current value. Nothing was changed.`
      );
    }
    if (address.address1 === undefined) {
      throw new Error('address.address1 is required when updating a user\'s address. Nothing was changed.');
    }
    // The API takes text for every address field; send a number such as a
    // postcode as text, and refuse anything else.
    const sent: Record<string, string> = {};
    for (const [key, value] of Object.entries(address)) {
      if (typeof value === 'string') sent[key] = value;
      else if (typeof value === 'number' && Number.isFinite(value)) sent[key] = String(value);
      else throw new Error(`address.${key} must be text. Nothing was changed.`);
    }
    requestBody.address = sent;
  }
  if (payRate !== undefined) requestBody.payRate = payRate;
  if (chargeOutRate !== undefined) requestBody.chargeOutRate = chargeOutRate;
  if (contactItems !== undefined) requestBody.contactItems = contactItems;

  if (Object.keys(requestBody).length === 0) {
    throw new Error('At least one field must be provided to update the user');
  }

  const user = await fergusClient.patch(`/users/${userId}`, requestBody);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(user, null, 2) }],
  };
}
