/**
 * Job Tools (consolidated)
 * manage-jobs: get, list, create, update, finalize, get-financial-summary, list-phases, get-phase, create-phase
 */

import { FergusClient } from '../fergus-client.js';
import { resolveJobId } from './job-resolver.js';

const jobStatusOptions = ['Active', 'Completed', 'Estimate Rejected', 'Estimate Sent', 'Inactive', 'Quote Sent', 'Quote Rejected', 'To Price'] as const;
const jobTypeOptions = ['Quote', 'Estimate', 'Charge Up'] as const;

const jobIdSchema = {
  type: 'string',
  description: 'Job number or API ID. Accepts user-friendly refs like "Job-500" or "500" as well as API IDs.',
};

const jobTypeSchema = {
  type: 'string',
  enum: [...jobTypeOptions],
};

export const manageJobsToolDefinition = {
  name: 'manage-jobs',
  description: 'Manage jobs. Actions: get, list, create, update, get-financial-summary, list-phases, get-phase, create-phase, update-phase, void-phase, get-phase-financial-summary. Jobs require a customer and site at creation time. The wrapper preserves title/jobType on updates and compensates for Fergus read/write model mismatches.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['get', 'list', 'create', 'update', 'get-financial-summary', 'list-phases', 'get-phase', 'create-phase', 'update-phase', 'void-phase', 'get-phase-financial-summary'],
        description: 'The action to perform.',
      },
      jobId: {
        ...jobIdSchema,
        description: 'Job number or API ID. Accepts "Job-500", "500", or an API ID. (required for: get, update, finalize, get-financial-summary, list-phases, get-phase, create-phase)',
      },
      // list params
      filterJobNo: {
        type: 'string',
        description: 'Filter by job number such as "500". Supports partial match. (for: list)',
      },
      filterJobStatus: {
        type: 'string',
        description: 'Filter by Fergus job status. (for: list)',
        enum: [...jobStatusOptions],
      },
      filterJobType: {
        ...jobTypeSchema,
        description: 'Filter by job type. (for: list)',
      },
      filterCustomerId: {
        type: 'string',
        description: 'Filter by customer ID. (for: list)',
      },
      filterSiteId: {
        type: 'string',
        description: 'Filter by site ID. (for: list)',
      },
      filterSearchText: {
        type: 'string',
        description: 'Full-text search across job description, customer, site, contact names, and job number. (for: list)',
      },
      pageSize: {
        type: 'number',
        description: 'Maximum number of jobs to return. Default: 50. (for: list)',
        default: 50,
      },
      sortField: {
        type: 'string',
        enum: ['jobNo', 'createdAt', 'lastModified'],
        description: 'Field to sort by. Default: createdAt. (for: list)',
        default: 'createdAt',
      },
      sortOrder: {
        type: 'string',
        description: 'Sort order. (for: list)',
        enum: ['asc', 'desc'],
        default: 'desc',
      },
      pageCursor: {
        type: 'string',
        description: 'Pagination cursor for the next page. (for: list)',
        default: '0',
      },
      // create/update params
      jobType: {
        ...jobTypeSchema,
        description: 'Type of job. (required for: create; optional for: update — wrapper preserves current value)',
      },
      title: {
        type: 'string',
        description: 'Job title. (required for: create; optional for: update — wrapper preserves current value)',
      },
      description: {
        type: 'string',
        description: 'Job description. (required for: create; optional for: update)',
      },
      customerId: {
        type: 'string',
        description: 'Customer ID. (required for: create; optional for: update)',
      },
      siteId: {
        type: 'string',
        description: 'Site ID. (required for: create; optional for: update)',
      },
      customerReference: {
        type: 'string',
        description: 'Customer reference number. (for: create, update)',
      },
      // phase params
      jobPhaseId: {
        type: 'string',
        description: 'Job phase ID. (required for: get-phase, update-phase, void-phase, get-phase-financial-summary)',
      },
      phaseTitle: {
        type: 'string',
        description: 'Phase title. (required for: create-phase; optional for: update-phase)',
      },
      phaseDescription: {
        type: 'string',
        description: 'Phase description. (required for: create-phase; optional for: update-phase)',
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
    case 'get-financial-summary':
      return handleGetFinancialSummary(fergusClient, args);
    case 'list-phases':
      return handleListPhases(fergusClient, args);
    case 'get-phase':
      return handleGetPhase(fergusClient, args);
    case 'create-phase':
      return handleCreatePhase(fergusClient, args);
    case 'update-phase':
      return handleUpdatePhase(fergusClient, args);
    case 'void-phase':
      return handleVoidPhase(fergusClient, args);
    case 'get-phase-financial-summary':
      return handleGetPhaseFinancialSummary(fergusClient, args);
    default:
      throw new Error(`Unknown action: ${args.action}. Valid actions: get, list, create, update, get-financial-summary, list-phases, get-phase, create-phase, update-phase, void-phase, get-phase-financial-summary`);
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
  const { jobType, title, description, customerId, siteId, customerReference } = args;

  if (!jobType || !title || !description || !customerId || !siteId) {
    throw new Error(
      'jobType, title, description, customerId, and siteId are all required for create action. ' +
      'Use manage-customers and manage-sites to find or create the customer and site first.'
    );
  }

  const requestBody: any = { jobType, title, description, customerId, siteId };
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
  const { jobId: jobRef, phaseTitle, phaseDescription } = args;
  if (!jobRef || !phaseTitle || !phaseDescription) {
    throw new Error('jobId, phaseTitle, and phaseDescription are required for create-phase action');
  }

  const { id: jobId } = await resolveJobId(fergusClient, String(jobRef));

  const requestBody = {
    title: phaseTitle,
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

// ===== UPDATE PHASE =====

async function handleUpdatePhase(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { jobId: jobRef, jobPhaseId, phaseTitle, phaseDescription } = args;
  if (!jobRef || !jobPhaseId) {
    throw new Error('jobId and jobPhaseId are required for update-phase action');
  }

  const { id: jobId } = await resolveJobId(fergusClient, String(jobRef));

  const requestBody: Record<string, unknown> = {};
  if (phaseTitle !== undefined) requestBody.title = phaseTitle;
  if (phaseDescription !== undefined) requestBody.description = phaseDescription;

  if (Object.keys(requestBody).length === 0) {
    throw new Error('At least one of phaseTitle or phaseDescription must be provided');
  }

  const phase = await fergusClient.put(`/jobs/${jobId}/phases/${jobPhaseId}`, requestBody);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(phase, null, 2) }],
  };
}

// ===== VOID PHASE =====

async function handleVoidPhase(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { jobId: jobRef, jobPhaseId } = args;
  if (!jobRef || !jobPhaseId) {
    throw new Error('jobId and jobPhaseId are required for void-phase action');
  }

  const { id: jobId } = await resolveJobId(fergusClient, String(jobRef));
  const result = await fergusClient.post(`/jobs/${jobId}/phases/${jobPhaseId}/void`, {});
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}

// ===== GET PHASE FINANCIAL SUMMARY =====

async function handleGetPhaseFinancialSummary(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { jobId: jobRef, jobPhaseId } = args;
  if (!jobRef || !jobPhaseId) {
    throw new Error('jobId and jobPhaseId are required for get-phase-financial-summary action');
  }

  const { id: jobId } = await resolveJobId(fergusClient, String(jobRef));
  const summary = await fergusClient.get(`/jobs/${jobId}/phases/${jobPhaseId}/financialSummary`);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }],
  };
}
