import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type AddressResolver = (hostname: string) => Promise<string[]>;

export interface OutboundUrlPolicy {
  allowPrivateNetwork?: boolean;
  allowPublicHttp?: boolean;
  resolver?: AddressResolver;
}

export interface ResolvedOutboundTarget {
  url: URL;
  address: string;
  family: 4 | 6;
}

function ipv4Number(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return (((octets[0] * 256 + octets[1]) * 256 + octets[2]) * 256 + octets[3]) >>> 0;
}

function inIpv4Range(value: number, base: string, prefix: number) {
  const baseValue = ipv4Number(base);
  if (baseValue === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (baseValue & mask);
}

interface Ipv6Range {
  base: bigint;
  prefix: number;
}

function ipv6Number(address: string): bigint | null {
  if (isIP(address) !== 6 || address.includes("%")) return null;

  let normalized = address.toLowerCase();
  const dottedTail = normalized.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  if (dottedTail) {
    const ipv4 = ipv4Number(dottedTail);
    if (ipv4 === null) return null;
    normalized = `${normalized.slice(0, -dottedTail.length)}${(ipv4 >>> 16).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }

  const compressed = normalized.split("::");
  if (compressed.length > 2) return null;
  const left = compressed[0] ? compressed[0].split(":") : [];
  const right = compressed.length === 2 && compressed[1]
    ? compressed[1].split(":")
    : [];
  const omitted = 8 - left.length - right.length;
  if (
    (compressed.length === 1 && omitted !== 0)
    || (compressed.length === 2 && omitted < 1)
  ) return null;

  const groups = [
    ...left,
    ...Array.from({ length: omitted }, () => "0"),
    ...right,
  ];
  if (
    groups.length !== 8
    || groups.some((group) => !/^[0-9a-f]{1,4}$/u.test(group))
  ) return null;

  return groups.reduce(
    (value, group) => (value << 16n) | BigInt(Number.parseInt(group, 16)),
    0n,
  );
}

function ipv6Range(base: string, prefix: number): Ipv6Range {
  const value = ipv6Number(base);
  if (value === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 128) {
    throw new Error("Invalid static IPv6 policy range.");
  }
  return { base: value, prefix };
}

function inIpv6Range(value: bigint, range: Ipv6Range) {
  const shift = 128n - BigInt(range.prefix);
  return (value >> shift) === (range.base >> shift);
}

// IANA IPv6 Special-Purpose Address Space, last reviewed 2026-07-13:
// https://www.iana.org/assignments/iana-ipv6-special-registry/iana-ipv6-special-registry.xhtml
// Translation/tunnel ranges are denied even when nominally global because they
// embed IPv4 destinations and could otherwise bypass the IPv4 SSRF policy.
const BLOCKED_IPV6_RANGES = [
  ipv6Range("::", 128),
  ipv6Range("::1", 128),
  ipv6Range("::ffff:0:0", 96),
  ipv6Range("64:ff9b::", 96),
  ipv6Range("64:ff9b:1::", 48),
  ipv6Range("100::", 64),
  ipv6Range("100:0:0:1::", 64),
  ipv6Range("2001:db8::", 32),
  ipv6Range("2002::", 16),
  ipv6Range("3fff::", 20),
  ipv6Range("5f00::", 16),
  ipv6Range("fc00::", 7),
  ipv6Range("fe80::", 10),
  ipv6Range("fec0::", 10),
  ipv6Range("ff00::", 8),
] as const;

// IANA marks 2001::/23 non-global unless a narrower allocation says otherwise.
// Keep the current globally reachable allocations usable without opening the
// unallocated, benchmarking, deprecated-ORCHID, or Teredo remainder.
const IETF_PROTOCOL_ASSIGNMENTS = ipv6Range("2001::", 23);
const GLOBAL_IETF_PROTOCOL_EXCEPTIONS = [
  ipv6Range("2001:1::1", 128),
  ipv6Range("2001:1::2", 128),
  ipv6Range("2001:1::3", 128),
  ipv6Range("2001:3::", 32),
  ipv6Range("2001:4:112::", 48),
  ipv6Range("2001:20::", 28),
  ipv6Range("2001:30::", 28),
] as const;

export function isPrivateOrReservedAddress(address: string) {
  const version = isIP(address);
  if (version === 4) {
    const value = ipv4Number(address);
    if (value === null) return true;
    return [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ].some(([base, prefix]) => inIpv4Range(value, base as string, prefix as number));
  }

  if (version === 6) {
    const value = ipv6Number(address);
    if (value === null) return true;
    if (BLOCKED_IPV6_RANGES.some((range) => inIpv6Range(value, range))) return true;
    if (!inIpv6Range(value, IETF_PROTOCOL_ASSIGNMENTS)) return false;
    return !GLOBAL_IETF_PROTOCOL_EXCEPTIONS.some(
      (range) => inIpv6Range(value, range),
    );
  }

  return true;
}

function isLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".home.arpa") ||
    normalized === "metadata.google.internal"
  );
}

export function parseOutboundHttpUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Provider endpoint must be a valid absolute URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Provider endpoint must use HTTP or HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("Provider endpoint must not contain embedded credentials.");
  }
  if (url.hash) {
    throw new Error("Provider endpoint must not contain a URL fragment.");
  }
  return url;
}

async function defaultResolver(hostname: string) {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

export async function resolveSafeOutboundTarget(
  value: string,
  policy: OutboundUrlPolicy = {},
): Promise<ResolvedOutboundTarget> {
  const url = parseOutboundHttpUrl(value);
  if (!policy.allowPrivateNetwork && !policy.allowPublicHttp && url.protocol !== "https:") {
    throw new Error("Remote provider endpoints must use HTTPS.");
  }
  if (!policy.allowPrivateNetwork && isLocalHostname(url.hostname)) {
    throw new Error("Provider endpoint resolves to a local or private hostname.");
  }

  const literalVersion = isIP(url.hostname);
  const addresses = literalVersion
    ? [url.hostname]
    : await (policy.resolver ?? defaultResolver)(url.hostname);
  if (
    addresses.length === 0 ||
    (!policy.allowPrivateNetwork && addresses.some(isPrivateOrReservedAddress))
  ) {
    throw new Error("Provider endpoint resolves to a private or reserved network address.");
  }
  const address = addresses[0];
  const family = isIP(address);
  if (family !== 4 && family !== 6) {
    throw new Error("Provider endpoint did not resolve to a valid IP address.");
  }
  return { url, address, family };
}

export async function assertSafeOutboundUrl(value: string, policy: OutboundUrlPolicy = {}) {
  return (await resolveSafeOutboundTarget(value, policy)).url;
}

export function requireSameOrigin(candidate: string, trustedBaseUrl: string) {
  const candidateUrl = parseOutboundHttpUrl(candidate);
  const trustedUrl = parseOutboundHttpUrl(trustedBaseUrl);
  if (candidateUrl.origin !== trustedUrl.origin) {
    throw new Error("Provider returned an artifact URL outside its configured origin.");
  }
  return candidateUrl;
}
