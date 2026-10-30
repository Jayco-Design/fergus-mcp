/**
 * Shared JSON schemas used across multiple tools
 * Eliminates duplication and ensures consistency
 */

export const addressSchema = {
  type: 'object',
  description: 'Physical or postal address',
  properties: {
    address1: {
      type: 'string',
      description: 'Address line 1. Required whenever an address is sent.',
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
      description: 'State/province/region',
    },
    addressPostcode: {
      type: 'string',
      description: 'Postal/ZIP code',
    },
    addressCountry: {
      type: 'string',
      description: 'Country',
    },
  },
  required: ['address1'],
};

export const contactItemSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'number',
      description: 'Id of an existing item (from get). Send it to keep or change that item; leave it out for a new item.',
    },
    contactType: {
      type: 'string',
      enum: ['email', 'phone', 'mobile', 'other', 'fax', 'website'],
      description: 'Type of contact',
    },
    contactValue: {
      type: 'string',
      description: 'Contact value (email address, phone number, etc.)',
    },
  },
  required: ['contactType', 'contactValue'],
};

export const contactSchema = {
  type: 'object',
  description: 'Contact person information',
  properties: {
    firstName: {
      type: 'string',
      description: 'First name of the contact',
    },
    lastName: {
      type: 'string',
      description: 'Last name of the contact',
    },
    position: {
      type: 'string',
      description: 'Position/title of the contact',
    },
    company: {
      type: 'string',
      description: 'Company name',
    },
    contactItems: {
      type: 'array',
      description: 'Contact methods (email, phone, mobile, etc.)',
      items: contactItemSchema,
    },
  },
};

/** Add, change or remove single contact items on update while keeping the rest. */
export const contactItemChangeProperties = {
  addContactItems: {
    type: 'array',
    description: 'Contact items to add, keeping the existing ones (for: update). Cannot be combined with contactItems.',
    items: {
      type: 'object',
      properties: {
        contactType: contactItemSchema.properties.contactType,
        contactValue: contactItemSchema.properties.contactValue,
      },
      required: ['contactType', 'contactValue'],
    },
  },
  updateContactItems: {
    type: 'array',
    description: 'Existing contact items to change, by id from get, keeping the others (for: update). Cannot be combined with contactItems.',
    items: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Id of the item to change (from get)' },
        contactType: contactItemSchema.properties.contactType,
        contactValue: contactItemSchema.properties.contactValue,
      },
      required: ['id'],
    },
  },
  removeContactItems: {
    type: 'array',
    description: 'Ids (from get) of contact items to remove, keeping the others (for: update). Cannot be combined with contactItems.',
    items: { type: 'number' },
  },
};
