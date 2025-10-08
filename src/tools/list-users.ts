/**
 * List Users Tool
 * Lists users/team members with optional filtering and pagination
 */

import { FergusClient } from '../fergus-client.js';
import { formatResponse, isChatGPT } from '../utils/format-response.js';

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
