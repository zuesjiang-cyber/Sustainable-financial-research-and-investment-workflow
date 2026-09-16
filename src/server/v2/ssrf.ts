import { lookup } from "node:dns/promises";
import net from "node:net";

const BLOCKED_HOSTS = new Set(["localhost", "localhost.localdomain", "metadata.google.internal"]);

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return (
    (n >= ipv4ToInt("10.0.0.0") && n <= ipv4ToInt("10.255.255.255")) ||
    (n >= ipv4ToInt("172.16.0.0") && n <= ipv4ToInt("172.31.255.255")) ||
    (n >= ipv4ToInt("192.168.0.0") && n <= ipv4ToInt("192.168.255.255")) ||
    (n >= ipv4ToInt("127.0.0.0") && n <= ipv4ToInt("127.255.255.255")) ||
    (n >= ipv4ToInt("169.254.0.0") && n <= ipv4ToInt("169.254.255.255")) ||
    (n >= ipv4ToInt("0.0.0.0") && n <= ipv4ToInt("0.255.255.255"))
  );
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.")
  );
}

export async function assertPublicHttpUrl(value: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw Object.assign(new Error("链接不是有效 URL"), { statusCode: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw Object.assign(new Error("只允许 http/https 链接"), { statusCode: 400 });
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (BLOCKED_HOSTS.has(hostname) || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw Object.assign(new Error("禁止访问本地或私有网络地址"), { statusCode: 400 });
  }
  if (net.isIP(hostname)) {
    if ((net.isIPv4(hostname) && isPrivateIPv4(hostname)) || (net.isIPv6(hostname) && isPrivateIPv6(hostname))) {
      throw Object.assign(new Error("禁止访问本地或私有网络地址"), { statusCode: 400 });
    }
    return parsed;
  }
  const addresses = await lookup(hostname, { all: true });
  for (const item of addresses) {
    if ((item.family === 4 && isPrivateIPv4(item.address)) || (item.family === 6 && isPrivateIPv6(item.address))) {
      throw Object.assign(new Error("禁止访问解析到私有网络的地址"), { statusCode: 400 });
    }
  }
  return parsed;
}
