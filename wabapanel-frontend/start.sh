#!/bin/bash
set -e
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
export NODE_ENV=production
export PORT=3002
exec node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port "$PORT"
