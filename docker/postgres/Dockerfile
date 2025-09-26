FROM postgres:16-bookworm

# Install locales (Debian) and enable Japanese UTF-8
RUN apt-get update \
    && apt-get install -y --no-install-recommends locales \
    && sed -i 's/^# \(ja_JP.UTF-8\)/\1/' /etc/locale.gen \
    && locale-gen \
    && update-locale LANG=ja_JP.UTF-8 \
    && rm -rf /var/lib/apt/lists/*

# Set locale environment
ENV LANG=ja_JP.UTF-8 \
    LC_ALL=ja_JP.UTF-8 \
    LANGUAGE=ja_JP:ja:en
