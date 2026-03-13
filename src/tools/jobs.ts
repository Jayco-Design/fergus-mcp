/**
 * Job Tools (consolidated)
 * manage-jobs: get, list, create, update, finalize, get-financial-summary, list-phases, get-phase, create-phase
 */

import { FergusClient } from '../fergus-client.js';
import { resolveJobId } from './job-resolver.js';

const jobStatusOptions = ['Active', 'Completed', 'Estimate Rejected', 'Estimate Sent', 'Inactive', 'Quote Sent', 'Quote Rejected', 'To Price'] as const;
const jobTypeOptions = ['Quote', 'Estimate', 'Charge Up'] as const;
const quirksResourceHint = 'Read `docs://fergus/known-quirks.md` before write operations.';

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
  description: 'Manage jobs with action-specific schemas. Write actions include wrapper behavior notes for Fergus API quirks.',
  inputSchema: {
    description: 'Choose exactly one job action schema.',
    oneOf: [
      {
        title: 'Get Job',
        description: 'Get a single job by job number or API ID.',
        type: 'object',
        additionalProperties: false,
        properties: {
          action: {
            const: 'get',
            description: 'Get a single job.',
          },
          jobId: jobIdSchema,
        },
        required: ['action', 'jobId'],
      },
      {
        title: 'List Jobs',
        description: 'List jobs with Fergus filters and pagination.',
        type: 'object',
        additionalProperties: false,
        properties: {
          action: {
            const: 'list',
            description: 'List jobs.',
          },
          filterJobNo: {
            type: 'string',
            description: 'Filter by job number such as "500". Supports partial match.',
          },
          filterJobStatus: {
            type: 'string',
            description: 'Filter by Fergus job status.',
            enum: [...jobStatusOptions],
          },
          filterJobType: {
            ...jobTypeSchema,
            description: 'Filter by job type.',
          },
          filterCustomerId: {
            type: 'number',
            description: 'Filter by customer ID.',
          },
          filterSiteId: {
            type: 'number',
            description: 'Filter by site ID.',
          },
          filterSearchText: {
            type: 'string',
            description: 'Full-text search across job description, customer, site, contact names, and job number.',
          },
          pageSize: {
            type: 'number',
            description: 'Maximum number of jobs to return. Default: 50.',
            default: 50,
          },
          sortField: {
            type: 'string',
            description: 'Field to sort by. Default: createdAt.',
            default: 'createdAt',
          },
          sortOrder: {
            type: 'string',
            description: 'Sort order.',
            enum: ['asc', 'desc'],
            default: 'desc',
          },
          pageCursor: {
            type: 'string',
            description: 'Pagination cursor for the next page.',
            default: '0',
          },
        },
        required: ['action'],
      },
      {
        title: 'Create Job',
        description: `Create a new job. Behavior Notes: draft jobs only require jobType and title; non-draft jobs also require description, customerId, and siteId. ${quirksResourceHint}`,
        type: 'object',
        additionalProperties: false,
        properties: {
          action: {
            const: 'create',
            description: 'Create a new job.',
          },
          jobType: {
            ...jobTypeSchema,
            description: 'Type of job to create.',
          },
          title: {
            type: 'string',
            description: 'Job title.',
          },
          description: {
            type: 'string',
            description: 'Job description. Required when isDraft is false.',
          },
          customerId: {
            type: 'number',
            description: 'Customer ID. Required when isDraft is false.',
          },
          siteId: {
            type: 'number',
            description: 'Site ID. Required when isDraft is false.',
          },
          customerReference: {
            type: 'string',
            description: 'Customer reference number.',
          },
          isDraft: {
            type: 'boolean',
            description: 'Whether to create the job as a draft. Default: true.',
            default: true,
          },
        },
        required: ['action', 'jobType', 'title'],
      },
      {
        title: 'Update Job',
        description: `Update a draft job. Behavior Notes: Fergus currently rejects partial updates unless title and jobType are present. This wrapper reads the current job and preserves those fields when omitted, but callers can still supply title and jobType explicitly if needed. ${quirksResourceHint}`,
        type: 'object',
        additionalProperties: false,
        properties: {
          action: {
            const: 'update',
            description: 'Update a draft job.',
          },
          jobId: jobIdSchema,
          title: {
            type: 'string',
            description: 'Explicit job title override. Usually optional because the wrapper preserves the current title.',
          },
          jobType: {
            ...jobTypeSchema,
            description: 'Explicit job type override. Usually optional because the wrapper preserves the current job type.',
          },
          description: {
            type: 'string',
            description: 'Updated job description.',
          },
          customerId: {
            type: 'number',
            description: 'Updated customer ID.',
          },
          siteId: {
            type: 'number',
            description: 'Updated site ID.',
          },
          customerReference: {
            type: 'string',
            description: 'Updated customer reference number.',
          },
        },
        required: ['action', 'jobId'],
      },
      {
        title: 'Finalize Job',
        description: `Finalize a draft job. Behavior Notes: Fergus expects the job to already satisfy its required draft fields before finalization. ${quirksResourceHint}`,
        type: 'object',
        additionalProperties: false,
        properties: {
          action: {
            const: 'finalize',
            description: 'Finalize a draft job.',
          },
          jobId: jobIdSchema,
        },
        required: ['action', 'jobId'],
      },
      {
        title: 'Get Job Financial Summary',
        description: 'Get the financial summary for a job.',
        type: 'object',
        additionalProperties: false,
        properties: {
          action: {
            const: 'get-financial-summary',
            description: 'Get the job financial summary.',
          },
          jobId: jobIdSchema,
        },
        required: ['action', 'jobId'],
      },
      {
        title: 'List Job Phases',
        description: 'List phases for a job.',
        type: 'object',
        additionalProperties: false,
        properties: {
          action: {
            const: 'list-phases',
            description: 'List job phases.',
          },
          jobId: jobIdSchema,
        },
        required: ['action', 'jobId'],
      },
      {
        title: 'Get Job Phase',
        description: 'Get a single phase on a job.',
        type: 'object',
        additionalProperties: false,
        properties: {
          action: {
            const: 'get-phase',
            description: 'Get a specific job phase.',
          },
          jobId: jobIdSchema,
          jobPhaseId: {
            type: 'string',
            description: 'Job phase ID.',
          },
        },
        required: ['action', 'jobId', 'jobPhaseId'],
      },
      {
        title: 'Create Job Phase',
        description: `Create a phase on a job. Behavior Notes: Fergus requires both phase name and phase description. ${quirksResourceHint}`,
        type: 'object',
        additionalProperties: false,
        properties: {
          action: {
            const: 'create-phase',
            description: 'Create a job phase.',
          },
          jobId: jobIdSchema,
          phaseName: {
            type: 'string',
            description: 'Phase name.',
          },
          phaseDescription: {
            type: 'string',
            description: 'Phase description.',
          },
        },
        required: ['action', 'jobId', 'phaseName', 'phaseDescription'],
      },
    ],
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
