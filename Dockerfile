node:23-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY tsconfig.json build.mjs server.js ./
COPY src ./src

RUN node build.mjs

EXPOSE 3005

CMD ["node", "dist/server.js"]