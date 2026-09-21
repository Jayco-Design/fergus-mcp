FROM node:24.21.0-alpine AS dependencies

WORKDIR /app

RUN npm install -g pnpm@10.34.5

COPY package.json pnpm-lock.yaml ./

FROM dependencies AS build
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build

FROM dependencies AS production-dependencies
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

FROM node:24.21.0-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Package managers are only needed in the build stages.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
        /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/pnpm /usr/local/bin/pnpx

COPY --from=build /app/dist ./dist
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY package.json ./

# File session storage needs a writable directory when enabled.
RUN mkdir .sessions && chown node:node .sessions

EXPOSE 3100
USER node

CMD ["node", "dist/http-server.js"]
