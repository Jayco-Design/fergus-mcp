/**
 * Create Site Tool
 * Creates a new site
 */

import { FergusClient } from '../fergus-client.js';

export const createSiteToolDefinition = {
  name: 'create-site',
  description: 'Create a new site with required defaultContact and siteAddress.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Site name (optional)',
      },
      defaultContact: {
        type: 'object',
        description: 'Default contact for the site (required)',
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
      billingContact: {
        type: 'object',
        description: 'Billing contact for the site (optional)',
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
      },
      siteAddress: {
        type: 'object',
        description: 'Physical address of the site (required)',
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
        description: 'Postal address (optional, same structure as siteAddress)',
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
    required: ['defaultContact', 'siteAddress'],
  },
};

export async function handleCreateSite(
  fergusClient: FergusClient,
  args: {
    name?: string;
    defaultContact: {
      firstName: string;
      lastName?: string;
      position?: string;
      company?: string;
      contactItems?: Array<{
        contactType: 'email' | 'phone' | 'mobile' | 'other' | 'fax' | 'website';
        contactValue: string;
      }>;
    };
    billingContact?: any;
    siteAddress: any;
    postalAddress?: any;
  }
) {
  const { name, defaultContact, billingContact, siteAddress, postalAddress } = args;

  const requestBody: any = {
    defaultContact,
    siteAddress,
  };

  if (name) {
    requestBody.name = name;
  }

  if (billingContact) {
    requestBody.billingContact = billingContact;
  }

  if (postalAddress) {
    requestBody.postalAddress = postalAddress;
  }

  const site = await fergusClient.post('/sites', requestBody);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(site, null, 2),
      },
    ],
  };
}
