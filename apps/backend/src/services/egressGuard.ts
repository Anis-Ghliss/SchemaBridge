import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/**
 * Egress policy for upstream requests. SchemaBridge legitimately proxies to
 * internal services (Docker service names, private VPC addresses), so private
 * ranges are allowed by default. What is *never* a legitimate upstream — cloud
 * metadata / link-local, the unspecified address, and non-HTTP schemes — is
 * always blocked. Deployments that can reach sensitive internal hosts should
 * tighten this with `allowPrivate: false` and/or an explicit `allowedHosts`
 * allowlist.
 */
export interface EgressPolicy {
  readonly allowedSchemes: ReadonlySet<string>;
  readonly allowPrivate: boolean;
  /** Lowercased `host` or `host:port` allowlist. When set, only these upstreams are reachable. */
  readonly allowedHosts: ReadonlySet<string> | null;
}

export function defaultEgressPolicy(): EgressPolicy {
  return { allowedSchemes: new Set(["http:", "https:"]), allowPrivate: true, allowedHosts: null };
}

export type EgressCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

type Classification = "public" | "private" | "loopback" | "linklocal" | "unspecified" | "invalid";

/**
 * Validate an upstream URL against the egress policy. May perform DNS
 * resolution (to defeat DNS-rebinding) when the policy forbids private ranges
 * and the host is a name rather than a literal IP.
 */
export async function checkEgress(rawUrl: string, policy: EgressPolicy): Promise<EgressCheck> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "upstream URL is not a valid absolute URL" };
  }

  if (!policy.allowedSchemes.has(url.protocol)) {
    return { ok: false, reason: `scheme "${url.protocol.replace(/:$/, "")}" is not allowed` };
  }

  const host = stripBrackets(url.hostname.toLowerCase());
  if (policy.allowedHosts) {
    const hostWithPort = url.port ? `${host}:${url.port}` : host;
    if (!policy.allowedHosts.has(host) && !policy.allowedHosts.has(hostWithPort)) {
      return { ok: false, reason: "upstream host is not in the allowlist" };
    }
  }

  // Literal IP: classify directly, no DNS needed.
  if (isIP(host) !== 0) {
    return enforce(classifyIp(host), policy);
  }

  // Hostname. The crown-jewel SSRF targets (metadata/link-local) are literal
  // IPs, so a permissive policy can safely skip resolution. When private ranges
  // are forbidden we must resolve to catch names that point at internal hosts
  // (and DNS-rebinding), checking every returned address.
  if (!policy.allowPrivate) {
    let addresses: { address: string }[];
    try {
      addresses = await lookup(host, { all: true });
    } catch {
      return { ok: false, reason: "upstream host could not be resolved" };
    }
    for (const { address } of addresses) {
      const verdict = enforce(classifyIp(address), policy);
      if (!verdict.ok) return verdict;
    }
  }

  return { ok: true };
}

function enforce(classification: Classification, policy: EgressPolicy): EgressCheck {
  switch (classification) {
    case "linklocal":
      return { ok: false, reason: "link-local / cloud-metadata addresses are not allowed" };
    case "unspecified":
      return { ok: false, reason: "the unspecified address is not allowed" };
    case "invalid":
      return { ok: false, reason: "upstream resolves to an invalid address" };
    case "loopback":
    case "private":
      return policy.allowPrivate ? { ok: true } : { ok: false, reason: `${classification} addresses are not allowed by this deployment` };
    case "public":
      return { ok: true };
  }
}

function classifyIp(ip: string): Classification {
  const kind = isIP(ip);
  if (kind === 4) return classifyIpv4(ip);
  if (kind === 6) return classifyIpv6(ip.toLowerCase());
  return "invalid";
}

function classifyIpv4(ip: string): Classification {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return "invalid";
  const a = parts[0] ?? -1;
  const b = parts[1] ?? -1;
  if (a === 0) return "unspecified";
  if (a === 127) return "loopback";
  if (a === 169 && b === 254) return "linklocal";
  if (a === 10) return "private";
  if (a === 172 && b >= 16 && b <= 31) return "private";
  if (a === 192 && b === 168) return "private";
  return "public";
}

function classifyIpv6(ip: string): Classification {
  const hextets = expandIpv6(ip);
  if (!hextets) return "invalid";

  if (hextets.every((part) => part === 0)) return "unspecified";
  if (hextets.slice(0, 7).every((part) => part === 0) && hextets[7] === 1) return "loopback";

  // IPv4-mapped (::ffff:a.b.c.d, which URL canonicalizes to hex) — classify the embedded v4.
  const first6 = hextets.slice(0, 6);
  if (first6[0] === 0 && first6[1] === 0 && first6[2] === 0 && first6[3] === 0 && first6[4] === 0 && first6[5] === 0xffff) {
    const high = hextets[6] ?? 0;
    const low = hextets[7] ?? 0;
    return classifyIpv4(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`);
  }

  const firstHextet = hextets[0] ?? 0;
  // fe80::/10 link-local (covers cloud-metadata reachability) + fec0::/10 deprecated site-local.
  if ((firstHextet & 0xffc0) === 0xfe80) return "linklocal";
  if ((firstHextet & 0xffc0) === 0xfec0) return "linklocal";
  // fc00::/7 unique-local addresses.
  if ((firstHextet & 0xfe00) === 0xfc00) return "private";
  return "public";
}

function stripBrackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

/** Expand an IPv6 string (with optional `::` and trailing dotted-quad) to 8 hextets, or null if malformed. */
function expandIpv6(ip: string): number[] | null {
  const zoneIndex = ip.indexOf("%");
  const bare = zoneIndex >= 0 ? ip.slice(0, zoneIndex) : ip;
  const halves = bare.split("::");
  if (halves.length > 2) return null;

  const head = halves[0] ? toHextets(halves[0]) : [];
  const tail = halves.length === 2 ? (halves[1] ? toHextets(halves[1]) : []) : null;
  if (head === null || tail === null && halves.length === 2) return null;
  if (head === null) return null;

  if (halves.length === 2) {
    const tailParts = tail ?? [];
    const missing = 8 - head.length - tailParts.length;
    if (missing < 0) return null;
    const full = [...head, ...new Array<number>(missing).fill(0), ...tailParts];
    return isValidHextets(full) ? full : null;
  }
  return head.length === 8 && isValidHextets(head) ? head : null;
}

function toHextets(group: string): number[] | null {
  const out: number[] = [];
  for (const part of group.split(":")) {
    if (part.includes(".")) {
      const octets = part.split(".").map((octet) => Number(octet));
      if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
      out.push(((octets[0] ?? 0) << 8) | (octets[1] ?? 0), ((octets[2] ?? 0) << 8) | (octets[3] ?? 0));
    } else {
      const value = Number.parseInt(part, 16);
      out.push(value);
    }
  }
  return out;
}

function isValidHextets(hextets: number[]): boolean {
  return hextets.length === 8 && hextets.every((part) => Number.isInteger(part) && part >= 0 && part <= 0xffff);
}
