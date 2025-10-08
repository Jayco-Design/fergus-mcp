/**
 * Create Customer Tool
 * Creates a new customer
 */

import { FergusClient } from '../../fergus-client.js';

export const createCustomerToolDefinition = {
  name: 'create-customer',
  description: 'Create a new customer with required customerFullName and mainContact information.',
  inputSchema: {
    type: 'object',
    properties: {
      customerFullName: {
        type: 'string',
        description: 'Full name of the customer (must not be empty)',
      },
      mainContact: {
        type: 'object',
        description: 'Main contact information for the customer',
        properties: {
          firstName: {
            type: 'string',
            description: 'First name of the contact (required)',
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
            items: {
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
            },
          },
        },
        required: ['firstName'],
      },
      physicalAddress: {
        type: 'object',
        description: 'Physical address (optional)',
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
      },
      postalAddress: {
        type: 'object',
        description: 'Postal address (optional, same structure as physicalAddress)',
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
      },
    },
    required: ['customerFullName', 'mainContact'],
  },
};

export async function handleCreateCustomer(
  fergusClient: FergusClient,
  args: {
    customerFullName: string;
    mainContact: {
      firstName: string;
      lastName?: string;
      position?: string;
      company?: string;
      contactItems?: Array<{
        contactType: 'email' | 'phone' | 'mobile' | 'other' | 'fax' | 'website';
        contactValue: string;
      }>;
    };
    physicalAddress?: any;
    postalAddress?: any;
  }
) {
  const { customerFullName, mainContact, physicalAddress, postalAddress } = args;

  const requestBody: any = {
    customerFullName,
    mainContact,
  };

  if (physicalAddress) {
    requestBody.physicalAddress = physicalAddress;
  }

  if (postalAddress) {
    requestBody.postalAddress = postalAddress;
  }

  const customer = await fergusClient.post('/customers', requestBody);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(customer, null, 2),
      },
    ],
  };
}
