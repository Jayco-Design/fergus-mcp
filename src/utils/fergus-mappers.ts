/**
 * Mappers for the address and contact shapes the Fergus partner API returns
 * on customers and sites.
 */

export interface MappedAddress {
  line1?: string | null;
  line2?: string | null;
  suburb?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

export interface MappedContact {
  name: string | null;
  firstName?: string | null;
  lastName?: string | null;
  position?: string | null;
  company?: string | null;
  email?: string;
  phone?: string;
}

/** Maps a partner API address (address1, addressCity, ...) to the tools' address shape. */
export function mapAddress(address: any): MappedAddress | null {
  if (!address) return null;
  return {
    line1: address.address1,
    line2: address.address2,
    suburb: address.addressSuburb,
    city: address.addressCity,
    region: address.addressRegion,
    postalCode: address.addressPostcode,
    country: address.addressCountry,
  };
}

/** The partner API keeps email and phone as entries in a contact's contactItems. */
export function contactEmail(contactItems: any[] | null | undefined): string | undefined {
  return (contactItems || []).find((c: any) => c.contactType === 'email')?.contactValue;
}

export function contactPhone(contactItems: any[] | null | undefined): string | undefined {
  return (contactItems || []).find((c: any) => c.contactType === 'phone' || c.contactType === 'mobile')?.contactValue;
}

/** Maps a partner API contact (firstName, lastName, contactItems, ...) to the tools' contact shape. */
export function mapContact(contact: any): MappedContact | null {
  if (!contact) return null;
  return {
    name: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || null,
    firstName: contact.firstName,
    lastName: contact.lastName,
    position: contact.position,
    company: contact.company,
    email: contactEmail(contact.contactItems),
    phone: contactPhone(contact.contactItems),
  };
}
