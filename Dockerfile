FROM node:20-alpine

WORKDIR /app

# Bağımlılıkları önce kopyala (Docker cache için)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Uygulama dosyalarını kopyala
COPY server.js ./
COPY services/ ./services/
COPY utils/ ./utils/

# Upload ve log dizinlerini oluştur
RUN mkdir -p uploads/baski-dosyalari logs data

# Güvenlik: root olmayan kullanıcı
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
