# Contexto de build: la RAÍZ del repo (el server compila /shared también).
# docker compose ya lo configura así; a mano: docker build -f server/Dockerfile .
FROM node:20-alpine AS build
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci
COPY shared ./shared
COPY server/tsconfig.json ./server/
COPY server/src ./server/src
RUN cd server && npx tsc

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/server/dist ./dist
COPY server/config ./config
EXPOSE 2567
CMD ["node", "dist/server/src/index.js"]
