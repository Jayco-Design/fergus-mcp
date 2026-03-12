/**
 * Job ID Resolver
 * Resolves user-facing job references (e.g. "Job-500", "500") to API IDs.
 *
 * Fergus jobs have two identifiers:
 * - jobNo: human-readable number shown in the UI (e.g. "500" displayed as "Job-500")
 * - id: internal API identifier (e.g. 20701539)
 *
 * Users always refer to jobs by jobNo. This utility resolves jobNo → id.
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
 * Otherwise searches by jobNo and returns the matching API ID.
 */
export async function resolveJobId(
  fergusClient: FergusClient,
  jobRef: string
): Promise<{ id: number; jobNo: string }> {
  const jobNo = extractJobNo(jobRef);

  if (!jobNo) {
    throw new Error(`Cannot parse job reference: "${jobRef}". Use a job number like "500" or "Job-500".`);
  }

  // If it looks like an API ID already (7+ digits), verify it exists
  if (!looksLikeJobNo(jobRef)) {
    const job: any = await fergusClient.get(`/jobs/${jobRef}`);
    return { id: job.id || parseInt(jobRef), jobNo: job.jobNo || jobRef };
  }

  // Search for the job by number — the API's filterSearchText does substring matching
  // so we need to fetch results and find the exact match
  const response: any = await fergusClient.get(`/jobs?pageSize=50&filterSearchText=${jobNo}`);
  const jobs = response.data || [];

  // Find exact jobNo match
  const match = jobs.find((j: any) => String(j.jobNo) === jobNo);
  if (match) {
    return { id: match.id, jobNo: match.jobNo };
  }

  // filterSearchText might not match jobNo directly — try fetching more broadly
  // by listing recent jobs and scanning
  const broadResponse: any = await fergusClient.get(`/jobs?pageSize=200&sortField=createdAt&sortOrder=desc`);
  const broadJobs = broadResponse.data || [];
  const broadMatch = broadJobs.find((j: any) => String(j.jobNo) === jobNo);
  if (broadMatch) {
    return { id: broadMatch.id, jobNo: broadMatch.jobNo };
  }

  throw new Error(
    `Job "${jobRef}" not found. Could not find a job with number ${jobNo}. ` +
    `Try using the full API ID if you have it, or check the job number in Fergus.`
  );
}
