# syntax=docker/dockerfile:1
FROM node:23.11.0-slim

RUN npm install -g pnpm@10.17.0

WORKDIR /app

# 1) Copiar solo package.json + lock (esto sí usa caché)
COPY package.json pnpm-lock.yaml ./

# 2) Instalar dependencias con caché
RUN pnpm install --frozen-lockfile

# 3) Instalar Playwright ANTES de copiar tu código → así se cachea
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN mkdir -p /ms-playwright && \
    pnpm playwright install --with-deps chromium && \
    chmod -R 755 /ms-playwright

# 4) Recién ahora copiar el resto del proyecto
COPY . .

RUN mkdir -p data/cases data/downloads && \
    chown -R node:node /app

USER node

CMD ["node", "src/index.js"]
