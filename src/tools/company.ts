/**
 * Company Info Tool
 * get-company-info: single-purpose tool to retrieve company details
 */

import { FergusClient } from '../fergus-client.js';

export const getCompanyInfoToolDefinition = {
  name: 'get-company-info',
  description: 'Get company information and settings',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export async function handleGetCompanyInfo(
  fergusClient: FergusClient
) {
  const company = await fergusClient.get('/company');
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(company, null, 2) }],
  };
}
