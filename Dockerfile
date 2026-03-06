# ===== Stage 1: React Panel Build =====
FROM node:20-alpine AS panel-builder

WORKDIR /panel
COPY panel/package.json panel/package-lock.json* ./
RUN npm ci || npm install
COPY panel/ ./
RUN npm run build

# ===== Stage 2: Bot Application =====
FROM node:20-alpine

WORKDIR /app

# better-sqlite3 derleme için gerekli native build araçları
RUN apk add --no-cache python3 make g++

# Bağımlılıkları önce kopyala (Docker cache için)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Uygulama dosyalarını kopyala
COPY server.js ./
COPY services/ ./services/
COPY utils/ ./utils/
COPY public/ ./public/

# React panel build çıktısını kopyala
COPY --from=panel-builder /public/panel-app/ ./public/panel-app/

# Upload, log ve data dizinlerini oluştur
RUN mkdir -p uploads/baski-dosyalari logs data

# Güvenlik: root olmayan kullanıcı
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
