FROM node:22-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm prisma generate && pnpm run build

EXPOSE 4000

CMD ["sh", "-c", "pnpm prisma db push && node dist/main"]
