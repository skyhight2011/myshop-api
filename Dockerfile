FROM node:22-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm prisma generate && pnpm run build

# development | uat | production. Runtime APP_ENV selects .env.<APP_ENV>.
ARG APP_ENV=development
ENV APP_ENV=${APP_ENV}

COPY docker/entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/main"]
