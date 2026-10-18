#!/bin/bash
# =============================================================
#  WABA Panel 2026 (NodeJS Edition) - One-Command Auto Installer
#  by KKHS Media  |  kkhsmedia.com  |  WhatsApp +91 70620 10000
#
#  FRESH SERVER? Just run this single line as root:
#    bash <(curl -fsSL https://kkhsmedia.com/downloads/install.sh)
#
#  Already unzipped the product? Run inside that folder:
#    bash install.sh
#
#  Fully unattended (no questions):
#    bash install.sh --domain panel.yourdomain.com --email you@mail.com --yes
# =============================================================
set -euo pipefail

API_PORT=5000
APP_PORT=3002

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
say()  { echo -e "${GREEN}${BOLD}==>${NC}${BOLD} $1${NC}"; }
warn() { echo -e "${YELLOW}[!] $1${NC}"; }
die()  { echo -e "${RED}[x] $1${NC}"; exit 1; }

DOMAIN=""; EMAIL=""; MONGO_URI=""; ASSUME_YES="no"
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --email)  EMAIL="${2:-}"; shift 2 ;;
    --mongo)  MONGO_URI="${2:-}"; shift 2 ;;
    -y|--yes) ASSUME_YES="yes"; shift ;;
    *) shift ;;
  esac
done

OS="linux"; [ "$(uname)" = "Darwin" ] && OS="mac"
SUDO=""
if [ "$OS" = "linux" ] && [ "$(id -u)" != "0" ]; then
  command -v sudo >/dev/null || die "Please run as root (or install sudo)."
  SUDO="sudo"
fi

echo ""
echo -e "${BOLD}=============================================="
echo "  WABA Panel 2026 - Auto Installer (KKHS Media)"
echo -e "==============================================${NC}"
echo ""

# ---------- 1. Questions (only 2) ----------
if [ -z "$DOMAIN" ]; then
  read -r -p "Your panel domain (e.g. panel.yourdomain.com) [ws.37182.club]: " DOMAIN
fi
DOMAIN=${DOMAIN:-ws.37182.club}
# Only ask for an SSL email when this script will actually run certbot:
# not behind a managed panel (BaoTa/aaPanel), not SETUP_NGINX=0, not SKIP_SSL=1.
if [ "$DOMAIN" != "localhost" ] && [ -z "$EMAIL" ] && [ "$ASSUME_YES" != "yes" ] \
   && [ ! -d /www/server/panel ] && [ "${SETUP_NGINX:-1}" != "0" ] && [ "${SKIP_SSL:-1}" = "0" ]; then
  read -r -p "Email for the free SSL certificate (Let's Encrypt): " EMAIL
fi
MONGO_URI=${MONGO_URI:-mongodb://localhost:27017/wabapanel}

if [ "$DOMAIN" = "localhost" ]; then
  BASE_URL="http://localhost:$APP_PORT"; COOKIE_DOM="localhost"
else
  BASE_URL="https://$DOMAIN"; COOKIE_DOM=".$(echo "$DOMAIN" | awk -F. '{n=NF; print $(n-1)"."$n}')"
fi

# ---------- 2. Base packages ----------
if [ "$OS" = "linux" ]; then
  export DEBIAN_FRONTEND=noninteractive
  say "Updating package list..."
  $SUDO apt-get update -qq || true
  $SUDO apt-get install -y -qq curl unzip ca-certificates gnupg git build-essential >/dev/null
fi

# ---------- 3. Get the product files ----------
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ ! -d "$DIR/wabapanel-express" ]; then
  DIR="/opt/wabapanel"
  if [ ! -d "$DIR/wabapanel-express" ]; then
    say "Downloading WABA Panel package (~50 MB)..."
    $SUDO mkdir -p "$DIR"
    $SUDO curl -fL# --http1.1 --retry 5 --retry-delay 3 --retry-all-errors -C - "$PKG_URL" -o /tmp/wabapanel.zip
    say "Extracting..."
    $SUDO unzip -qo /tmp/wabapanel.zip -d "$DIR"
    rm -f /tmp/wabapanel.zip
  fi
  [ -d "$DIR/wabapanel-express" ] || die "Package extract failed (wabapanel-express not found in $DIR)."
