/**
 * Job ID Resolver
 * Resolves user-facing job references (e.g. "Job-500", "500") to API IDs.
 *
 * Fergus jobs have two identifiers:
 * - jobNo (internal_job_id): human-readable number shown in the UI (e.g. "500" displayed as "Job-500")
 * - id: internal API identifier (e.g. 20701539)
 *
 * Users always refer to jobs by jobNo. This utility resolves jobNo → id.
 * The jobs API supports filterJobNo (LIKE match on internal_job_id, indexed).
 * The timeEntries API filterJobNo does exact match on internal_job_id.
 */

import { FergusClient } from '../fergus-client.js';

/**
 * Extract numeric job number from user input.
 * Handles: "Job-500", "job-500", "JOB 500", "#500", "500"
 */
export function extractJobNo(input: string): string | null {
  const cleaned = input.trim();

  // Match "Job-500", "job 500", "JOB-500", "#500", or plain "500"
  const match = cleaned.match(/^(?:job[- ]?|#)?(\d+)$/i);
  return match ? match[1] : null;
}

/**
 * Check if a value looks like a job reference (jobNo) rather than an API ID.
 * API IDs are typically 7-8 digit numbers; jobNos are 1-4 digits.
 * Also triggers if input contains non-numeric characters (e.g. "Job-500").
 */
export function looksLikeJobNo(input: string): boolean {
  const cleaned = input.trim();

  // Contains non-numeric chars → definitely a job reference
  if (/[^0-9]/.test(cleaned)) return true;

  // Pure number: if <= 6 digits, likely a jobNo; if >= 7, likely an API ID
  return cleaned.length <= 6;
}

/**
 * Resolve a job reference to an API ID.
 * If the input already looks like an API ID, returns it as-is.
 * Otherwise uses filterJobNo (LIKE on internal_job_id) to find exact match.
 */
export async function resolveJobId(
  fergusClient: FergusClient,
  jobRef: string
): Promise<{ id: number; jobNo: string }> {
  const jobNo = extractJobNo(jobRef);

  if (!jobNo) {
    throw new Error(`Cannot parse job reference: "${jobRef}". Use a job number like "500" or "Job-500".`);
  }

  // If it looks like an API ID already (7+ digits), return as-is
  if (!looksLikeJobNo(jobRef)) {
    return { id: parseInt(jobNo), jobNo: jobNo };
  }

  // Use filterJobNo which does LIKE match on internal_job_id (indexed)
  const response: any = await fergusClient.get(`/jobs?pageSize=10&filterJobNo=${jobNo}`);
  const jobs = response.data || [];

  // filterJobNo is LIKE-based, so find the exact match
  const match = jobs.find((j: any) => String(j.jobNo) === jobNo);
  if (match) {
    return { id: match.id, jobNo: match.jobNo };
  }

  throw new Error(
    `Job "${jobRef}" not found. Could not find a job with number ${jobNo}. ` +
    `Try using the full API ID if you have it, or check the job number in Fergus.`
  );
}
