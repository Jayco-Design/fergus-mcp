/**
 * Get Customer Tool
 * Retrieves a specific customer by ID
 */

import { FergusClient } from '../fergus-client.js';

export const getCustomerToolDefinition = {
  name: 'get-customer',
  description: 'Get details of a specific customer by ID',
  inputSchema: {
    type: 'object',
    properties: {
      customerId: {
        type: 'string',
        description: 'The ID of the customer to retrieve',
      },
    },
    required: ['customerId'],
  },
};

export async function handleGetCustomer(
  fergusClient: FergusClient,
  args: { customerId: string }
) {
  const { customerId } = args;

  if (!customerId) {
    throw new Error('customerId is required');
  }

  const customer = await fergusClient.get(`/customers/${customerId}`);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(customer, null, 2),
      },
    ],
  };
}
