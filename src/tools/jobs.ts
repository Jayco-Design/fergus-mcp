/**
 * Job Tools (consolidated)
 * manage-jobs: get, list, create, update, finalize, get-financial-summary, list-phases, get-phase, create-phase
 */

import { FergusClient } from '../fergus-client.js';
import { resolveJobId } from './job-resolver.js';

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
        description: 'Job number or ID. Accepts user-friendly refs like "Job-500" or "500" as well as API IDs. (required for: get, update, finalize, get-financial-summary, list-phases, get-phase, create-phase)',
      },
      jobPhaseId: {
        type: 'string',
        description: 'Phase ID (required for: get-phase)',
      },
      // list params
      filterJobNo: {
        type: 'string',
        description: 'Filter by job number e.g. "500" (for: list). Supports partial match.',
      },
      filterJobStatus: {
        type: 'string',
        description: 'Filter by job status (for: list)',
        enum: ['Active', 'Completed', 'Estimate Rejected', 'Estimate Sent', 'Inactive', 'Quote Sent', 'Quote Rejected', 'To Price'],
      },
      filterJobType: {
        type: 'string',
        description: 'Filter by job type (for: list)',
        enum: ['Quote', 'Estimate', 'Charge Up'],
      },
      filterCustomerId: {
        type: 'number',
        description: 'Filter by customer ID (for: list)',
      },
      filterSiteId: {
        type: 'number',
        description: 'Filter by site ID (for: list)',
      },
      filterSearchText: {
        type: 'string',
        description: 'Full-text search across job description, customer name, site name, contact names, and job number (for: list)',
      },
      pageSize: {
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
        description: 'Phase description (required for: create-phase)',
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
  const jobRef = args.jobId;
  if (!jobRef) {
    throw new Error('jobId is required for get action');
  }

  const { id: jobId } = await resolveJobId(fergusClient, String(jobRef));
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
  const {
    filterJobNo,
    filterJobStatus,
    filterJobType,
    filterCustomerId,
    filterSiteId,
    filterSearchText,
    pageSize = 50,
    sortField = 'createdAt',
    sortOrder = 'desc',
    pageCursor = '0',
  } = args;

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  params.append('sortField', sortField);
  params.append('sortOrder', sortOrder);
  params.append('pageCursor', pageCursor);

  if (filterJobNo) params.append('filterJobNo', filterJobNo);
  if (filterJobStatus) params.append('filterJobStatus', filterJobStatus);
  if (filterJobType) params.append('filterJobType', filterJobType);
  if (filterCustomerId) params.append('filterCustomerId', filterCustomerId.toString());
  if (filterSiteId) params.append('filterSiteId', filterSiteId.toString());
  if (filterSearchText) params.append('filterSearchText', filterSearchText);

  const jobs = await fergusClient.get(`/jobs?${params.toString()}`);
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
  const { jobId: jobRef, jobType, title, description, customerId, siteId, customerReference } = args;

  if (!jobRef) {
    throw new Error('jobId is required for update action');
  }

  const { id: jobId } = await resolveJobId(fergusClient, String(jobRef));
  const existingJobResponse: any = await fergusClient.get(`/jobs/${jobId}`);
  const existingJob = existingJobResponse?.data ?? existingJobResponse;

  // Fergus currently rejects partial job updates unless title and jobType
  // are present. The read model exposes the job title as "description",
  // so fall back to that field when "title" is absent in GET responses.
  const requestBody: any = {
    title: title ?? existingJob?.title ?? existingJob?.description,
    jobType: jobType ?? existingJob?.jobType,
  };
  if (description !== undefined) requestBody.description = description;
  if (customerId !== undefined) requestBody.customerId = customerId;
  if (siteId !== undefined) requestBody.siteId = siteId;
  if (customerReference !== undefined) requestBody.customerReference = customerReference;

  if (
    description === undefined &&
    customerId === undefined &&
    siteId === undefined &&
    customerReference === undefined &&
    title === undefined
  ) {
    throw new Error('At least one field must be provided to update the job');
  }

  if (!requestBody.title || !requestBody.jobType) {
    throw new Error('Unable to determine title and jobType required for job update');
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
  const jobRef = args.jobId;
  if (!jobRef) {
    throw new Error('jobId is required for finalize action');
  }

  const { id: jobId } = await resolveJobId(fergusClient, String(jobRef));
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
  const jobRef = args.jobId;
  if (!jobRef) {
    throw new Error('jobId is required for get-financial-summary action');
  }

  const { id: jobId } = await resolveJobId(fergusClient, String(jobRef));
  const summary = await fergusClient.get(`/jobs/${jobId}/financialSummary`);
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
  const jobRef = args.jobId;
  if (!jobRef) {
    throw new Error('jobId is required for list-phases action');
  }

  const { id: jobId } = await resolveJobId(fergusClient, String(jobRef));
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
  const { jobId: jobRef, jobPhaseId } = args;
  if (!jobRef || !jobPhaseId) {
    throw new Error('jobId and jobPhaseId are required for get-phase action');
  }

  const { id: jobId } = await resolveJobId(fergusClient, String(jobRef));
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
  const { jobId: jobRef, phaseName, phaseDescription } = args;
  if (!jobRef || !phaseName || !phaseDescription) {
    throw new Error('jobId, phaseName, and phaseDescription are required for create-phase action');
  }

  const { id: jobId } = await resolveJobId(fergusClient, String(jobRef));

  const requestBody = {
    title: phaseName,
    description: phaseDescription,
  };

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
