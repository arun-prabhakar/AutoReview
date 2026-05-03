FROM node:20-alpine AS builder

WORKDIR /app

COPY server/package.json server/package-lock.json* ./server/
COPY client/package.json client/package-lock.json* ./client/

RUN cd server && npm ci
RUN cd client && npm ci

COPY server/ ./server/
COPY client/ ./client/

RUN cd server && npm run build
RUN cd client && npm run build

FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/server/package.json ./
COPY --from=builder /app/client/dist ./public

RUN mkdir -p /app/data /app/logs

EXPOSE 3001

CMD ["node", "dist/index.js"]
