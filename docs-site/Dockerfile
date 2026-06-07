FROM node:lts AS base
RUN corepack enable
WORKDIR /opt/docusaurus

FROM base AS prod
WORKDIR /opt/docusaurus
COPY . /opt/docusaurus/
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM prod AS serve
EXPOSE 3001
CMD ["pnpm", "serve", "--host", "0.0.0.0", "--no-open"]
