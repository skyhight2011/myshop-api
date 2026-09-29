# MyShop API

NestJS API with Prisma ORM and PostgreSQL.

## Setup

```bash
pnpm install
cp .env.example .env # optional if you create an example file
pnpm prisma:generate
pnpm prisma:migrate:dev
pnpm run start:dev
```

Default local database URL in `.env`:

```env
DATABASE_URL="postgresql://rick:2011truyen@localhost:5432/myshop?schema=public"
```

## User CRUD API

Base route: `/users`

1. `POST /users` - create user
2. `GET /users` - list users
3. `GET /users/:id` - get user by id
4. `PATCH /users/:id` - update user
5. `DELETE /users/:id` - delete user

User model:

- `id` (number, auto increment)
- `email` (unique string)
- `name` (optional string)
- `createdAt` (date)
- `updatedAt` (date)

## Docker (API + PostgreSQL)

Env files:

- `.env.development` — local API and Compose defaults
- `.env.uat` — UAT placeholders; pass a real `DATABASE_URL` at deploy time
- `.env.production` — production placeholders; pass a real `DATABASE_URL` at deploy time

The image reads `APP_ENV` (`development`, `uat`, or `production`) and loads `.env.<APP_ENV>`. Variables already set on the container are kept.

```bash
docker compose up --build
```

UAT or production image:

```bash
docker build --build-arg APP_ENV=uat -t myshop-api:uat .
docker build --build-arg APP_ENV=production -t myshop-api:production .
```

This starts:

- PostgreSQL on `localhost:5432`
- API on `localhost:4000`

Inside Docker Compose, the API connects to PostgreSQL via hostname `db`.

## Useful commands

```bash
pnpm run build
pnpm run lint
pnpm run test
pnpm run test:e2e
pnpm prisma:generate
pnpm prisma:db:push
pnpm prisma:migrate:dev
pnpm prisma:migrate:deploy
```
