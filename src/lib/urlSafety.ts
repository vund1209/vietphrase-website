// Basic SSRF guard for endpoints that make a server-side outbound fetch
// to a user-submitted URL with no auth gate (see src/app/api/surf/route.ts).
// Rejects the obvious cases -- literal localhost/private/link-local
// targets -- as a proportionate first line of defense for a small app.
// Doesn't resolve DNS to catch rebinding (a hostname that looks public
// but resolves to an internal IP); that's a deliberately out-of-scope
// edge case for now.
function ipv4ToInt(parts: number[]): number {
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateIPv4(hostname: string): boolean {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const parts = match.slice(1, 5).map(Number);
  if (parts.some((p) => p > 255)) return false;
  const ip = ipv4ToInt(parts);

  const ranges: [string, string][] = [
    ["10.0.0.0", "255.0.0.0"],
    ["172.16.0.0", "255.240.0.0"],
    ["192.168.0.0", "255.255.0.0"],
    ["169.254.0.0", "255.255.0.0"], // link-local, incl. cloud metadata (169.254.169.254)
    ["127.0.0.0", "255.0.0.0"], // loopback
    ["0.0.0.0", "255.0.0.0"],
  ];
  return ranges.some(([base, mask]) => {
    const baseInt = ipv4ToInt(base.split(".").map(Number));
    const maskInt = ipv4ToInt(mask.split(".").map(Number));
    return (ip & maskInt) === (baseInt & maskInt);
  });
}

function isPrivateIPv6(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "::1" || // loopback
    h === "::" ||
    h.startsWith("fc") || // unique local fc00::/7
    h.startsWith("fd") ||
    h.startsWith("fe80") // link-local
  );
}

export function isSafePublicUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const hostname = url.hostname.replace(/^\[|\]$/g, ""); // strip [] from a literal IPv6 host
  if (hostname === "localhost") return false;
  if (isPrivateIPv4(hostname)) return false;
  if (hostname.includes(":") && isPrivateIPv6(hostname)) return false;

  return true;
}
