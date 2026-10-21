/**
 * Tests for jobs, the job-number lookup, quotes and invoices.
 *
 * FakeApi follows the Partner API's behaviour:
 *  - GET /jobs leaves out archived (and on-hold) jobs unless
 *    filterShowArchived is set, and then returns only archived ones. It never
 *    returns drafts. filterJobNo matches job numbers containing the digits,
 *    and results come in creation order unless sortField=jobNo.
 *  - PUT /jobs/:id/phases/:phaseId needs both title and description.
 *  - PUT /jobs/:id only updates drafts (400 "Job is not in draft" otherwise),
 *    and requires title and jobType on every update. Drafts have no job
 *    number, so they're referred to by API id.
 *  - GET /jobs/:id/quotes is paged, 10 per page by default, with no lookup by
 *    version number.
 *  - GET /customerInvoices filters jobId on the job's API id.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { handleManageJobs } from '../jobs.js';
import { handleManageQuotes } from '../quotes.js';
import { handleManageInvoices } from '../invoices.js';
import { FergusAPIError, type FergusClient } from '../../fergus-client.js';

const ACTIVE = { id: 90000001, jobNo: '1001', title: 'Test job 1001', jobType: 'Quote', archived: false };
const ARCHIVED = { id: 90000002, jobNo: '1002', title: 'Test job 1002', jobType: 'Quote', archived: true };
const DRAFT = { id: 90000003, jobNo: null, title: 'Draft test job', jobType: 'Quote', archived: false, draft: true };

type FakeJob = { id: number; jobNo: string | null; title: string; jobType: string; archived: boolean; draft?: boolean };

class FakeApi {
  writes: Array<{ method: string; endpoint: string; body: any }> = [];
  gets: string[] = [];
  jobs: FakeJob[] = [ACTIVE, ARCHIVED, DRAFT];
  phase = { id: 80000001, title: 'Phase A', description: 'Phase A scope' };
  quotes = Array.from({ length: 12 }, (_, i) => ({ id: 70000000 + i, versionNumber: i + 1, title: `v${i + 1}`, description: '<p>Intro</p>' }));

  get(endpoint: string) {
    this.gets.push(endpoint);
    const [path, query] = endpoint.split('?');
    const params = new URLSearchParams(query);

    if (path === '/jobs') {
      const archived = params.get('filterShowArchived') === 'true';
      const jobNo = params.get('filterJobNo');
      let data = this.jobs.filter((j) => !j.draft && j.archived === archived && (!jobNo || j.jobNo!.includes(jobNo)));
      if (params.get('sortField') === 'jobNo') data = [...data].sort((a, b) => Number(a.jobNo) - Number(b.jobNo));
      const size = Number(params.get('pageSize') ?? 10);
      return { data: data.slice(0, size), paging: { links: { next: data.length > size ? '/jobs?pageCursor=next' : null } } };
    }
    const job = path.match(/^\/jobs\/(\d+)$/);
    if (job) {
      const found = this.jobs.find((j) => j.id === Number(job[1]));
      if (!found) throw new FergusAPIError('API request failed: Not Found', 404);
      // Like the API, the job's title comes back as description; there's no title field.
      return { result: 'success', data: { id: found.id, jobNo: found.jobNo, description: found.title, jobType: found.jobType } };
    }
    if (/^\/jobs\/\d+\/phases\/\d+$/.test(path)) return { result: 'success', data: { ...this.phase } };
    if (/^\/jobs\/\d+\/quotes$/.test(path)) {
      const size = Math.min(Number(params.get('pageSize') ?? 10), 10); // pages of at most 10, to exercise paging
      const start = Number(params.get('pageCursor') ?? 0);
      const data = this.quotes.slice(start, start + size);
      const next = start + size < this.quotes.length ? `/jobs/1/quotes?pageCursor=${start + size}` : null;
      return { data, paging: { pageCount: data.length, links: { next } } };
    }
    const quote = path.match(/^\/jobs\/\d+\/quotes\/(\d+)$/);
    if (quote) return { result: 'success', data: this.quotes.find((q) => q.id === Number(quote[1])) };
    if (path === '/customerInvoices') return { data: [{ id: 1, jobId: Number(params.get('jobId')) }], paging: { links: {} } };
    throw new Error(`unexpected GET ${endpoint}`);
  }

  put(endpoint: string, body: any) {
    this.writes.push({ method: 'PUT', endpoint, body });
    const job = endpoint.match(/^\/jobs\/(\d+)$/);
    if (job) {
      if (!this.jobs.find((j) => j.id === Number(job[1]))?.draft) {
        throw new FergusAPIError('API request failed: Bad Request', 400, { statusCode: 400, error: 'Bad Request', message: 'Job is not in draft' });
      }
      if (!body.title || !body.jobType) {
        throw new FergusAPIError('API request failed: Bad Request', 400, { message: 'title and jobType are required' });
      }
    }
    if (/^\/jobs\/\d+\/phases\/\d+$/.test(endpoint)) {
      if (typeof body.title !== 'string' || typeof body.description !== 'string') {
        throw new FergusAPIError('API request failed: Bad Request', 400, { message: "body must have required property 'title' and 'description'" });
      }
      Object.assign(this.phase, body);
      return { result: 'success', data: this.phase };
    }
    return { result: 'success', data: body };
  }

  post(endpoint: string, body: any) {
    this.writes.push({ method: 'POST', endpoint, body });
    return { result: 'Created', data: body };
  }
}

function clientFor(api: FakeApi): FergusClient {
  return {
    get: async (e: string) => api.get(e),
    put: async (e: string, b: any) => api.put(e, b),
    post: async (e: string, b: any) => api.post(e, b),
  } as unknown as FergusClient;
}

describe('job number lookup', () => {
  test('finds an archived job by its job number', async () => {
    const api = new FakeApi();
    const result: any = await handleManageJobs(clientFor(api), { action: 'get', jobId: '1002' });

    assert.match(result.content[0].text, /Test job 1002/);
    assert.ok(api.gets.some((g) => g.includes('filterShowArchived=true')));
  });

  test('finds an active job without asking for archived ones', async () => {
    const api = new FakeApi();
    await handleManageJobs(clientFor(api), { action: 'get', jobId: 'Job-1001' });

    assert.equal(api.gets.some((g) => g.includes('filterShowArchived')), false);
  });

  test('finds a short job number among more than a page of near-matches', async () => {
    const api = new FakeApi();
    // 150 jobs whose numbers contain "5", created before job 5 itself.
    const nearMatches = Array.from({ length: 1000 }, (_, i) => i + 10)
      .filter((n) => String(n).includes('5'))
      .slice(0, 150)
      .map((n) => ({ id: 30000000 + n, jobNo: String(n), title: `Job ${n}`, jobType: 'Quote', archived: false }));
    api.jobs = [...nearMatches, { id: 30000005, jobNo: '5', title: 'Job five', jobType: 'Quote', archived: false }];

    const result: any = await handleManageJobs(clientFor(api), { action: 'get', jobId: 'Job-5' });

    assert.match(result.content[0].text, /Job five/);
    assert.equal(api.gets.filter((g) => g.startsWith('/jobs?')).length, 1);
  });

  test('still reports a job number that matches nothing', async () => {
    await assert.rejects(() => handleManageJobs(clientFor(new FakeApi()), { action: 'get', jobId: '9999' }), /Job "9999" not found/);
  });

  test('jobs list passes the archived and on-hold filters', async () => {
    const api = new FakeApi();
    await handleManageJobs(clientFor(api), { action: 'list', filterShowArchived: true });
    await handleManageJobs(clientFor(api), { action: 'list', filterShowOnHold: true });

    assert.match(api.gets[0], /filterShowArchived=true/);
    assert.match(api.gets[1], /filterShowOnHold=true/);
  });

  test('jobs list leaves out a false archived filter, which would return everything', async () => {
    const api = new FakeApi();
    await handleManageJobs(clientFor(api), { action: 'list', filterShowArchived: false });

    assert.equal(api.gets[0].includes('filterShowArchived'), false);
  });
});

describe('manage-jobs update-phase', () => {
  test('renaming a phase keeps its description', async () => {
    const api = new FakeApi();
    await handleManageJobs(clientFor(api), { action: 'update-phase', jobId: '1001', jobPhaseId: '80000001', phaseName: 'Phase A renamed' });

    assert.deepEqual(api.writes[0].body, { title: 'Phase A renamed', description: 'Phase A scope' });
    assert.equal(api.phase.description, 'Phase A scope');
  });

  test('changing only the description keeps the name', async () => {
    const api = new FakeApi();
    await handleManageJobs(clientFor(api), { action: 'update-phase', jobId: '1001', jobPhaseId: '80000001', phaseDescription: 'New scope' });

    assert.deepEqual(api.writes[0].body, { title: 'Phase A', description: 'New scope' });
  });

  test('an empty description on its own clears it and keeps the name', async () => {
    const api = new FakeApi();
    await handleManageJobs(clientFor(api), { action: 'update-phase', jobId: '1001', jobPhaseId: '80000001', phaseDescription: '' });

    assert.deepEqual(api.writes[0].body, { title: 'Phase A', description: '' });
  });

  test('renaming a phase with no description sends an empty one', async () => {
    const api = new FakeApi();
    (api.phase as any).description = null;
    await handleManageJobs(clientFor(api), { action: 'update-phase', jobId: '1001', jobPhaseId: '80000001', phaseName: 'Renamed' });

    assert.deepEqual(api.writes[0].body, { title: 'Renamed', description: '' });
  });
});

describe('manage-jobs update', () => {
  test('keeps the current title and job type, which the API requires on every update', async () => {
    const api = new FakeApi();
    await handleManageJobs(clientFor(api), { action: 'update', jobId: String(DRAFT.id), description: 'More detail' });

    assert.equal(api.writes[0].endpoint, `/jobs/${DRAFT.id}`);
    assert.equal(api.writes[0].body.jobType, 'Quote');
    assert.equal(api.writes[0].body.title, 'Draft test job');
  });

  test('a draft is updated by its API id, without a job number lookup', async () => {
    const api = new FakeApi();
    await handleManageJobs(clientFor(api), { action: 'update', jobId: String(DRAFT.id), title: 'Draft test job renamed' });

    assert.equal(api.gets.some((g) => g.startsWith('/jobs?')), false);
    assert.equal(api.writes[0].body.title, 'Draft test job renamed');
  });

  test('changes the job type of a draft when asked', async () => {
    const api = new FakeApi();
    await handleManageJobs(clientFor(api), { action: 'update', jobId: String(DRAFT.id), jobType: 'Charge Up' });

    assert.equal(api.writes[0].body.jobType, 'Charge Up');
  });

  test('updating a job that isn\'t a draft passes on the API\'s "not in draft" error', async () => {
    const api = new FakeApi();
    await assert.rejects(
      () => handleManageJobs(clientFor(api), { action: 'update', jobId: '1001', description: 'More detail' }),
      (err: any) => err instanceof FergusAPIError && err.statusCode === 400 && err.response?.message === 'Job is not in draft'
    );
  });

  test('rejects an empty description before calling the API', async () => {
    const api = new FakeApi();
    await assert.rejects(() => handleManageJobs(clientFor(api), { action: 'update', jobId: String(DRAFT.id), description: '' }), /can't be set to empty/);
    assert.equal(api.writes.length, 0);
  });
});

describe('manage-quotes', () => {
  test('update-version finds a version past the first page of 10', async () => {
    const api = new FakeApi();
    await handleManageQuotes(clientFor(api), { action: 'update-version', jobId: '1001', versionNumber: 11, sections: [{ name: 'Main', lineItems: [] }] });

    const put = api.writes.find((w) => w.method === 'PUT');
    assert.equal(put?.endpoint, `/jobs/${ACTIVE.id}/quotes/version/11`);
    assert.equal(put?.body.title, 'v11');
  });

  test('create passes price book lines and discounts through to the API', async () => {
    const api = new FakeApi();
    const sections = [{ name: 'Materials', lineItems: [{ priceBookLineItemId: 123456, itemQuantity: 4, discountRate: 0.1 }] }];
    await handleManageQuotes(clientFor(api), { action: 'create', jobId: '1001', title: 'Quote', dueDays: 30, sections });

    const post = api.writes.find((w) => w.method === 'POST');
    assert.deepEqual(post?.body.sections[0].lineItems[0], { priceBookLineItemId: 123456, itemQuantity: 4, discountRate: 0.1 });
  });
});

describe('manage-invoices list', () => {
  test('a job number in jobId is resolved to the job\'s API id', async () => {
    const api = new FakeApi();
    await handleManageInvoices(clientFor(api), { action: 'list', jobId: '1001' });

    const call = api.gets.find((g) => g.startsWith('/customerInvoices'));
    assert.equal(new URLSearchParams(call!.split('?')[1]).get('jobId'), String(ACTIVE.id));
  });

  test('an API id in jobId is used as it is', async () => {
    const api = new FakeApi();
    await handleManageInvoices(clientFor(api), { action: 'list', jobId: '90000002' });

    const call = api.gets.find((g) => g.startsWith('/customerInvoices'));
    assert.equal(new URLSearchParams(call!.split('?')[1]).get('jobId'), '90000002');
  });
});
