FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store corepack enable pnpm && pnpm i --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules

ARG NEXT_PUBLIC_COMMIT_HASH
ARG NEXT_PUBLIC_BUILD_DATE
ENV NEXT_PUBLIC_COMMIT_HASH=$NEXT_PUBLIC_COMMIT_HASH
ENV NEXT_PUBLIC_BUILD_DATE=$NEXT_PUBLIC_BUILD_DATE

COPY next.config.js* tsconfig.json* ./
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable pnpm && SKIP_ENV_VALIDATION=1 pnpm run build

FROM gcr.io/distroless/nodejs20-debian12 AS runner
WORKDIR /app

ENV NODE_ENV=production
ARG NEXT_PUBLIC_COMMIT_HASH
ARG NEXT_PUBLIC_BUILD_DATE
ENV NEXT_PUBLIC_COMMIT_HASH=$NEXT_PUBLIC_COMMIT_HASH
ENV NEXT_PUBLIC_BUILD_DATE=$NEXT_PUBLIC_BUILD_DATE
USER nonroot

COPY --from=builder --chown=nonroot:nonroot /app/.next/standalone ./
COPY --from=builder --chown=nonroot:nonroot /app/.next/static ./.next/static
COPY --from=builder --chown=nonroot:nonroot /app/public ./public
COPY --from=builder --chown=nonroot:nonroot /app/next.config.js ./

EXPOSE 3000
ENV PORT=3000

CMD ["server.js"]