fi
say "Install folder: $DIR"

# ---------- 4. Node.js 22 ----------
NODE_MAJOR=0
command -v node >/dev/null && NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -ge 20 ] 2>/dev/null; then
  say "Node.js $(node -v) already installed"
else
  say "Installing Node.js 22..."
  if [ "$OS" = "mac" ]; then
    command -v brew >/dev/null || die "Homebrew not found: https://brew.sh"
    brew install node@22 && brew link --overwrite node@22
  else
    curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO bash - >/dev/null
    $SUDO apt-get install -y -qq nodejs >/dev/null
  fi
fi

# ---------- 5. MongoDB (only if local) ----------
if echo "$MONGO_URI" | grep -q "localhost\|127.0.0.1"; then
  if command -v mongod >/dev/null || pgrep -x mongod >/dev/null; then
    say "MongoDB already installed"
  else
    say "Installing MongoDB 7..."
    if [ "$OS" = "mac" ]; then
      brew tap mongodb/brew && brew install mongodb-community@7.0 && brew services start mongodb-community@7.0
    else
      . /etc/os-release 2>/dev/null || true
      CODENAME="${VERSION_CODENAME:-jammy}"
      case "${ID:-ubuntu}" in
        debian) REPO="https://repo.mongodb.org/apt/debian $CODENAME/mongodb-org/7.0 main" ;;
        *)      REPO="https://repo.mongodb.org/apt/ubuntu $CODENAME/mongodb-org/7.0 multiverse" ;;
      esac
      curl -fsSL https://pgp.mongodb.com/server-7.0.asc | $SUDO gpg -o /usr/share/keyrings/mongodb.gpg --dearmor --yes
      echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb.gpg ] $REPO" | $SUDO tee /etc/apt/sources.list.d/mongodb-org-7.0.list >/dev/null
      $SUDO apt-get update -qq && $SUDO apt-get install -y -qq mongodb-org >/dev/null
      $SUDO systemctl enable --now mongod || warn "Could not start MongoDB via systemd - start it manually."
    fi
  fi
  if [ "$OS" = "linux" ] && ! pgrep -x mongod >/dev/null; then $SUDO systemctl start mongod || true; fi
fi

# ---------- 6. PM2 ----------
command -v pm2 >/dev/null || { say "Installing PM2..."; $SUDO npm install -g pm2 --silent >/dev/null; }

# ---------- 7. Swap on small servers (Next.js build needs RAM) ----------
if [ "$OS" = "linux" ]; then
  TOTAL_MB=$(free -m | awk '/^Mem:/{print $2}')
  SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
  if [ "${TOTAL_MB:-0}" -lt 4096 ] && [ "${SWAP_MB:-0}" -lt 2048 ] && [ ! -f /swapfile ]; then
    say "Low RAM detected (${TOTAL_MB}MB) - creating a 4GB swap file so the build does not fail..."
    $SUDO fallocate -l 4G /swapfile || $SUDO dd if=/dev/zero of=/swapfile bs=1M count=4096 status=none
    $SUDO chmod 600 /swapfile && $SUDO mkswap -q /swapfile && $SUDO swapon /swapfile
    grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | $SUDO tee -a /etc/fstab >/dev/null
  fi
fi

# ---------- 8. .env files ----------
say "Creating .env files..."
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
VERIFY_TOKEN=$(node -e "console.log(require('crypto').randomBytes(12).toString('hex'))")
PANEL_VERSION=$(grep -m1 '^PANEL_VERSION=' "$DIR/wabapanel-express/.env.example" 2>/dev/null | cut -d= -f2- || true)

if [ -f "$DIR/wabapanel-express/.env" ]; then
  warn "Existing wabapanel-express/.env kept (backup: .env.bak)"
  cp "$DIR/wabapanel-express/.env" "$DIR/wabapanel-express/.env.bak"
else
  cat > "$DIR/wabapanel-express/.env" <<EOF
