/**
 * Get Job Tool
 * Retrieves detailed information for a specific job by ID
 */

import { FergusClient } from '../fergus-client.js';

export const getJobToolDefinition = {
  name: 'get-job',
  description: 'Get details for a specific job by ID',
  annotations: {
    readOnlyHint: true
  },
  inputSchema: {
    type: 'object',
    properties: {
      jobId: {
        type: 'string',
        description: 'The ID of the job to retrieve',
      },
    },
    required: ['jobId'],
  },
};

export async function handleGetJob(
  fergusClient: FergusClient,
  args: { jobId?: string }
) {
  const jobId = args?.jobId;
  if (!jobId) {
    throw new Error('jobId is required');
  }

  const job = await fergusClient.get(`/jobs/${jobId}`);
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(job, null, 2),
      },
    ],
  };
}
