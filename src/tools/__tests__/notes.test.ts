/**
 * Tests for manage-notes create/list.
 *
 * The tool uses the API's uppercase entity keys (JOB, JOB_PHASE, ...)
 * everywhere. POST /notes on the Partner API accepts those keys; its older
 * lowercase values (job, works_order, ...) are still accepted but deprecated,
 * so the tool must send the uppercase key unchanged.
 *
 * FakeNotesApi below follows that contract, records the value sent on the
 * wire, and stores notes so list can read back what create wrote.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { handleManageNotes } from '../notes.js';
import { FergusAPIError, type FergusClient } from '../../fergus-client.js';

// The 8 entity types the manage-notes tool exposes, and the API's deprecated
// lowercase value for each. Mirrors the Partner API's note entity names.
const ENTITY_TYPES: Array<{ mcpName: string; wireValue: string }> = [
  { mcpName: 'JOB', wireValue: 'job' },
  { mcpName: 'CUSTOMER', wireValue: 'customer' },
  { mcpName: 'CUSTOMER_INVOICE', wireValue: 'customer_invoice' },
  { mcpName: 'QUOTE', wireValue: 'quote' },
  { mcpName: 'SITE', wireValue: 'site' },
  { mcpName: 'TASK', wireValue: 'task' },
  { mcpName: 'ENQUIRY', wireValue: 'enquiry' },
  { mcpName: 'JOB_PHASE', wireValue: 'works_order' },
];

/**
 * Minimal stand-in for the Fergus /notes API. Accepts the uppercase key (or
 * the deprecated lowercase value) on create, records what was sent, and
 * stores notes so list can read back what create wrote.
 */
class FakeNotesApi {
  private notes: any[] = [];
  private nextId = 1;
  sentEntityNames: string[] = [];

  create(body: Record<string, any>) {
    this.sentEntityNames.push(body.entityName);
    const toKey = Object.fromEntries(
      ENTITY_TYPES.flatMap((e) => [[e.mcpName, e.mcpName], [e.wireValue, e.mcpName]])
    );
    if (!(body.entityName in toKey)) {
      throw new FergusAPIError('API request failed: Bad Request', 400, {
        message: 'Validation Failed: [<body/entityName>: must be equal to one of the allowed values]',
      });
    }

    const note = {
      id: this.nextId++,
      entityName: toKey[body.entityName],
      entityId: body.entityId,
      text: body.text,
      isPinned: body.isPinned,
      parentId: body.parentId,
    };
    this.notes.push(note);
    return note;
  }

  list(filterEntityName: string, filterEntityId: number) {
    return {
      data: this.notes.filter(
        (n) => n.entityName === filterEntityName && n.entityId === filterEntityId
      ),
      paging: { perPage: 50 },
    };
  }
}

function fakeClient(api: FakeNotesApi): FergusClient {
  return {
    async post(endpoint: string, body: any) {
      assert.equal(endpoint, '/notes');
      return api.create(body);
    },
    async get(endpoint: string) {
      const params = new URLSearchParams(endpoint.split('?')[1]);
      return api.list(params.get('filterEntityName')!, Number(params.get('filterEntityId')));
    },
    async patch() {
      throw new Error('not used in these tests');
    },
  } as unknown as FergusClient;
}

describe('manage-notes create', () => {
  for (const { mcpName, wireValue } of ENTITY_TYPES) {
    test(`creates a note for entityName=${mcpName} (sends ${mcpName}, not the deprecated "${wireValue}") and it shows up in list`, async () => {
      const api = new FakeNotesApi();
      const client = fakeClient(api);

      const createResult = await handleManageNotes(client, {
        action: 'create',
        entityName: mcpName,
        entityId: 42,
        text: 'Need to create a new quote. Scope has changed',
      });
      const created = JSON.parse(createResult.content[0].text);
      assert.deepEqual(api.sentEntityNames, [mcpName]);
      assert.equal(created.entityName, mcpName);
      assert.equal(created.entityId, 42);

      const listResult = await handleManageNotes(client, {
        action: 'list',
        filterEntityName: mcpName,
        filterEntityId: 42,
      });
      const listed = JSON.parse(listResult.content[0].text);
      assert.equal(listed.data.length, 1);
      assert.equal(listed.data[0].id, created.id);
      assert.equal(listed.data[0].text, 'Need to create a new quote. Scope has changed');
    });
  }

  test('rejects an unknown entityName before calling the API', async () => {
    const api = new FakeNotesApi();

    await assert.rejects(
      () => handleManageNotes(fakeClient(api), { action: 'create', entityName: 'works_order', entityId: 1, text: 'x' }),
      /Unknown entityName: works_order/
    );
    assert.equal(api.sentEntityNames.length, 0);
  });

  test('defaults isPinned to false and parentId to null when omitted', async () => {
    const api = new FakeNotesApi();
    const client = fakeClient(api);

    const result = await handleManageNotes(client, {
      action: 'create',
      entityName: 'JOB',
      entityId: 1,
      text: 'hello',
    });
    const created = JSON.parse(result.content[0].text);
    assert.equal(created.isPinned, false);
    assert.equal(created.parentId, null);
  });

  test('requires text, entityName and entityId', async () => {
    const client = fakeClient(new FakeNotesApi());

    await assert.rejects(
      () => handleManageNotes(client, { action: 'create', entityName: 'JOB', entityId: 1 }),
      /text is required/
    );
    await assert.rejects(
      () => handleManageNotes(client, { action: 'create', text: 'hi', entityId: 1 }),
      /entityName is required/
    );
    await assert.rejects(
      () => handleManageNotes(client, { action: 'create', text: 'hi', entityName: 'JOB' }),
      /entityId is required/
    );
  });
});

describe('manage-notes list', () => {
  test('requires an entity scope', async () => {
    const client = fakeClient(new FakeNotesApi());

    await assert.rejects(
      () => handleManageNotes(client, { action: 'list' }),
      /filterEntityName and filterEntityId are required/
    );
  });
});
