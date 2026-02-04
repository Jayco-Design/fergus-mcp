FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable

COPY package.json ./
COPY pnpm-lock.yaml ./
COPY tsconfig.json ./
COPY src ./src

RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm run build
RUN pnpm prune --prod --ignore-scripts

EXPOSE 3100

CMD ["pnpm", "run", "start:http"]
