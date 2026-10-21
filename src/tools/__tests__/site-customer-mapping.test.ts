/**
 * Tests for how manage-sites list and manage-customers get/list map the
 * partner API's response.
 *
 * fergus-partner-api returns addresses as physicalAddress/postalAddress
 * ({ address1, addressCity, addressPostcode, ... }) and contacts as
 * { firstName, lastName, contactItems: [{ contactType, contactValue }] }
 * (src/routes/sites/response.ts, src/routes/customers). CUS-1409 was
 * manage-sites list reading siteAddress.line1 / defaultContact.email instead,
 * which don't exist, so every site listed with an empty address and contact.
 *
 * The fake client returns those real shapes, so mapping the wrong field names
 * shows up here as missing values.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { handleManageSites } from '../sites.js';
import { handleManageCustomers } from '../customers.js';
import type { FergusClient } from '../../fergus-client.js';

const physicalAddress = {
  id: 64027243,
  address1: '65 New North Road',
  address2: '',
  addressSuburb: 'Eden Terrace',
  addressCity: 'Auckland',
  addressRegion: null,
  addressPostcode: '1021',
  addressCountry: 'New Zealand',
};

const fullSite = {
  id: 8926191,
  companyId: 80528,
  name: 'MCP test site',
  defaultContact: {
    id: 64027244,
    firstName: 'Steve',
    lastName: 'Marsh',
    position: 'Site manager',
    company: 'Coastline Maintenance',
    contactItems: [
      { contactType: 'phone', contactValue: '+6432319000' },
      { contactType: 'email', contactValue: 'steve@example.co.nz' },
    ],
  },
  billingContact: {
    id: 64027245,
    firstName: 'Accounts',
    lastName: '',
    position: null,
    company: null,
    contactItems: [{ contactType: 'email', contactValue: 'accounts@example.co.nz' }],
  },
  physicalAddress,
  postalAddress: { ...physicalAddress, id: 64027246, address1: 'PO Box 1' },
  isArchived: false,
};

// A site as the partner API returns it with no name, postal address or billing contact.
const sparseSite = {
  id: 7396305,
  companyId: 80528,
  name: null,
  defaultContact: { id: 1, firstName: 'Joe', lastName: null, position: null, company: null, contactItems: null },
  billingContact: null,
  physicalAddress: { ...physicalAddress, address1: '1234 State Highway 16', addressSuburb: 'Waimauku', addressPostcode: '' },
  postalAddress: null,
  isArchived: false,
};

function clientReturning(body: unknown, seen: string[] = []): FergusClient {
  return {
    async get(endpoint: string) {
      seen.push(endpoint);
      return body;
    },
  } as unknown as FergusClient;
}

describe('manage-sites list', () => {
  test('returns each site\'s address and contacts from the partner API shape', async () => {
    const result: any = await handleManageSites(
      clientReturning({ data: [fullSite], paging: { perPage: 10, links: { next: null, previous: null } } }),
      { action: 'list' }
    );
    const [site] = result.structuredContent.sites;

    assert.equal(site.id, 8926191);
    assert.equal(site.name, 'MCP test site');
    assert.deepEqual(site.address, {
      line1: '65 New North Road',
      line2: '',
      suburb: 'Eden Terrace',
      city: 'Auckland',
      region: null,
      postalCode: '1021',
      country: 'New Zealand',
    });
    assert.equal(site.postalAddress.line1, 'PO Box 1');
    assert.deepEqual(site.defaultContact, {
      name: 'Steve Marsh',
      firstName: 'Steve',
      lastName: 'Marsh',
      position: 'Site manager',
      company: 'Coastline Maintenance',
      email: 'steve@example.co.nz',
      phone: '+6432319000',
    });
    assert.equal(site.billingContact.name, 'Accounts');
    assert.equal(site.billingContact.email, 'accounts@example.co.nz');
    assert.equal(site.billingContact.phone, undefined);
    assert.equal(site.isArchived, false);
  });

  test('lists a site with no name, postal address or billing contact without errors', async () => {
    const result: any = await handleManageSites(clientReturning({ data: [sparseSite] }), { action: 'list' });
    const [site] = result.structuredContent.sites;

    assert.equal(site.name, null);
    assert.equal(site.address.line1, '1234 State Highway 16');
    assert.equal(site.postalAddress, null);
    assert.equal(site.billingContact, null);
    assert.equal(site.defaultContact.name, 'Joe');
    assert.equal(site.defaultContact.email, undefined);
  });

  test('includes the address and contact in the text content too', async () => {
    const result: any = await handleManageSites(clientReturning({ data: [fullSite] }), { action: 'list' });

    assert.match(result.content[0].text, /65 New North Road/);
    assert.match(result.content[0].text, /steve@example\.co\.nz/);
  });

  test('passes the filters and paging through unchanged', async () => {
    const seen: string[] = [];
    await handleManageSites(clientReturning({ data: [] }, seen), {
      action: 'list',
      filterSearchText: 'MCP test',
      pageSize: 5,
    });

    const params = new URLSearchParams(seen[0].split('?')[1]);
    assert.equal(params.get('filterSearchText'), 'MCP test');
    assert.equal(params.get('pageSize'), '5');
    assert.equal(params.get('sortField'), 'name');
  });
});

describe('manage-customers', () => {
  const customer = {
    id: 10476400,
    customerFullName: 'Joe Bloggs',
    mainContact: {
      id: 62691477,
      firstName: 'Joe',
      lastName: 'Bloggs',
      contactItems: [
        { contactType: 'mobile', contactValue: '+64211234567' },
        { contactType: 'email', contactValue: 'joe@example.co.nz' },
      ],
    },
    physicalAddress,
    postalAddress: null,
  };

  test('get returns email and phone from the main contact\'s contactItems', async () => {
    const result: any = await handleManageCustomers(clientReturning({ data: customer }), {
      action: 'get',
      customerId: 10476400,
    });
    const mapped = result.structuredContent.customer;

    assert.equal(mapped.email, 'joe@example.co.nz');
    assert.equal(mapped.phone, '+64211234567');
    assert.deepEqual(mapped.mainContact, customer.mainContact);
  });

  test('list keeps returning email, phone and address as before', async () => {
    const result: any = await handleManageCustomers(clientReturning({ data: [customer] }), { action: 'list' });
    const [mapped] = result.structuredContent.customers;

    assert.equal(mapped.name, 'Joe Bloggs');
    assert.equal(mapped.email, 'joe@example.co.nz');
    assert.equal(mapped.phone, '+64211234567');
    assert.equal(mapped.address.line1, '65 New North Road');
    assert.equal(mapped.address.postalCode, '1021');
  });

  test('list returns a null address, and falls back to top-level email/phone, as before', async () => {
    const bare = { id: 1, customerFullName: 'No Address Ltd', email: 'top@example.co.nz', phone: '091234567', mainContact: { contactItems: [] }, physicalAddress: null };
    const result: any = await handleManageCustomers(clientReturning({ data: [bare] }), { action: 'list' });
    const [mapped] = result.structuredContent.customers;

    assert.equal(mapped.address, null);
    assert.equal(mapped.email, 'top@example.co.nz');
    assert.equal(mapped.phone, '091234567');
  });

  test('phone is the first phone or mobile item, in item order', async () => {
    const twoNumbers = { ...customer, mainContact: { contactItems: [
      { contactType: 'mobile', contactValue: '+64211111111' },
      { contactType: 'phone', contactValue: '+6492222222' },
    ] } };
    const result: any = await handleManageCustomers(clientReturning({ data: [twoNumbers] }), { action: 'list' });

    assert.equal(result.structuredContent.customers[0].phone, '+64211111111');
  });
});

describe('contact names', () => {
  test('a contact with no first or last name has a null name', async () => {
    const noName = { ...sparseSite, defaultContact: { id: 2, firstName: '', lastName: null, contactItems: [] } };
    const result: any = await handleManageSites(clientReturning({ data: [noName] }), { action: 'list' });

    assert.equal(result.structuredContent.sites[0].defaultContact.name, null);
  });
});
