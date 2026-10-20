#!/bin/bash
# 云仓历史数据导入脚本包装器
# 借用面板的 node_modules（已含 mongodb 驱动）
DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_PATH=/www/wwwroot/redpanel/wabapanel-express/node_modules \
  node "$DIR/import-cache.js" "$@"
