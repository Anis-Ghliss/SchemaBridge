# syntax=docker/dockerfile:1.7
# Build from the repo root: docker build -f apps/control-plane/Dockerfile -t schemabridge-control-plane .
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/control-plane/package.json apps/control-plane/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/schema-parser/package.json packages/schema-parser/package.json
COPY packages/transformation-engine/package.json packages/transformation-engine/package.json
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build -w @schemabridge/shared-types \
 && npm run build -w @schemabridge/control-plane

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=5000
ENV HOST=0.0.0.0
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared-types ./packages/shared-types
COPY --from=build /app/apps/control-plane ./apps/control-plane
WORKDIR /app/apps/control-plane
EXPOSE 5000
LABEL org.opencontainers.image.title="SchemaBridge Control Plane"
LABEL org.opencontainers.image.description="Ingests contract-drift reports from SchemaBridge data planes and serves the fleet view + alerts"
LABEL org.opencontainers.image.source="https://github.com/Anis-Ghliss/SchemaBridge"
LABEL org.opencontainers.image.licenses="MIT"
CMD ["node", "dist/server.js"]
