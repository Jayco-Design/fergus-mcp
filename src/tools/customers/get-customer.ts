/**
 * Get Customer Tool
 * Retrieves a specific customer by ID
 */

import { FergusClient } from '../../fergus-client.js';
import { formatResponse, isChatGPT } from '../../utils/format-response.js';

export const getCustomerToolDefinition = {
  name: 'get-customer',
  description: 'Get details of a specific customer by ID',
  annotations: {
    readOnlyHint: true
  },
  _meta: {
    'openai/outputTemplate': 'ui://customers/customer-detail.html',
    'openai/toolInvocation/invoking': 'Loading customer details...',
    'openai/toolInvocation/invoked': 'Customer details loaded'
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
  outputSchema: {
    type: 'object',
    properties: {
      customer: {
        type: 'object',
        properties: {
          id: { type: ['number', 'string'] },
          name: { type: 'string' },
          customerFullName: { type: 'string' },
          email: { type: ['string', 'null'] },
          phone: { type: ['string', 'null'] },
          mainContact: {
            type: ['object', 'null'],
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
              phone: { type: 'string' },
              position: { type: 'string' },
            },
          },
          physicalAddress: {
            type: ['object', 'null'],
            properties: {
              line1: { type: 'string' },
              line2: { type: 'string' },
              city: { type: 'string' },
              state: { type: 'string' },
              postalCode: { type: 'string' },
              country: { type: 'string' },
            },
          },
          postalAddress: {
            type: ['object', 'null'],
            properties: {
              line1: { type: 'string' },
              line2: { type: 'string' },
              city: { type: 'string' },
              state: { type: 'string' },
              postalCode: { type: 'string' },
              country: { type: 'string' },
            },
          },
        },
      },
    },
  },
};

export async function handleGetCustomer(
  fergusClient: FergusClient,
  args: { customerId: string },
  meta?: Record<string, any>
) {
  // Log client detection
  const isChatGPTClient = isChatGPT(meta);
  console.log('[get-customer] Client detected:', isChatGPTClient ? 'ChatGPT' : 'Claude', meta?.['openai/userAgent'] || 'unknown');

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

  // Build structured content
  const structuredContent = {
    customer: structuredCustomer,
  };

  // Format response based on client type
  return formatResponse(structuredContent, meta);
}
