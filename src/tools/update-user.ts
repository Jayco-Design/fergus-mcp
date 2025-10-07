/**
 * Update User Tool
 * Updates an existing user's details
 */

import { FergusClient } from '../fergus-client.js';

export const updateUserToolDefinition = {
  name: 'update-user',
  description: 'Update an existing user. Can update firstName, lastName, address, payRate, chargeOutRate, and contactItems.',
  inputSchema: {
    type: 'object',
    properties: {
      userId: {
        type: 'number',
        description: 'The ID of the user to update',
      },
      firstName: {
        type: 'string',
        description: 'First name of the user (must not be empty)',
      },
      lastName: {
        type: 'string',
        description: 'Last name of the user (must not be empty)',
      },
      address: {
        type: 'object',
        description: 'User address',
        properties: {
          address1: {
            type: 'string',
            description: 'Address line 1',
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
            description: 'Region/State',
          },
          addressPostcode: {
            type: 'string',
            description: 'Postcode/ZIP',
          },
          addressCountry: {
            type: 'string',
            description: 'Country',
          },
        },
        required: [
          'address1',
          'address2',
          'addressSuburb',
          'addressCity',
          'addressRegion',
          'addressPostcode',
          'addressCountry',
        ],
      },
      payRate: {
        type: 'number',
        description: 'Pay rate (must be greater than 0, with 2 decimal places)',
      },
      chargeOutRate: {
        type: 'number',
        description: 'Charge out rate (must be greater than 0, with 2 decimal places)',
      },
      contactItems: {
        type: 'array',
        description: 'Contact items for the user',
        items: {
          type: 'object',
          properties: {
            contactType: {
              type: 'string',
              enum: ['phone', 'mobile', 'other', 'fax', 'website'],
              description: 'Type of contact',
            },
            contactValue: {
              type: 'string',
              description: 'Contact value (must not be empty)',
            },
          },
          required: ['contactType', 'contactValue'],
        },
      },
    },
    required: ['userId'],
  },
};

export async function handleUpdateUser(
  fergusClient: FergusClient,
  args: {
    userId: number;
    firstName?: string;
    lastName?: string;
    address?: {
      address1: string;
      address2: string;
      addressSuburb: string;
      addressCity: string;
      addressRegion: string;
      addressPostcode: string;
      addressCountry: string;
    };
    payRate?: number;
    chargeOutRate?: number;
    contactItems?: Array<{
      contactType: 'phone' | 'mobile' | 'other' | 'fax' | 'website';
      contactValue: string;
    }>;
  }
) {
  const { userId, ...updates } = args;

  // Build request body with only provided fields
  const requestBody: any = {};
  if (updates.firstName !== undefined) requestBody.firstName = updates.firstName;
  if (updates.lastName !== undefined) requestBody.lastName = updates.lastName;
  if (updates.address !== undefined) requestBody.address = updates.address;
  if (updates.payRate !== undefined) requestBody.payRate = updates.payRate;
  if (updates.chargeOutRate !== undefined) requestBody.chargeOutRate = updates.chargeOutRate;
  if (updates.contactItems !== undefined) requestBody.contactItems = updates.contactItems;

  // Validate that at least one field is being updated
  if (Object.keys(requestBody).length === 0) {
    throw new Error('At least one field must be provided to update the user');
  }

  const user = await fergusClient.patch(`/users/${userId}`, requestBody);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(user, null, 2),
      },
    ],
  };
}
