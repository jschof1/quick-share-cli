export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  },
};

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;
  const corsHeaders = {
    "Access-Control-Allow-Origin": env.CORS_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405, corsHeaders);
  }

  if (url.pathname === "/health") {
    return json(
      {
        ok: Boolean(env.R2_BUCKET),
        service: "quick-share",
        bucketBound: Boolean(env.R2_BUCKET),
        publicBaseUrl: env.PUBLIC_BASE_URL || null,
        endpoints: endpoints(origin),
      },
      env.R2_BUCKET ? 200 : 503,
      corsHeaders,
    );
  }

  if (
    url.pathname === "/agent.json" ||
    url.pathname === "/quick-share.json" ||
    url.pathname === "/.well-known/quick-share.json"
  ) {
    return json(agentManifest(origin, env), 200, {
      "Cache-Control": "public, max-age=300",
      ...corsHeaders,
    });
  }

  if (url.pathname === "/openapi.json") {
    return json(openApiSpec(origin), 200, {
      "Cache-Control": "public, max-age=300",
      ...corsHeaders,
    });
  }

  if (url.pathname !== "/files" && url.pathname !== "/files.json") {
    return json({ error: "Not found" }, 404, corsHeaders);
  }

  if (!env.R2_BUCKET) {
    return json(
      {
        error: "R2_BUCKET binding is not configured",
        hint: "Bind your R2 bucket in wrangler.toml as R2_BUCKET.",
      },
      500,
      corsHeaders,
    );
  }

  const limit = clampInt(url.searchParams.get("limit"), 1, 1000, 1000);
  const prefix = cleanPrefix(url.searchParams.get("prefix"));
  const cursor = url.searchParams.get("cursor") || undefined;
  const format = url.searchParams.get("format") || "json";

  try {
    const list = await env.R2_BUCKET.list({
      limit,
      prefix,
      cursor,
      include: ["httpMetadata", "customMetadata"],
    });

    const publicBaseUrl = trimTrailingSlash(env.PUBLIC_BASE_URL || "");
    const files = list.objects.map((object) => {
      const mimeType =
        object.httpMetadata?.contentType ||
        guessMimeType(object.key) ||
        "application/octet-stream";

      return {
        name: object.key,
        size: object.size,
        uploadedAt: object.uploaded,
        etag: object.etag,
        httpEtag: object.httpEtag,
        mimeType,
        url: publicBaseUrl
          ? `${publicBaseUrl}/${encodePath(object.key)}`
          : undefined,
      };
    });

    return json(
      {
        service: "quick-share",
        schemaVersion: "1.0",
        files,
        truncated: list.truncated,
        cursor: list.truncated ? list.cursor : null,
        next:
          list.truncated && list.cursor
            ? `${origin}/files?${nextSearchParams(url.searchParams, list.cursor)}`
            : null,
      },
      200,
      {
        "Cache-Control": "public, max-age=30",
        ...corsHeaders,
      },
      format,
    );
  } catch (error) {
    return json(
      {
        error: "Unable to list R2 files",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
      corsHeaders,
    );
  }
}

function json(body, status = 200, headers = {}, format = "json") {
  if (format === "ndjson" && Array.isArray(body.files)) {
    return new Response(body.files.map((file) => JSON.stringify(file)).join("\n") + "\n", {
      status,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        ...headers,
      },
    });
  }

  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function endpoints(origin) {
  return {
    health: `${origin}/health`,
    manifest: `${origin}/.well-known/quick-share.json`,
    openapi: `${origin}/openapi.json`,
    files: `${origin}/files`,
    filesJson: `${origin}/files.json`,
    filesNdjson: `${origin}/files?format=ndjson`,
  };
}

function agentManifest(origin, env) {
  return {
    name: env.SERVICE_NAME || "quick-share",
    schemaVersion: "1.0",
    description:
      "Public Cloudflare R2 file index for agents, scripts, and browser users.",
    durability:
      "File metadata is read from the configured R2 bucket at request time. Public file URLs remain valid only while the underlying bucket/object remains public and unchanged.",
    authentication: "none",
    destructiveActions: false,
    productionReadiness:
      "Read-only listing service. Add authentication before exposing private client files.",
    endpoints: endpoints(origin),
    query: {
      limit: "Integer from 1 to 1000. Defaults to 1000.",
      prefix: "Optional R2 key prefix, with leading slashes ignored.",
      cursor: "Optional pagination cursor returned by a prior /files response.",
      format: "json or ndjson. ndjson returns one file object per line.",
    },
    fileObject: {
      name: "R2 object key.",
      size: "Object size in bytes.",
      uploadedAt: "Upload timestamp from R2.",
      etag: "R2 object etag.",
      httpEtag: "HTTP etag.",
      mimeType: "Content type from metadata or filename fallback.",
      url: "Public file URL when PUBLIC_BASE_URL is configured.",
    },
    examples: {
      list: `curl -s ${origin}/files | jq '.files[] | {name, url}'`,
      images: `curl -s '${origin}/files?prefix=images/&format=ndjson' | jq -r 'select(.mimeType | startswith("image/")) | .url'`,
      paginate: `curl -s '${origin}/files?limit=100' | jq -r '.next'`,
    },
  };
}

function openApiSpec(origin) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Quick Share API",
      version: "1.0.0",
      description: "Read-only Cloudflare R2 file listing API.",
    },
    servers: [{ url: origin }],
    paths: {
      "/health": {
        get: {
          summary: "Check service configuration",
          responses: {
            200: { description: "Worker and R2 binding are available" },
            503: { description: "R2 binding is missing" },
          },
        },
      },
      "/.well-known/quick-share.json": {
        get: {
          summary: "Machine-readable agent manifest",
          responses: {
            200: { description: "Agent integration metadata" },
          },
        },
      },
      "/files": {
        get: {
          summary: "List public R2 files",
          parameters: [
            parameter("limit", "integer", "Number of files from 1 to 1000"),
            parameter("prefix", "string", "R2 key prefix"),
            parameter("cursor", "string", "Pagination cursor"),
            parameter("format", "string", "json or ndjson"),
          ],
          responses: {
            200: { description: "File list" },
            500: { description: "Bucket binding or R2 list failure" },
          },
        },
      },
    },
  };
}

function parameter(name, type, description) {
  return {
    name,
    in: "query",
    required: false,
    schema: { type },
    description,
  };
}

function nextSearchParams(searchParams, cursor) {
  const next = new URLSearchParams(searchParams);
  next.set("cursor", cursor);
  return next.toString();
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function cleanPrefix(prefix) {
  if (!prefix) return undefined;
  return prefix.replace(/^\/+/, "");
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function guessMimeType(filename) {
  const ext = filename.split(".").pop()?.toLowerCase();
  const types = {
    avif: "image/avif",
    gif: "image/gif",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    svg: "image/svg+xml",
    webp: "image/webp",
    mp4: "video/mp4",
    mov: "video/quicktime",
    pdf: "application/pdf",
    zip: "application/zip",
  };
  return ext ? types[ext] : undefined;
}
