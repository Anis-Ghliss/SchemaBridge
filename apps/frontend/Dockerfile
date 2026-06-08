FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_API_URL=http://localhost:4000
ARG VITE_PROXY_URL=http://localhost:8080
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_PROXY_URL=$VITE_PROXY_URL
COPY package*.json ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/schema-parser/package.json packages/schema-parser/package.json
RUN npm install
COPY . .
RUN npm run build -w @schemabridge/shared-types
RUN npm run build -w @schemabridge/schema-parser
RUN npm run build -w @schemabridge/frontend

FROM nginx:1.27-alpine
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html
EXPOSE 80
