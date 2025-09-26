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

## Getting started

### What you need

- A computer to run the app
  - A reasonably recent CPU is recommended. Suggested baselines: Apple Silicon (M1 or newer) on macOS / 11th Gen or newer on Windows
  - If you prefer not to use your main machine, a mini PC or Mac mini works well as a dedicated server
  - At least 4 GB RAM (8 GB or more recommended)
- Storage
  - Space for the assets and videos you want to manage. Pick a size that suits your library.
  - An SSD with at least 128 GB of free space is recommended
  - External storage is supported
- Docker Desktop (Windows/macOS) or Docker Engine (Linux)

### Setup

1. **Install prerequisites in advance**

   - **Windows**
     - WSL2
     - Docker Desktop (enable WSL2 integration)
     - *(Optional)* Git (recommended because it makes updates easier)
   - **macOS**
     - Command Line Tools for Xcode
     - Docker Desktop or OrbStack
   - **Linux**
     - Docker Engine + docker compose plugin

   *Docker Desktop and OrbStack may require paid plans for corporate use depending on organization size or revenue. Check the respective licenses.*

2. **Download CaramelBoard**

   - **Using a ZIP archive**
     - Download the ZIP from the Releases page and extract it
     - This path is easy, but updates are a little manual
     - Place the extracted folder wherever you like
   - **Using Git** (recommended when available because updates become simpler)
     - Open Windows Terminal (or another shell) and move to the directory where you want to install
     - Run `git clone https://github.com/na-zu-nya/caramel-board.git caramel-board && cd caramel-board`

3. **Run the setup**

   Open the `caramel-board` folder in your terminal or WSL session and execute:

   ```bash
   ./setup.sh
   ```

   Follow the prompts. (On Windows you can double-click `setup.bat`.)

### Running the app

#### Starting the services

Run `start.sh` in your terminal on macOS/Linux or WSL on Windows to launch the services. (On Windows you can also double-click `start.bat`.)

```bash
./serve.sh
```

After the services start, access the app at:

- http://localhost:9000
- http://<local-ip>:9000

If you plan to use phones or tablets, assigning a static IP to the host machine is recommended.

#### Operational commands

```
# Start the app
./serve.sh

# Stop the app
./serve.sh stop

# Update the app (only when cloned via Git)
./serve.sh update
```

### Backups

#### Storage locations (assets and database)

- Recommended defaults (for local overrides):
  - Images and videos (`/app/data` inside the container): `./data/assets`
  - PostgreSQL data: `./data/postgres`
- You can override these via `docker-compose.local.yml`. When the file exists, `./serve.sh` loads it automatically.

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

Example for Windows/WSL (when storing data elsewhere):

```yaml
services:
  app:
    volumes:
      - C:\\Data\\CaramelBoard\\assets:/app/data
      # or using the WSL path form
      - /mnt/c/Data/CaramelBoard/assets:/app/data
  postgres:
    volumes:
      - C:\\Data\\CaramelBoard\\postgres:/var/lib/postgresql/data
      # or using the WSL path form
      - /mnt/c/Data/CaramelBoard/postgres:/var/lib/postgresql/data
```

If you encounter permission errors, adjust ownership or permissions on the host directories.

## Troubleshooting

- Port 9000 is already in use → change the `ports` setting in `docker-compose.yml`, then rerun `./serve.sh`
- PostgreSQL port 5432 is already occupied during development → adjust the `ports` section in `docker-compose.dev.yml`
- Cannot connect to JoyTag → check with `curl http://localhost:5001/health` and verify `JOYTAG_SERVER_URL`
- Storage permission errors → fix ownership/permissions on the host directories

## License / Contributions / For developers

- Please report bugs or feature requests via Issues (a template is in preparation)
- Pull requests are currently limited to approved maintainers, though this may open up in the future
