/**
 * Contact Tools
 * manage-contacts: get, list, create, update
 */

import { FergusClient } from '../fergus-client.js';
import { contactItemSchema, contactItemChangeProperties } from './schemas.js';
import { normalizeListResponse } from '../utils/format-response.js';
import { applyContactItemChanges, assertContactItemInputs } from '../utils/contact-items.js';

export const manageContactsToolDefinition = {
  name: 'manage-contacts',
  description: 'Manage contacts of customers and sites. Actions: get, list, create, update. Create needs contactType (CUSTOMER with customerId, or SITE with siteId), firstName, and an email or at least one contact item. On update, anything not mentioned stays as it is: the tool reads the contact and keeps its current name, position, company, contact items, main and billing status. To add, change or remove a single phone number or email, use addContactItems, updateContactItems or removeContactItems. A customer\'s main contact is updated with manage-customers update, not here.',
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
      // create params
      contactType: {
        type: 'string',
        enum: ['CUSTOMER', 'SITE'],
        description: 'Whether the contact belongs to a customer or a site (required for: create)',
      },
      customerId: {
        type: 'number',
        description: 'Customer the contact belongs to (required for: create when contactType is CUSTOMER)',
      },
      siteId: {
        type: 'number',
        description: 'Site the contact belongs to (required for: create when contactType is SITE)',
      },
      email: {
        type: 'string',
        description: 'Email address, added as a contact item (for: create). Create needs an email or at least one contact item.',
      },
      // create/update params
      firstName: {
        type: 'string',
        description: 'First name (required for: create; for update, kept if left out)',
      },
      lastName: {
        type: 'string',
        description: 'Last name (for: create, update). On update, kept if left out; send an empty string to clear it.',
      },
      position: {
        type: 'string',
        description: 'Position/title (for: create, update). On update, kept if left out; send an empty string to clear it.',
      },
      company: {
        type: 'string',
        description: 'Company name (for: create, update). On update, kept if left out; send an empty string to clear it.',
      },
      isMain: {
        type: 'boolean',
        description: 'Whether this is the site\'s main contact (for: create, update; SITE contacts only). On update, kept if left out.',
      },
      isBilling: {
        type: 'boolean',
        description: 'Whether this is the billing contact (for: create, update). On update, kept if left out. Setting false on a site\'s billing contact doesn\'t unset it; make another site contact the billing contact instead.',
      },
      contactItems: {
        type: 'array',
        description: 'The complete list of contact methods (for: create, update). On update this replaces the list: keep existing items by sending their id (from get); items without an id are added; items left out are removed. To change single items, use addContactItems/updateContactItems/removeContactItems instead. Items get doesn\'t show can\'t be kept.',
        items: contactItemSchema,
      },
      ...contactItemChangeProperties,
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
  return { content: [{ type: 'text' as const, text: JSON.stringify(normalizeListResponse(contacts), null, 2) }] };
}

async function handleCreateContact(fergusClient: FergusClient, args: Record<string, any>) {
  const { contactType, customerId, siteId, email, firstName, lastName, position, company, isMain, isBilling, contactItems } = args;
  if (!firstName) throw new Error('firstName is required for create action');
  if (contactType !== 'CUSTOMER' && contactType !== 'SITE') {
    throw new Error('contactType (CUSTOMER or SITE) is required for create action');
  }
  if (contactType === 'CUSTOMER' && !customerId) throw new Error('customerId is required when contactType is CUSTOMER');
  if (contactType === 'SITE' && !siteId) throw new Error('siteId is required when contactType is SITE');
  if (contactType === 'CUSTOMER' && isMain) {
    throw new Error("A customer's main contact can't be created here; use manage-customers update to change it");
  }
  if (!email && !(Array.isArray(contactItems) && contactItems.length > 0)) {
    throw new Error('create needs an email or at least one contact item');
  }

  const requestBody: any = { contactType, firstName };
  if (contactType === 'CUSTOMER') requestBody.customerId = Number(customerId);
  if (contactType === 'SITE') requestBody.siteId = Number(siteId);
  if (email) requestBody.email = email;
  if (lastName) requestBody.lastName = lastName;
  if (position) requestBody.position = position;
  if (company) requestBody.company = company;
  if (isMain !== undefined) requestBody.isMain = isMain;
  if (isBilling !== undefined) requestBody.isBilling = isBilling;
  if (contactItems) requestBody.contactItems = contactItems;

  const contact = await fergusClient.post('/contacts', requestBody);
  return { content: [{ type: 'text' as const, text: JSON.stringify(contact, null, 2) }] };
}

/**
 * The value to send for an optional text field on update: the caller's value,
 * left out when they clear it with "" (the API then sets it to null; it rejects
 * an empty lastName), or the contact's current value when they don't mention it.
 */
function keepOrClear(given: unknown, current: unknown): string | undefined {
  if (given !== undefined) return given === '' ? undefined : String(given);
  return typeof current === 'string' && current.trim() !== '' ? current : undefined;
}

async function handleUpdateContact(fergusClient: FergusClient, args: Record<string, any>) {
  const { contactId } = args;
  if (!contactId) throw new Error('contactId is required for update action');
  assertContactItemInputs(args, 'update');

  // PUT /contacts/:id clears every field it isn't sent, so read the contact
  // and resend what the caller didn't mention.
  const response: any = await fergusClient.get(`/contacts/${contactId}`);
  const current = response?.data ?? response;

  if (current.contactType === 'CUSTOMER' && current.isMain) {
    throw new Error(
      `Contact ${contactId} is the main contact of customer ${current.customerId}. Update it with manage-customers update (mainContact), not manage-contacts. Nothing was changed.`
    );
  }

  const firstName = args.firstName || current.firstName;
  if (!firstName) {
    throw new Error(`Contact ${contactId} has no first name on record; send firstName with the update. Nothing was changed.`);
  }
  const requestBody: any = { firstName };
  const lastName = keepOrClear(args.lastName, current.lastName);
  const position = keepOrClear(args.position, current.position);
  const company = keepOrClear(args.company, current.company);
  if (lastName !== undefined) requestBody.lastName = lastName;
  if (position !== undefined) requestBody.position = position;
  if (company !== undefined) requestBody.company = company;
  requestBody.isMain = args.isMain ?? Boolean(current.isMain);
  requestBody.isBilling = args.isBilling ?? Boolean(current.isBilling);

  if (args.contactItems !== undefined) {
    requestBody.contactItems = args.contactItems;
  } else {
    requestBody.contactItems = applyContactItemChanges(current.contactItems, args, 'update');
  }
  if (requestBody.contactItems.length === 0) {
    throw new Error('A contact must keep at least one contact item. Nothing was changed.');
  }

  const contact = await fergusClient.put(`/contacts/${contactId}`, requestBody);
  return { content: [{ type: 'text' as const, text: JSON.stringify(contact, null, 2) }] };
}
