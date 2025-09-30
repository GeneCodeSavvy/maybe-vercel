FROM node:20-slim

WORKDIR /home/app

RUN apt-get update && \
    apt-get install -y git && \
    rm -rf /var/lib/apt/lists/*

COPY script.js script.js
COPY script.sh script.sh
COPY package*.json .

RUN npm install

RUN chmod +x ./script.sh

ENTRYPOINT [ "/home/app/script.sh" ]
