/**
 * User Tools
 * All user-related operations (get, list, update)
 */

import { FergusClient } from '../fergus-client.js';
import { formatResponse, isChatGPT } from '../utils/format-response.js';

// ===== GET USER =====

export const getUserToolDefinition = {
  name: 'get-user',
  description: 'Get details of a specific user by ID',
  annotations: {
    readOnlyHint: true
  },
  inputSchema: {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        description: 'The ID of the user to retrieve',
      },
    },
    required: ['userId'],
  },
};

export async function handleGetUser(
  fergusClient: FergusClient,
  args: { userId: string }
) {
  const { userId } = args;

  if (!userId) {
    throw new Error('userId is required');
  }

  const user = await fergusClient.get(`/users/${userId}`);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(user, null, 2),
      },
    ],
  };
}

// ===== LIST USERS =====

export const listUsersToolDefinition = {
  name: 'list-users',
  description: 'List users/team members with optional filtering by name, email, user type, and status',
  annotations: {
    readOnlyHint: true
  },
  inputSchema: {
    type: 'object',
    properties: {
      filterSearchText: {
        type: 'string',
        description: 'Search text to filter users by first name, last name, or email',
      },
      pageSize: {
        type: 'number',
        description: 'Maximum number of users to return per page',
        default: 10,
      },
      sortField: {
        type: 'string',
        description: 'Field to sort by',
        enum: ['firstName', 'lastName', 'createdAt'],
        default: 'firstName',
      },
      sortOrder: {
        type: 'string',
        description: 'Sort order: asc or desc',
        enum: ['asc', 'desc'],
        default: 'asc',
      },
      filterUserType: {
        type: 'string',
        description: 'Filter by user type',
        enum: ['contractor', 'field_worker', 'apprentice', 'tradesman', 'advisor', 'full_user', 'time_sheet_only'],
      },
      filterStatus: {
        type: 'string',
        description: 'Filter by user status',
        enum: ['active', 'disabled', 'invited'],
      },
      pageCursor: {
        type: 'string',
        description: 'Pagination cursor for next page',
        default: '0',
      },
    },
  },
};

export async function handleListUsers(
  fergusClient: FergusClient,
  args: {
    filterSearchText?: string;
    pageSize?: number;
    sortField?: string;
    sortOrder?: string;
    filterUserType?: string;
    filterStatus?: string;
    pageCursor?: string;
  },
  meta?: Record<string, any>
) {
  // Log client detection
  const isChatGPTClient = isChatGPT(meta);
  console.log('[list-users] Client detected:', isChatGPTClient ? 'ChatGPT' : 'Claude', meta?.['openai/userAgent'] || 'unknown');

  const {
    filterSearchText,
    pageSize = 10,
    sortField = 'firstName',
    sortOrder = 'asc',
    filterUserType,
    filterStatus,
    pageCursor = '0',
  } = args || {};

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  params.append('sortField', sortField);
  params.append('sortOrder', sortOrder);
  params.append('pageCursor', pageCursor);

  if (filterSearchText) params.append('filterSearchText', filterSearchText);
  if (filterUserType) params.append('filterUserType', filterUserType);
  if (filterStatus) params.append('filterStatus', filterStatus);

  const endpoint = `/users?${params.toString()}`;
  const response = await fergusClient.get(endpoint) as any;

  // Extract users array from response
  const users = Array.isArray(response) ? response : (response.data || response.users || []);
  const totalCount = response.total || response.totalCount || users.length;
  const nextCursor = response.nextCursor || response.pageCursor || null;

  // Create a concise text summary
  const summary = `Found ${users.length} user(s)${totalCount > users.length ? ` of ${totalCount} total` : ''}`;

  // Structure the data for better ChatGPT consumption
  const structuredUsers = users.map((user: any) => ({
    id: user.id || user.userId,
    name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    email: user.email || user.contactItems?.find((c: any) => c.type === 'email')?.value,
    userType: user.userType,
    status: user.status,
    chargeOutRate: user.chargeOutRate,
  }));

  // Build structured content
  const structuredContent = {
    users: structuredUsers,
    pagination: {
      count: users.length,
      total: totalCount,
      nextCursor,
    },
  };

  // Format response based on client type
  return formatResponse(structuredContent, meta);
}

