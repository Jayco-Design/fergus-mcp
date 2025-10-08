/**
 * Job Tools
 * All job-related operations (get, list, create, update, finalize)
 */

import { FergusClient } from '../fergus-client.js';

// ===== GET JOB =====

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

// ===== LIST JOBS =====

export const listJobsToolDefinition = {
  name: 'list-jobs',
  description: 'List all jobs with optional filtering and sorting',
  annotations: {
    readOnlyHint: true
  },
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

// ===== CREATE JOB =====

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

// ===== UPDATE JOB =====

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

// ===== FINALIZE JOB =====

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
