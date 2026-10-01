# Quick Share for Raycast

Choose a file in Raycast, upload it to Cloudflare R2, and copy a public link. Each user configures their own Cloudflare R2 account in Raycast. No shared storage, embedded credentials, or fallback to the shell uploader's configuration.

## Install locally

Requires macOS, Raycast, Node **22.22.2 or newer**, and rclone (`brew install rclone`).

From the repository root:

```sh
cd raycast
npm ci
npm run dev
```

Raycast registers **Upload File** and **Recent Uploads**. Search for **Upload File**, choose a file, then press **Command–Return**. The public link is copied and the result offers copy/open actions. Use Recent Uploads to find earlier links. The development watcher can be stopped after registration; rerun it when editing the extension.

## Set up your own Cloudflare storage

1. Sign into **your own** Cloudflare account and create an R2 bucket.
2. Create an R2 S3 token with **Object Read & Write**, scoped to **that bucket only**. Copy its Access Key ID, Secret Access Key, and S3 endpoint.
3. In your bucket's Settings, connect your own public custom domain, or enable its Public Development URL for testing. Cloudflare recommends a custom domain for production sharing.
4. Open Upload File in Raycast. First launch requires your bucket name, S3 endpoint, access key, secret key, and public bucket URL in extension preferences. The two credential fields use Raycast password preferences.
5. Upload a harmless test file and open its link to check the public domain matches your bucket.

Uploads go directly from your Mac to the configured endpoint and bucket. Storage usage belongs to that Cloudflare account. There is no developer-hosted upload service, bundled account, or default public URL. The extension never reads `~/.r2-config` or imports credentials from shell/rclone configuration. Missing preferences block uploads; there is no fallback.

Credentials are supplied locally by each user and passed to rclone through environment variables. They are not written to upload history, source control, or command arguments. The optional rclone executable preference supports nonstandard installations.

Cloudflare setup references: [bucket-scoped S3 credentials](https://developers.cloudflare.com/r2/get-started/s3/) and [public bucket configuration](https://developers.cloudflare.com/r2/buckets/public-buckets/).

## Behaviour

- One regular file per upload, with no file-type restriction.
- Files upload under `raycast/<uuid>/<original filename>`. Matching names do not overwrite earlier uploads.
- Public URL path segments are encoded for spaces, Unicode, and punctuation.
- The progress toast reports upload success or failure. A clipboard/history failure leaves the completed upload's link visible.
- Uploads are public to anyone who has the link. They remain available while the R2 object and public domain exist. There is no automatic expiry.
- Recent Uploads stores the latest 100 links locally in Raycast. It does not list the entire bucket or import shell uploads. Clearing history does not remove uploaded files.
- Large files are streamed by rclone rather than buffered in the extension. Upload timeout is 30 minutes. Closing Raycast during an upload is not a promised cancellation mechanism.
- A public R2 base URL is required. The extension does not configure bucket visibility or deploy the read-only Worker.

## Checks

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Tests cover required user configuration with no shared defaults, unique keys, URL encoding, file validation, safe argument handling, environment-based credentials, and redacted upload failures. The underlying uploader was verified with a real R2 upload and public content readback before this onboarding change. The new per-user configuration flow is covered with an isolated mock upload; no credentials are pre-filled in the local installation. Raycast command registration and the native upload form were checked in the installed app.

## Research and publishing

This is a native React/TypeScript extension, using Raycast's FilePicker, clipboard, preferences, and LocalStorage APIs:

- [Getting started](https://developers.raycast.com/basics/getting-started)
- [Forms and file picker](https://developers.raycast.com/api-reference/user-interface/form)
- [Extension manifest](https://developers.raycast.com/information/manifest)
- [Preferences](https://developers.raycast.com/api-reference/preferences)
- [Clipboard](https://developers.raycast.com/api-reference/clipboard)
- [Local storage](https://developers.raycast.com/api-reference/storage)

It is installed locally for development, not published to the Raycast Store. Store submission would be a separate step through Raycast's official extension repository, with screenshots and submission review. The manifest author matches Jack's verified Raycast profile, `jack_schofield`.