// ===== UPDATE USER =====

export const updateUserToolDefinition = {
  name: 'update-user',
  description: 'Update an existing user. Can update firstName, lastName, address, payRate, chargeOutRate, and contactItems.',
  inputSchema: {
    type: 'object',
    properties: {
      userId: {
        type: 'number',
        description: 'The ID of the user to update',
      },
      firstName: {
        type: 'string',
        description: 'First name of the user (must not be empty)',
      },
      lastName: {
        type: 'string',
        description: 'Last name of the user (must not be empty)',
      },
      address: {
        type: 'object',
        description: 'User address',
        properties: {
          address1: {
            type: 'string',
            description: 'Address line 1',
          },
          address2: {
            type: 'string',
            description: 'Address line 2',
          },
          addressSuburb: {
            type: 'string',
            description: 'Suburb',
          },
          addressCity: {
            type: 'string',
            description: 'City',
          },
          addressRegion: {
            type: 'string',
            description: 'Region/State',
          },
          addressPostcode: {
            type: 'string',
            description: 'Postcode/ZIP',
          },
          addressCountry: {
            type: 'string',
            description: 'Country',
          },
        },
        required: [
          'address1',
          'address2',
          'addressSuburb',
          'addressCity',
          'addressRegion',
          'addressPostcode',
          'addressCountry',
        ],
      },
      payRate: {
        type: 'number',
        description: 'Pay rate (must be greater than 0, with 2 decimal places)',
      },
      chargeOutRate: {
        type: 'number',
        description: 'Charge out rate (must be greater than 0, with 2 decimal places)',
      },
      contactItems: {
        type: 'array',
        description: 'Contact items for the user',
        items: {
          type: 'object',
          properties: {
            contactType: {
              type: 'string',
              enum: ['phone', 'mobile', 'other', 'fax', 'website'],
              description: 'Type of contact',
            },
            contactValue: {
              type: 'string',
              description: 'Contact value (must not be empty)',
            },
          },
          required: ['contactType', 'contactValue'],
        },
      },
    },
    required: ['userId'],
  },
};

export async function handleUpdateUser(
  fergusClient: FergusClient,
  args: {
    userId: number;
    firstName?: string;
    lastName?: string;
    address?: {
      address1: string;
      address2: string;
      addressSuburb: string;
      addressCity: string;
      addressRegion: string;
      addressPostcode: string;
      addressCountry: string;
    };
    payRate?: number;
    chargeOutRate?: number;
    contactItems?: Array<{
      contactType: 'phone' | 'mobile' | 'other' | 'fax' | 'website';
      contactValue: string;
    }>;
  }
) {
  const { userId, ...updates } = args;

  // Build request body with only provided fields
  const requestBody: any = {};
  if (updates.firstName !== undefined) requestBody.firstName = updates.firstName;
  if (updates.lastName !== undefined) requestBody.lastName = updates.lastName;
  if (updates.address !== undefined) requestBody.address = updates.address;
  if (updates.payRate !== undefined) requestBody.payRate = updates.payRate;
  if (updates.chargeOutRate !== undefined) requestBody.chargeOutRate = updates.chargeOutRate;
  if (updates.contactItems !== undefined) requestBody.contactItems = updates.contactItems;

  // Validate that at least one field is being updated
  if (Object.keys(requestBody).length === 0) {
    throw new Error('At least one field must be provided to update the user');
  }

  const user = await fergusClient.patch(`/users/${userId}`, requestBody);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(user, null, 2),
      },
    ],
  };
}
