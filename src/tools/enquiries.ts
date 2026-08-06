/**
 * Enquiry Tools
 * manage-enquiries: get, list, create
 */

import { FergusClient } from '../fergus-client.js';
import { normalizeListResponse } from '../utils/format-response.js';

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
        type: 'number',
        description: 'Enquiry ID (required for: get)',
        minimum: 1,
      },
      // list params
      filterStatus: {
        type: 'string',
        description: 'Filter by enquiry status (for: list)',
        enum: ['TODO', 'CONTACTED', 'JOBCREATED', 'REJECTED'],
      },
      filterSource: {
        type: 'string',
        description: 'Filter by the source the enquiry came from (for: list)',
      },
      filterSearchText: {
        type: 'string',
        description: 'Search text, matches on name, description, phone and email (for: list)',
      },
      pageSize: {
        type: 'number',
        description: 'Max results per page, 1-100 (for: list, default: 50)',
        default: 50,
        minimum: 1,
        maximum: 100,
      },
      sortField: {
        type: 'string',
        description: 'Field to sort by (for: list)',
        enum: ['createdAt'],
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
      name: {
        type: 'string',
        description: 'Name of the person making the enquiry (required for: create)',
      },
      email: {
        type: 'string',
        format: 'email',
        description: 'Email address of the enquirer (required for: create)',
      },
      phoneNumber: {
        type: 'string',
        description: 'Phone number of the enquirer (required for: create)',
      },
      description: {
        type: 'string',
        description: 'Description of the enquiry (required for: create)',
      },
      source: {
        type: 'string',
        description: 'Where the enquiry came from, e.g. "Website", "Phone", "Referral" (required for: create)',
      },
      address1: {
        type: 'string',
        description: 'Address line 1 (required for: create)',
      },
      address2: {
        type: 'string',
        description: 'Address line 2 (for: create)',
      },
      addressSuburb: {
        type: 'string',
        description: 'Suburb (for: create)',
      },
      addressCity: {
        type: 'string',
        description: 'City (required for: create)',
      },
      addressRegion: {
        type: 'string',
        description: 'State/province/region (for: create)',
      },
      addressPostcode: {
        type: 'string',
        description: 'Postal/ZIP code (for: create)',
      },
      addressCountry: {
        type: 'string',
        description: 'Country (for: create)',
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
  const {
    filterStatus,
    filterSource,
    filterSearchText,
    pageSize = 50,
    sortField,
    sortOrder,
    pageCursor,
  } = args;

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  if (filterStatus) params.append('filterStatus', filterStatus);
  if (filterSource) params.append('filterSource', filterSource);
  if (filterSearchText) params.append('filterSearchText', filterSearchText);
  if (sortField) params.append('sortField', sortField);
  if (sortOrder) params.append('sortOrder', sortOrder);
  if (pageCursor) params.append('pageCursor', pageCursor);

  const enquiries = await fergusClient.get(`/enquiries?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(normalizeListResponse(enquiries), null, 2) }] };
}

const REQUIRED_CREATE_FIELDS = [
  'name',
  'email',
  'phoneNumber',
  'description',
  'source',
  'address1',
  'addressCity',
] as const;

const OPTIONAL_CREATE_FIELDS = [
  'address2',
  'addressSuburb',
  'addressRegion',
  'addressPostcode',
  'addressCountry',
] as const;

async function handleCreateEnquiry(fergusClient: FergusClient, args: Record<string, any>) {
  const missing = REQUIRED_CREATE_FIELDS.filter((field) => !args[field]?.toString().trim());
  if (missing.length > 0) {
    throw new Error(`${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} required for create action`);
  }

  const requestBody: any = {};
  for (const field of REQUIRED_CREATE_FIELDS) {
    requestBody[field] = args[field];
  }
  // The API rejects blank strings on address fields, so only send ones with a value
  for (const field of OPTIONAL_CREATE_FIELDS) {
    if (args[field]?.toString().trim()) requestBody[field] = args[field];
  }

  const enquiry = await fergusClient.post('/enquiries', requestBody);
  return { content: [{ type: 'text' as const, text: JSON.stringify(enquiry, null, 2) }] };
}
