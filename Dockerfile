# Production Dockerfile for POS Toko dengan Rekonsiliasi QRIS Otomatis
FROM node:20-alpine AS builder

WORKDIR /app

# Install client dependencies & build frontend
COPY client/package*.json ./client/
RUN cd client && npm install

COPY client/ ./client/
RUN cd client && npm run build

# Production Runner Image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy server code
COPY server/ ./server/

# Copy built frontend assets from builder stage
COPY --from=builder /app/client/dist ./client/dist

# Expose HTTP port
EXPOSE 3000

# Volume for SQLite database persistence
VOLUME ["/app/server/data"]

# Run seed and start server
CMD ["sh", "-c", "node server/seed.js && node server/index.js"]
