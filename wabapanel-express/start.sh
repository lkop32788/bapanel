#!/bin/bash
set -e
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
export NODE_ENV=production
export HOST=127.0.0.1
exec node src/server.js
