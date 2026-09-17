/**
 * Tests for manage-notes create/list.
 *
 * These guard the entityName translation in notes.ts: the MCP tool exposes
 * uppercase entity keys (JOB, JOB_PHASE, ...) everywhere, but POST /notes on
 * the Fergus partner API validates entityName against an anyOf of lowercase
 * consts (job, works_order, ...) - see fergus-partner-api's
 * src/routes/notes/schema.ts (NoteEntityType). CUS-1186 was exactly this
 * mismatch: create sent the uppercase key straight through and got a 400
 * ("must be equal to constant" x8) from every anyOf branch.
 *
 * FakeNotesApi below enforces that same lowercase-const contract, so a
 * regression that starts sending the wrong entityName value fails here the
 * same way it fails against the real API, instead of only surfacing in prod.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { handleManageNotes } from '../notes.js';
import { FergusAPIError, type FergusClient } from '../../fergus-client.js';

// The 8 entity types the manage-notes tool exposes, and the exact wire value
// each must become on create. Mirrors fergus-partner-api's NoteEntityType enum.
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
 * Minimal stand-in for the Fergus /notes API. Validates entityName the same
 * way the real anyOf-of-consts schema does on create, and stores notes so
 * list can read back what create wrote - the create-then-list round trip the
 * CUS-1186 acceptance criteria calls for.
 */
class FakeNotesApi {
  private notes: any[] = [];
  private nextId = 1;

  create(body: Record<string, any>) {
    const wireValueToMcpName = Object.fromEntries(
      ENTITY_TYPES.map((e) => [e.wireValue, e.mcpName])
    );
    if (!(body.entityName in wireValueToMcpName)) {
      throw new FergusAPIError(
        'API request failed: Bad Request',
        400,
        'Validation Failed: [<body/entityName>: must be equal to constant] x8, ' +
          '[<body/entityName>: must match a schema in anyOf]'
      );
    }

    const note = {
      id: this.nextId++,
      entityName: wireValueToMcpName[body.entityName],
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
    test(`creates a note for entityName=${mcpName} (sends "${wireValue}" on the wire) and it shows up in list`, async () => {
      const api = new FakeNotesApi();
      const client = fakeClient(api);

      const createResult = await handleManageNotes(client, {
        action: 'create',
        entityName: mcpName,
        entityId: 42,
        text: 'Need to create a new quote. Scope has changed',
      });
      const created = JSON.parse(createResult.content[0].text);
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

  test('rejects an entityName the wire contract does not recognise (regression guard)', () => {
    // Simulates the CUS-1186 bug directly: sending the uppercase MCP key
    // straight through as the wire value, unmapped.
    const api = new FakeNotesApi();

    assert.throws(
      () => api.create({ entityName: 'JOB', entityId: 1, text: 'x', isPinned: false, parentId: null }),
      FergusAPIError
    );
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
