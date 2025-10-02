#!/bin/bash

git clone "$GIT_REPOSITORY__URL" /home/app/output/

exec node ./script.js
