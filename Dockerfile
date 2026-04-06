FROM node:23-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
# lockfile 6.x 需 pnpm 9；Node 自带 corepack 可能激活 pnpm 10 导致 ERR_PNPM_LOCKFILE_BREAKING_CHANGE
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate && pnpm install --frozen-lockfile

COPY tsconfig.json build.mjs server.js ./
COPY src ./src

RUN node build.mjs

EXPOSE 3005

CMD ["node", "dist/server.js"]