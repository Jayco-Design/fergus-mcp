/**
 * Tests for calendar event delete and list, time entry date ranges, and user
 * address updates.
 *
 * The fake client follows the Partner API's behaviour:
 *  - DELETE /calendarEvents/:id requires a JSON object body; without one it
 *    returns 400 "body must be object".
 *  - GET /calendarEvents has no paging: it returns every event in the range.
 *  - GET /timeEntries requires filterDateFrom strictly before filterDateTo,
 *    and includes both dates.
 *  - GET /company returns the company's time zone in settings, as
 *    company_timezone.
 *  - PATCH /users/:id requires address.address1, rejects empty strings, and
 *    keeps the current value of any address field left out.
 */

import { test, describe, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { handleManageCalendarEvents, manageCalendarEventsToolDefinition } from '../calendar-events.js';
import { handleManageTimeEntries } from '../time-entries.js';
import { handleManageUsers, manageUsersToolDefinition } from '../users.js';
import { FergusAPIError, type FergusClient } from '../../fergus-client.js';

class FakeApi {
  calls: Array<{ method: string; endpoint: string; body?: any }> = [];
  timeZone: string | null = 'Pacific/Auckland';
  companyFails = false;
  deleteResponse: any = {}; // the client turns the API's empty 204 into {}

  get(endpoint: string) {
    this.calls.push({ method: 'GET', endpoint });
    const [path, query] = endpoint.split('?');
    const params = new URLSearchParams(query);
    if (path === '/company') {
      if (this.companyFails) throw new FergusAPIError('Access forbidden.', 403);
      const settings = [{ settingKey: 'currency', settingValue: 'NZD' }];
      if (this.timeZone) settings.push({ settingKey: 'company_timezone', settingValue: this.timeZone });
      return { result: 'success', data: { name: 'Test company', settings } };
    }
    if (path === '/timeEntries') {
      const from = params.get('filterDateFrom');
      const to = params.get('filterDateTo');
      const isDate = (d: string | null) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
      if (!isDate(from) || !isDate(to)) {
        throw new FergusAPIError('API request failed: Bad Request', 400, { message: "The filterDateFrom must be a valid date in 'yyyy-mm-dd' format" });
      }
      if (!(new Date(from!) < new Date(to!))) {
        throw new FergusAPIError('API request failed: Bad Request', 400, {
          message: 'The filterDateFrom must be before the filterDateTo and both must be provided.',
        });
      }
      return { data: [], paging: { links: { next: null } } };
    }
    if (path === '/calendarEvents') return { data: [{ id: 1 }, { id: 2 }] };
    throw new Error(`unexpected GET ${endpoint}`);
  }

  delete(endpoint: string, body?: any) {
    this.calls.push({ method: 'DELETE', endpoint, body });
    if (body === undefined || typeof body !== 'object' || body === null) {
      throw new FergusAPIError('API request failed: Bad Request', 400, { message: 'body must be object' });
    }
    return this.deleteResponse;
  }

  patch(endpoint: string, body: any) {
    this.calls.push({ method: 'PATCH', endpoint, body });
    const address = body.address;
    if (address) {
      if (!address.address1) throw new FergusAPIError('API request failed: Bad Request', 400, { message: 'address1 is required' });
      for (const [key, value] of Object.entries(address)) {
        if (typeof value === 'string' && !/\S/.test(value)) {
          throw new FergusAPIError('API request failed: Bad Request', 400, { message: `The ${key} must not be empty` });
        }
      }
    }
    return { result: 'success', data: { id: 1 } };
  }
}

function clientFor(api: FakeApi): FergusClient {
  return {
    get: async (e: string) => api.get(e),
    delete: async (e: string, b?: any) => api.delete(e, b),
    patch: async (e: string, b: any) => api.patch(e, b),
  } as unknown as FergusClient;
}

function sentDates(api: FakeApi) {
  const call = api.calls.find((c) => c.endpoint.startsWith('/timeEntries'))!;
  const params = new URLSearchParams(call.endpoint.split('?')[1]);
  return { from: params.get('filterDateFrom'), to: params.get('filterDateTo') };
}

function parsed(result: any) {
  return JSON.parse(result.content[0].text);
}

describe('manage-calendar-events delete', () => {
  test('a simple event with no flags is deleted with an empty object body', async () => {
    const api = new FakeApi();
    const result: any = await handleManageCalendarEvents(clientFor(api), { action: 'delete', eventId: '123' });

    assert.deepEqual(api.calls[0], { method: 'DELETE', endpoint: '/calendarEvents/123', body: {} });
    assert.deepEqual(JSON.parse(result.content[0].text), { success: true });
  });

  test('a delete that returns content passes it through unchanged', async () => {
    const api = new FakeApi();
    api.deleteResponse = { result: 'success', data: { id: 123 } };
    const result: any = await handleManageCalendarEvents(clientFor(api), { action: 'delete', eventId: '123' });

    assert.deepEqual(JSON.parse(result.content[0].text), { result: 'success', data: { id: 123 } });
  });

  test('flags are still sent', async () => {
    const api = new FakeApi();
    await handleManageCalendarEvents(clientFor(api), { action: 'delete', eventId: '123', deleteAllRecurring: 'TRUE' });

    assert.deepEqual(api.calls[0].body, { deleteAllRecurring: 'TRUE' });
  });
});

describe('manage-calendar-events list', () => {
  test('sends no paging parameters, which the API does not support', async () => {
    const api = new FakeApi();
    await handleManageCalendarEvents(clientFor(api), {
      action: 'list', filterDateFrom: '2026-10-23T00:00:00+13:00', pageSize: 10, pageCursor: 'abc',
    });

    const query = api.calls[0].endpoint.split('?')[1] ?? '';
    assert.equal(/pageSize|pageCursor/.test(query), false);
    assert.equal(new URLSearchParams(query).get('filterDateFrom'), '2026-10-23T00:00:00+13:00');
  });

  test('the tool offers no paging, and gives one time zone rule', () => {
    const props: any = manageCalendarEventsToolDefinition.inputSchema.properties;
    assert.equal(props.pageSize, undefined);
    assert.equal(props.pageCursor, undefined);
    assert.equal(/subtract/i.test(manageCalendarEventsToolDefinition.description), false);
    assert.match(manageCalendarEventsToolDefinition.description, /company_timezone/);
  });
});

describe('manage-time-entries list dates', () => {
  afterEach(() => mock.timers.reset());

  test('a single day is sent as that day and the next, with a note', async () => {
    const api = new FakeApi();
    const result = parsed(await handleManageTimeEntries(clientFor(api), {
      action: 'list', filterDateFrom: '2026-10-20', filterDateTo: '2026-10-20',
    }));

    assert.deepEqual(sentDates(api), { from: '2026-10-20', to: '2026-10-21' });
    assert.deepEqual(result.dateRange, { from: '2026-10-20', to: '2026-10-21' });
    assert.match(result.note, /2026-10-20 and 2026-10-21/);
  });

  test('the single-day note says to compare start times in the company\'s time zone', async () => {
    const api = new FakeApi();
    const result = parsed(await handleManageTimeEntries(clientFor(api), {
      action: 'list', filterDateFrom: '2026-10-20', filterDateTo: '2026-10-20',
    }));

    assert.match(result.note, /in the company's time zone/);
  });

  test('the default start is the same date a year earlier', async () => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2028-02-29T12:00:00Z') });
    const api = new FakeApi();
    api.timeZone = 'UTC';
    await handleManageTimeEntries(clientFor(api), { action: 'list' });

    assert.deepEqual(sentDates(api), { from: '2027-02-28', to: '2028-02-29' });
  });

  test('a longer range is sent as given, without a note', async () => {
    const api = new FakeApi();
    const result = parsed(await handleManageTimeEntries(clientFor(api), {
      action: 'list', filterDateFrom: '2026-10-01', filterDateTo: '2026-10-20',
    }));

    assert.deepEqual(sentDates(api), { from: '2026-10-01', to: '2026-10-20' });
    assert.equal(result.note, undefined);
  });

  test('"today" in a New Zealand morning uses the company\'s date, not UTC\'s', async () => {
    // 08:00 on 23 Oct in Auckland (NZDT, UTC+13) is still 22 Oct in UTC.
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-22T19:00:00Z') });
    const api = new FakeApi();
    await handleManageTimeEntries(clientFor(api), { action: 'list', filterDateFrom: '2026-10-23' });

    assert.deepEqual(sentDates(api), { from: '2026-10-23', to: '2026-10-24' });
  });

  test('the default range ends today in the company\'s time zone', async () => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-22T19:00:00Z') });
    const api = new FakeApi();
    await handleManageTimeEntries(clientFor(api), { action: 'list' });

    assert.equal(sentDates(api).to, '2026-10-23');
  });

  test('only an end date sends 2020-01-01 as the start', async () => {
    const api = new FakeApi();
    await handleManageTimeEntries(clientFor(api), { action: 'list', filterDateTo: '2026-10-20' });

    assert.deepEqual(sentDates(api), { from: '2020-01-01', to: '2026-10-20' });
    assert.equal(api.calls.some((c) => c.endpoint === '/company'), false);
  });

  test('falls back to UTC when the company can\'t be read', async () => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-22T19:00:00Z') });
    const api = new FakeApi();
    api.companyFails = true;
    await handleManageTimeEntries(clientFor(api), { action: 'list' });

    assert.equal(sentDates(api).to, '2026-10-22');
  });

  test('falls back to UTC for an unknown time zone name', async () => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-22T19:00:00Z') });
    const api = new FakeApi();
    api.timeZone = 'Not/A_Zone';
    await handleManageTimeEntries(clientFor(api), { action: 'list' });

    assert.equal(sentDates(api).to, '2026-10-22');
  });

  for (const bad of ['20/10/2026', '2026-10-5', '2026-02-30']) {
    test(`rejects a badly formatted date (${bad}) without calling the list`, async () => {
      const api = new FakeApi();
      await assert.rejects(
        () => handleManageTimeEntries(clientFor(api), { action: 'list', filterDateFrom: bad, filterDateTo: '2026-10-20' }),
        /filterDateFrom must be a date in YYYY-MM-DD format/
      );
      assert.equal(api.calls.some((c) => c.endpoint.startsWith('/timeEntries')), false);
    });
  }

  test('a future start date with no end date names the default in the error', async () => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-22T19:00:00Z') });
    const api = new FakeApi();
    await assert.rejects(
      () => handleManageTimeEntries(clientFor(api), { action: 'list', filterDateFrom: '2026-11-01' }),
      /after today in the company's time zone \(2026-10-23\), which filterDateTo defaults to/
    );
  });

  test('falls back to UTC when the company has no time zone setting', async () => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-22T19:00:00Z') });
    const api = new FakeApi();
    api.timeZone = null;
    await handleManageTimeEntries(clientFor(api), { action: 'list' });

    assert.equal(sentDates(api).to, '2026-10-22');
  });

  test('a start date after the end date is reported without calling the list', async () => {
    const api = new FakeApi();
    await assert.rejects(
      () => handleManageTimeEntries(clientFor(api), { action: 'list', filterDateFrom: '2026-10-21', filterDateTo: '2026-10-20' }),
      /is after filterDateTo/
    );
    assert.equal(api.calls.some((c) => c.endpoint.startsWith('/timeEntries')), false);
  });
});

