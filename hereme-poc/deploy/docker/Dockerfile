FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY public ./public
COPY seed ./seed
COPY server ./server

RUN install -d -o node -g node /var/lib/hereme

USER node
EXPOSE 3000

CMD ["node", "server/index.js"]
