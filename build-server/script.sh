#!/bin/bash

git clone "$GIT_REPOSITORY_URL" /home/app/output/

exec node ./script.js
