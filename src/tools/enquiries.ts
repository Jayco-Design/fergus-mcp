/**
 * Enquiry Tools
 * manage-enquiries: get, list, create
 */

import { FergusClient } from '../fergus-client.js';

export const manageEnquiriesToolDefinition = {
  name: 'manage-enquiries',
  description: 'Manage enquiries. Actions: get, list, create',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['get', 'list', 'create'],
        description: 'The action to perform',
      },
      enquiryId: {
        type: 'string',
        description: 'Enquiry ID (required for: get)',
      },
      // list params
      filterStatus: {
        type: 'string',
        enum: ['TODO', 'CONTACTED', 'JOBCREATED', 'REJECTED'],
        description: 'Filter by enquiry status (for: list)',
      },
      filterSearchText: {
        type: 'string',
        description: 'Search text (for: list)',
      },
      pageSize: {
        type: 'number',
        description: 'Max results per page (for: list, default: 50)',
        default: 50,
      },
      sortField: {
        type: 'string',
        enum: ['createdAt'],
        description: 'Field to sort by (for: list, default: createdAt)',
      },
      sortOrder: {
        type: 'string',
        description: 'Sort order: asc or desc (for: list)',
        enum: ['asc', 'desc'],
      },
      pageCursor: {
        type: 'string',
        description: 'Pagination cursor (for: list)',
      },
      // create params
      title: {
        type: 'string',
        description: 'Enquiry title (required for: create)',
      },
      description: {
        type: 'string',
        description: 'Enquiry description (for: create)',
      },
      customerId: {
        type: 'string',
        description: 'Customer ID (for: create)',
      },
      siteId: {
        type: 'string',
        description: 'Site ID (for: create)',
      },
      contactName: {
        type: 'string',
        description: 'Contact name (for: create)',
      },
      contactPhone: {
        type: 'string',
        description: 'Contact phone (for: create)',
      },
      contactEmail: {
        type: 'string',
        description: 'Contact email (for: create)',
      },
    },
    required: ['action'],
  },
};

export async function handleManageEnquiries(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  switch (args.action) {
    case 'get':
      return handleGetEnquiry(fergusClient, args);
    case 'list':
      return handleListEnquiries(fergusClient, args);
    case 'create':
      return handleCreateEnquiry(fergusClient, args);
    default:
      throw new Error(`Unknown action: ${args.action}. Valid actions: get, list, create`);
  }
}

async function handleGetEnquiry(fergusClient: FergusClient, args: Record<string, any>) {
  const { enquiryId } = args;
  if (!enquiryId) throw new Error('enquiryId is required for get action');

  const enquiry = await fergusClient.get(`/enquiries/${enquiryId}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(enquiry, null, 2) }] };
}

async function handleListEnquiries(fergusClient: FergusClient, args: Record<string, any>) {
  const { filterStatus, filterSearchText, pageSize = 50, sortField, sortOrder, pageCursor } = args;

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  if (filterStatus) params.append('filterStatus', filterStatus);
  if (filterSearchText) params.append('filterSearchText', filterSearchText);
  if (sortField) params.append('sortField', sortField);
  if (sortOrder) params.append('sortOrder', sortOrder);
  if (pageCursor) params.append('pageCursor', pageCursor);

  const enquiries = await fergusClient.get(`/enquiries?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(enquiries, null, 2) }] };
}

async function handleCreateEnquiry(fergusClient: FergusClient, args: Record<string, any>) {
  const { title, description, customerId, siteId, contactName, contactPhone, contactEmail } = args;
  if (!title) throw new Error('title is required for create action');

  const requestBody: any = { title };
  if (description) requestBody.description = description;
  if (customerId) requestBody.customerId = customerId;
  if (siteId) requestBody.siteId = siteId;
  if (contactName) requestBody.contactName = contactName;
  if (contactPhone) requestBody.contactPhone = contactPhone;
  if (contactEmail) requestBody.contactEmail = contactEmail;

  const enquiry = await fergusClient.post('/enquiries', requestBody);
  return { content: [{ type: 'text' as const, text: JSON.stringify(enquiry, null, 2) }] };
}
