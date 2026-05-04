import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCursor,
  extractPagination,
  normalizeListResponse,
} from './format-response.js';

describe('extractCursor', () => {
  test('returns null for final-page sentinels (null, undefined, empty)', () => {
    assert.equal(extractCursor(null), null);
    assert.equal(extractCursor(undefined), null);
    assert.equal(extractCursor(''), null);
  });

  test('returns null when the link has no query string', () => {
    assert.equal(extractCursor('/customers'), null);
  });

  test('returns null when the query has no pageCursor param', () => {
    assert.equal(extractCursor('/customers?pageSize=10&sortField=createdAt'), null);
  });

  test('extracts a simple numeric cursor', () => {
    assert.equal(
      extractCursor('/customers?pageSize=10&pageCursor=146429'),
      '146429',
    );
  });

  test('preserves compound id_timestamp cursors', () => {
    assert.equal(
      extractCursor('/jobs/quotes?pageSize=10&pageCursor=13986_1415144340000'),
      '13986_1415144340000',
    );
  });

  test('takes the LAST pageCursor when the API emits duplicates', () => {
    // The API has been observed appending a new cursor to previous/self links
    // without removing the original; standard "last wins" query semantics apply.
    assert.equal(
      extractCursor(
        '/users?pageSize=100&sortOrder=asc&pageCursor=140892&sortField=createdAt&pageCursor=45216',
      ),
      '45216',
    );
  });
});

describe('extractPagination', () => {
  const firstPage = {
    data: [{}, {}, {}],
    paging: {
      perPage: 10,
      pageCount: 10,
      links: {
        self: '/customers?pageSize=10&pageCursor=0',
        previous: null,
        next: '/customers?pageSize=10&pageCursor=146429',
      },
    },
  };

  const lastPage = {
    data: [{}, {}, {}],
    paging: {
      perPage: 100,
      pageCount: 39,
      links: {
        self: '/users?pageSize=100&pageCursor=140892&sortField=createdAt&pageCursor=140892',
        previous: '/users?pageSize=100&pageCursor=140892&sortField=createdAt&pageCursor=45216',
        next: null,
      },
    },
  };

  test('first page → previousCursor null, nextCursor set', () => {
    const p = extractPagination(firstPage);
    assert.equal(p.previousCursor, null);
    assert.equal(p.nextCursor, '146429');
  });

  test('last page → nextCursor null, previousCursor resolved through duplicate-param URL', () => {
    const p = extractPagination(lastPage);
    assert.equal(p.nextCursor, null);
    assert.equal(p.previousCursor, '45216');
  });

  test('single-page response → both cursors null', () => {
    const p = extractPagination({
      data: [{}],
      paging: {
        perPage: 10,
        pageCount: 1,
        links: { self: '/x?pageCursor=0', previous: null, next: null },
      },
    });
    assert.equal(p.nextCursor, null);
    assert.equal(p.previousCursor, null);
  });

  test('count is sourced from paging.pageCount when present', () => {
    assert.equal(extractPagination(lastPage).count, 39);
    assert.equal(extractPagination(lastPage).perPage, 100);
  });

  test('count falls back to data.length when paging is missing', () => {
    const p = extractPagination({ data: [{}, {}, {}] });
    assert.equal(p.count, 3);
    assert.equal(p.perPage, undefined);
    assert.equal(p.nextCursor, null);
    assert.equal(p.previousCursor, null);
  });

  test('bare-array response is handled', () => {
    const p = extractPagination([{}, {}]);
    assert.equal(p.count, 2);
    assert.equal(p.nextCursor, null);
    assert.equal(p.previousCursor, null);
  });
});

describe('normalizeListResponse', () => {
  test('returns { data, pagination } and strips the raw paging envelope', () => {
    const result = normalizeListResponse({
      data: [{ id: 1 }, { id: 2 }],
      paging: {
        perPage: 10,
        pageCount: 2,
        links: { self: '/x', previous: null, next: '/x?pageCursor=5' },
      },
    });

    assert.deepEqual(Object.keys(result).sort(), ['data', 'pagination']);
    assert.equal(result.data.length, 2);
    assert.equal((result.data[0] as any).id, 1);
    assert.equal(result.pagination.nextCursor, '5');
    assert.equal((result as any).paging, undefined);
  });

  test('handles a bare-array response', () => {
    const result = normalizeListResponse([{ id: 1 }]);
    assert.deepEqual(result.data, [{ id: 1 }]);
    assert.equal(result.pagination.count, 1);
    assert.equal(result.pagination.nextCursor, null);
  });
});
