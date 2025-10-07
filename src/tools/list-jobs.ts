/**
 * List Jobs Tool
 * Lists all jobs with optional filtering and sorting
 */

import { FergusClient } from '../fergus-client.js';

export const listJobsToolDefinition = {
  name: 'list-jobs',
  description: 'List all jobs with optional filtering and sorting',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: 'Filter by job status (e.g., active, completed)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of jobs to return',
        default: 50,
      },
      sortField: {
        type: 'string',
        description: 'Field to sort by (e.g., createdAt, lastModified)',
        default: 'createdAt',
      },
      sortOrder: {
        type: 'string',
        description: 'Sort order: asc (oldest first) or desc (newest first)',
        enum: ['asc', 'desc'],
        default: 'desc',
      },
      pageCursor: {
        type: 'string',
        description: 'Pagination cursor for next page',
        default: '0',
      },
    },
  },
};

export async function handleListJobs(
  fergusClient: FergusClient,
  args: { status?: string; limit?: number; sortField?: string; sortOrder?: string; pageCursor?: string }
) {
  const status = args?.status;
  const limit = args?.limit || 50;
  const sortField = args?.sortField || 'createdAt';
  const sortOrder = args?.sortOrder || 'desc';
  const pageCursor = args?.pageCursor || '0';

  let endpoint = `/jobs?limit=${limit}&sortField=${sortField}&sortOrder=${sortOrder}&pageCursor=${pageCursor}`;
  if (status) {
    endpoint += `&status=${encodeURIComponent(status)}`;
  }

  const jobs = await fergusClient.get(endpoint);
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(jobs, null, 2),
      },
    ],
  };
}
