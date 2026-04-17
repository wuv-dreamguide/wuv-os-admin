FROM node:20-alpine

# Install wget for health check
RUN apk add --no-cache wget

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy application source
COPY server.js db.js ./
COPY middleware/ ./middleware/
COPY routes/ ./routes/
COPY public/ ./public/

# Non-root user for security
RUN addgroup -S wuv && adduser -S wuv -G wuv \
    && mkdir -p /app/data \
    && chown -R wuv:wuv /app

USER wuv

EXPOSE 3200

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3200/health || exit 1

CMD ["node", "server.js"]
