/**
 * Job Tools (consolidated)
 * manage-jobs: get, list, create, update, finalize, get-financial-summary, list-phases, get-phase, create-phase
 */

import { FergusClient } from '../fergus-client.js';

export const manageJobsToolDefinition = {
  name: 'manage-jobs',
  description: 'Manage jobs. Actions: get, list, create, update, finalize, get-financial-summary, list-phases, get-phase, create-phase',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['get', 'list', 'create', 'update', 'finalize', 'get-financial-summary', 'list-phases', 'get-phase', 'create-phase'],
        description: 'The action to perform',
      },
      jobId: {
        type: 'string',
        description: 'Job ID (required for: get, update, finalize, get-financial-summary, list-phases, get-phase, create-phase)',
      },
      jobPhaseId: {
        type: 'string',
        description: 'Phase ID (required for: get-phase)',
      },
      // list params
      status: {
        type: 'string',
        description: 'Filter by job status (for: list)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of jobs to return (for: list, default: 50)',
        default: 50,
      },
      sortField: {
        type: 'string',
        description: 'Field to sort by (for: list, default: createdAt)',
        default: 'createdAt',
      },
      sortOrder: {
        type: 'string',
        description: 'Sort order: asc or desc (for: list)',
        enum: ['asc', 'desc'],
        default: 'desc',
      },
      pageCursor: {
        type: 'string',
        description: 'Pagination cursor for next page (for: list)',
        default: '0',
      },
      // create params
      jobType: {
        type: 'string',
        description: 'Type of job (required for: create)',
        enum: ['Quote', 'Estimate', 'Charge Up'],
      },
      title: {
        type: 'string',
        description: 'Job title (required for: create, optional for: update)',
      },
      description: {
        type: 'string',
        description: 'Job description (for: create, update)',
      },
      customerId: {
        type: 'number',
        description: 'Customer ID (for: create, update)',
      },
      siteId: {
        type: 'number',
        description: 'Site ID (for: create, update)',
      },
      customerReference: {
        type: 'string',
        description: 'Customer reference number (for: create, update)',
      },
      isDraft: {
        type: 'boolean',
        description: 'Whether to create as a draft job (for: create, default: true)',
        default: true,
      },
      // create-phase params
      phaseName: {
        type: 'string',
        description: 'Phase name (required for: create-phase)',
      },
      phaseDescription: {
        type: 'string',
        description: 'Phase description (for: create-phase)',
      },
    },
    required: ['action'],
  },
};

export async function handleManageJobs(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  switch (args.action) {
    case 'get':
      return handleGetJob(fergusClient, args);
    case 'list':
      return handleListJobs(fergusClient, args);
    case 'create':
      return handleCreateJob(fergusClient, args);
    case 'update':
      return handleUpdateJob(fergusClient, args);
    case 'finalize':
      return handleFinalizeJob(fergusClient, args);
    case 'get-financial-summary':
      return handleGetFinancialSummary(fergusClient, args);
    case 'list-phases':
      return handleListPhases(fergusClient, args);
    case 'get-phase':
      return handleGetPhase(fergusClient, args);
    case 'create-phase':
      return handleCreatePhase(fergusClient, args);
    default:
      throw new Error(`Unknown action: ${args.action}. Valid actions: get, list, create, update, finalize, get-financial-summary, list-phases, get-phase, create-phase`);
  }
}

// ===== GET JOB =====

async function handleGetJob(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const jobId = args.jobId;
  if (!jobId) {
    throw new Error('jobId is required for get action');
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

async function handleListJobs(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const limit = args.limit || 50;
  const sortField = args.sortField || 'createdAt';
  const sortOrder = args.sortOrder || 'desc';
  const pageCursor = args.pageCursor || '0';

  let endpoint = `/jobs?limit=${limit}&sortField=${sortField}&sortOrder=${sortOrder}&pageCursor=${pageCursor}`;
  if (args.status) {
    endpoint += `&status=${encodeURIComponent(args.status)}`;
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

async function handleCreateJob(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { jobType, title, description, customerId, siteId, customerReference, isDraft = true } = args;

  if (!jobType || !title) {
    throw new Error('jobType and title are required for create action');
  }

  if (!isDraft) {
    if (!description || !customerId || !siteId) {
      throw new Error(
        'Non-draft jobs require description, customerId, and siteId. Set isDraft=true to create a draft job with fewer requirements.'
      );
    }
  }

  const requestBody: any = { jobType, title, isDraft };
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

async function handleUpdateJob(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { jobId, title, description, customerId, siteId, customerReference } = args;

  if (!jobId) {
    throw new Error('jobId is required for update action');
  }

  const requestBody: any = {};
  if (title !== undefined) requestBody.title = title;
  if (description !== undefined) requestBody.description = description;
  if (customerId !== undefined) requestBody.customerId = customerId;
  if (siteId !== undefined) requestBody.siteId = siteId;
  if (customerReference !== undefined) requestBody.customerReference = customerReference;

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

async function handleFinalizeJob(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { jobId } = args;
  if (!jobId) {
    throw new Error('jobId is required for finalize action');
  }

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

// ===== GET FINANCIAL SUMMARY =====

async function handleGetFinancialSummary(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { jobId } = args;
  if (!jobId) {
    throw new Error('jobId is required for get-financial-summary action');
  }

  const summary = await fergusClient.get(`/jobs/${jobId}/financial-summary`);
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(summary, null, 2),
      },
    ],
  };
}

// ===== LIST PHASES =====

async function handleListPhases(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { jobId } = args;
  if (!jobId) {
    throw new Error('jobId is required for list-phases action');
  }

  const phases = await fergusClient.get(`/jobs/${jobId}/phases`);
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(phases, null, 2),
      },
    ],
  };
}

// ===== GET PHASE =====

async function handleGetPhase(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { jobId, jobPhaseId } = args;
  if (!jobId || !jobPhaseId) {
    throw new Error('jobId and jobPhaseId are required for get-phase action');
  }

  const phase = await fergusClient.get(`/jobs/${jobId}/phases/${jobPhaseId}`);
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(phase, null, 2),
      },
    ],
  };
}

// ===== CREATE PHASE =====

async function handleCreatePhase(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { jobId, phaseName, phaseDescription } = args;
  if (!jobId || !phaseName) {
    throw new Error('jobId and phaseName are required for create-phase action');
  }

  const requestBody: any = { name: phaseName };
  if (phaseDescription) requestBody.description = phaseDescription;

  const phase = await fergusClient.post(`/jobs/${jobId}/phases`, requestBody);
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(phase, null, 2),
      },
    ],
  };
}
