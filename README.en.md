# CaramelBoard 🍬🤎

[Japanese version is here → README.md](./README.md)

CaramelBoard is a private web application for collecting and organizing local assets such as images and videos. It runs on your own PC, and you can browse the catalog comfortably from the host machine or any other device on the same LAN—desktop browsers, phones, or tablets.

This app is being developed gradually by [nazunya](https://x.com/na_zu_nya) as a personal project. The vibe is very much VibeCoding; the goal is to refine it little by little.

The **main** branch hosts the stable releases, while **dev** carries newer features. The dev branch ships updates faster but may contain bugs, so use it at your own risk!

#### Key features

- Bulk import and organize lots of assets via drag & drop
- Pleasant viewing experience for images, comics (multi-page), and videos
- Fully local processing with no external transmission for private management
- Powerful search and slicing across multiple libraries with tags, creator metadata, color extraction, optional auto-tagging, and favorites

#### Setup difficulty (rough guide)

- **Web developers:** ★★・・・ (relatively easy)
- **Power users comfortable with PCs:** ★★★・・ (somewhat challenging)

*Setup and operation require the command line—expect a bit of a learning curve!*

## Before you start

#### License, usage scope, and warranty

This software is distributed under the [**Elastic License 2.0 (ELv2)**](https://www.elastic.co/licensing/elastic-license).

- Both individuals and companies can use it **within their own homes or offices (commercial use included)**.
- You **may not offer it as a hosted or managed service for third parties** (SaaS is not allowed). Contact us for a separate agreement if you need that use case.
- The software is provided **as-is**, without any express or implied warranties.

Because there is no built-in access control, exposing the app directly to the public internet is extremely risky. Keep the deployment within environments you can manage.

#### For anyone cautious about AI

**About the auto-tagging feature**

Auto-tagging analyzes registered assets with a pre-trained model to generate descriptive tags automatically. Enabling it lets you use those tags for search, smart collections, and finding similar images.

- It is **disabled by default**. Opt in during setup if you want to use it.
- Enabling the feature downloads **locally run inference libraries distributed by third parties**. Review the training data and licenses for those libraries at your own responsibility.
- The feature inspects registered images locally **only to estimate tags**. It does **not** generate new content, perform additional training, or send data outside your machine.
- If you have concerns, leave auto-tagging disabled and rely on manual tagging.

**About development**

This software is built with the assistance of common AI coding tools.

## Setup guide

### Windows / macOS

- Windows: [docs/installation-windows.md](./docs/installation-windows.md)
- macOS: [docs/installation-macos.md](./docs/installation-macos.md)

Refer to those platform-specific guides for detailed steps.

### Linux quick start

#### Requirements

- Docker Engine with the docker compose plugin
- Git
- Python 3 (3.10 or newer recommended)

> `huggingface-hub` is required for the optional auto-tagging feature, so ensure pip is available.

#### Clone the repository

```bash
git clone https://github.com/na-zu-nya/caramel-board.git caramel-board
cd caramel-board
```

#### Initial setup

```bash
chmod +x setup.sh serve.sh scripts/*.sh
python3 -m pip install --upgrade pip
python3 -m pip install huggingface-hub
./setup.sh
```

- Installing `pip` upgrades and `huggingface-hub` ahead of time ensures the setup script can use the required libraries
- During `./setup.sh`, follow the prompts to choose storage locations and optional features

#### Start and stop the app

```bash
# production mode
./serve.sh prod

# development mode
./serve.sh dev

# stop the services
./serve.sh stop
```

Once the services are up, open `http://localhost:6766` or `http://<host-ip>:6766` in your browser.

#### Update

```bash
./serve.sh update
```

This command pulls the latest changes, rebuilds the container image, and restarts as needed.

## Backup

### Database backup

```bash
./serve.sh backup
```

The backup file is written to `backups/caramel-board-db-YYYYMMDD-HHMMSS.sql`.
Pass a path if you want to choose the output location.

```bash
./serve.sh backup backups/my-backup.sql
./serve.sh backup backups/my-backup.sql.gz
```

You can also run the same backup with `npm run db:backup`.

### Storage locations (assets and database)

- Recommended defaults:
  - Images and videos (`/app/data` inside the container): `./data/assets`
  - PostgreSQL data: `./data/postgres`
- Override paths by providing a `docker-compose.local.yml`; `./serve.sh` loads it automatically when present.

Example (using the recommended defaults):

```yaml
services:
  app:
    environment:
      - FILES_STORAGE=/app/data
    volumes:
      - ./data/assets:/app/data
  postgres:
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
```

If you encounter permission errors, adjust ownership or permissions on the host directories.

## Troubleshooting

- Port 6766 is already in use → change the `ports` setting in `docker-compose.yml`, then rerun `./serve.sh`
- PostgreSQL port 5432 is already occupied during development → adjust the `ports` section in `docker-compose.dev.yml`
- Cannot connect to JoyTag → check with `curl http://localhost:5001/health` and verify `JOYTAG_SERVER_URL`
- Storage permission errors → fix ownership/permissions on the host directories

## License / Contributions / For developers

- Please report bugs or feature requests via Issues (a template is in preparation)
- Pull requests are currently limited to approved maintainers, though this may open up in the future