NODE_ENV=production
PORT=$API_PORT
MONGODB_URI=$MONGO_URI
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d
SESSION_SECRET=$SESSION_SECRET
FRONTEND_URL=$BASE_URL
BACKEND_URL=$BASE_URL
ADMIN_URL=$BASE_URL
COOKIE_DOMAIN=$COOKIE_DOM
WHATSAPP_VERIFY_TOKEN=$VERIFY_TOKEN
PANEL_VERSION=$PANEL_VERSION
EOF
fi

if [ "$DOMAIN" = "localhost" ]; then
  API_URL="http://localhost:$API_PORT/api"; SOCK_URL="http://localhost:$API_PORT"
else
  API_URL="$BASE_URL/api"; SOCK_URL="$BASE_URL"
fi
cat > "$DIR/wabapanel-frontend/.env" <<EOF
NEXT_PUBLIC_API_URL=$API_URL
NEXT_PUBLIC_SOCKET_URL=$SOCK_URL
EOF

# ---------- 9. Dependencies + seed + build (ONE build only) ----------
# npm 12 blocks git-type deps by default (EALLOWGIT); @whiskeysockets/baileys
# pulls "libsignal" from a GitHub git ref, and the lockfile pins it over SSH.
# Allow git deps per-project and rewrite GitHub SSH -> HTTPS (works without keys).
say "Enabling git dependencies for npm (baileys/libsignal)..."
git config --global --unset-all url."https://github.com/".insteadOf 2>/dev/null || true
git config --global --add url."https://github.com/".insteadOf "ssh://git@github.com/"
git config --global --add url."https://github.com/".insteadOf "git@github.com:"
for d in wabapanel-express wabapanel-frontend; do
  if [ -d "$DIR/$d" ]; then
    grep -q '^allow-git=' "$DIR/$d/.npmrc" 2>/dev/null \
      || echo 'allow-git=all' >> "$DIR/$d/.npmrc"
  fi
done

say "Installing backend dependencies..."
( cd "$DIR/wabapanel-express" && npm install --legacy-peer-deps --no-audit --no-fund )
say "Creating the first admin account..."
( cd "$DIR/wabapanel-express" && npm run seed ) || warn "Seed skipped (already seeded)."
say "Installing frontend dependencies + building (longest step, ~5 min)..."
( cd "$DIR/wabapanel-frontend" && npm install --no-audit --no-fund && NODE_OPTIONS=--max-old-space-size=4096 npm run build )

# ---------- 10. PM2 ----------
say "Starting the panel with PM2..."
cat > "$DIR/ecosystem.generated.config.js" <<EOF
module.exports = { apps: [
  { name: 'wabapanel-api', script: '$DIR/wabapanel-express/src/server.js', cwd: '$DIR/wabapanel-express', watch: false, autorestart: true, max_restarts: 10, restart_delay: 3000 },
  { name: 'wabapanel-app', script: 'node_modules/next/dist/bin/next', args: 'start -p $APP_PORT', cwd: '$DIR/wabapanel-frontend', watch: false, autorestart: true, max_restarts: 10, restart_delay: 3000 }
] };
EOF
cd "$DIR"
pm2 delete wabapanel-api wabapanel-app >/dev/null 2>&1 || true
pm2 start ecosystem.generated.config.js
pm2 save >/dev/null
[ "$OS" = "linux" ] && $SUDO env PATH="$PATH" pm2 startup systemd -u "$(whoami)" --hp "$HOME" >/dev/null 2>&1 || true

# ---------- 11. Nginx + SSL ----------
# Skip entirely when a managed web panel (BaoTa/aaPanel) already runs the web
# server, or when SETUP_NGINX=0. Installing the apt nginx on such a box fights
# the panel's own nginx over port 80 and /etc/init.d/nginx. Configure the
# reverse proxy inside the panel instead (see the mapping printed below).
if [ -d /www/server/panel ] || [ "${SETUP_NGINX:-1}" = "0" ]; then
  say "Managed web panel detected (BaoTa/aaPanel) or SETUP_NGINX=0 - skipping nginx + SSL."
  warn "Add a reverse proxy for $DOMAIN in your panel with these routes:"
  warn "  /api/  /socket.io/  /uploads/   ->  http://127.0.0.1:$API_PORT"
  warn "  everything else ( / )           ->  http://127.0.0.1:$APP_PORT"
  warn "  client_max_body_size 100M; and pass X-Forwarded-Proto \$scheme for websockets."
