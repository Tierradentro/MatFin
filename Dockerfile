FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,id=s/ca118e50-8659-4b10-8f64-fa4c7b9601c1-/root/.npm,target=/root/.npm \
    npm ci --no-audit

FROM deps AS build
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/data ./data
COPY package.json ./

# Ensure data directory is writable for file-based persistence
RUN chmod -R 777 /app/data

EXPOSE 3000
CMD ["npm", "start"]
