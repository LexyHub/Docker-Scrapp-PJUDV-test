FROM node:23.11.0-slim

RUN npm install -g pnpm@10.17.0

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

# Si quieremos instalarlos todos usamos este de acam abajo
# RUN pnpm playwright install --with-deps
# Para solo el que usare q es chormium
RUN pnpm playwright install --with-deps chromium

COPY . .

# Crear los directorios necesarios y dar permisos
RUN mkdir -p data/cases data/downloads && \
    chown -R node:node /app

USER node

CMD ["node", "src/index.js"]