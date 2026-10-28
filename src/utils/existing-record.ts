/**
 * Result for a create that found an existing record instead of creating one.
 *
 * The partner API answers a duplicate customer name or site address with a
 * 303 to the existing record. This reports that plainly, with the record, so
 * the assistant doesn't tell the user something was created when it wasn't.
 */

import { FergusClient } from '../fergus-client.js';

export async function existingRecordResult(fergusClient: FergusClient, location: string, message: string) {
  // Location is the existing record's URL, e.g. /customers/123 or https://…/sites/456
  // (/api/partner/sites/456 locally).
  const path = location.replace(/^https?:\/\/[^/]+/, '').replace(/^\/api\/partner/, '');
  const id = path.match(/\/(\d+)\/?$/)?.[1];

  let existing: unknown = id ? { id: Number(id) } : null;
  if (id) {
    try {
      const response: any = await fergusClient.get(path);
      existing = response?.data ?? response;
    } catch {
      // Still report that nothing was created, with the id we have.
    }
  }

  const result = { created: false, alreadyExists: true, message, existing };
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
