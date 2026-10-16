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

### Local shell uploader (macOS)

Run `./upload-file.sh` to choose a file, or `./upload-file.sh "path/to/file.pdf"` to upload directly. Cancelling exits without uploading. Uses `~/.r2-config`, created by `./setup-r2.sh`. Uploads are public; matching filenames are replaced.

## Raycast Extension

The macOS extension in [raycast/](raycast/) adds **Upload File** and **Recent Uploads**. Each user supplies their own R2 bucket and credentials in Raycast preferences. It uses rclone, gives each upload a unique public URL, and copies the link. See [installation and development](raycast/README.md). The CLI and Worker API remain read-only.

## Jack's Files

The deployed library lives in `assets/jack-files/` with its Pages configuration in
`deploy/jack-files/wrangler.json`. The discovery CLI and its read-only Worker remain separate.

- Larger lazy-loaded previews, video durations, readable titles with original filenames,
  grid/list views, search, folders, type filters, and sorting.
- Select files to copy their public links or download a ZIP. ZIPs are built in a browser
  worker, with a visible limit of 100 files / 500 MB to bound browser memory use.
- Named collections persist selected R2 keys in `.quickshare/collections/<uuid>.json`.
  Anyone with a collection URL can preview/download it. They reference current objects;
  they are not immutable copies, private shares, or a separate backup.
- Uploads and collection creation require the owner's passphrase. Authentication uses
  an HMAC-signed Secure/HttpOnly/SameSite cookie lasting 30 days. Set `UPLOAD_PASSWORD`
  using Pages secrets; changing it invalidates all sessions. Use a long random passphrase.
- Browser uploads use unique `uploads/<uuid>/<filename>` keys and the existing `FILES`
  R2 binding. They never replace an existing file. Multipart parts are 8 MiB; the app
  accepts files up to 5 GiB, retries interrupted parts, and supports cancel/retry.
  The page must remain open; reload does not resume a previous upload. Reload may leave
  unfinished multipart uploads for bucket lifecycle cleanup; cancel attempts to abort immediately.
- Everything uploaded is public. The upload credential never belongs in source code,
  localStorage, collection links, or the public R2 bucket.

Deploy the library and its Pages Worker together:

```bash
CLOUDFLARE_ACCOUNT_ID=1d7541992ccacf0931ee0e385daa5e08 \
CLOUDFLARE_API_TOKEN="$(secret CLOUDFLARE_PAGES_TOKEN)" npm run deploy:jack-files
```

Set the upload passphrase through `wrangler pages secret put UPLOAD_PASSWORD --project-name=jack-files`
from `deploy/jack-files/`, then deploy. Secrets are configured separately for production
and preview environments. For local development with isolated local R2 storage:

```bash
cd deploy/jack-files
wrangler pages dev --r2 FILES --binding UPLOAD_PASSWORD=local-test-passphrase
```

Run `npm test` and `npm run check`. The tests cover public discovery, authentication,
origin validation, multipart completion/abort, persistent collections, attachment headers,
unsafe inline content and ZIP boundaries. The live site also needs browser checks for
playback, real upload progress, ZIP downloads and mobile layout.
