FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app ./app
COPY components ./components
COPY public ./public
COPY vps-app ./vps-app
COPY postcss.config.mjs tsconfig.json ./
RUN npm run build

FROM caddy:2-alpine AS web
COPY --from=frontend /build/vps-dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile

FROM python:3.12-slim AS backend
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
COPY server ./server
RUN useradd --uid 10001 --create-home archive && mkdir -p /data /uploads && chown archive:archive /data /uploads
USER archive
EXPOSE 8765
CMD ["python", "server/app.py"]
