# Quick Share CLI

Quick Share is a small CLI-first tool for making shared Cloudflare R2 assets easy to find from any project.

The goal is simple: once a project is configured, agents and developers can run boring commands like `quick-share images` or `quick-share urls` from the project root. No remembered bucket URLs, no copied curl snippets, no custom integration work per project.

## What It Provides

- `quick-share init` to configure any project in one command
- `quick-share setup-service` to prepare the Cloudflare Worker/R2 service with Wrangler
- `quick-share health` to check the hosted Worker
- `quick-share files` to list shared files
- `quick-share urls` to print public URLs
- `quick-share images` to print public image URLs
- `quick-share open <file>` and `quick-share copy <file>` for quick use
- `.quick-share.json` project config discovered from the current directory or parent folders
- Optional browser library for humans
- Read-only Cloudflare Worker API backed by R2

## Install Locally

From this repo:

```bash
npm link
```

Then check:

```bash
quick-share help
```

Without linking, use:

```bash
npm run quick-share -- help
```

## Smooth Project Setup

If the hosted Worker does not exist yet, set up the service first:

```bash
quick-share setup-service --bucket quick-share-assets --public-url https://YOUR-PUBLIC-BUCKET.r2.dev
```

This checks for Wrangler, installs it locally if needed, checks Cloudflare authentication, creates the R2 bucket, writes `wrangler.toml`, and deploys the Worker.

If Cloudflare auth is not ready, the CLI will stop and tell you to use one of:

```bash
wrangler login
export CLOUDFLARE_API_TOKEN=your_token_here
```

Cloudflare documents R2 public development URLs as a dashboard setting, so if you do not provide `--public-url`, the Worker can list files but file objects will not include public asset URLs yet.

Configure Hermes, OpenClaw, Codex, Claude project folders, or any other repo:

```bash
quick-share init https://YOUR-WORKER.workers.dev hermes/ --project /Users/jack/Documents/GitHub/hermes
quick-share init https://YOUR-WORKER.workers.dev openclaw/ --project /Users/jack/Documents/GitHub/openclaw
```

That writes:

- `.quick-share.json`
- a short `AGENTS.md` Quick Share note, if one is not already present

After setup, anyone can use the project naturally:

```bash
cd /Users/jack/Documents/GitHub/hermes
quick-share health
quick-share images
quick-share urls
quick-share files handovers/
```

## Daily CLI Usage

List files using the project default prefix:

```bash
quick-share files
```

List files under another prefix:

```bash
quick-share files client-name/
```

Print URLs only:

```bash
quick-share urls
```

Print image URLs only:

```bash
quick-share images
```

Open or copy by exact name, partial name, or list index:

```bash
quick-share open logo.png
quick-share copy "hero"
quick-share copy 1
```

Show which config the CLI found:

```bash
quick-share where
```

## Service Setup

Preferred:

```bash
quick-share setup-service --bucket quick-share-assets --public-url https://YOUR-PUBLIC-BUCKET.r2.dev
```

Useful options:

```bash
quick-share setup-service --name quick-share-api
quick-share setup-service --bucket client-images
quick-share setup-service --cors-origin https://quick-share-library.pages.dev
quick-share setup-service --no-deploy
quick-share setup-service --skip-bucket-create
quick-share setup-service --no-install
```

Manual fallback:

1. Copy `wrangler.toml.example` to `wrangler.toml`.
2. Edit `bucket_name`, `PUBLIC_BASE_URL`, and `CORS_ORIGIN`.
3. Run `wrangler login` or set `CLOUDFLARE_API_TOKEN`.
4. Run `wrangler r2 bucket create <bucket>`.
5. Run `wrangler deploy`.

## Browser Library

Preview locally:

```bash
npm run preview
```

Deploy the static browser library:

```bash
QUICK_SHARE_WORKER_URL="https://YOUR-WORKER.workers.dev/files" \
QUICK_SHARE_PUBLIC_URL="https://YOUR-PUBLIC-BUCKET.r2.dev" \
./scripts/deploy-library.sh quick-share-library
```

## API Contract

The CLI talks to these read-only endpoints:

- `GET /health`
- `GET /.well-known/quick-share.json`
- `GET /files`
- `GET /files?format=ndjson`
- `GET /openapi.json`

`GET /files` returns:

```json
{
  "service": "quick-share",
  "schemaVersion": "1.0",
  "files": [
    {
      "name": "example.jpg",
      "size": 12345,
      "uploadedAt": "2026-06-30T12:00:00.000Z",
      "etag": "abc123",
      "httpEtag": "\"abc123\"",
      "mimeType": "image/jpeg",
      "url": "https://pub-example.r2.dev/example.jpg"
    }
  ],
  "truncated": false,
  "cursor": null,
  "next": null
}
```

## Boundaries

- Quick Share is read-only.
- It lists metadata from R2 at request time.
- Public URLs only work while the bucket/object/domain remains public.
- It is not an auth system.
- Do not expose private client files without adding authentication and signed URLs.

## Checks

```bash
npm run check
```
