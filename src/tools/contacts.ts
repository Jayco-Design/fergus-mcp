/**
 * Contact Tools
 * manage-contacts: get, list, create, update
 */

import { FergusClient } from '../fergus-client.js';
import { contactItemSchema } from './schemas.js';

export const manageContactsToolDefinition = {
  name: 'manage-contacts',
  description: 'Manage contacts. Actions: get, list, create, update',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['get', 'list', 'create', 'update'],
        description: 'The action to perform',
      },
      contactId: {
        type: 'string',
        description: 'Contact ID (required for: get, update)',
      },
      // list params
      filterSearchText: {
        type: 'string',
        description: 'Search text to filter contacts (for: list)',
      },
      pageSize: {
        type: 'number',
        description: 'Max results per page (for: list, default: 50)',
        default: 50,
      },
      sortField: {
        type: 'string',
        description: 'Field to sort by (for: list)',
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
      // create/update params
      firstName: {
        type: 'string',
        description: 'First name (required for: create)',
      },
      lastName: {
        type: 'string',
        description: 'Last name (for: create, update)',
      },
      position: {
        type: 'string',
        description: 'Position/title (for: create, update)',
      },
      company: {
        type: 'string',
        description: 'Company name (for: create, update)',
      },
      contactItems: {
        type: 'array',
        description: 'Contact methods (for: create, update)',
        items: contactItemSchema,
      },
    },
    required: ['action'],
  },
};

export async function handleManageContacts(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  switch (args.action) {
    case 'get':
      return handleGetContact(fergusClient, args);
    case 'list':
      return handleListContacts(fergusClient, args);
    case 'create':
      return handleCreateContact(fergusClient, args);
    case 'update':
      return handleUpdateContact(fergusClient, args);
    default:
      throw new Error(`Unknown action: ${args.action}. Valid actions: get, list, create, update`);
  }
}

async function handleGetContact(fergusClient: FergusClient, args: Record<string, any>) {
  const { contactId } = args;
  if (!contactId) throw new Error('contactId is required for get action');

  const contact = await fergusClient.get(`/contacts/${contactId}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(contact, null, 2) }] };
}

async function handleListContacts(fergusClient: FergusClient, args: Record<string, any>) {
  const { filterSearchText, pageSize = 50, sortField, sortOrder, pageCursor } = args;

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  if (filterSearchText) params.append('filterSearchText', filterSearchText);
  if (sortField) params.append('sortField', sortField);
  if (sortOrder) params.append('sortOrder', sortOrder);
  if (pageCursor) params.append('pageCursor', pageCursor);

  const contacts = await fergusClient.get(`/contacts?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(contacts, null, 2) }] };
}

async function handleCreateContact(fergusClient: FergusClient, args: Record<string, any>) {
  const { firstName, lastName, position, company, contactItems } = args;
  if (!firstName) throw new Error('firstName is required for create action');

  const requestBody: any = { firstName };
  if (lastName) requestBody.lastName = lastName;
  if (position) requestBody.position = position;
  if (company) requestBody.company = company;
  if (contactItems) requestBody.contactItems = contactItems;

  const contact = await fergusClient.post('/contacts', requestBody);
  return { content: [{ type: 'text' as const, text: JSON.stringify(contact, null, 2) }] };
}

async function handleUpdateContact(fergusClient: FergusClient, args: Record<string, any>) {
  const { contactId, firstName, lastName, position, company, contactItems } = args;
  if (!contactId) throw new Error('contactId is required for update action');

  const requestBody: any = {};
  if (firstName !== undefined) requestBody.firstName = firstName;
  if (lastName !== undefined) requestBody.lastName = lastName;
  if (position !== undefined) requestBody.position = position;
  if (company !== undefined) requestBody.company = company;
  if (contactItems !== undefined) requestBody.contactItems = contactItems;

  const contact = await fergusClient.put(`/contacts/${contactId}`, requestBody);
  return { content: [{ type: 'text' as const, text: JSON.stringify(contact, null, 2) }] };
}
