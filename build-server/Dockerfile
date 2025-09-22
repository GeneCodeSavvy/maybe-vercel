FROM ubuntu

RUN apt update -y && apt install curl -y

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash -

RUN apt install nodejs git -y

WORKDIR /home/app

COPY . .

RUN chmod +x ./script.sh ./script.js

ENTRYPOINT ["/home/app/script.sh"]
