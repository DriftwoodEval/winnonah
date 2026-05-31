FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store corepack enable pnpm && pnpm i --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules

ARG NEXT_PUBLIC_COMMIT_HASH
ARG NEXT_PUBLIC_GIT_BRANCH
ARG NEXT_PUBLIC_BUILD_DATE

ENV NEXT_PUBLIC_COMMIT_HASH=$NEXT_PUBLIC_COMMIT_HASH
ENV NEXT_PUBLIC_GIT_BRANCH=$NEXT_PUBLIC_GIT_BRANCH
ENV NEXT_PUBLIC_BUILD_DATE=$NEXT_PUBLIC_BUILD_DATE

COPY next.config.js* tsconfig.json* ./
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable pnpm && SKIP_ENV_VALIDATION=1 pnpm run build

FROM gcr.io/distroless/nodejs20-debian12@sha256:6fe218dbad37e979c7542e670d28d6e23d3f53d2929693bc9cdded8b622f339f AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_COMMIT_HASH
ARG NEXT_PUBLIC_GIT_BRANCH
ARG NEXT_PUBLIC_BUILD_DATE
ENV NEXT_PUBLIC_COMMIT_HASH=$NEXT_PUBLIC_COMMIT_HASH
ENV NEXT_PUBLIC_GIT_BRANCH=$NEXT_PUBLIC_GIT_BRANCH
ENV NEXT_PUBLIC_BUILD_DATE=$NEXT_PUBLIC_BUILD_DATE

USER nonroot

COPY --from=builder --chown=nonroot:nonroot /app/.next/standalone ./
COPY --from=builder --chown=nonroot:nonroot /app/.next/static ./.next/static
COPY --from=builder --chown=nonroot:nonroot /app/public ./public
COPY --from=builder --chown=nonroot:nonroot /app/next.config.js ./

EXPOSE 3000

CMD ["server.js"]
