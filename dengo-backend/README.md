# DENGO POS – API Backend

Fastify 5 + Prisma 5 + PostgreSQL · Node 20 · TypeScript 5.8

## Quick Start

### 1. Prerequisites
- Node.js 20+
- PostgreSQL 14+ (self-hosted, or a managed provider like Neon/Supabase/Railway)
- npm / pnpm

### 2. Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your PostgreSQL connection string and JWT secret
npm install
```

### 3. Database

```bash
npx prisma generate   # generate Prisma client
npx prisma db push    # sync schema to a fresh PostgreSQL database
```

> **Note:** the old SQL Server (T-SQL) scripts from before the PostgreSQL migration have been removed — `prisma db push` against the schema in `prisma/schema.prisma` is the current, correct way to create the schema; use `src/seed.ts` (or `prisma/seed-portal.ts` for Portal Escolar starter data) to load starter data.

### 4. Run

```bash
npm run dev      # development (hot reload)
npm run build    # compile to dist/
npm start        # run compiled build
```

## API Endpoints

| Module           | Prefix                  |
|------------------|-------------------------|
| Auth             | POST /api/auth/login    |
| Branches         | /api/branches           |
| Users            | /api/users              |
| Categories       | /api/categories         |
| Products         | /api/products           |
| Inventory        | /api/inventory          |
| Customers        | /api/customers          |
| Suppliers        | /api/suppliers          |
| Sales            | /api/sales              |
| Cash Registers   | /api/cash-registers     |
| Purchases        | /api/purchases          |
| Transfers        | /api/transfers          |
| Quotations       | /api/quotations         |
| Reports          | /api/reports            |
| Audit Logs       | /api/audit              |

## Default Users (from seed.sql)

| Email                 | Password     | Role              |
|-----------------------|--------------|-------------------|
| admin@dengo.gt        | Admin1234!   | ADMIN             |
| cajero@dengo.gt       | Admin1234!   | OPERATOR          |
| inventario@dengo.gt   | Admin1234!   | INVENTORY_CONTROL |
| auditor@dengo.gt      | Admin1234!   | AUDITOR           |

## Environment Variables

See `.env.example` for all required variables.
