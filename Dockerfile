# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/schema-parser/package.json packages/schema-parser/package.json
COPY packages/transformation-engine/package.json packages/transformation-engine/package.json
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run db:generate \
 && npm run build -w @schemabridge/shared-types \
 && npm run build -w @schemabridge/schema-parser \
 && npm run build -w @schemabridge/transformation-engine \
 && npm run build -w @schemabridge/backend \
 && npm run build -w @schemabridge/frontend

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=4000
ENV PROXY_PORT=8080
ENV HOST=0.0.0.0
ENV FRONTEND_DIST=/app/frontend
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/backend ./apps/backend
COPY --from=build /app/apps/frontend/dist ./frontend
WORKDIR /app/apps/backend
EXPOSE 4000 8080
LABEL org.opencontainers.image.title="SchemaBridge"
LABEL org.opencontainers.image.description="Programmable JSON mapping middleware: admin + GUI on :4000, runtime proxy on :8080"
LABEL org.opencontainers.image.source="https://github.com/Anis-Ghliss/SchemaBridge"
LABEL org.opencontainers.image.licenses="MIT"
CMD ["sh", "-c", "npm run prisma:deploy && node dist/server.js"]
