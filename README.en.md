# Caramel Board

<img src="./docs/assets/intro.jpg" alt="Caramel Board screenshot"/>

[Japanese version is here -> README.md](./README.md)

Caramel Board is a local-first private app for collecting reference images, assets, illustrations, comics, and videos into one place, then browsing them comfortably from PCs, phones, and tablets on your LAN.

It is an application for people who enjoy creative work, from creators organizing references to fans browsing illustrations and comics.

This app is developed gradually by [nazunya](https://x.com/na_zu_nya) as a personal project. If you like it, following on X or supporting through [fanbox](https://na-zu-nya.fanbox.cc/) would be greatly appreciated.

## Features

### Easy Drag-And-Drop Import And A Comfortable Viewer

- Drop files into a list to keep collecting assets quickly.
- Images, multi-image works such as comics and books, PDFs, videos, and GIFs are supported.
  - When an item is open in the viewer, dropping additional files adds them as pages. Reordering, sorting, and partial deletion are supported.
  - Video/GIF encoding and automatic PDF splitting require separately installed OSS libraries.
- Gesture-based viewing
  - Swipe or click the edge of the viewer to move between images and pages.
  - Scroll or pinch to zoom in and out.
  - Swipe down to close the image and return to the list.
- Small analysis tools
  - Quick paint with the pen tool
  - Color picking with the picker

### Fully Local-First

- Imported images are stored on your PC and are never sent to external services.
- Private or sensitive images can be managed locally.

### Use From Phones, Tablets, And Other PCs Over LAN

- With local network access enabled, you can open Caramel Board from browsers on devices in your home network.
- Basic authentication and per-library password settings provide simple protection.
- For access from outside your home, use a VPN app such as Tailscale.

### Rich Organization And Search

- Organize and slice your data by libraries, tags, authors, collections, bookmarks, favorites, scratches, and more.
- Search by tags, AutoTags, and author names. Similar-color search and similar-image/similar-collection search are also available. Similar-image features require AutoTag.

### AutoTag Feature (Optional Setup)

- Enabling AutoTag lets Caramel Board automatically tag imported images, search by those tags, and find similar images.
- It can tag character attributes, hair style and color, clothing, accessories, visual descriptions, situations, some well-known characters and series names, and NSFW tags.
- AutoTag can be left disabled, and setup can be skipped. This feature uses a trained open source model and analyzes images locally on your PC. Images are not sent externally and are not used for training. If you are uncomfortable with model-based analysis itself, you can leave it unconfigured.

## Getting Started

For desktop use, download the app from the releases page.

- Desktop (Windows/macOS): [GitHub Releases](https://github.com/na-zu-nya/caramel-board/releases)

The CLI / Docker edition is frozen at the `release/v1.0.8` checkpoint and is no longer maintained on mainline. Use the Desktop edition for normal use.

- CLI / Docker freeze notes: [CLI / Docker setup](./docs/cli-installation.md)
- Migration from the old Docker setup to Desktop: [Docker to Desktop migration guide](./docs/docker-to-desktop-migration.md)

### Optional Setup Guides

These guides cover setup for importing videos, GIFs, and PDFs.

- Windows: [Desktop external tools - Windows](./docs/desktop-tools-windows.md)
- macOS: [Desktop external tools - macOS](./docs/desktop-tools-macos.md)

### Recommended Requirements

Caramel Board app:

- OS: Windows 11+ / macOS 26+
- Memory: 8 GB or more
- Storage:
  - Application: 1 GB
  - Additional storage is required for your saved data.

Client app:

- Latest versions of major browsers are recommended.
- Tested browsers: Safari / Chrome

## Project Information

- Contribution: [CONTRIBUTING.md](./CONTRIBUTING.md)
- License: [LICENSE](./LICENSE)
- Third Party Notices: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)

### License

This software is distributed under the [Caramel Board Source Available License 1.0](./LICENSE). The source code is available, but this is not an Open Source license as defined by the Open Source Initiative.

- Individuals and companies may use it at home or inside their own organization, including internal commercial use.
- You may read, modify, and build the source code for your own personal or internal organizational use.
- GitHub forks, Issues, and Pull Requests are allowed for development, review, and contribution.
- You may not sell, redistribute, provide, rebrand, or otherwise make available built desktop applications, installers, or substantially similar applications or services to third parties.
- The software is provided as-is, without any express or implied warranties.

Do not expose the app directly to the public internet without appropriate access control. Use it within devices and networks you can manage.

### Contribution

Bugs and feature requests are accepted through Issues. Pull Requests are currently focused on approved maintainers and contributors who have discussed the change beforehand.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.
