FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg git \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY public ./public
COPY seed ./seed
COPY server ./server
COPY scripts ./scripts

RUN install -d -o node -g node /var/lib/hereme /var/lib/hereme-git

USER node
EXPOSE 3000

CMD ["node", "server/index.js"]
