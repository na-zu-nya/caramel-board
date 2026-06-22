# Third-Party Notices

Caramel Board includes, depends on, documents, or can interoperate with
third-party software. Third-party components are licensed under their own terms.
Those terms are not changed by the Caramel Board Source Available License 1.0.

This file is a project-level notice. Before publishing a public binary release,
review the bundled artifacts and include any license files, notices, source
offers, or attribution required by the third-party components included in that
release.

## Bundled Runtime Components

Desktop packages may include runtime components used to run Caramel Board
locally:

- Tauri and Rust crates used by the desktop application.
- Node.js runtime used by the bundled standalone server.
- uv runtime used by optional local integrations.
- npm packages installed into the bundled server resources.
- Fonts and frontend packages used by the client application.

Dependency versions are recorded in:

- `package-lock.json`
- `apps/desktop/src-tauri/Cargo.lock`

## Optional External Tools

Some features require tools that are installed separately by the user or
administrator:

- FFmpeg, used for GIF and video preview support.
- Poppler, used for PDF rasterization.
- AutoTag/JoyTag related libraries, used for optional local image tagging.

These tools are not relicensed by Caramel Board. Review and comply with their
own licenses before installing or redistributing them.

## Release Checklist

For each public binary release:

- Review the generated desktop packages and bundled resources.
- Verify the licenses of bundled npm packages, Rust crates, runtimes, fonts, and
  optional integration components.
- Include required license texts and attribution notices alongside the release
  artifacts when required.
- Do not assume this notice alone is sufficient for third-party redistribution
  obligations.
