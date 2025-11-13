# se puede mejorar caleta este dockerfile, estara sujeto a cambios

FROM node:23.11.0-slim

RUN npm install -g pnpm@10.17.0

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

# Crear los directorios necesarios y dar permisos
RUN mkdir -p data/cases data/downloads && \
    chown -R node:node /app

# Instalar Playwright browsers en ubicación compartida accesible para todos los usuarios
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN mkdir -p /ms-playwright && \
    pnpm playwright install --with-deps chromium && \
    chmod -R 755 /ms-playwright

USER node

CMD ["node", "src/index.js"]