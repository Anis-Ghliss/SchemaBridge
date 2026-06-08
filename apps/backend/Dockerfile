FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/schema-parser/package.json packages/schema-parser/package.json
COPY packages/transformation-engine/package.json packages/transformation-engine/package.json
RUN npm install

FROM deps AS build
COPY . .
RUN npm run prisma:generate -w @schemabridge/backend
RUN npm run build -w @schemabridge/shared-types
RUN npm run build -w @schemabridge/schema-parser
RUN npm run build -w @schemabridge/transformation-engine
RUN npm run build -w @schemabridge/backend

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/backend ./apps/backend
WORKDIR /app/apps/backend
CMD ["sh", "-c", "npm run prisma:deploy && node dist/server.js"]
