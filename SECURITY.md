# Security Policy

This project works with private iCloud Notes data. Treat exported files,
manifests, progress files, logs, and browser profiles as sensitive.

## Supported Use

- Sign in to iCloud manually in your own browser.
- Run the exporter only on machines you trust.
- Store exports in a private local directory.
- Review exported Markdown before sharing any files.

## Out Of Scope

This project does not collect, request, or automate:

- Apple ID passwords;
- two-factor authentication codes;
- trusted-device approvals;
- browser cookies;
- iCloud session tokens;
- HAR files or browser profile archives.

Do not include any of the above in bug reports.

## Reporting Issues

When reporting a bug, use synthetic notes or redacted examples. Include:

- operating system version;
- Node.js version;
- browser name and version;
- command used;
- sanitized console output;
- sanitized manifest excerpts when relevant.

Do not attach exported notes, real note titles, local absolute paths, browser
profile directories, or screenshots that reveal private information.

## Data Safety

The exporter is designed to read notes and write local Markdown. It should not
delete or modify source notes. If you find behavior that appears to alter iCloud
Notes content, stop using the tool and open a security issue with a minimal,
redacted reproduction.
