/**
 * Update Site Tool
 * Updates an existing site
 */

import { FergusClient } from '../fergus-client.js';

export const updateSiteToolDefinition = {
  name: 'update-site',
  description: 'Update an existing site. Requires siteId and siteAddress.',
  inputSchema: {
    type: 'object',
    properties: {
      siteId: {
        type: 'number',
        description: 'The ID of the site to update',
      },
      name: {
        type: 'string',
        description: 'Site name (optional)',
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
    required: ['siteId', 'siteAddress'],
  },
};

export async function handleUpdateSite(
  fergusClient: FergusClient,
  args: {
    siteId: number;
    name?: string;
    siteAddress: any;
    postalAddress?: any;
  }
) {
  const { siteId, name, siteAddress, postalAddress } = args;

  const requestBody: any = {
    siteAddress,
  };

  if (name) {
    requestBody.name = name;
  }

  if (postalAddress) {
    requestBody.postalAddress = postalAddress;
  }

  const site = await fergusClient.patch(`/sites/${siteId}`, requestBody);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(site, null, 2),
      },
    ],
  };
}
