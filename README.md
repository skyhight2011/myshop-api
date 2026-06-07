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
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/myshop?schema=public"
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

```bash
docker compose up --build
```

This starts:

- PostgreSQL on `localhost:5432`
- API on `localhost:4000`

Inside Docker, the API connects to PostgreSQL via:

```env
DATABASE_URL=postgresql://postgres:postgres@db:5432/myshop?schema=public
```

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
