# DENGO POS – API Backend

Fastify 5 + Prisma 5 + SQL Server · Node 20 · TypeScript 5.8

## Quick Start

### 1. Prerequisites
- Node.js 20+
- SQL Server 2019+ (or Azure SQL)
- npm / pnpm

### 2. Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your SQL Server connection string and JWT secret
npm install
```

### 3. Database

**Option A – Run the raw SQL script first (recommended)**
```sql
-- In SQL Server Management Studio or sqlcmd:
-- 1. Run database/schema.sql
-- 2. Run database/seed.sql
```

**Option B – Use Prisma (after configuring DATABASE_URL)**
```bash
npm run prisma:push      # sync schema to existing DB
npm run prisma:generate  # generate Prisma client
```

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
