#!/bin/bash
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
prompt()  { echo -e "${YELLOW}>>>${NC} $1"; }

echo ""
echo "=================================================="
echo "  IOTBomlist-v2 — Server Setup Script"
echo "=================================================="
echo ""

# ─── Cek .env ada di folder yang sama ─────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo -e "${RED}[ERROR]${NC} File .env tidak ditemukan di $SCRIPT_DIR"
  echo "  Upload .env ke folder yang sama dengan script ini:"
  echo "  scp .env ubuntu@SERVER:~/"
  exit 1
fi

info "Membaca konfigurasi dari .env..."

# Source semua nilai dari .env
set -a
source "$ENV_FILE"
set +a

success "Nilai dari .env berhasil dibaca"

# ─── Hanya tanya 3 hal ────────────────────────────────────────────────────────
echo ""
prompt "IP atau Domain server ini (contoh: 103.12.34.56 atau bom.perusahaan.com):"
read -r SERVER_HOST

echo ""
prompt "GitHub username/org pemilik GHCR (contoh: gspetch):"
read -r GITHUB_OWNER

echo ""
prompt "GitHub Personal Access Token (scope: read:packages):"
read -rs GITHUB_PAT
echo ""

# ─── Auto-generate secrets kuat (override nilai lemah dari .env) ──────────────
info "Generating JWT_SECRET dan AUTH_COOKIE_SECRET yang kuat..."
JWT_SECRET=$(openssl rand -hex 32)
AUTH_COOKIE_SECRET=$(openssl rand -hex 32)

# ─── Install Docker ───────────────────────────────────────────────────────────
if ! command -v docker &> /dev/null; then
  info "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  newgrp docker
  success "Docker installed"
else
  success "Docker already installed: $(docker --version)"
fi

if ! docker compose version &> /dev/null; then
  info "Installing Docker Compose plugin..."
  sudo apt-get update -qq
  sudo apt-get install -y docker-compose-plugin
fi

# ─── Buat folder project ──────────────────────────────────────────────────────
INSTALL_DIR="$HOME/iotbomlist"
info "Setup project directory: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR/nginx"
cd "$INSTALL_DIR"

# ─── Login ke GHCR ────────────────────────────────────────────────────────────
info "Login ke GitHub Container Registry..."
echo "$GITHUB_PAT" | docker login ghcr.io -u "$GITHUB_OWNER" --password-stdin
success "GHCR login OK"

# ─── Tulis .env untuk server (pakai nilai dari .env + override secrets) ────────
info "Membuat .env production..."
cat > .env << EOF
# DATABASE
DB_USER=${DB_USER:-bom}
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=${DB_NAME:-bom_v2}

# SECURITY (auto-generated saat setup)
JWT_SECRET=${JWT_SECRET}
AUTH_COOKIE_SECRET=${AUTH_COOKIE_SECRET}

# GITHUB
GITHUB_REPOSITORY_OWNER=${GITHUB_OWNER}

