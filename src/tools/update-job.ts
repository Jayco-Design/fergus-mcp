/**
 * Update Job Tool
 * Updates an existing draft job
 */

import { FergusClient } from '../fergus-client.js';

export const updateJobToolDefinition = {
  name: 'update-job',
  description: 'Update an existing draft job. Can update title, description, customerId, siteId, and customerReference.',
  inputSchema: {
    type: 'object',
    properties: {
      jobId: {
        type: 'number',
        description: 'ID of the job to update',
      },
      title: {
        type: 'string',
        description: 'Job title',
      },
      description: {
        type: 'string',
        description: 'Job description',
      },
      customerId: {
        type: 'number',
        description: 'Customer ID',
      },
      siteId: {
        type: 'number',
        description: 'Site ID',
      },
      customerReference: {
        type: 'string',
        description: 'Customer reference number',
      },
    },
    required: ['jobId'],
  },
};

export async function handleUpdateJob(
  fergusClient: FergusClient,
  args: {
    jobId: number;
    title?: string;
    description?: string;
    customerId?: number;
    siteId?: number;
    customerReference?: string;
  }
) {
  const { jobId, ...updates } = args;

  // Build request body with only provided fields
  const requestBody: any = {};
  if (updates.title !== undefined) requestBody.title = updates.title;
  if (updates.description !== undefined) requestBody.description = updates.description;
  if (updates.customerId !== undefined) requestBody.customerId = updates.customerId;
  if (updates.siteId !== undefined) requestBody.siteId = updates.siteId;
  if (updates.customerReference !== undefined) requestBody.customerReference = updates.customerReference;

  // Validate that at least one field is being updated
  if (Object.keys(requestBody).length === 0) {
    throw new Error('At least one field must be provided to update the job');
  }

  const job = await fergusClient.put(`/jobs/${jobId}`, requestBody);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(job, null, 2),
      },
    ],
  };
}
