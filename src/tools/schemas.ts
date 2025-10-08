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
      description: 'Address line 1',
    },
    address2: {
      type: 'string',
      description: 'Address line 2',
    },
    city: {
      type: 'string',
      description: 'City',
    },
    state: {
      type: 'string',
      description: 'State/province',
    },
    postalCode: {
      type: 'string',
      description: 'Postal/ZIP code',
    },
    country: {
      type: 'string',
      description: 'Country',
    },
  },
};

export const contactItemSchema = {
  type: 'object',
  properties: {
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
