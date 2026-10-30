/**
 * Tests for list parameter limits, required fields, stock, price book search,
 * the quote draft error and the extra filters.
 *
 * The fake client records every request and answers in the Partner API's
 * shapes. Its rules follow the API:
 *  - list endpoints accept pageSize 1-100 and a fixed set of sortField values;
 *  - GET /stockUsed accepts only filterDateFrom and pageCursor;
 *  - GET /pricebooks is paged (100 per page) and never lists the custom price
 *    book, supplier 0, which POST /pricebooks/search accepts;
 *  - DELETE returns 204, which the client turns into {};
 *  - a quote update that isn't a draft returns 400 with the message in the body.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { handleManageJobs, manageJobsToolDefinition } from '../jobs.js';
import { handleManageInvoices, manageInvoicesToolDefinition } from '../invoices.js';
import { handleManageTimeEntries, manageTimeEntriesToolDefinition } from '../time-entries.js';
import { handleManageCustomers, manageCustomersToolDefinition } from '../customers.js';
import { handleManageSites, manageSitesToolDefinition } from '../sites.js';
import { handleManageContacts, manageContactsToolDefinition } from '../contacts.js';
import { handleManageQuotes, manageQuotesToolDefinition } from '../quotes.js';
import { handleManageStock, manageStockToolDefinition } from '../stock.js';
import { handleManagePricebooks, managePricebooksToolDefinition } from '../pricebooks.js';
import { handleManageFavourites, manageFavouritesToolDefinition } from '../favourites.js';
import { handleManageEnquiries, manageEnquiriesToolDefinition } from '../enquiries.js';
import { handleManageUsers, manageUsersToolDefinition } from '../users.js';
import { handleManagePricingTiers, managePricingTiersToolDefinition } from '../pricing-tiers.js';
import { handleManageNotes, manageNotesToolDefinition } from '../notes.js';
import { addressSchema } from '../schemas.js';
import { FergusAPIError, type FergusClient } from '../../fergus-client.js';

type Call = { method: string; endpoint: string; body?: any };

class FakeApi {
  calls: Call[] = [];
  pricebookPages: any[][] = [[{ id: 420619, supplierId: 439221, supplierName: "Paul's Supplier" }]];
  quoteIsDraft = true;

  handle(method: string, endpoint: string, body?: any): any {
    this.calls.push({ method, endpoint, body });
    const [path, query] = endpoint.split('?');
    const params = new URLSearchParams(query);

    if (method === 'GET' && path === '/pricebooks') {
      const page = Number(params.get('pageCursor') ?? 0);
      const next = page + 1 < this.pricebookPages.length ? String(page + 1) : null;
      return { data: this.pricebookPages[page], paging: { links: { next: next ? `/pricebooks?pageCursor=${next}` : null } } };
    }
    if (method === 'GET' && /^\/jobs\/\d+\/quotes\/\d+$/.test(path)) {
      return { result: 'success', data: { id: 1, title: 'Quote', description: null, sections: [] } };
    }
    if (method === 'PUT' && /^\/jobs\/\d+\/quotes\//.test(path) && !this.quoteIsDraft) {
      throw new FergusAPIError('API request failed: Bad Request', 400, {
        statusCode: 400, error: 'Bad Request', message: 'The quote must be a draft to be updated.',
      });
    }
    if (method === 'DELETE') return {}; // the client turns the API's empty 204 into {}
    if (method === 'GET' && /^\/jobs\/\d+$/.test(path)) return { result: 'success', data: { id: 1 } };
    return { data: [], paging: { links: { next: null } } };
  }

  sent(method: string, prefix: string): Call | undefined {
    return this.calls.find((c) => c.method === method && c.endpoint.startsWith(prefix));
  }

  query(method: string, prefix: string): URLSearchParams {
    const call = this.sent(method, prefix);
    assert.ok(call, `no ${method} ${prefix} request`);
    return new URLSearchParams(call!.endpoint.split('?')[1] ?? '');
  }
}

function clientFor(api: FakeApi): FergusClient {
  return {
    get: async (e: string) => api.handle('GET', e),
    post: async (e: string, b: any) => api.handle('POST', e, b),
    put: async (e: string, b: any) => api.handle('PUT', e, b),
    patch: async (e: string, b: any) => api.handle('PATCH', e, b),
    delete: async (e: string, b?: any) => api.handle('DELETE', e, b),
  } as unknown as FergusClient;
}

const JOB_ID = '90000001'; // an API id, so no job-number lookup

describe('sortField values', () => {
  const cases: Array<{ tool: any; handler: any; args: any; allowed: string[]; prefix: string }> = [
    { tool: manageJobsToolDefinition, handler: handleManageJobs, args: { action: 'list' }, allowed: ['jobNo', 'createdAt', 'lastModified'], prefix: '/jobs?' },
    { tool: manageInvoicesToolDefinition, handler: handleManageInvoices, args: { action: 'list' }, allowed: ['id', 'createdAt', 'dueDate'], prefix: '/customerInvoices' },
    { tool: manageTimeEntriesToolDefinition, handler: handleManageTimeEntries, args: { action: 'list', filterDateFrom: '2026-10-01', filterDateTo: '2026-10-20' }, allowed: ['timeEntryDate', 'jobNo', 'user'], prefix: '/timeEntries' },
    { tool: manageCustomersToolDefinition, handler: handleManageCustomers, args: { action: 'list' }, allowed: ['name', 'createdAt'], prefix: '/customers' },
    { tool: manageSitesToolDefinition, handler: handleManageSites, args: { action: 'list' }, allowed: ['name', 'createdAt'], prefix: '/sites' },
    { tool: manageContactsToolDefinition, handler: handleManageContacts, args: { action: 'list' }, allowed: ['firstName', 'lastName', 'createdAt'], prefix: '/contacts' },
  ];

  for (const { tool, handler, args, allowed, prefix } of cases) {
    test(`${tool.name} offers only ${allowed.join(', ')}`, () => {
      assert.deepEqual(tool.inputSchema.properties.sortField.enum, allowed);
    });

    test(`${tool.name} rejects another sortField before calling the API`, async () => {
      const api = new FakeApi();
      await assert.rejects(() => handler(clientFor(api), { ...args, sortField: 'title' }), /sortField must be one of/);
      assert.equal(api.calls.length, 0);
    });

    for (const value of allowed) {
      test(`${tool.name} sends sortField ${value}`, async () => {
        const api = new FakeApi();
        await handler(clientFor(api), { ...args, sortField: value });
        assert.equal(api.query('GET', prefix).get('sortField'), value);
      });
    }
  }

  for (const value of ['id', 'versionNumber']) {
    test(`quotes list sends sortField ${value}`, async () => {
      const api = new FakeApi();
      await handleManageQuotes(clientFor(api), { action: 'list', jobId: JOB_ID, sortField: value });
      assert.equal(api.query('GET', `/jobs/${JOB_ID}/quotes`).get('sortField'), value);
    });
  }

  for (const value of ['id', 'createdAt', 'lastModified']) {
    test(`quotes list-all sends sortField ${value}`, async () => {
      const api = new FakeApi();
      await handleManageQuotes(clientFor(api), { action: 'list-all', sortField: value });
      assert.equal(api.query('GET', '/jobs/quotes').get('sortField'), value);
    });
  }

  for (const value of ['name', 'createdAt', 'sortOrder']) {
    test(`favourites list sends sortField ${value}`, async () => {
      const api = new FakeApi();
      await handleManageFavourites(clientFor(api), { action: 'list', sortField: value });
      assert.equal(api.query('GET', '/favourites').get('sortField'), value);
    });
  }

  for (const value of ['dateEntered', 'lastModified']) {
    test(`stock list-on-hand sends sortField ${value}`, async () => {
      const api = new FakeApi();
      await handleManageStock(clientFor(api), { action: 'list-on-hand', sortField: value });
      assert.equal(api.query('GET', '/phases/stockOnHand').get('sortField'), value);
    });
  }

  test('stock list-on-hand rejects another sortField before calling the API', async () => {
    const api = new FakeApi();
    await assert.rejects(() => handleManageStock(clientFor(api), { action: 'list-on-hand', sortField: 'createdAt' }), /sortField must be one of: dateEntered, lastModified/);
    assert.equal(api.calls.length, 0);
  });

  test('quotes list and list-all each accept only their own sort fields', async () => {
    const api = new FakeApi();
    await assert.rejects(() => handleManageQuotes(clientFor(api), { action: 'list', jobId: JOB_ID, sortField: 'createdAt' }), /sortField must be one of: id, versionNumber/);
    await assert.rejects(() => handleManageQuotes(clientFor(api), { action: 'list-all', sortField: 'versionNumber' }), /sortField must be one of: id, createdAt, lastModified/);
    assert.equal(api.calls.length, 0);

    await handleManageQuotes(clientFor(api), { action: 'list', jobId: JOB_ID, sortField: 'versionNumber' });
    await handleManageQuotes(clientFor(api), { action: 'list-all', sortField: 'lastModified' });
    assert.equal(api.query('GET', `/jobs/${JOB_ID}/quotes`).get('sortField'), 'versionNumber');
    assert.equal(api.query('GET', '/jobs/quotes').get('sortField'), 'lastModified');
  });
});

describe('pageSize limit', () => {
  const tools = [
    manageJobsToolDefinition, manageInvoicesToolDefinition, manageTimeEntriesToolDefinition, manageCustomersToolDefinition,
    manageSitesToolDefinition, manageContactsToolDefinition, manageQuotesToolDefinition, manageStockToolDefinition,
    managePricebooksToolDefinition, manageFavouritesToolDefinition, manageEnquiriesToolDefinition, manageUsersToolDefinition,
    managePricingTiersToolDefinition, manageNotesToolDefinition,
  ];
  for (const tool of tools) {
    test(`${tool.name} pageSize is 1 to 100`, () => {
      const pageSize: any = (tool.inputSchema.properties as any).pageSize;
      assert.equal(pageSize.minimum, 1);
      assert.equal(pageSize.maximum, 100);
    });
  }

  for (const bad of [0, 101, 2.5]) {
    test(`a pageSize of ${bad} is rejected before calling the API`, async () => {
      const api = new FakeApi();
      await assert.rejects(() => handleManageJobs(clientFor(api), { action: 'list', pageSize: bad }), /pageSize must be a whole number from 1 to 100/);
      assert.equal(api.calls.length, 0);
    });
  }

  // Every list handler checks pageSize itself: nothing enforces the schema.
  const listCalls: Array<[string, (c: FergusClient, a: any) => Promise<any>, any]> = [
    ['jobs list', handleManageJobs, { action: 'list' }],
    ['invoices list', handleManageInvoices, { action: 'list' }],
    ['time entries list', handleManageTimeEntries, { action: 'list', filterDateFrom: '2026-10-01', filterDateTo: '2026-10-20' }],
    ['customers list', handleManageCustomers, { action: 'list' }],
    ['sites list', handleManageSites, { action: 'list' }],
    ['contacts list', handleManageContacts, { action: 'list' }],
    ['quotes list', handleManageQuotes, { action: 'list', jobId: JOB_ID }],
    ['quotes list-all', handleManageQuotes, { action: 'list-all' }],
    ['stock list-on-hand', handleManageStock, { action: 'list-on-hand' }],
    ['stock list-on-hand-by-phase', handleManageStock, { action: 'list-on-hand-by-phase', jobPhaseId: '1' }],
    ['pricebooks list', handleManagePricebooks, { action: 'list' }],
    ['pricebooks list-items', handleManagePricebooks, { action: 'list-items', pricebookId: '1' }],
    ['pricebooks search', handleManagePricebooks, { action: 'search', searchText: 'pipe' }],
    ['favourites list', handleManageFavourites, { action: 'list' }],
    ['enquiries list', handleManageEnquiries, { action: 'list' }],
    ['users list', handleManageUsers, { action: 'list' }],
    ['pricing tiers list', handleManagePricingTiers, { action: 'list' }],
    ['notes list', handleManageNotes, { action: 'list', filterEntityName: 'JOB', filterEntityId: 1 }],
  ];
  for (const [label, handler, args] of listCalls) {
    test(`${label} rejects pageSize 101 before calling the API`, async () => {
      const api = new FakeApi();
      await assert.rejects(() => handler(clientFor(api), { ...args, pageSize: 101 }), /pageSize must be a whole number from 1 to 100/);
      assert.equal(api.calls.length, 0);
    });
  }

  test('a pageSize of 100 is sent', async () => {
    const api = new FakeApi();
    await handleManageCustomers(clientFor(api), { action: 'list', pageSize: 100 });
    assert.equal(api.query('GET', '/customers').get('pageSize'), '100');
  });
});

describe('required fields', () => {
  test('an address requires address1 (customers and sites)', () => {
    assert.deepEqual((addressSchema as any).required, ['address1']);
    const customerProps: any = manageCustomersToolDefinition.inputSchema.properties;
    const siteProps: any = manageSitesToolDefinition.inputSchema.properties;
    for (const props of [customerProps, siteProps]) {
      const addresses = Object.values(props).filter((p: any) => p?.properties?.address1);
      assert.ok(addresses.length > 0);
      for (const a of addresses) assert.deepEqual((a as any).required, ['address1']);
    }
  });

  test('a quote section requires name', () => {
    const sections: any = (manageQuotesToolDefinition.inputSchema.properties as any).sections;
    assert.deepEqual(sections.items.required, ['name']);
  });
});

describe('manage-quotes', () => {
  test('list-all refuses createdAfter and modifiedAfter together', async () => {
    const api = new FakeApi();
    await assert.rejects(
      () => handleManageQuotes(clientFor(api), { action: 'list-all', createdAfter: '2026-10-01T00:00:00Z', modifiedAfter: '2026-10-01T00:00:00Z' }),
      /can't be combined/
    );
    assert.equal(api.calls.length, 0);
  });

  for (const action of ['update', 'update-version']) {
    test(`${action} on a quote that isn't a draft shows the friendly message`, async () => {
      const api = new FakeApi();
      api.quoteIsDraft = false;
      const args = action === 'update'
        ? { action, jobId: JOB_ID, quoteId: '1', sections: [{ name: 'Main', lineItems: [] }] }
        : { action, jobId: JOB_ID, versionNumber: 1, sections: [{ name: 'Main', lineItems: [] }] };
      api.handle = ((orig) => function (this: FakeApi, m: string, e: string, b?: any) {
        if (m === 'GET' && e.startsWith(`/jobs/${JOB_ID}/quotes?`)) { this.calls.push({ method: m, endpoint: e }); return { data: [{ id: 1, versionNumber: 1 }], paging: { links: {} } }; }
        return orig.call(this, m, e, b);
      })(api.handle);
      await assert.rejects(() => handleManageQuotes(clientFor(api), args), /must be in DRAFT status/);
    });
  }
});

describe('manage-stock', () => {
  test('list-used sends only the start date and cursor', async () => {
    const api = new FakeApi();
    await handleManageStock(clientFor(api), { action: 'list-used', filterDateFrom: '2026-09-01', filterSearchText: 'pipe', pageSize: 10, pageCursor: 'abc' });
    const q = api.query('GET', '/stockUsed');
    assert.deepEqual([...q.keys()].sort(), ['filterDateFrom', 'pageCursor']);
    assert.equal(q.get('filterDateFrom'), '2026-09-01');
  });

  test('list-used rejects a badly formatted start date', async () => {
    const api = new FakeApi();
    await assert.rejects(() => handleManageStock(clientFor(api), { action: 'list-used', filterDateFrom: '01/09/2026' }), /yyyy-mm-dd/);
    assert.equal(api.calls.length, 0);
  });

  test('the tool no longer offers search or page size for list-used', () => {
    const props: any = manageStockToolDefinition.inputSchema.properties;
    assert.doesNotMatch(props.filterSearchText.description, /list-used/);
    assert.doesNotMatch(props.pageSize.description, /list-used/);
    assert.match(props.filterDateFrom.description, /list-used/);
  });

  test('list-on-hand sends dateEntered with its sort field', async () => {
    const api = new FakeApi();
    await handleManageStock(clientFor(api), { action: 'list-on-hand', dateEntered: '2026-10-01T00:00:00Z' });
    assert.equal(api.query('GET', '/phases/stockOnHand').get('dateEntered'), '2026-10-01T00:00:00Z');
  });

  test('list-on-hand refuses a date that does not match the sort field', async () => {
    const api = new FakeApi();
    await assert.rejects(
      () => handleManageStock(clientFor(api), { action: 'list-on-hand', sortField: 'dateEntered', lastModified: '2026-10-01T00:00:00Z' }),
      /lastModified only applies when sortField is lastModified/
    );
    assert.equal(api.calls.length, 0);
  });

  test('delete-on-hand reports success for the empty response', async () => {
    const api = new FakeApi();
    const result: any = await handleManageStock(clientFor(api), { action: 'delete-on-hand', jobPhaseId: '1', stockOnHandId: '2' });
    assert.deepEqual(JSON.parse(result.content[0].text), { success: true });
  });
});

describe('manage-pricebooks', () => {
  test('search accepts supplier 0, the custom price book', async () => {
    const api = new FakeApi();
    await handleManagePricebooks(clientFor(api), { action: 'search', searchText: 'pipe', supplierIds: [0] });
    assert.deepEqual(api.sent('POST', '/pricebooks/search')!.body, { search: 'pipe', supplierIds: [0], allSuppliers: false });
  });

  test('supplier lookup reads every page of price books', async () => {
    const api = new FakeApi();
    api.pricebookPages = [
      Array.from({ length: 100 }, (_, i) => ({ id: 500000 + i, supplierId: 600000 + i, supplierName: `Supplier ${i}` })),
      [{ id: 700000, supplierId: 800000, supplierName: 'Reece' }],
    ];
    await handleManagePricebooks(clientFor(api), { action: 'search', searchText: 'pipe', supplierNames: ['Reece'] });
    assert.deepEqual(api.sent('POST', '/pricebooks/search')!.body.supplierIds, [800000]);
  });

  test('beyond the page limit, an unknown supplier ID is passed through rather than rejected', async () => {
    const api = new FakeApi();
    api.pricebookPages = Array.from({ length: 51 }, (_, p) => [{ id: 500000 + p, supplierId: 600000 + p, supplierName: `Supplier ${p}` }]);
    await handleManagePricebooks(clientFor(api), { action: 'search', searchText: 'pipe', supplierIds: [999999] });

    assert.equal(api.calls.filter((c) => c.endpoint.startsWith('/pricebooks?')).length, 50);
    assert.deepEqual(api.sent('POST', '/pricebooks/search')!.body.supplierIds, [999999]);
  });

  test('beyond the page limit, an unknown supplier name says the list was cut short', async () => {
    const api = new FakeApi();
    api.pricebookPages = Array.from({ length: 51 }, (_, p) => [{ id: 500000 + p, supplierId: 600000 + p, supplierName: `Supplier ${p}` }]);
    await assert.rejects(
      () => handleManagePricebooks(clientFor(api), { action: 'search', searchText: 'pipe', supplierNames: ['Supplier 50'] }),
      /Only the first 50 price books could be read/
    );
  });

  test('a cut-short list is remembered for the next search on the same connection', async () => {
    const api = new FakeApi();
    api.pricebookPages = Array.from({ length: 51 }, (_, p) => [{ id: 500000 + p, supplierId: 600000 + p, supplierName: `Supplier ${p}` }]);
    const client = clientFor(api);
    await handleManagePricebooks(client, { action: 'search', searchText: 'pipe', supplierIds: [999999] });
    await handleManagePricebooks(client, { action: 'search', searchText: 'pipe', supplierIds: [888888] });

    // The second search used the cached list and still passed the unknown ID through.
    assert.equal(api.calls.filter((c) => c.endpoint.startsWith('/pricebooks?')).length, 50);
    const searches = api.calls.filter((c) => c.method === 'POST');
    assert.deepEqual(searches.map((c) => c.body.supplierIds), [[999999], [888888]]);
  });

  test('a supplier name in a cut-short list is still resolved', async () => {
    const api = new FakeApi();
    api.pricebookPages = Array.from({ length: 51 }, (_, p) => [{ id: 500000 + p, supplierId: 600000 + p, supplierName: `Supplier ${p}` }]);
    await handleManagePricebooks(clientFor(api), { action: 'search', searchText: 'pipe', supplierNames: ['Supplier 7'] });

    assert.deepEqual(api.sent('POST', '/pricebooks/search')!.body.supplierIds, [600007]);
  });

  test('a repeated page cursor stops the lookup, and unknown IDs are passed through', async () => {
    const api = new FakeApi();
    const orig = api.handle.bind(api);
    api.handle = (m: string, e: string, b?: any) => {
      if (m === 'GET' && e.startsWith('/pricebooks?')) {
        api.calls.push({ method: m, endpoint: e });
        return { data: [{ id: 1, supplierId: 2, supplierName: 'Acme' }], paging: { links: { next: '/pricebooks?pageCursor=same' } } };
      }
      return orig(m, e, b);
    };
    await handleManagePricebooks(clientFor(api), { action: 'search', searchText: 'pipe', supplierIds: [999999] });

    assert.equal(api.calls.filter((c) => c.endpoint.startsWith('/pricebooks?')).length, 2);
    assert.deepEqual(api.sent('POST', '/pricebooks/search')!.body.supplierIds, [999999]);
  });

  test('with every page read, an unknown supplier ID is still rejected', async () => {
    const api = new FakeApi();
    await assert.rejects(
      () => handleManagePricebooks(clientFor(api), { action: 'search', searchText: 'pipe', supplierIds: [999999] }),
      /aren't supplier IDs/
    );
    assert.equal(api.sent('POST', '/pricebooks/search'), undefined);
  });

  test('search rejects a term shorter than 3 characters', async () => {
    const api = new FakeApi();
    await assert.rejects(() => handleManagePricebooks(clientFor(api), { action: 'search', searchText: 'ab' }), /at least 3 characters/);
    assert.equal(api.calls.length, 0);
  });

  test('list sends filterSupplierName, and get-item sends filterPricingTierId', async () => {
    const api = new FakeApi();
    await handleManagePricebooks(clientFor(api), { action: 'list', filterSupplierName: 'Ree' });
    await handleManagePricebooks(clientFor(api), { action: 'get-item', pricebookId: '1', itemId: '2', filterPricingTierId: 7 });
    assert.equal(api.query('GET', '/pricebooks?').get('filterSupplierName'), 'Ree');
    assert.equal(api.query('GET', '/pricebooks/1/pricebookItems/2').get('filterPricingTierId'), '7');
  });
});

describe('filters', () => {
  test('contacts list sends contact type, customer and site', async () => {
    const api = new FakeApi();
    await handleManageContacts(clientFor(api), { action: 'list', filterContactType: 'SITE', filterCustomerId: 5, filterSiteId: 6 });
    const q = api.query('GET', '/contacts');
    assert.equal(q.get('filterContactType'), 'SITE');
    assert.equal(q.get('filterCustomerId'), '5');
    assert.equal(q.get('filterSiteId'), '6');
  });

  test('invoices list sends the direct debit status', async () => {
    const api = new FakeApi();
    await handleManageInvoices(clientFor(api), { action: 'list', filterDirectDebitStatus: 'failed' });
    assert.equal(api.query('GET', '/customerInvoices').get('filterDirectDebitStatus'), 'failed');
  });

  test('list-phases sends the phase status and updated-since filters', async () => {
    const api = new FakeApi();
    await handleManageJobs(clientFor(api), { action: 'list-phases', jobId: JOB_ID, filterPhaseStatus: 'In Progress', filterUpdatedSince: '2026-10-01T00:00:00Z' });
    const q = api.query('GET', `/jobs/${JOB_ID}/phases`);
    assert.equal(q.get('filterStatus'), 'In Progress');
    assert.equal(q.get('filterUpdatedSince'), '2026-10-01T00:00:00Z');
  });

  test('list-phases sends no query when no filters are given', async () => {
    const api = new FakeApi();
    await handleManageJobs(clientFor(api), { action: 'list-phases', jobId: JOB_ID });
    assert.equal(api.sent('GET', `/jobs/${JOB_ID}/phases`)!.endpoint, `/jobs/${JOB_ID}/phases`);
  });

  test('favourites list sends representation, search, section and sort', async () => {
    const api = new FakeApi();
    await handleManageFavourites(clientFor(api), { action: 'list', representation: 'tree', filterSearchText: 'tap', filterSectionName: 'Bathroom', sortField: 'name', sortOrder: 'desc' });
    const q = api.query('GET', '/favourites');
    assert.deepEqual(
      ['representation', 'filterSearchText', 'filterSectionName', 'sortField', 'sortOrder'].map((k) => q.get(k)),
      ['tree', 'tap', 'Bathroom', 'name', 'desc']
    );
  });

  test('favourites rejects an unknown sortField', async () => {
    const api = new FakeApi();
    await assert.rejects(() => handleManageFavourites(clientFor(api), { action: 'list', sortField: 'price' }), /sortField must be one of: name, createdAt, sortOrder/);
  });
});
