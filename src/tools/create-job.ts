/**
 * Create Job Tool
 * Creates a new job (draft or finalized)
 */

import { FergusClient } from '../fergus-client.js';

export const createJobToolDefinition = {
  name: 'create-job',
  description: 'Create a new job (draft or finalized). Draft jobs require only jobType and title. Finalized jobs also require description, customerId, and siteId.',
  inputSchema: {
    type: 'object',
    properties: {
      jobType: {
        type: 'string',
        description: 'Type of job',
        enum: ['Quote', 'Estimate', 'Charge Up'],
      },
      title: {
        type: 'string',
        description: 'Job title',
      },
      description: {
        type: 'string',
        description: 'Job description (required for non-draft jobs)',
      },
      customerId: {
        type: 'number',
        description: 'Customer ID (required for non-draft jobs)',
      },
      siteId: {
        type: 'number',
        description: 'Site ID (required for non-draft jobs)',
      },
      customerReference: {
        type: 'string',
        description: 'Customer reference number',
      },
      isDraft: {
        type: 'boolean',
        description: 'Whether to create as a draft job (default: true)',
        default: true,
      },
    },
    required: ['jobType', 'title'],
  },
};

export async function handleCreateJob(
  fergusClient: FergusClient,
  args: {
    jobType: 'Quote' | 'Estimate' | 'Charge Up';
    title: string;
    description?: string;
    customerId?: number;
    siteId?: number;
    customerReference?: string;
    isDraft?: boolean;
  }
) {
  const {
    jobType,
    title,
    description,
    customerId,
    siteId,
    customerReference,
    isDraft = true,
  } = args;

  // Validate requirements for non-draft jobs
  if (!isDraft) {
    if (!description || !customerId || !siteId) {
      throw new Error(
        'Non-draft jobs require description, customerId, and siteId. Set isDraft=true to create a draft job with fewer requirements.'
      );
    }
  }

  const requestBody: any = {
    jobType,
    title,
    isDraft,
  };

  if (description) requestBody.description = description;
  if (customerId) requestBody.customerId = customerId;
  if (siteId) requestBody.siteId = siteId;
  if (customerReference) requestBody.customerReference = customerReference;

  const job = await fergusClient.post('/jobs', requestBody);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(job, null, 2),
      },
    ],
  };
}
