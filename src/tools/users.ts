/**
 * User Tools (consolidated)
 * manage-users: get, list, update
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { FergusClient } from '../fergus-client.js';
import { formatResponse, isChatGPT } from '../utils/format-response.js';

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
        description: 'User address (for: update)',
        properties: {
          address1: { type: 'string', description: 'Address line 1' },
          address2: { type: 'string', description: 'Address line 2' },
          addressSuburb: { type: 'string', description: 'Suburb' },
          addressCity: { type: 'string', description: 'City' },
          addressRegion: { type: 'string', description: 'Region/State' },
          addressPostcode: { type: 'string', description: 'Postcode/ZIP' },
          addressCountry: { type: 'string', description: 'Country' },
        },
        required: ['address1', 'address2', 'addressSuburb', 'addressCity', 'addressRegion', 'addressPostcode', 'addressCountry'],
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
        description: 'Contact items (for: update)',
        items: {
          type: 'object',
          properties: {
            contactType: { type: 'string', enum: ['phone', 'mobile', 'other', 'fax', 'website'] },
            contactValue: { type: 'string' },
          },
          required: ['contactType', 'contactValue'],
        },
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
  const totalCount = response.total || response.totalCount || users.length;
  const nextCursor = response.nextCursor || response.pageCursor || null;

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
    pagination: { count: users.length, total: totalCount, nextCursor },
  }, meta);
}

// ===== UPDATE USER =====

async function handleUpdateUser(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { userId, firstName, lastName, address, payRate, chargeOutRate, contactItems } = args;
  if (!userId) {
    throw new Error('userId is required for update action');
  }

  const requestBody: any = {};
  if (firstName !== undefined) requestBody.firstName = firstName;
  if (lastName !== undefined) requestBody.lastName = lastName;
  if (address !== undefined) requestBody.address = address;
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
