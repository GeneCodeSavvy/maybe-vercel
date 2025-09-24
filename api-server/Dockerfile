FROM node:22-slim

RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    && curl -fsSL https://get.docker.com | sh \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /home/app

COPY . .

RUN npm install

ENTRYPOINT ["node", "index.js"]