describe('manage-users update address', () => {
  test('an address with only some fields is sent as given', async () => {
    const api = new FakeApi();
    await handleManageUsers(clientFor(api), {
      action: 'update', userId: '42', address: { address1: '1 Queen Street', addressCity: 'Auckland' },
    });

    assert.deepEqual(api.calls[0].body, { address: { address1: '1 Queen Street', addressCity: 'Auckland' } });
  });

  test('a blank address1 is refused as a clear, not reported as missing', async () => {
    const api = new FakeApi();
    await assert.rejects(
      () => handleManageUsers(clientFor(api), { action: 'update', userId: '42', address: { address1: '  ' } }),
      /address\.address1 can't be cleared/
    );
    assert.equal(api.calls.length, 0);
  });

  for (const notAnObject of [null, '1 Queen Street', ['1 Queen Street']]) {
    test(`an address that isn't an object (${JSON.stringify(notAnObject)}) is refused`, async () => {
      const api = new FakeApi();
      await assert.rejects(
        () => handleManageUsers(clientFor(api), { action: 'update', userId: '42', address: notAnObject }),
        /address must be an object/
      );
      assert.equal(api.calls.length, 0);
    });
  }

  test('a numeric postcode is sent as text', async () => {
    const api = new FakeApi();
    await handleManageUsers(clientFor(api), {
      action: 'update', userId: '42', address: { address1: '1 Queen Street', addressPostcode: 1010 },
    });

    assert.deepEqual(api.calls[0].body.address, { address1: '1 Queen Street', addressPostcode: '1010' });
  });

  test('a field that isn\'t text is refused', async () => {
    const api = new FakeApi();
    await assert.rejects(
      () => handleManageUsers(clientFor(api), { action: 'update', userId: '42', address: { address1: '1 Queen Street', addressCity: { name: 'Auckland' } } }),
      /address\.addressCity must be text/
    );
    assert.equal(api.calls.length, 0);
  });

  for (const empty of ['', '  ', null]) {
    test(`an attempt to clear a field (${JSON.stringify(empty)}) is refused, not silently dropped`, async () => {
      const api = new FakeApi();
      await assert.rejects(
        () => handleManageUsers(clientFor(api), {
          action: 'update', userId: '42', address: { address1: '1 Queen Street', address2: empty },
        }),
        /address\.address2 can't be cleared/
      );
      assert.equal(api.calls.length, 0);
    });
  }

  test('address1 is required, and nothing is sent without it', async () => {
    const api = new FakeApi();
    await assert.rejects(
      () => handleManageUsers(clientFor(api), { action: 'update', userId: '42', address: { addressCity: 'Auckland' } }),
      /address1 is required/
    );
    assert.equal(api.calls.length, 0);
  });

  test('the tool requires only address1', () => {
    const props: any = manageUsersToolDefinition.inputSchema.properties;
    assert.deepEqual(props.address.required, ['address1']);
  });
});