elif [ "$OS" = "linux" ] && [ "$DOMAIN" != "localhost" ]; then
  say "Configuring Nginx..."
  $SUDO apt-get install -y -qq nginx >/dev/null
  $SUDO tee /etc/nginx/sites-available/wabapanel >/dev/null <<NGX
server {
  listen 80;
  server_name $DOMAIN;
  client_max_body_size 100M;
  location /api/      { proxy_pass http://127.0.0.1:$API_PORT; proxy_set_header Host \$host; proxy_set_header X-Real-IP \$remote_addr; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$http_x_forwarded_proto; proxy_read_timeout 300; }
  location /socket.io/ { proxy_pass http://127.0.0.1:$API_PORT; proxy_http_version 1.1; proxy_set_header Upgrade \$http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host \$host; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$http_x_forwarded_proto; }
  location /uploads/  { proxy_pass http://127.0.0.1:$API_PORT; proxy_set_header Host \$host; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$http_x_forwarded_proto; }
  location /          { proxy_pass http://127.0.0.1:$APP_PORT; proxy_set_header Host \$host; proxy_set_header X-Real-IP \$remote_addr; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$http_x_forwarded_proto; }
}
NGX
  $SUDO ln -sf /etc/nginx/sites-available/wabapanel /etc/nginx/sites-enabled/wabapanel
  $SUDO rm -f /etc/nginx/sites-enabled/default
  $SUDO nginx -t && $SUDO systemctl reload nginx

  # SSL: skipped by default because this origin sits behind Cloudflare's
  # orange-cloud proxy, which terminates TLS at the edge. Nginx stays on
  # port 80 and Cloudflare connects to it. Set CF SSL/TLS mode to "Flexible"
  # (or install a CF Origin Certificate and use "Full (strict)").
  # To issue a real Let's Encrypt cert on this box instead, run with SKIP_SSL=0.
  if [ "${SKIP_SSL:-1}" = "0" ]; then
    say "Requesting free SSL certificate..."
    $SUDO apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
    if [ -n "$EMAIL" ]; then
      $SUDO certbot --nginx -d "$DOMAIN" --redirect --agree-tos -m "$EMAIL" --non-interactive \
        || warn "SSL failed - make sure $DOMAIN points to this server, then run: certbot --nginx -d $DOMAIN"
    else
      $SUDO certbot --nginx -d "$DOMAIN" --redirect --register-unsafely-without-email --agree-tos --non-interactive \
        || warn "SSL failed - make sure $DOMAIN points to this server, then run: certbot --nginx -d $DOMAIN"
    fi
  else
    say "Skipping Let's Encrypt (using Cloudflare for TLS). Nginx is serving on port 80."
    warn "In Cloudflare: proxy $DOMAIN (orange cloud) and set SSL/TLS mode to 'Flexible'."
  fi
fi

# ---------- 12. Health check ----------
sleep 6
API_CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$API_PORT/api/public/branding" || echo 000)
APP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$APP_PORT/" || echo 000)

echo ""
echo -e "${GREEN}${BOLD}=============================================="
echo "  DONE! WABA Panel 2026 is installed."
echo -e "==============================================${NC}"
echo -e "  Backend health : $API_CODE   Frontend: $APP_CODE   (200 = OK)"
echo -e "  Open           : ${BOLD}$BASE_URL${NC}"
echo -e "  Login          : ${BOLD}admin@wabapanel.com${NC} / ${BOLD}admin123456${NC}  (change it now!)"
echo    "  Next step      : Admin > License > paste your NJSP- license key."
echo    "  Useful         : pm2 status | pm2 logs wabapanel-api | pm2 restart all"
echo    "  Support        : WhatsApp +91 70620 10000 | info@kkhsmedia.com"
echo ""
