import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";

export type ChatLinkPreview = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
};

type ResolvedAddress = { address: string; family: number };
type HtmlResponse = {
  statusCode: number;
  location: string | undefined;
  contentType: string;
  body: string;
};

const MAX_URL_LENGTH = 2_048;
const MAX_HTML_BYTES = 400_000;
const PREVIEW_TTL_MS = 10 * 60_000;
const MAX_CACHE_SIZE = 300;
const previewCache = new Map<
  string,
  { expiresAt: number; preview: ChatLinkPreview }
>();

const blockedIpv4Ranges: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const value = octets.reduce(
    (total, octet) => total * 256n + BigInt(octet),
    0n,
  );

  return !blockedIpv4Ranges.some(([network, prefix]) => {
    const networkValue = network
      .split(".")
      .map(Number)
      .reduce((total, octet) => total * 256n + BigInt(octet), 0n);
    const mask = ((1n << BigInt(prefix)) - 1n) << BigInt(32 - prefix);
    return (value & mask) === (networkValue & mask);
  });
}

function isPublicAddress(address: string): boolean {
  const cleanAddress = address.replace(/^\[|\]$/g, "").split("%")[0];
  const family = isIP(cleanAddress);
  if (family === 4) return isPublicIpv4(cleanAddress);
  if (family !== 6) return false;

  const normalized = cleanAddress.toLowerCase();
  // Only global-unicast IPv6 addresses (2000::/3) are allowed. Exclude
  // documentation and 6to4 ranges, as well as mapped, local and multicast IPs.
  return (
    /^[23]/.test(normalized) &&
    !normalized.startsWith("2001:db8:") &&
    !normalized.startsWith("2001:10:") &&
    !normalized.startsWith("2002:")
  );
}

function normalizeUrl(rawUrl: string): URL {
  if (rawUrl.length > MAX_URL_LENGTH) {
    throw new Error("URL is too long");
  }
  const url = new URL(rawUrl);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    (url.port &&
      !(
        (url.protocol === "http:" && url.port === "80") ||
        (url.protocol === "https:" && url.port === "443")
      ))
  ) {
    throw new Error("Unsupported link URL");
  }
  return url;
}

async function resolvePublicAddresses(url: URL): Promise<ResolvedAddress[]> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(hostname);
  const addresses: ResolvedAddress[] = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookup(hostname, { all: true, verbatim: true });

  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicAddress(address))
  ) {
    throw new Error("Link host is not publicly routable");
  }
  return addresses;
}

function requestHtml(url: URL, address: ResolvedAddress): Promise<HtmlResponse> {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      method: "GET",
      headers: {
        "user-agent": "5thElementChatPreview/1.0",
        accept: "text/html,application/xhtml+xml;q=0.9",
        "accept-encoding": "identity",
      },
      timeout: 5_000,
      lookup: ((
        _hostname: string,
        options: unknown,
        callback?: (...args: unknown[]) => void,
      ) => {
        const done =
          typeof options === "function"
            ? (options as (...args: unknown[]) => void)
            : callback;
        if (!done) return;
        if (
          typeof options === "object" &&
          options !== null &&
          "all" in options &&
          options.all
        ) {
          done(null, [address]);
        } else {
          done(null, address.address, address.family);
        }
      }) as never,
    };

    const onResponse = (response: import("node:http").IncomingMessage) => {
      const statusCode = response.statusCode ?? 0;
      const location = response.headers.location;
      const contentType = (response.headers["content-type"] ?? "")
        .split(";")[0]
        .trim()
        .toLowerCase();

      if (statusCode >= 300 && statusCode < 400 && location) {
        response.resume();
        resolve({ statusCode, location, contentType, body: "" });
        return;
      }
      if (
        statusCode < 200 ||
        statusCode >= 300 ||
        (contentType !== "text/html" &&
          contentType !== "application/xhtml+xml")
      ) {
        response.resume();
        resolve({ statusCode, location, contentType, body: "" });
        return;
      }

      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > MAX_HTML_BYTES) {
          response.destroy(new Error("Link page is too large"));
          return;
        }
        chunks.push(buffer);
      });
      response.on("end", () => {
        resolve({
          statusCode,
          location,
          contentType,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
      response.on("error", reject);
    };

    const request =
      url.protocol === "https:"
        ? httpsRequest(url, requestOptions, onResponse)
        : httpRequest(url, requestOptions, onResponse);
    request.on("timeout", () => request.destroy(new Error("Link request timed out")));
    request.on("error", reject);
    request.end();
  });
}

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi,
    (entity, code: string) => {
      const normalized = code.toLowerCase();
      if (normalized.startsWith("#x")) {
        const point = Number.parseInt(normalized.slice(2), 16);
        return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
          ? String.fromCodePoint(point)
          : entity;
      }
      if (normalized.startsWith("#")) {
        const point = Number.parseInt(normalized.slice(1), 10);
        return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
          ? String.fromCodePoint(point)
          : entity;
      }
      return (
        { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" }[normalized] ??
        entity
      );
    },
  );
}

