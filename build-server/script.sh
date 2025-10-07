#!/bin/bash

curl -sfS https://dotenvx.sh/install.sh | sh

git clone "$GIT_REPOSITORY__URL" /home/app/output/

exec dotenvx run -- node ./script.js
