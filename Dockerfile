FROM node:23-alpine

WORKDIR /app

# Railway 构建常带 NODE_ENV=production → pnpm 不装 devDependencies → 缺 esbuild，build 失败
ENV NODE_ENV=development

# 只复制 package.json：仓库里 pnpm-lock.yaml 曾与 package.json 不一致会导致 frozen 安装失败
COPY package.json ./
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate && pnpm install

COPY tsconfig.json build.mjs server.js ./
COPY src ./src

RUN node build.mjs

ENV NODE_ENV=production

EXPOSE 3005

CMD ["node", "dist/server.js"]