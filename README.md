# iCloud Notes Exporter

A Windows-oriented command-line exporter that reads iCloud Notes from an already
logged-in browser session and writes Markdown files with resumable progress and
manifest-based verification.

This project uses Chrome DevTools Protocol (CDP) to connect to Microsoft Edge or
Chrome. It does not automate Apple ID login, passwords, two-factor prompts, or
trusted-device approval.

## Features

- Exports iCloud Notes to Markdown.
- Groups notes by their iCloud folder metadata.
- Uses zero-padded filenames with sanitized note titles.
- Tracks resumable progress by note record identifier.
- Writes `_manifest.json` files for count checks and auditability.
- Handles locked and pinned notes with explicit status markers.
- Stops safely after repeated content-load timeouts to reduce rate-limit risk.
- Avoids clipboard scraping and virtual-list scrolling as primary extraction
  routes.

## Requirements

- Windows
- Node.js 18 or newer
- Microsoft Edge or Google Chrome
- Manual access to iCloud Notes in the browser

## Install

```bash
npm install
```

## Quick Start

1. Start a browser with the debugging port enabled:

```bash
npm run start-edge
```

2. In the opened browser, sign in to iCloud manually and open Notes.
3. Wait until the normal Notes interface is visible.
4. Run the exporter:

```bash
npm start
```

You can also use the Windows helper:

```bat
scripts\start.bat
```

## Usage

Export all available folders to the default output directory:

```bash
node src/main.mjs
```

Export to a specific output directory:

```bash
node src/main.mjs "C:\Exports\iCloudNotes"
```

Export folders whose displayed name or record identifier matches a filter:

```bash
node src/main.mjs "C:\Exports\iCloudNotes" "Work"
```

By default, exported files are written to a sibling directory named
`导出的备忘录`, outside the project source directory.

## Output

Each exported folder contains Markdown files plus verification artifacts:

- `0001_Note title.md`
- `_manifest.json`
- `_export_progress.json`

The manifest records note identifiers, folder information, output filenames,
content hashes, character counts, status, and errors. Do not treat an export as
complete unless the manifest count and Markdown file count match the expected
source count, excluding intentionally skipped locked notes.

## Safety Model

The exporter is intentionally read-oriented:

- The user signs in manually.
- The tool connects only after the Notes UI is loaded.
- Clipboard extraction is not used as the main route.
- Virtual-list scrolling is not used as the main route.
- Source notes are never deleted or modified by this tool.

Exported Markdown files may contain private information. Keep output directories
out of version control, cloud sharing, and public bug reports unless you have
reviewed and sanitized the contents.

## Known Limits

- iCloud may rate-limit repeated note content loads. The exporter stops after
  repeated timeouts and can be resumed later.
- Locked notes cannot be read until they are unlocked on an Apple device and the
  iCloud Notes page is refreshed.
- iCloud Notes is a private web application, so Apple UI or data-layer changes
  may require exporter updates.
- The current implementation is optimized for Windows paths and browsers.

## Project Structure

```text
icloud-notes-exporter/
  package.json
  scripts/
    start.bat
  src/
    main.mjs
    start-edge.mjs
    verify-env.mjs
    cdp/
      connect.mjs
      store.mjs
    export/
      writer.mjs
    utils/
      filename.mjs
      manifest.mjs
      progress.mjs
  docs/
    pitfalls.md
```

## Troubleshooting

See [docs/pitfalls.md](docs/pitfalls.md) for engineering notes about common
failure modes and design decisions.

## License

MIT
