/**
 * Finalize Job Tool
 * Finalizes a draft job, making it active
 */

import { FergusClient } from '../fergus-client.js';

export const finalizeJobToolDefinition = {
  name: 'finalize-job',
  description: 'Finalize a draft job, converting it from draft to active status. The job must have all required fields (title, description, customerId, siteId) before it can be finalized.',
  inputSchema: {
    type: 'object',
    properties: {
      jobId: {
        type: 'number',
        description: 'ID of the draft job to finalize',
      },
    },
    required: ['jobId'],
  },
};

export async function handleFinalizeJob(
  fergusClient: FergusClient,
  args: {
    jobId: number;
  }
) {
  const { jobId } = args;

  const job = await fergusClient.put(`/jobs/${jobId}/finalise`, {});

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(job, null, 2),
      },
    ],
  };
}