# JLC SIDECAR
JLC_APP_ID=${JLC_APP_ID}
JLC_ACCESS_KEY=${JLC_ACCESS_KEY}
JLC_SECRET_KEY=${JLC_SECRET_KEY}
JLC_ENDPOINT=${JLC_ENDPOINT:-https://jlcpcb.com/api/}
JLC_PORT=${JLC_PORT:-8089}

# SUPPLIER APIs
MOUSER_API_KEY=${MOUSER_API_KEY}
DIGIKEY_CLIENT_ID=${DIGIKEY_CLIENT_ID}
DIGIKEY_CLIENT_SECRET=${DIGIKEY_CLIENT_SECRET}

# FRONTEND
NEXT_PUBLIC_API_URL=http://${SERVER_HOST}:8001

# CORS
ALLOWED_ORIGINS=http://${SERVER_HOST}:8080
EOF
chmod 600 .env
success ".env production dibuat (permissions: 600)"

# ─── Tulis docker-compose.prod.yml ────────────────────────────────────────────
info "Membuat docker-compose.prod.yml..."
cat > docker-compose.prod.yml << 'COMPOSE_EOF'
services:
  db:
    image: postgres:15-alpine
    container_name: bom-db
    restart: always
    environment:
      POSTGRES_USER: ${DB_USER:-bom}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME:-bom_v2}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-bom} -d ${DB_NAME:-bom_v2}"]
      interval: 10s
      timeout: 5s
      retries: 5

  sidecar:
    image: ghcr.io/${GITHUB_REPOSITORY_OWNER}/iotbomlist-v2-sidecar:latest
    container_name: bom-sidecar
    restart: always
    environment:
      JLC_APP_ID: ${JLC_APP_ID}
      JLC_ACCESS_KEY: ${JLC_ACCESS_KEY}
      JLC_SECRET_KEY: ${JLC_SECRET_KEY}
      JLC_PORT: 8089
    healthcheck:
      test: ["CMD-SHELL", "nc -z localhost 8089 || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 30s
    deploy:
      resources:
        limits:
          memory: 512m

  backend:
    image: ghcr.io/${GITHUB_REPOSITORY_OWNER}/iotbomlist-v2-backend:latest
    container_name: bom-backend
    restart: always
    depends_on:
      db:
        condition: service_healthy
      sidecar:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://${DB_USER:-bom}:${DB_PASSWORD}@db:5432/${DB_NAME:-bom_v2}?schema=public
      JWT_SECRET: ${JWT_SECRET}
      AUTH_COOKIE_SECRET: ${AUTH_COOKIE_SECRET}
      PORT: 8001
      JLC_SIDECAR_URL: http://sidecar:8089
      MOUSER_API_KEY: ${MOUSER_API_KEY}
      DIGIKEY_CLIENT_ID: ${DIGIKEY_CLIENT_ID}
      DIGIKEY_CLIENT_SECRET: ${DIGIKEY_CLIENT_SECRET}
      ALLOWED_ORIGINS: ${ALLOWED_ORIGINS:-http://localhost:3000}
    volumes:
      - uploads:/app/uploads
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:8001/health || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 1g

  frontend:
    image: ghcr.io/${GITHUB_REPOSITORY_OWNER}/iotbomlist-v2-frontend:latest
    container_name: bom-frontend
    restart: always
    depends_on:
      backend:
        condition: service_healthy
    deploy:
      resources:
        limits:
          memory: 512m

  nginx:
    image: nginx:1.27-alpine
    container_name: bom-nginx
    restart: always
    depends_on:
      - frontend
      - backend
    ports:
      - "8080:80"
      - "8001:8001"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro

volumes:
  pgdata:
  uploads:
COMPOSE_EOF
success "docker-compose.prod.yml dibuat"

# ─── Tulis nginx.conf ─────────────────────────────────────────────────────────
info "Membuat nginx/nginx.conf..."
cat > nginx/nginx.conf << 'NGINX_EOF'
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    sendfile      on;
    keepalive_timeout 65;
    client_max_body_size 50M;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    upstream frontend { server frontend:3000; }
    upstream backend  { server backend:8001; }

    server {
        listen 80;
        server_name _;

        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Referrer-Policy "strict-origin-when-cross-origin";

        location / {
            proxy_pass http://frontend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_cache_bypass $http_upgrade;
        }
    }

    server {
        listen 8001;
        server_name _;

        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;

        location / {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }
    }
}
NGINX_EOF
success "nginx/nginx.conf dibuat"

# ─── Pull & Start ─────────────────────────────────────────────────────────────
info "Pulling Docker images dari GHCR..."
docker compose -f docker-compose.prod.yml pull

info "Menjalankan semua services..."
docker compose -f docker-compose.prod.yml up -d

# ─── Health check ─────────────────────────────────────────────────────────────
info "Menunggu backend siap (maks 90 detik)..."
for i in $(seq 1 18); do
  if curl -sf http://localhost:8001/health > /dev/null 2>&1; then
    success "Backend siap!"
    break
  fi
  if [ "$i" -eq 18 ]; then
    warn "Backend belum merespons. Cek log: docker logs bom-backend -f"
  fi
  echo "  Menunggu... ($((i*5))s)"
  sleep 5
done

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "=================================================="
success "Setup selesai!"
echo ""
echo "  Frontend : http://${SERVER_HOST}:8080"
echo "  API      : http://${SERVER_HOST}:8001"
echo ""
warn "WAJIB: Ganti password default setelah login pertama!"
warn "Login default: jonathan / admins"
echo ""
echo "  Lihat log    : docker logs bom-backend -f"
echo "  Status semua : docker compose -f $INSTALL_DIR/docker-compose.prod.yml ps"
echo ""
echo "  Update nanti :"
echo "  cd $INSTALL_DIR && docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d"
echo "=================================================="
