FROM node:22-alpine

WORKDIR /app

# Copy backend
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --production

COPY backend/ ./backend/

# Copy frontend build
COPY frontend/build/ ./frontend/build/

# Create data directory for SQLite
RUN mkdir -p /app/backend/data

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "backend/src/server.js"]
