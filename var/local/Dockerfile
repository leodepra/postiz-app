FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates openssl && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@10.6.1
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 POSTIZ_LOCAL_ONLY=true STORAGE_PROVIDER=local FRONTEND_URL=https://localhost:7443 NEXT_PUBLIC_BACKEND_URL=https://localhost:7443/api BACKEND_INTERNAL_URL=http://127.0.0.1:3000 UPLOAD_DIRECTORY=/uploads
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm exec prisma generate --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma && pnpm rebuild bcrypt
RUN pnpm --filter ./apps/backend run build && pnpm --filter ./apps/orchestrator run build
RUN pnpm --filter ./apps/frontend exec next build --webpack

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Runtime dependencies are retained until production pruning has been validated.
# This image is a candidate for validation, not an approved release artifact.
COPY --from=build --chown=node:node /app /app
RUN mkdir /uploads && chown node:node /uploads
USER node
ENV NODE_ENV=production POSTIZ_LOCAL_ONLY=true NEXT_TELEMETRY_DISABLED=1
ENTRYPOINT ["node", "--require", "/app/var/local/bootstrap.cjs"]
CMD ["apps/backend/dist/apps/backend/src/main.js"]

FROM node:22-alpine AS egress
WORKDIR /proxy
COPY --from=build /app/node_modules/ipaddr.js ./node_modules/ipaddr.js
COPY var/local/egress.cjs ./egress.cjs
USER node
CMD ["node", "egress.cjs"]
