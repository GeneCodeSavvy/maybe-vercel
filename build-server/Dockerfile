FROM node:20-slim

WORKDIR /home/app

RUN apt-get update && \
    apt-get install -y git curl && \
    rm -rf /var/lib/apt/lists/*

COPY . .

RUN npm install

RUN chmod +x ./script.sh

ENTRYPOINT [ "/home/app/script.sh" ]
