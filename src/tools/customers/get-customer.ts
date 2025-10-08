/**
 * Get Customer Tool
 * Retrieves a specific customer by ID
 */

import { FergusClient } from '../../fergus-client.js';

export const getCustomerToolDefinition = {
  name: 'get-customer',
  description: 'Get details of a specific customer by ID',
  annotations: {
    readOnlyHint: true,
    'openai/outputTemplate': 'ui://customers/customer-detail.html'
  },
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

  const customer = await fergusClient.get(`/customers/${customerId}`) as any;

  // Create structured customer data
  const structuredCustomer = {
    id: customer.id || customer.customerId,
    name: customer.customerFullName || customer.name,
    email: customer.mainContact?.email || customer.email,
    phone: customer.mainContact?.phone || customer.phone,
    mainContact: customer.mainContact,
    physicalAddress: customer.physicalAddress,
    postalAddress: customer.postalAddress,
    customerFullName: customer.customerFullName,
  };

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(structuredCustomer, null, 2),
      },
    ],
    // Structured content for ChatGPT Apps template
    structuredContent: {
      customer: structuredCustomer,
    },
  };
}
