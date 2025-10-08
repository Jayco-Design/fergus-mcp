/**
 * Get Site Tool
 * Retrieves a specific site by ID
 */

import { FergusClient } from '../fergus-client.js';

export const getSiteToolDefinition = {
  name: 'get-site',
  description: 'Get details of a specific site by ID',
  annotations: {
    readOnlyHint: true
  },
  inputSchema: {
    type: 'object',
    properties: {
      siteId: {
        type: 'string',
        description: 'The ID of the site to retrieve',
      },
    },
    required: ['siteId'],
  },
};

export async function handleGetSite(
  fergusClient: FergusClient,
  args: { siteId: string }
) {
  const { siteId } = args;

  if (!siteId) {
    throw new Error('siteId is required');
  }

  const site = await fergusClient.get(`/sites/${siteId}`);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(site, null, 2),
      },
    ],
  };
}
