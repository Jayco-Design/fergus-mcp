/**
 * Pricing Tier Tools
 * manage-pricing-tiers: list, get
 */

import { FergusClient } from '../fergus-client.js';

export const managePricingTiersToolDefinition = {
  name: 'manage-pricing-tiers',
  description: 'Manage pricing tiers. Actions: list, get',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'get'],
        description: 'The action to perform',
      },
      pricingTierId: {
        type: 'string',
        description: 'Pricing tier ID (required for: get)',
      },
      pageSize: {
        type: 'number',
        description: 'Max results per page (for: list, default: 50)',
        default: 50,
      },
      pageCursor: {
        type: 'string',
        description: 'Pagination cursor (for: list)',
      },
    },
    required: ['action'],
  },
};

export async function handleManagePricingTiers(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  switch (args.action) {
    case 'list':
      return handleListPricingTiers(fergusClient, args);
    case 'get':
      return handleGetPricingTier(fergusClient, args);
    default:
      throw new Error(`Unknown action: ${args.action}. Valid actions: list, get`);
  }
}

async function handleListPricingTiers(fergusClient: FergusClient, args: Record<string, any>) {
  const { pageSize = 50, pageCursor } = args;
  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  if (pageCursor) params.append('pageCursor', pageCursor);

  const tiers = await fergusClient.get(`/pricingTiers?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(tiers, null, 2) }] };
}

async function handleGetPricingTier(fergusClient: FergusClient, args: Record<string, any>) {
  const { pricingTierId } = args;
  if (!pricingTierId) throw new Error('pricingTierId is required for get action');

  const tier = await fergusClient.get(`/pricingTiers/${pricingTierId}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(tier, null, 2) }] };
}
