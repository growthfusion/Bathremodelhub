FROM node:20-alpine

WORKDIR /app

# Install production deps (cached unless package.json changes)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy backend source and frontend assets
COPY backend/ ./backend/
COPY frontend/ ./frontend/

EXPOSE 8080
CMD ["node", "backend/server.js"]
