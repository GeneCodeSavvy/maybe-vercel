FROM ubuntu

RUN apt update -y && apt install curl -y

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash -

RUN curl -fsSL https://get.pnpm.io/install.sh | sh -

RUN apt install nodejs pnpm -y

WORKDIR /home/app

COPY . .

RUN pnpm install

RUN node index.js
