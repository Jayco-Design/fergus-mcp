/**
 * Tests for manage-quotes update / update-version title and description.
 *
 * The Partner API PUT /jobs/:jobId/quotes/:quoteId (and /version/:n) accepts
 * optional title and description, and saves an omitted one as null. The MCP
 * used to always send the quote's existing title and description, so a new
 * intro passed by the caller was silently dropped.
 *
 * FakeQuotesApi below applies the same omitted-means-null rule, so an update
 * that stops sending the current values clears them here as it would against
 * the API. Like the API, it stores an explicit null as "".
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { handleManageQuotes } from '../quotes.js';
import type { FergusClient } from '../../fergus-client.js';

const JOB_ID = 20701539;
const QUOTE_ID = 6669305;
const VERSION_NUMBER = 2;

const SECTIONS = [
  { name: 'Labour', lineItems: [{ itemName: 'Install', itemPrice: 100, isLabour: true }] },
];

class FakeQuotesApi {
  quote: { id: number; versionNumber: number; title: string | null; description: string | null; sections: any[] } = {
    id: QUOTE_ID,
    versionNumber: VERSION_NUMBER,
    title: 'Bathroom renovation',
    description: '<p>Thanks for the opportunity to quote.</p>',
    sections: [],
  };
  puts: Array<{ endpoint: string; body: any }> = [];

  get(endpoint: string) {
    if (endpoint === `/jobs/${JOB_ID}/quotes/${QUOTE_ID}`) {
      return { result: 'success', data: { ...this.quote } };
    }
    if (endpoint === `/jobs/${JOB_ID}/quotes`) {
      return { result: 'success', data: [{ id: QUOTE_ID, versionNumber: VERSION_NUMBER }] };
    }
    throw new Error(`unexpected GET ${endpoint}`);
  }

  put(endpoint: string, body: any) {
    const expected = [
      `/jobs/${JOB_ID}/quotes/${QUOTE_ID}`,
      `/jobs/${JOB_ID}/quotes/version/${VERSION_NUMBER}`,
    ];
    if (!expected.includes(endpoint)) throw new Error(`unexpected PUT ${endpoint}`);
    this.puts.push({ endpoint, body });
    this.quote = {
      ...this.quote,
      title: 'title' in body ? (body.title ?? '') : null,
      description: 'description' in body ? (body.description ?? '') : null,
      sections: body.sections,
    };
    return { result: 'success', data: { ...this.quote } };
  }
}

function fakeClient(api: FakeQuotesApi): FergusClient {
  return {
    async get(endpoint: string) {
      return api.get(endpoint);
    },
    async put(endpoint: string, body: any) {
      return api.put(endpoint, body);
    },
  } as unknown as FergusClient;
}

const UPDATE_ACTIONS: Array<{ name: string; args: Record<string, any> }> = [
  { name: 'update', args: { action: 'update', jobId: String(JOB_ID), quoteId: QUOTE_ID } },
  { name: 'update-version', args: { action: 'update-version', jobId: String(JOB_ID), versionNumber: VERSION_NUMBER } },
];

for (const { name, args: baseArgs } of UPDATE_ACTIONS) {
  describe(`manage-quotes ${name}`, () => {
    test('changes the intro when description is given, keeping the title', async () => {
      const api = new FakeQuotesApi();

      await handleManageQuotes(fakeClient(api), {
        ...baseArgs,
        description: '<p>Scope as discussed on site.</p>',
        sections: SECTIONS,
      });

      assert.equal(api.quote.description, '<p>Scope as discussed on site.</p>');
      assert.equal(api.quote.title, 'Bathroom renovation');
    });

    test('changes the title when given, keeping the intro', async () => {
      const api = new FakeQuotesApi();

      await handleManageQuotes(fakeClient(api), {
        ...baseArgs,
        title: 'Bathroom and laundry renovation',
        sections: SECTIONS,
      });

      assert.equal(api.quote.title, 'Bathroom and laundry renovation');
      assert.equal(api.quote.description, '<p>Thanks for the opportunity to quote.</p>');
    });

    test('keeps both when neither is given', async () => {
      const api = new FakeQuotesApi();

      await handleManageQuotes(fakeClient(api), { ...baseArgs, sections: SECTIONS });

      assert.equal(api.quote.title, 'Bathroom renovation');
      assert.equal(api.quote.description, '<p>Thanks for the opportunity to quote.</p>');
      assert.deepEqual(api.quote.sections, SECTIONS);
    });

    test('clears the intro with an empty string', async () => {
      const api = new FakeQuotesApi();

      await handleManageQuotes(fakeClient(api), { ...baseArgs, description: '', sections: SECTIONS });

      assert.equal(api.puts.length, 1);
      assert.equal(api.puts[0].body.description, '');
      assert.equal(api.quote.title, 'Bathroom renovation');
    });

    test('changes the intro on a quote that has none', async () => {
      const api = new FakeQuotesApi();
      api.quote.description = null;

      await handleManageQuotes(fakeClient(api), {
        ...baseArgs,
        description: '<p>Scope as discussed on site.</p>',
        sections: SECTIONS,
      });

      assert.equal(api.quote.description, '<p>Scope as discussed on site.</p>');
      assert.equal(api.quote.title, 'Bathroom renovation');
    });

    test('rejects an empty or whitespace-only title before calling the API', async () => {
      for (const title of ['', '   ']) {
        const api = new FakeQuotesApi();

        await assert.rejects(
          () => handleManageQuotes(fakeClient(api), { ...baseArgs, title, sections: SECTIONS }),
          /title cannot be empty/
        );
        assert.equal(api.puts.length, 0);
      }
    });
  });
}
