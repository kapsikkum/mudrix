# The web app, built from source and served by nginx:
#   docker build -t mudrix .
#   docker run -p 8080:80 mudrix
# Images are pinned to exact versions (not digests) so a rebuild is reproducible; bump them together
# with the toolchain in rust-toolchain.toml.
FROM rust:1.100.0-bookworm AS builder

# Node next to the Rust toolchain (the build runs both)
COPY --from=node:22.23.5-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=node:22.23.5-bookworm-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

ARG WASM_PACK=0.15.0
RUN arch="$(uname -m)" \
 && curl -sSfL "https://github.com/rustwasm/wasm-pack/releases/download/v${WASM_PACK}/wasm-pack-v${WASM_PACK}-${arch}-unknown-linux-musl.tar.gz" \
  | tar -xz --strip-components=1 -C /usr/local/bin "wasm-pack-v${WASM_PACK}-${arch}-unknown-linux-musl/wasm-pack"

WORKDIR /app
COPY rust-toolchain.toml ./
RUN rustup toolchain install

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY packages/i18n/package.json packages/i18n/
COPY packages/emoji/package.json packages/emoji/
COPY packages/icons/package.json packages/icons/
COPY packages/sounds/package.json packages/sounds/
RUN npm ci --ignore-scripts

COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    npm run build

FROM nginx:1.31.8-alpine3.24

# The master process runs as the unprivileged `nginx` user (uid 101), so it owns everything it writes:
# the pid file, the temp/cache directories and the web root. listen 80 in apps/web/nginx.conf is a
# privileged port, so the nginx binary keeps CAP_NET_BIND_SERVICE instead of the container running as
# root.
RUN apk add --no-cache libcap \
 && setcap 'cap_net_bind_service=+ep' /usr/sbin/nginx \
 && chown -R nginx:nginx /var/cache/nginx \
 && mkdir -p /run \
 && chown nginx:nginx /run

COPY --from=builder --chown=nginx:nginx /app/apps/web/dist /usr/share/nginx/html
COPY --chown=nginx:nginx apps/web/nginx.conf /etc/nginx/conf.d/default.conf

USER nginx
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
