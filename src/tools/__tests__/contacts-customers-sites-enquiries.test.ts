/**
 * Tests for contacts create/update, contact item changes on customers,
 * contacts and users, duplicate customer/site creates, and enquiry create.
 *
 * FakeApi follows the Partner API's behaviour:
 *  - POST /contacts needs contactType with customerId/siteId, and an email or
 *    a contact item.
 *  - PUT /contacts/:id needs firstName and contactItems; it clears an omitted
 *    lastName/position/company and sets isMain/isBilling to false; it rejects
 *    an empty lastName.
 *  - Contact item lists on customers and contacts are replaced: stored items
 *    whose id isn't sent are deleted, id-less items are added. A customer's
 *    items are untouched when mainContact.contactItems isn't sent.
 *  - PATCH /users/:id adds id-less items and updates items by id; it never
 *    deletes.
 * So a regression that sends the wrong body loses data or fails here the same
 * way it would against the API.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { handleManageContacts } from '../contacts.js';
import { handleManageCustomers } from '../customers.js';
import { handleManageSites } from '../sites.js';
import { handleManageUsers } from '../users.js';
import { handleManageEnquiries } from '../enquiries.js';
import { FergusAPIError, FergusClient } from '../../fergus-client.js';

type Item = { id: number; contactType: string; contactValue: string };

class FakeApi {
  nextItemId = 100;
  writes: Array<{ method: string; endpoint: string; body: any }> = [];
  contacts = new Map<number, any>();
  customers = new Map<number, any>();
  users = new Map<number, any>();

  items(...pairs: Array<[string, string]>): Item[] {
    return pairs.map(([contactType, contactValue]) => ({ id: this.nextItemId++, contactType, contactValue }));
  }

  private replaceItems(current: Item[], incoming: any[]): Item[] {
    const kept = current
      .filter((c) => incoming.some((i) => i.id === c.id))
      .map((c) => ({ ...c, ...incoming.find((i) => i.id === c.id) }));
    const added = incoming.filter((i) => !i.id).map((i) => ({ id: this.nextItemId++, contactType: i.contactType, contactValue: i.contactValue }));
    return [...kept, ...added];
  }

  private bad(message: string): never {
    throw new FergusAPIError('API request failed: Bad Request', 400, { message });
  }

  get(endpoint: string) {
    const [, kind, id] = endpoint.split('?')[0].split('/');
    const store = kind === 'contacts' ? this.contacts : kind === 'customers' ? this.customers : this.users;
    const record = store.get(Number(id));
    if (!record) throw new FergusAPIError('API request failed: Not Found', 404);
    return { result: 'success', data: structuredClone(record) };
  }

  post(endpoint: string, body: any) {
    this.writes.push({ method: 'POST', endpoint, body });
    if (endpoint === '/contacts') {
      if (!['CUSTOMER', 'SITE'].includes(body.contactType)) this.bad('The contactType is required');
      if (body.contactType === 'CUSTOMER' && !body.customerId) this.bad('customerId is required');
      if (body.contactType === 'SITE' && !body.siteId) this.bad('siteId is required');
      if (!body.email && !body.contactItems?.length) this.bad('at least one contact item is required');
      const id = 5000 + this.contacts.size;
      const items = this.replaceItems([], [...(body.contactItems ?? []), ...(body.email ? [{ contactType: 'email', contactValue: body.email }] : [])]);
      this.contacts.set(id, { id, ...body, contactItems: items, isMain: !!body.isMain, isBilling: !!body.isBilling });
      return { result: 'Created', data: this.contacts.get(id) };
    }
    if (endpoint === '/enquiries') return { result: 'Created', data: { id: 1, ...body } };
    throw new Error(`unexpected POST ${endpoint}`);
  }

  put(endpoint: string, body: any) {
    this.writes.push({ method: 'PUT', endpoint, body });
    const [, kind, idText] = endpoint.split('/');
    const id = Number(idText);
    if (kind === 'contacts') {
      const contact = this.contacts.get(id);
      if (!body.firstName) this.bad('The firstName must not be empty');
      if (body.lastName !== undefined && !/\S/.test(body.lastName)) this.bad('The lastName must not be empty');
      if (!body.contactItems?.length) this.bad('The contactItems must contain at least one item');
      Object.assign(contact, {
        firstName: body.firstName,
        lastName: body.lastName ?? null,
        position: body.position ?? null,
        company: body.company ?? null,
        isMain: body.isMain ?? false,
        isBilling: body.isBilling ?? false,
        contactItems: this.replaceItems(contact.contactItems, body.contactItems),
      });
      return { result: 'success', data: contact };
    }
    if (kind === 'customers') {
      const customer = this.customers.get(id);
      if (!body.customerFullName) this.bad('The customerFullName must not be empty');
      if (!body.mainContact?.firstName) this.bad('The firstName must not be empty');
      customer.customerFullName = body.customerFullName;
      const { contactItems, ...fields } = body.mainContact;
      for (const [k, v] of Object.entries(fields)) if (v !== undefined) customer.mainContact[k] = v;
      if (contactItems !== undefined) customer.mainContact.contactItems = this.replaceItems(customer.mainContact.contactItems, contactItems);
      return { result: 'success', data: customer };
    }
    throw new Error(`unexpected PUT ${endpoint}`);
  }

  patch(endpoint: string, body: any) {
    this.writes.push({ method: 'PATCH', endpoint, body });
    const user = this.users.get(Number(endpoint.split('/')[2]));
    for (const item of body.contactItems ?? []) {
      if (item.contactType === 'email') this.bad('The contactType must be a valid contact type');
      if (item.id) Object.assign(user.contactItems.find((c: Item) => c.id === item.id), item);
      else user.contactItems.push({ id: this.nextItemId++, contactType: item.contactType, contactValue: item.contactValue });
    }
    return { result: 'success', data: user };
  }
}

function clientFor(api: FakeApi): FergusClient {
  return {
    get: async (e: string) => api.get(e),
    post: async (e: string, b: any) => api.post(e, b),
    put: async (e: string, b: any) => api.put(e, b),
    patch: async (e: string, b: any) => api.patch(e, b),
  } as unknown as FergusClient;
}

const values = (items: Item[]) => items.map((i) => `${i.contactType}:${i.contactValue}`).sort();

describe('manage-contacts create', () => {
  test('creates a customer contact and a site contact', async () => {
    const api = new FakeApi();
    await handleManageContacts(clientFor(api), {
      action: 'create', contactType: 'CUSTOMER', customerId: 10511881, firstName: 'Accounts', email: 'accounts@example.co.nz',
    });
    await handleManageContacts(clientFor(api), {
      action: 'create', contactType: 'SITE', siteId: 8926191, firstName: 'Gate', contactItems: [{ contactType: 'phone', contactValue: '091234567' }],
    });

    assert.equal(api.contacts.size, 2);
    assert.deepEqual(api.writes[0].body, { contactType: 'CUSTOMER', firstName: 'Accounts', customerId: 10511881, email: 'accounts@example.co.nz' });
    assert.equal(api.writes[1].body.siteId, 8926191);
  });

  test('rejects a create without contactType, its id, or an email/contact item', async () => {
    const api = new FakeApi();
    const create = (args: any) => handleManageContacts(clientFor(api), { action: 'create', firstName: 'X', ...args });

    await assert.rejects(() => create({ email: 'x@example.co.nz' }), /contactType \(CUSTOMER or SITE\) is required/);
    await assert.rejects(() => create({ contactType: 'SITE', email: 'x@example.co.nz' }), /siteId is required/);
    await assert.rejects(() => create({ contactType: 'CUSTOMER', customerId: 1 }), /an email or at least one contact item/);
    await assert.rejects(() => create({ contactType: 'CUSTOMER', customerId: 1, isMain: true, email: 'x@e.nz' }), /manage-customers/);
    assert.equal(api.writes.length, 0);
  });
});

describe('manage-contacts update keeps what is not mentioned', () => {
  let api: FakeApi;
  beforeEach(() => {
    api = new FakeApi();
    api.contacts.set(7, {
      id: 7, contactType: 'CUSTOMER', customerId: 1, firstName: 'Steve', lastName: 'Marsh', position: 'Manager',
      company: 'Coastline', isMain: false, isBilling: true,
      contactItems: api.items(['phone', '+6432319000'], ['mobile', '+64211234567']),
    });
  });

  test('changing only the position keeps name, company, items and billing status', async () => {
    await handleManageContacts(clientFor(api), { action: 'update', contactId: '7', position: 'Director' });

    const c = api.contacts.get(7);
    assert.equal(c.position, 'Director');
    assert.equal(c.lastName, 'Marsh');
    assert.equal(c.company, 'Coastline');
    assert.equal(c.isBilling, true);
    assert.deepEqual(values(c.contactItems), ['mobile:+64211234567', 'phone:+6432319000']);
  });

  test('an empty string clears a field', async () => {
    await handleManageContacts(clientFor(api), { action: 'update', contactId: '7', lastName: '', company: '' });

    const c = api.contacts.get(7);
    assert.equal(c.lastName, null);
    assert.equal(c.company, null);
    assert.equal(c.position, 'Manager');
  });

  test('adding an email keeps the existing phone numbers', async () => {
    await handleManageContacts(clientFor(api), {
      action: 'update', contactId: '7', addContactItems: [{ contactType: 'email', contactValue: 'steve@example.co.nz' }],
    });

    assert.deepEqual(values(api.contacts.get(7).contactItems), ['email:steve@example.co.nz', 'mobile:+64211234567', 'phone:+6432319000']);
  });

  test('changing and removing items by id keeps the rest', async () => {
    const [phone, mobile] = api.contacts.get(7).contactItems;
    await handleManageContacts(clientFor(api), {
      action: 'update', contactId: '7',
      updateContactItems: [{ id: mobile.id, contactValue: '+64219999999' }],
      removeContactItems: [phone.id],
    });

    const items = api.contacts.get(7).contactItems;
    assert.deepEqual(values(items), ['mobile:+64219999999']);
    assert.equal(items[0].id, mobile.id);
  });

  test('a stored empty lastName is not resent', async () => {
    api.contacts.get(7).lastName = '';
    await handleManageContacts(clientFor(api), { action: 'update', contactId: '7', position: 'Director' });

    assert.equal('lastName' in api.writes[0].body, false);
  });

  test('refuses to touch items when contact details are hidden (contactItems null), instead of deleting them', async () => {
    // The API returns contactItems: null when the caller can't see contact details.
    api.contacts.get(7).contactItems = null;

    await assert.rejects(
      () => handleManageContacts(clientFor(api), { action: 'update', contactId: '7', addContactItems: [{ contactType: 'phone', contactValue: '021' }] }),
      /contact details aren't visible/
    );
    await assert.rejects(
      () => handleManageContacts(clientFor(api), { action: 'update', contactId: '7', position: 'Director' }),
      /contact details aren't visible/
    );
    assert.equal(api.writes.length, 0);
  });

  test("rejects updating a customer's main contact, and unknown item ids", async () => {
    api.contacts.get(7).isMain = true;
    await assert.rejects(() => handleManageContacts(clientFor(api), { action: 'update', contactId: '7', position: 'X' }), /manage-customers update/);
    api.contacts.get(7).isMain = false;
    await assert.rejects(
      () => handleManageContacts(clientFor(api), { action: 'update', contactId: '7', removeContactItems: [999] }),
      /contact item 999 doesn't exist/
    );
    await assert.rejects(
      () => handleManageContacts(clientFor(api), { action: 'update', contactId: '7', contactItems: [], addContactItems: [{ contactType: 'email', contactValue: 'a@b.nz' }] }),
      /not both/
    );
    assert.equal(api.writes.length, 0);
  });
});

describe('manage-customers update', () => {
  let api: FakeApi;
  beforeEach(() => {
    api = new FakeApi();
    api.customers.set(1, {
      id: 1, customerFullName: 'Coastline Maintenance',
      mainContact: { id: 9, firstName: 'Steve', lastName: 'Marsh', contactItems: api.items(['phone', '+6432319000'], ['mobile', '+64211234567']) },
    });
  });

  test('adding an email keeps the existing phone numbers, without resending the name', async () => {
    await handleManageCustomers(clientFor(api), {
      action: 'update', customerId: '1', addContactItems: [{ contactType: 'email', contactValue: 'steve@example.co.nz' }],
    });

    const c = api.customers.get(1);
    assert.equal(c.customerFullName, 'Coastline Maintenance');
    assert.equal(c.mainContact.lastName, 'Marsh');
    assert.deepEqual(values(c.mainContact.contactItems), ['email:steve@example.co.nz', 'mobile:+64211234567', 'phone:+6432319000']);
  });

  test('refuses item changes when the main contact\'s details are hidden', async () => {
    api.customers.get(1).mainContact.contactItems = null;
    await assert.rejects(
      () => handleManageCustomers(clientFor(api), { action: 'update', customerId: '1', addContactItems: [{ contactType: 'email', contactValue: 'a@b.nz' }] }),
      /contact details aren't visible/
    );
    assert.equal(api.writes.length, 0);
  });

  test('an address-only update keeps the name and main contact', async () => {
    await handleManageCustomers(clientFor(api), { action: 'update', customerId: '1', physicalAddress: { address1: '12 Beach Road' } });

    assert.equal(api.writes[0].body.customerFullName, 'Coastline Maintenance');
    assert.deepEqual(api.writes[0].body.mainContact, { firstName: 'Steve' });
    assert.equal(api.customers.get(1).mainContact.contactItems.length, 2);
  });

  test('a main contact change without contact items leaves the items alone', async () => {
    await handleManageCustomers(clientFor(api), { action: 'update', customerId: '1', mainContact: { position: 'Owner' } });

    const c = api.customers.get(1);
    assert.equal(c.mainContact.position, 'Owner');
    assert.equal(c.mainContact.firstName, 'Steve');
    assert.equal(c.mainContact.contactItems.length, 2);
    assert.equal('contactItems' in api.writes[0].body.mainContact, false);
  });
});

describe('manage-users update contact items', () => {
  let api: FakeApi;
  beforeEach(() => {
    api = new FakeApi();
    api.users.set(3, { id: 3, firstName: 'Bob', contactItems: api.items(['mobile', '+64211111111']) });
  });

  test('changing a mobile by id changes it in place instead of adding a second one', async () => {
    const [mobile] = api.users.get(3).contactItems;
    await handleManageUsers(clientFor(api), { action: 'update', userId: '3', updateContactItems: [{ id: mobile.id, contactValue: '+64212222222' }] });

    assert.deepEqual(values(api.users.get(3).contactItems), ['mobile:+64212222222']);
  });

  test('adding a phone keeps the mobile', async () => {
    await handleManageUsers(clientFor(api), { action: 'update', userId: '3', addContactItems: [{ contactType: 'phone', contactValue: '094444444' }] });

    assert.deepEqual(values(api.users.get(3).contactItems), ['mobile:+64211111111', 'phone:094444444']);
  });

  test('email items are rejected for users before calling the API', async () => {
    await assert.rejects(
      () => handleManageUsers(clientFor(api), { action: 'update', userId: '3', addContactItems: [{ contactType: 'email', contactValue: 'bob@b.nz' }] }),
      /users can't have email contact items/
    );
    assert.equal(api.writes.length, 0);
  });

  test('removing returns an error, because the API never removes user items', async () => {
    const [mobile] = api.users.get(3).contactItems;
    await assert.rejects(
      () => handleManageUsers(clientFor(api), { action: 'update', userId: '3', removeContactItems: [mobile.id] }),
      /can't be removed/
    );
    assert.equal(api.writes.length, 0);
  });
});

describe('manage-enquiries create', () => {
  const base = { action: 'create', name: 'Jo', description: 'Leaking tap', source: 'Phone' };

  test('creates an enquiry with only a phone number, or only an email, and no address', async () => {
    const api = new FakeApi();
    await handleManageEnquiries(clientFor(api), { ...base, phoneNumber: '021000000' });
    await handleManageEnquiries(clientFor(api), { ...base, email: 'jo@example.co.nz' });

    assert.deepEqual(api.writes[0].body, { name: 'Jo', description: 'Leaking tap', source: 'Phone', phoneNumber: '021000000' });
    assert.deepEqual(api.writes[1].body, { name: 'Jo', description: 'Leaking tap', source: 'Phone', email: 'jo@example.co.nz' });
  });

  test('rejects an enquiry with neither email nor phone', async () => {
    await assert.rejects(() => handleManageEnquiries(clientFor(new FakeApi()), base), /an email or a phone number is required/);
  });
});

// Duplicate creates go through the real FergusClient against a stubbed fetch,
// because the 303 handling lives in the client.
describe('duplicate customer and site creates', () => {
  let originalFetch: typeof fetch;
  let requests: Array<{ method: string; path: string; redirect?: string }>;

  beforeEach(() => {
    requests = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      requests.push({ method, path: url.pathname, redirect: init?.redirect });
      const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
        new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

      if (method === 'POST' && url.pathname === '/customers') {
        return json(303, { result: 'Redirect', message: 'Customer with name Coastline Maintenance already exists' }, { location: '/customers/10511881' });
      }
      if (method === 'POST' && url.pathname === '/sites') {
        return json(303, { result: 'Redirect', message: 'Site address already exists' }, { location: '/sites/8926191' });
      }
      if (url.pathname === '/customers/10511881') return json(200, { result: 'success', data: { id: 10511881, customerFullName: 'Coastline Maintenance' } });
      if (url.pathname === '/sites/8926191') return json(200, { result: 'success', data: { id: 8926191, name: 'MCP test site' } });
      if (method === 'POST' && url.pathname === '/customers-no-location') {
        return json(303, { result: 'Redirect', location: '/customers/10511881' });
      }
      if (method === 'POST' && url.pathname === '/enquiries') return json(201, { result: 'Created', data: { id: 1 } });
      return json(404, { message: 'not found' });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const client = () => new FergusClient({ apiToken: 'token', baseUrl: 'https://api.test' });

  test('a customer name that exists returns alreadyExists with the existing customer', async () => {
    const result: any = await handleManageCustomers(client(), {
      action: 'create', customerFullName: 'Coastline Maintenance', mainContact: { firstName: 'Steve' },
    });
    const body = JSON.parse(result.content[0].text);

    assert.equal(body.created, false);
    assert.equal(body.alreadyExists, true);
    assert.match(body.message, /Coastline Maintenance" already exists\. Nothing was created/);
    assert.equal(body.existing.id, 10511881);
    assert.deepEqual(requests.map((r) => `${r.method} ${r.path} ${r.redirect ?? ''}`.trim()), ['POST /customers manual', 'GET /customers/10511881']);
  });

  test('a site address that exists returns alreadyExists with the existing site', async () => {
    const result: any = await handleManageSites(client(), {
      action: 'create', defaultContact: { firstName: 'MCP Test' }, siteAddress: { address1: '65 New North Road', addressCity: 'Auckland' },
    });
    const body = JSON.parse(result.content[0].text);

    assert.equal(body.alreadyExists, true);
    assert.match(body.message, /65 New North Road, Auckland already exists/);
    assert.equal(body.existing.id, 8926191);
  });

  test('uses the location in the body when the header is missing', async () => {
    const result = await client().createOrFindExisting('/customers-no-location', {});

    assert.deepEqual(result, { created: false, location: '/customers/10511881' });
  });

  test('still reports alreadyExists with the id when the existing record can\'t be fetched', async () => {
    const { existingRecordResult } = await import('../../utils/existing-record.js');
    const result: any = await existingRecordResult(client(), '/api/partner/sites/777', 'A site at X already exists.');
    const body = JSON.parse(result.content[0].text);

    assert.equal(body.alreadyExists, true);
    assert.deepEqual(body.existing, { id: 777 });
    assert.equal(requests.at(-1)?.path, '/sites/777');
  });

  test('other creates still follow the normal path', async () => {
    await handleManageEnquiries(client(), { action: 'create', name: 'Jo', description: 'x', source: 'Phone', email: 'jo@example.co.nz' });

    assert.equal(requests[0].redirect, undefined);
  });
});
