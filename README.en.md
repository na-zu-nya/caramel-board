# CaramelBoard 🍬🤎

[Japanese version is here → README.md]

CaramelBoard is a private web application for collecting and organizing local assets such as images and videos. It runs on your own computer, and you can browse your library comfortably from the host PC itself or other devices on the same LAN (desktop browser, phone, or tablet).

The app is being developed gradually by [nazunya](https://x.com/na_zu_nya) as an individual side project. The vibe is very much "Vibe Coding"—expect incremental polish over time. The **main** branch contains the stable releases, while **dev** tracks new features (faster updates but higher risk of bugs—use at your own discretion!).

#### Highlights

- Bulk-import and organize large numbers of assets with drag & drop
- Smooth viewing experience for images, comics (multi-page), and videos
- Completely local processing with no external data transmission for private management
- Powerful search and filtering across multiple libraries with tags, creators, color extraction, optional auto-tagging, and favorites

#### Setup difficulty (rough guide)

- **Web developers:** ★★☆☆☆ (fairly easy)
- **Computer enthusiasts:** ★★★☆☆ (somewhat challenging)

> Setup and operation require the command line. It is a bit advanced!

## Before you start

#### License, permitted use, and warranty

This software is distributed under the [**Elastic License 2.0 (ELv2)**](https://www.elastic.co/licensing/elastic-license).

- Personal and organizational use **inside your own home or company** (including commercial use) is allowed.
- You **may not offer it as a hosted or managed service to third parties** (SaaS is disallowed). Please contact us for separate permission if you need that use case.
- The software is provided **as-is** without any express or implied warranty.

Because there is no built-in user access control, exposing the app directly to the public internet is very risky. Please operate it only within environments you can manage.

#### For those cautious about AI

**About the auto-tagging feature**

Auto-tagging analyzes registered assets to automatically generate descriptive tags using a pre-trained model. With the feature enabled you can leverage tags for search, smart collections, and finding similar images.

- It is **disabled by default**. Enable it explicitly during setup if you want to use it.
- Enabling auto-tagging downloads **locally-run inference libraries distributed by third parties**. Please review the training data and licenses for those external assets at your own responsibility.
- The feature only inspects registered images locally to **estimate tags**. It does **not** generate new content, perform further training, or send data outside your machine.
- If you have any concerns, leave auto-tagging disabled and use manual tagging instead.

**About development**

The software is developed with the assistance of common AI coding tools.

## Installation guide

### What you need

- A computer to run the app
  - A reasonably recent CPU is recommended. Suggested baseline: Apple Silicon (M1 or newer) on macOS / 11th gen or newer on Windows
  - If you do not want to use your primary machine, a mini PC or Mac mini works well as a dedicated server
  - At least 4 GB RAM (8 GB or more recommended)
- Storage
  - Space for the assets and any videos you want to catalog—size depends on your desired library
  - An SSD with at least 128 GB free space is recommended
  - External storage can be mounted if preferred
- Docker Desktop (Windows/macOS) or Docker Engine (Linux)

### Setup steps

1. **Install prerequisites**

   - **Windows**
     - WSL2
     - Docker Desktop (enable WSL2 integration)
     - *(Optional)* Git (recommended for simpler updates)
   - **macOS**
     - Command Line Tools for Xcode
     - Docker Desktop or OrbStack
   - **Linux**
     - Docker Engine + docker compose plugin

   > Docker Desktop and OrbStack may require a paid plan for corporate use depending on company size or revenue. Check each license.

2. **Download CaramelBoard**

   - **Using ZIP**
     - Download the ZIP from Releases and extract it
     - Simple to get started, but updates are a bit more manual
     - Place the extracted folder anywhere you like
   - **Using Git** (recommended if available because updates are easier)
     - Open Windows Terminal (or another shell) and navigate to the folder where you want to install
     - Run `git clone https://github.com/na-zu-nya/caramel-board.git caramel-board && cd caramel-board`

3. **Run the setup script**

   Open the `caramel-board` folder in your terminal/WSL and execute:

   ```bash
   ./setup.sh
   ```

   Follow the prompts to configure the environment. (On Windows you can double-click `setup.bat` instead.)

### Starting and operating the app

#### Starting the services

Run `serve.sh` in your terminal (macOS/Linux) or WSL (Windows) to launch the services. (On Windows you can double-click `serve.bat` to open the WSL wrapper.)

```bash
./serve.sh
```

Once the app is running, open:

- http://localhost:9000
- http://<local-ip>:9000 (to access from other devices on the same network)

If you plan to browse from phones or tablets, assigning a static IP to the host machine is recommended.

#### Operational commands

```
# Start the app
./serve.sh

# Stop the app
./serve.sh stop

# Update the app (Git checkout only)
./serve.sh update
```

### Backups

#### Storage locations (images/videos and database)

- Recommended defaults (can be overridden locally):
  - Media files (`/app/data` inside the container): `./data/assets`
  - PostgreSQL data: `./data/postgres`
- Override via `docker-compose.local.yml`. If the file exists, `./serve.sh` loads it automatically.

Example (using the default locations):

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

If you encounter permission errors, adjust ownership/permissions on the host directories.

## Troubleshooting

- Port 9000 already in use → change the `ports` mapping in `docker-compose.yml` and rerun `./serve.sh`
- PostgreSQL port 5432 already in use during development → adjust the `ports` section in `docker-compose.dev.yml`
- Cannot connect to JoyTag → try `curl http://localhost:5001/health` and double-check `JOYTAG_SERVER_URL`
- Storage permission errors → update ownership and permissions on the host-side directories

## License / Contributions / For developers

- Contributions: Issues are welcome. Pull requests are only accepted from approved maintainers
- For detailed developer documentation refer to `docs/DEVELOPMENT.md`
