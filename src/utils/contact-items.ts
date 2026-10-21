/**
 * Contact item changes for customer, contact and user updates.
 *
 * The partner API stores a contact's email and phone numbers as contact items,
 * each with an id. On update, customers and contacts replace the whole list:
 * stored items whose id isn't sent are deleted and id-less items are added.
 * Users only add id-less items and update items by id; they never delete.
 * These helpers let a tool add, change or remove single items while keeping
 * the rest.
 */

export interface ContactItem {
  id?: number;
  contactType: string;
  contactValue: string;
}

export interface ContactItemChanges {
  addContactItems?: Array<{ contactType: string; contactValue: string }>;
  updateContactItems?: Array<{ id: number; contactType?: string; contactValue?: string }>;
  removeContactItems?: number[];
}

/** True when the call asks to add, update or remove individual items. */
export function hasContactItemChanges(args: ContactItemChanges): boolean {
  return Boolean(
    args.addContactItems?.length || args.updateContactItems?.length || args.removeContactItems?.length
  );
}

/**
 * Rejects calls that send a full contactItems list together with item changes,
 * since the two can't both describe the result.
 */
export function assertContactItemInputs(args: ContactItemChanges & { contactItems?: unknown }, where: string) {
  if (args.contactItems !== undefined && hasContactItemChanges(args)) {
    throw new Error(
      `${where}: send either contactItems (the complete list) or addContactItems/updateContactItems/removeContactItems, not both`
    );
  }
}

/**
 * The API returns contactItems as null when the caller isn't allowed to see
 * contact details, and also when there are none. The two can't be told apart,
 * and treating hidden items as an empty list would replace, and so delete,
 * every stored item, so refuse instead.
 */
export function assertItemsVisible(current: ContactItem[] | null | undefined, where: string) {
  if (current === null || current === undefined) {
    throw new Error(
      `${where}: this record's contact details aren't visible to this connection, or it has none, so its phone numbers and emails can't be kept. Send the complete contactItems list instead (or ask an account owner if they're hidden). Nothing was changed.`
    );
  }
}

function findItem(current: ContactItem[], id: number, where: string): ContactItem {
  const item = current.find((c) => Number(c.id) === Number(id));
  if (!item) {
    const known = current.map((c) => `${c.id} (${c.contactType} ${c.contactValue})`).join(', ') || 'none';
    throw new Error(`${where}: contact item ${id} doesn't exist. Current items: ${known}`);
  }
  return item;
}

/**
 * Applies item changes to the current items and returns the complete list to
 * send, for endpoints that replace the whole list (customers, contacts).
 * Items keep their ids so the API updates them in place rather than
 * re-creating them.
 */
export function applyContactItemChanges(
  current: ContactItem[] | null | undefined,
  changes: ContactItemChanges,
  where: string
): ContactItem[] {
  assertItemsVisible(current, where);
  const items = (current ?? []).map((c) => ({ id: c.id, contactType: c.contactType, contactValue: c.contactValue }));

  for (const id of changes.removeContactItems ?? []) {
    findItem(items, id, where);
  }
  const kept = items.filter((c) => !(changes.removeContactItems ?? []).some((id) => Number(id) === Number(c.id)));

  for (const change of changes.updateContactItems ?? []) {
    const item = findItem(kept, change.id, where);
    if (change.contactType !== undefined) item.contactType = change.contactType;
    if (change.contactValue !== undefined) item.contactValue = change.contactValue;
  }

  return [
    ...kept,
    ...(changes.addContactItems ?? []).map((c) => ({ contactType: c.contactType, contactValue: c.contactValue })),
  ];
}

/**
 * Builds the items to send for a user update. Users add id-less items and
 * update items by id, and never delete, so only the changed items are sent.
 */
export function userContactItemChanges(
  current: ContactItem[] | null | undefined,
  changes: ContactItemChanges,
  where: string
): ContactItem[] {
  if (changes.removeContactItems?.length) {
    throw new Error(`${where}: user contact items can't be removed through the API. Nothing was changed.`);
  }
  const emails = [...(changes.addContactItems ?? []), ...(changes.updateContactItems ?? [])].filter((c) => c.contactType === 'email');
  if (emails.length) {
    throw new Error(`${where}: users can't have email contact items through the API. Nothing was changed.`);
  }
  if (changes.updateContactItems?.length) assertItemsVisible(current, where);
  const items = current ?? [];
  const updated = (changes.updateContactItems ?? []).map((change) => {
    const item = findItem(items, change.id, where);
    if (item.contactType === 'email') {
      throw new Error(`${where}: a user's email item can't be changed through the API. Nothing was changed.`);
    }
    return {
      id: item.id,
      contactType: change.contactType ?? item.contactType,
      contactValue: change.contactValue ?? item.contactValue,
    };
  });
  return [
    ...updated,
    ...(changes.addContactItems ?? []).map((c) => ({ contactType: c.contactType, contactValue: c.contactValue })),
  ];
}
