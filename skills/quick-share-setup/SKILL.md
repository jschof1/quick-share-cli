---
name: quick-share-setup
description: Set up and use Quick Share CLI for shared public project assets. Use this whenever the user mentions Quick Share, quick-share-cli, shared asset URLs, R2 file libraries, configuring Hermes/OpenClaw/Codex/Claude projects to find shared images/files, or asks to make a project use a common asset library. Prefer this skill even if the user does not explicitly say "skill" or "CLI".
---

# Quick Share Setup

Quick Share is a CLI-first tool for finding shared public Cloudflare R2 assets from project folders.

Use this skill to make setup boring and repeatable. The expected result is a configured project where agents and developers can run commands like `quick-share images`, `quick-share urls`, and `quick-share files` without remembering bucket URLs.

## Source Repo

Default repo path:

```bash
/Users/jack/Documents/GitHub/quick-share-cli
```

Before changing anything, inspect the repo if the request depends on current behavior:

```bash
cd /Users/jack/Documents/GitHub/quick-share-cli
npm run check
quick-share help
```

If `quick-share` is not installed globally, use:

```bash
cd /Users/jack/Documents/GitHub/quick-share-cli
npm link
```

If linking is not appropriate, use:

```bash
node /Users/jack/Documents/GitHub/quick-share-cli/bin/quick-share.js help
```

## Configure A Project

Use the CLI, not hand-written setup, unless there is a clear reason.

If there is no hosted Quick Share Worker yet, set up the service first:

```bash
quick-share setup-service --bucket quick-share-assets --public-url https://YOUR-PUBLIC-BUCKET.r2.dev
```

This command should:

- Check whether Wrangler is available
- Install Wrangler locally as a dev dependency if needed
- Check Cloudflare auth with `wrangler whoami`
- Create the R2 bucket with `wrangler r2 bucket create`
- Write `wrangler.toml`
- Deploy the Worker with `wrangler deploy`

If Cloudflare auth is missing, do not invent credentials. Ask Jack to run `wrangler login` or provide a scoped `CLOUDFLARE_API_TOKEN`.

If `--public-url` is missing, explain that Cloudflare documents R2 public development URL enablement as a dashboard setting. The Worker can list files without it, but public file URLs will be missing until `PUBLIC_BASE_URL` is configured.

From the target project root:

```bash
quick-share init https://YOUR-WORKER.workers.dev project-prefix/
```

From anywhere:

```bash
quick-share init https://YOUR-WORKER.workers.dev project-prefix/ --project /path/to/project
```

This should create or update:

- `.quick-share.json`
- `AGENTS.md` with a short Quick Share note, if one is not already present

For Jack's common projects, use project-specific prefixes when known:

```bash
quick-share init https://YOUR-WORKER.workers.dev hermes/ --project /Users/jack/Documents/GitHub/hermes
quick-share init https://YOUR-WORKER.workers.dev openclaw/ --project /Users/jack/Documents/GitHub/openclaw
quick-share init https://YOUR-WORKER.workers.dev codex/ --project /Users/jack/Documents/GitHub/codex
```

If the real Worker URL is not known, do not invent one. Ask Jack for the hosted Quick Share Worker URL, or say that service setup is still required.

## Verify Setup

After configuring a project, verify from inside the target project:

```bash
quick-share where
quick-share health
quick-share files
```

If the project should contain images:

```bash
quick-share images
```

If `health` fails, report the exact error and distinguish:

- Missing local config
- Worker unreachable
- Worker reachable but R2 binding missing
- No public `url` values because `PUBLIC_BASE_URL` is not configured

## Daily Usage

Use:

```bash
quick-share files
quick-share files client-name/
quick-share urls
quick-share images
quick-share open logo.png
quick-share copy hero
quick-share where
```

Prefer `quick-share urls` or `quick-share images` when the user needs output that can be pasted into another tool.

Prefer `quick-share files` when the user needs metadata like size, upload date, MIME type, or object names.

## Service Setup Boundary

There are two setup layers:

1. Hosted service setup: Cloudflare Worker, R2 bucket binding, and `PUBLIC_BASE_URL`.
2. Project setup: `.quick-share.json` in each repo.

This skill handles both setup layers. Prefer `quick-share setup-service` for the hosted service and `quick-share init` for each project.

Important boundaries:

- Quick Share is read-only.
- It is public-first and not an auth system.
- Do not put private client material behind it unless auth or signed URLs are added.
- Do not deploy, publish, or change Cloudflare resources without Jack's explicit confirmation.

## Good Final Response

Keep the final response concise and concrete:

- Which project was configured
- Which config file was written
- Which commands were verified
- Any remaining blocker, especially missing Worker URL or failed Cloudflare/R2 health

Example:

```text
Configured Quick Share for /Users/jack/Documents/GitHub/hermes.
Wrote .quick-share.json with prefix hermes/ and added the AGENTS.md note.
Verified quick-share where and quick-share health. The Worker is reachable.
```
