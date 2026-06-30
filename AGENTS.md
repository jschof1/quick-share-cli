# Quick Share Agent Notes

Quick Share is a CLI-first bridge to shared public assets in Cloudflare R2.

Use it when a project needs to find shared images, PDFs, exports, handoff files, or public asset URLs without guessing bucket paths.

## Preferred Workflow

From any configured project:

```bash
quick-share where
quick-share health
quick-share images
quick-share urls
quick-share files client-name/
```

The CLI reads `.quick-share.json` from the current directory or a parent directory. If no config file exists, it falls back to `QUICK_SHARE_API_URL`.

## Configure A Project

If there is no hosted Quick Share Worker yet, set it up first:

```bash
quick-share setup-service --bucket quick-share-assets --public-url https://YOUR-PUBLIC-BUCKET.r2.dev
```

This checks Wrangler, installs a local Wrangler dev dependency when needed, checks Cloudflare authentication, creates the R2 bucket, writes `wrangler.toml`, and deploys the Worker.

If authentication is missing, do not guess credentials. Ask Jack to run `wrangler login` or provide a scoped `CLOUDFLARE_API_TOKEN`.

From the project root:

```bash
quick-share init https://quick-share-api.example.workers.dev project-prefix/
```

Or configure another project from anywhere:

```bash
quick-share init https://quick-share-api.example.workers.dev project-prefix/ --project /path/to/project
```

This writes `.quick-share.json` and adds a short Quick Share section to that project's `AGENTS.md` if needed.

## Important Boundaries

- Read-only: no upload, delete, move, or overwrite command exists.
- Public-first: treat returned URLs as public.
- Not authentication: do not use this for private client assets without adding signed URLs or auth.
- Durability depends on the R2 object and public asset domain staying available.

## Stable Commands

- `quick-share init <api-url> [prefix] [--project <dir>]`
- `quick-share setup-service [--bucket <bucket>] [--public-url <url>] [--no-deploy]`
- `quick-share health`
- `quick-share manifest`
- `quick-share files [prefix]`
- `quick-share urls [prefix]`
- `quick-share images [prefix]`
- `quick-share open <filename-or-index> [prefix]`
- `quick-share copy <filename-or-index> [prefix]`
- `quick-share where`
