# iCloud Notes Exporter Pitfalls

This document records engineering lessons for maintaining the exporter. It is
intentionally generic: do not add personal note titles, local machine paths,
account details, browser profile data, or private export counts.

## Core Principles

1. The user must sign in to iCloud manually.
2. Do not automate Apple ID, password, two-factor, QR-code, or trusted-device
   prompts.
3. Do not use clipboard selection as the primary extraction route.
4. Do not use virtual-list scrolling as the primary traversal route.
5. Prefer iCloud Notes' in-page data objects after the Notes UI is loaded.
6. Treat count checks, manifests, failures, and progress files as required
   artifacts, not optional diagnostics.
7. Never suggest deleting source notes based only on a successful program exit.

## Recommended Data Route

The safest route observed so far is:

1. Start Edge or Chrome with a CDP debugging port.
2. Let the user sign in manually and open the normal iCloud Notes interface.
3. Locate the Notes iframe where `window.NotesApp` exists.
4. Prefer `_cwStore.__CW__allNotes` when available.
5. Fall back to the current folder's `filteredSortedNotes.items._array` only
   when exporting a selected folder.
6. For each note, call `note.load()` and, if needed, `note.loadSearchableText()`.
7. Convert note text with `String(note.TopoTextString)`.
8. Write Markdown, progress, manifest, and failure information together.

## Routes To Avoid

### Clipboard Extraction

Selecting the editor and copying visible content is fragile. It depends on
focus, selection state, and the currently rendered viewport. In the worst case,
automation can type into or alter the editor. Keep clipboard behavior as a
manual diagnostic only.

### Virtual-List Scrolling

iCloud Notes renders only part of long lists. Scrolling the visible list is a
poor source of truth because rows are recycled, delayed, and sometimes missing
while data is still loading. Use UI interaction only to open a folder, then
verify the in-page data layer.

### Blind Folder Matching

Do not hard-code a single localized folder name. Build a folder map from note
metadata and match against both display names and stable record identifiers.

## Loading And Stability

The note array can appear before it is complete. A short nonzero count is not a
safe completion signal. Wait until the observed source count is stable across
multiple reads before exporting.

When using a current-folder array, cache the note array reference after it is
stable. Re-resolving deep view paths during every note export can fail if the
web app swaps views or clears intermediate state.

## Content Loading

`TopoTextString` may be empty until the note is loaded. The exporter should:

- call `note.load()` with a timeout;
- retry transient timeouts a limited number of times;
- try `note.loadSearchableText()` when useful;
- record non-timeout errors as failures;
- avoid marking failed notes as successfully exported empty notes.

Repeated content-load timeouts may indicate iCloud throttling. Stop safely,
preserve progress, and allow the user to resume later.

## Locked And Pinned Notes

Locked notes may expose metadata while withholding body text. The exporter must
make this visible in the manifest and avoid treating locked content as a normal
successful export. After the user unlocks notes on an Apple device, they may
need to refresh iCloud Notes before the browser session can read the content.

Pinned notes should be represented consistently in filenames or metadata so
users can identify them after export.

## Filenames

Note titles can contain characters that are legal in the web app but invalid or
confusing on Windows filesystems. Sanitize filenames by removing control
characters, reserved path characters, bidirectional formatting characters,
zero-width characters, and trailing spaces or dots.

Use stable sequence numbers for readability. Keep record identifiers and hashes
in the manifest instead of exposing them in filenames.

## Verification

A run is not complete unless:

- expected source count is known;
- Markdown file count matches the manifest count, except intentionally skipped
  locked notes;
- failures are reported explicitly;
- empty notes are explained;
- progress can be read for resume;
- output is outside the project source tree.

The manifest should record enough information to audit what happened without
opening every Markdown file.

## Release Checklist

Before publishing changes:

- run syntax checks for all JavaScript files;
- verify `.gitignore` excludes debug profiles, dependencies, logs, manifests,
  progress files, and exported notes;
- scan the repository for local absolute paths and personal data;
- confirm README behavior matches the current code;
- test a small export using non-sensitive notes when possible.