async function metadataFromHtml(
  html: string,
  pageUrl: URL,
): Promise<ChatLinkPreview> {
  const meta: Array<Record<string, string>> = [];
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes: Record<string, string> = {};
    for (const attribute of tag[0].matchAll(
      /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g,
    )) {
      attributes[attribute[1].toLowerCase()] =
        attribute[2] ?? attribute[3] ?? attribute[4] ?? "";
    }
    meta.push(attributes);
  }

  const metaValue = (...keys: string[]) => {
    for (const key of keys) {
      const found = meta.find(
        (attributes) =>
          attributes.property?.toLowerCase() === key ||
          attributes.name?.toLowerCase() === key,
      )?.content;
      if (found?.trim()) return decodeHtmlEntities(found.trim());
    }
    return null;
  };

  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1];
  const fallbackTitle = titleTag
    ? decodeHtmlEntities(titleTag.replace(/<[^>]+>/g, "").trim())
    : null;
  const rawImage =
    metaValue("og:image", "og:image:secure_url", "twitter:image", "twitter:image:src") ??
    html.match(/<link\b(?=[^>]*\brel\s*=\s*["'][^"']*image_src[^"']*["'])[^>]*\bhref\s*=\s*["']([^"']+)["']/i)?.[1] ??
    null;

  let image: string | null = null;
  if (rawImage) {
    try {
      const imageUrl = normalizeUrl(new URL(rawImage, pageUrl).toString());
      await resolvePublicAddresses(imageUrl);
      image = imageUrl.toString();
    } catch {
      image = null;
    }
  }

  return {
    url: pageUrl.toString(),
    title: (metaValue("og:title", "twitter:title") ?? fallbackTitle)?.slice(0, 240) ?? null,
    description: metaValue("og:description", "description", "twitter:description")?.slice(0, 500) ?? null,
    image,
    siteName: metaValue("og:site_name")?.slice(0, 120) ?? pageUrl.hostname,
  };
}

export async function getChatLinkPreview(
  rawUrl: string,
): Promise<ChatLinkPreview> {
  let url = normalizeUrl(rawUrl);
  const cacheKey = url.toString();
  const cached = previewCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.preview;
  if (cached) previewCache.delete(cacheKey);

  if (/\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(url.pathname)) {
    await resolvePublicAddresses(url);
    const directImagePreview: ChatLinkPreview = {
      url: url.toString(),
      title: decodeHtmlEntities(url.pathname.split("/").pop() || url.hostname),
      description: null,
      image: url.toString(),
      siteName: url.hostname,
    };
    previewCache.set(cacheKey, {
      expiresAt: Date.now() + PREVIEW_TTL_MS,
      preview: directImagePreview,
    });
    if (previewCache.size > MAX_CACHE_SIZE) {
      const oldestKey = previewCache.keys().next().value;
      if (oldestKey) previewCache.delete(oldestKey);
    }
    return directImagePreview;
  }

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const [address] = await resolvePublicAddresses(url);
    const response = await requestHtml(url, address);
    if (response.location) {
      if (redirects === 3) throw new Error("Too many link redirects");
      url = normalizeUrl(new URL(response.location, url).toString());
      continue;
    }
    if (!response.body) throw new Error("Link preview is unavailable");

    const preview = await metadataFromHtml(response.body, url);
    previewCache.set(cacheKey, {
      expiresAt: Date.now() + PREVIEW_TTL_MS,
      preview,
    });
    if (previewCache.size > MAX_CACHE_SIZE) {
      const oldestKey = previewCache.keys().next().value;
      if (oldestKey) previewCache.delete(oldestKey);
    }
    return preview;
  }

  throw new Error("Link preview is unavailable");
}
