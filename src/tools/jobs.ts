/**
 * Job Tools (consolidated)
 * manage-jobs: get, list, create, update, finalize, get-financial-summary, list-phases, get-phase, create-phase, update-phase, void-phase, get-phase-financial-summary
 */

import { FergusClient } from '../fergus-client.js';
import { resolveJobId } from './job-resolver.js';
import { normalizeListResponse } from '../utils/format-response.js';

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
  description: 'Manage jobs. Actions: get, list, create, update, finalize, get-financial-summary, list-phases, get-phase, create-phase, update-phase, void-phase, get-phase-financial-summary. Update only works on draft jobs, and changes the title, job type, description, customer, site or customer reference; the current title and job type are kept if left out. Job numbers of archived and on-hold jobs are found too. IMPORTANT: When creating a job, always confirm jobType, customer, and site with the user before proceeding — do not infer or assume these from existing jobs or context.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['get', 'list', 'create', 'update', 'finalize', 'get-financial-summary', 'list-phases', 'get-phase', 'create-phase', 'update-phase', 'void-phase', 'get-phase-financial-summary'],
        description: 'The action to perform.',
      },
      jobId: {
        ...jobIdSchema,
        description: 'Job number or API ID. Accepts "Job-500", "500", or an API ID. Draft jobs have no job number, so update and finalize need the draft\'s API ID, which is returned when the draft is created; drafts don\'t appear in list. (required for: get, update, finalize, get-financial-summary, list-phases, get-phase, create-phase, update-phase)',
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
        type: 'number',
        description: 'Filter by customer ID. (for: list)',
      },
      filterSiteId: {
        type: 'number',
        description: 'Filter by site ID. (for: list)',
      },
      filterShowArchived: {
        type: 'boolean',
        description: 'Set true to list only archived jobs (archived jobs, including on-hold ones, are left out by default). (for: list)',
      },
      filterShowOnHold: {
        type: 'boolean',
        description: 'Set true to list only on-hold jobs. Ignored when filterShowArchived is also true, which lists all archived jobs, on-hold ones included. (for: list)',
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
        description: 'Type of job. Always ask the user which type to use — do not assume. (required for: create; for: update of a draft job, which keeps the current type if left out)',
      },
      title: {
        type: 'string',
        description: 'Job title. (required for: create; for: update, which keeps the current title if left out)',
      },
      description: {
        type: 'string',
        description: 'Job description. Required when isDraft is false. (for: create, update)',
      },
      customerId: {
        type: 'number',
        description: 'Customer ID. Always confirm with the user — do not assume from existing jobs or search results. Required when isDraft is false. (for: create, update)',
      },
      siteId: {
        type: 'number',
        description: 'Site ID. Always confirm with the user — do not assume from existing jobs or search results. Required when isDraft is false. (for: create, update)',
      },
      customerReference: {
        type: 'string',
        description: 'Customer reference number. (for: create, update)',
      },
      isDraft: {
        type: 'boolean',
        description: 'Whether to create the job as a draft. Default: true. (for: create)',
        default: true,
      },
      // phase params
      jobPhaseId: {
        type: 'string',
        description: 'Job phase ID. (required for: get-phase, update-phase, void-phase, get-phase-financial-summary)',
      },
      phaseName: {
        type: 'string',
        description: 'Phase name. (required for: create-phase; for: update-phase, which keeps the current name if omitted)',
      },
      phaseDescription: {
        type: 'string',
        description: 'Phase description. (required for: create-phase; for: update-phase, which keeps the current description if omitted; an empty string clears it)',
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
    case 'update-phase':
      return handleUpdatePhase(fergusClient, args);
    case 'void-phase':
      return handleVoidPhase(fergusClient, args);
    case 'get-phase-financial-summary':
      return handleGetPhaseFinancialSummary(fergusClient, args);
    default:
      throw new Error(`Unknown action: ${args.action}. Valid actions: get, list, create, update, finalize, get-financial-summary, list-phases, get-phase, create-phase, update-phase, void-phase, get-phase-financial-summary`);
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
  // Only send these when true: an explicit false makes the API skip its
  // archived filter and return active and archived jobs together.
  if (args.filterShowArchived === true) params.append('filterShowArchived', 'true');
  if (args.filterShowOnHold === true) params.append('filterShowOnHold', 'true');
  if (filterSearchText) params.append('filterSearchText', filterSearchText);

  const jobs = await fergusClient.get(`/jobs?${params.toString()}`);
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(normalizeListResponse(jobs), null, 2),
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
  if (description === '') {
    throw new Error("A job's description can't be set to empty. Nothing was changed.");
  }
  if (customerReference === '') {
    throw new Error("A job's customer reference can't be set to empty. Nothing was changed.");
  }

  const { id: jobId } = await resolveJobId(fergusClient, String(jobRef));
  const existingJobResponse: any = await fergusClient.get(`/jobs/${jobId}`);
  const existingJob = existingJobResponse?.data ?? existingJobResponse;

  // The API only updates draft jobs, and requires title and jobType on
  // every update, so send the current values when they aren't given. The read
  // model exposes the job title as "description", so use that when "title" is
  // absent in GET responses.
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
    title === undefined &&
    jobType === undefined
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
  const job = await fergusClient.action('PUT', `/jobs/${jobId}/finalise`);
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

// ===== UPDATE PHASE =====

async function handleUpdatePhase(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { jobId: jobRef, jobPhaseId, phaseName, phaseDescription } = args;
  if (!jobRef || !jobPhaseId) {
    throw new Error('jobId and jobPhaseId are required for update-phase action');
  }
  // An empty phaseDescription is a value: it clears the description.
  const descriptionGiven = phaseDescription !== undefined && phaseDescription !== null;
  if (!phaseName && !descriptionGiven) {
    throw new Error('At least one of phaseName or phaseDescription must be provided for update-phase action');
  }

  const { id: jobId } = await resolveJobId(fergusClient, String(jobRef));

  // The API needs both title and description on a phase update, so keep the
  // current value of whichever wasn't given.
  let current: any = {};
  if (!phaseName || !descriptionGiven) {
    const response: any = await fergusClient.get(`/jobs/${jobId}/phases/${jobPhaseId}`);
    current = response?.data ?? response;
  }
  const requestBody: any = {
    title: phaseName || current.title,
    description: phaseDescription ?? current.description ?? '',
  };
  if (!requestBody.title) {
    throw new Error(`Phase ${jobPhaseId} has no name on record; send phaseName. Nothing was changed.`);
  }

  const phase = await fergusClient.put(`/jobs/${jobId}/phases/${jobPhaseId}`, requestBody);
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(phase, null, 2),
      },
    ],
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
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
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
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(summary, null, 2),
      },
    ],
  };
}
