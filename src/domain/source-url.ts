/**
 * Normalize URLs that can cross provider and persistence boundaries as source
 * provenance. Query strings are removed because arbitrary provider-returned
 * parameters can contain signed capabilities, tracking identifiers, or PII.
 * Fragments are client-local and do not identify the fetched resource.
 */
export function normalizePersistableSourceUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new TypeError("Source URL must be a valid absolute URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError("Source URL must use HTTP or HTTPS.");
  }
  if (url.username || url.password) {
    throw new TypeError("Source URL must not contain embedded credentials.");
  }

  url.search = "";
  url.hash = "";
  return url.toString();
}

export function isPersistableSourceUrl(value: string): boolean {
  try {
    normalizePersistableSourceUrl(value);
    return true;
  } catch {
    return false;
  }
}
