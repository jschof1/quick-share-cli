# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-02-06

### Added

- Initial release of Quick Share CLI
- Upload any file type (images, videos, documents, archives)
- Automatic MIME type detection
- Smart output formatting (Markdown, HTML, embed codes)
- Clipboard integration (auto-copies URL)
- Interactive setup wizard
- Support for Cloudflare R2 storage
- Cross-platform support (macOS, Linux)
- Three command aliases: `quick-share`, `qshare`, `share`
- Configuration stored securely in `~/.quick-share/`

### Features

- ⚡ Lightning-fast uploads using rclone
- 🖼️ Image support with Markdown/HTML output
- 🎬 Video support with HTML5 player embed
- 🎵 Audio support with HTML5 player embed
- 📄 Document support (PDF, Word, Excel)
- 📦 Archive support (ZIP, TAR, GZ)
- 🔒 Secure credential storage (600 permissions)
- 📋 Automatic clipboard copy on macOS/Linux
- 📊 File size and type information

[1.0.0]: https://github.com/jack/quick-share-cli/releases/tag/v1.0.0
