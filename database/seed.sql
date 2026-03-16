-- ============================================================
--  DENGO POS  ·  Seed Data
--  Run AFTER schema.sql
-- ============================================================
USE DENGO_POS;
GO

-- ── Branches ─────────────────────────────────────────────────
INSERT INTO BRANCHES (ID, NAME, CODE, TYPE, ADDRESS, CITY, PHONE, EMAIL, MANAGER, STATUS, OPEN_TIME, CLOSE_TIME, CURRENCY, TAX_RATE)
VALUES
  ('branch-001', 'Tienda Central',   'TC001', 'main',   'Av. Principal 1', 'Guatemala City', '2222-1111', 'central@dengo.gt',  'Admin Principal',  'active', '08:00', '20:00', 'GTQ', 0.12),
  ('branch-002', 'Sucursal Norte',   'SN001', 'branch', 'Zona 18, C. 3',   'Guatemala City', '2222-2222', 'norte@dengo.gt',    'Supervisor Norte', 'active', '08:00', '20:00', 'GTQ', 0.12),
  ('branch-003', 'Sucursal Sur',     'SS001', 'branch', 'Zona 12, Av. 5',  'Guatemala City', '2222-3333', 'sur@dengo.gt',      'Supervisor Sur',   'active', '08:00', '20:00', 'GTQ', 0.12);
GO

-- ── Default users  (contraseña: Admin1234!)
-- bcrypt hash de "Admin1234!" con 12 rounds
INSERT INTO USERS (ID, EMAIL, NAME, PASSWORD_HASH, ROLE, BRANCH_ID)
VALUES
  ('user-admin-001', 'admin@dengo.gt',       'Administrador Principal',  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMqJqhCanQJrAajV5UFWZDO.ni', 'ADMIN',             'branch-001'),
  ('user-op-001',    'cajero@dengo.gt',      'Juan Pérez Cajero',        '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMqJqhCanQJrAajV5UFWZDO.ni', 'OPERATOR',          'branch-001'),
  ('user-inv-001',   'inventario@dengo.gt',  'María Control Inventario', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMqJqhCanQJrAajV5UFWZDO.ni', 'INVENTORY_CONTROL', 'branch-001'),
  ('user-aud-001',   'auditor@dengo.gt',     'Carlos Auditor',           '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMqJqhCanQJrAajV5UFWZDO.ni', 'AUDITOR',           'branch-001');
GO

-- ── Categories ───────────────────────────────────────────────
INSERT INTO CATEGORIES (ID, NAME, DESCRIPTION, COLOR)
VALUES
  ('cat-001', 'Bebidas',     'Bebidas frías y calientes',      '#3B82F6'),
  ('cat-002', 'Snacks',      'Botanas y aperitivos',           '#F59E0B'),
  ('cat-003', 'Dulces',      'Confitería y dulces',            '#EC4899'),
  ('cat-004', 'Lácteos',     'Leche, queso, yogur',            '#8B5CF6'),
  ('cat-005', 'Panadería',   'Pan y repostería',               '#D97706'),
  ('cat-006', 'Limpieza',    'Productos de limpieza',          '#10B981'),
  ('cat-007', 'Abarrotes',   'Granos, harinas y conservas',    '#6B7280'),
  ('cat-008', 'Electrónica', 'Pilas, accesorios electrónicos', '#1D4ED8');
GO

-- ── Product Units ────────────────────────────────────────────
INSERT INTO PRODUCT_UNITS (ID, NAME, ABBREVIATION, TYPE)
VALUES
  ('unit-001', 'Pieza',     'pz',  'DISCRETE'),
  ('unit-002', 'Caja',      'cja', 'DISCRETE'),
  ('unit-003', 'Docena',    'doc', 'DISCRETE'),
  ('unit-004', 'Litro',     'L',   'CONTINUOUS'),
  ('unit-005', 'Kilogramo', 'kg',  'CONTINUOUS'),
  ('unit-006', 'Metro',     'm',   'CONTINUOUS'),
  ('unit-007', 'Mililitro', 'mL',  'CONTINUOUS');
GO

-- ── Products ─────────────────────────────────────────────────
INSERT INTO PRODUCTS (ID, BARCODE, NAME, BRAND, BASE_PRICE, COST, CATEGORY_ID, BASE_UNIT_ID, MIN_STOCK, SALES_COUNT, IS_ACTIVE)
VALUES
  ('prod-001', '7501234567890', 'Coca Cola 600ml',   'Coca-Cola', 15.00, 10.00, 'cat-001', 'unit-001', 10, 150, 1),
  ('prod-002', '7501234567893', 'Pepsi 600ml',        'Pepsi',    14.00,  9.00, 'cat-001', 'unit-001', 10, 120, 1),
  ('prod-003', '7501234567894', 'Sabritas Original',  'Sabritas', 18.50, 12.00, 'cat-002', 'unit-001', 10, 200, 1),
  ('prod-004', '7501234567895', 'Agua Natural 600ml', 'Ciel',      8.00,  4.00, 'cat-001', 'unit-001', 15, 180, 1),
  ('prod-005', '7501234567896', 'Galletas Oreo',      'Nabisco',  12.00,  8.00, 'cat-002', 'unit-001', 10,  95, 1),
  ('prod-006', '7501234567897', 'Leche Entera 1L',    'Lala',     22.00, 16.00, 'cat-004', 'unit-004', 12, 130, 1),
  ('prod-007', '7501234567898', 'Pan Dulce',          'Bimbo',     3.00,  1.50, 'cat-005', 'unit-001', 20, 250, 1),
  ('prod-008', '7501234567899', 'Jabón de Manos',     'Dove',     28.00, 18.00, 'cat-006', 'unit-001',  8,  60, 1),
  ('prod-009', '7501234567900', 'Arroz Blanco 1kg',   'Maseca',   18.00, 12.00, 'cat-007', 'unit-005', 15, 110, 1),
  ('prod-010', '7501234567901', 'Detergente 1kg',     'Ariel',    35.00, 22.00, 'cat-006', 'unit-001', 10,  85, 1),
  ('prod-011', '7501234567902', 'Red Bull 250ml',     'Red Bull', 35.00, 25.00, 'cat-001', 'unit-001', 10,  80, 1);
GO

-- ── Product Variations ───────────────────────────────────────
INSERT INTO PRODUCT_VARIATIONS (ID, PRODUCT_ID, NAME, BARCODE, CONVERSION_FACTOR, PRICE, IS_DEFAULT)
VALUES
  -- Coca Cola
  ('var-001-1', 'prod-001', 'Pieza',      '7501234567890',  1,  15.00, 1),
  ('var-001-2', 'prod-001', 'Six Pack',   '7501234567891',  6,  85.00, 0),
  ('var-001-3', 'prod-001', 'Caja (24u)', '7501234567892', 24, 320.00, 0),
  -- Sabritas
  ('var-003-1', 'prod-003', 'Pieza',      '7501234567894',  1,  18.50, 1),
  ('var-003-2', 'prod-003', 'Caja (12u)', NULL,            12, 210.00, 0),
  -- Galletas Oreo
  ('var-005-1', 'prod-005', 'Paquete',    '7501234567896',  1,  12.00, 1),
  ('var-005-2', 'prod-005', 'Caja (12u)', NULL,            12, 130.00, 0);
GO

-- ── Default Inventory (stock inicial Tienda Central) ─────────
INSERT INTO INVENTORY (ID, PRODUCT_ID, BRANCH_ID, QUANTITY)
VALUES
  (LOWER(NEWID()), 'prod-001', 'branch-001', 50),
  (LOWER(NEWID()), 'prod-002', 'branch-001', 40),
  (LOWER(NEWID()), 'prod-003', 'branch-001', 60),
  (LOWER(NEWID()), 'prod-004', 'branch-001', 80),
  (LOWER(NEWID()), 'prod-005', 'branch-001', 30),
  (LOWER(NEWID()), 'prod-006', 'branch-001', 25),
  (LOWER(NEWID()), 'prod-007', 'branch-001', 100),
  (LOWER(NEWID()), 'prod-008', 'branch-001', 20),
  (LOWER(NEWID()), 'prod-009', 'branch-001', 35),
  (LOWER(NEWID()), 'prod-010', 'branch-001', 15),
  (LOWER(NEWID()), 'prod-011', 'branch-001', 8);
GO

-- ── Default Customers ────────────────────────────────────────
INSERT INTO CUSTOMERS (ID, NIT, NAME, EMAIL, PHONE, CREDIT_LIMIT, CREDIT_USED)
VALUES
  ('cust-001', 'CF',         'Consumidor Final',  NULL,                 NULL,         0,     0),
  ('cust-002', '12345678-9', 'Juan Pérez',        'juan@email.com',     '5555-1234',  5000,  1200),
  ('cust-003', '98765432-1', 'María García',      'maria@email.com',    '5555-5678',  3000,  0),
  ('cust-004', '11223344-5', 'Empresa ABC S.A.',  'compras@abc.com.gt', '2233-4455',  10000, 2500);
GO

-- ── Default Suppliers ────────────────────────────────────────
INSERT INTO SUPPLIERS (ID, CODE, NAME, CONTACT_NAME, EMAIL, PHONE, PAYMENT_TERMS, RATING, IS_ACTIVE)
VALUES
  ('supp-001', 'COCA-001',   'Distribuidora Coca-Cola GT', 'Pedro López',    'pedrol@coca.gt',  '2233-1000', '30 días', 5, 1),
  ('supp-002', 'DISTRIB-01', 'Distribuidora General',      'Ana Martínez',   'ana@distgen.gt',  '2233-2000', '15 días', 4, 1),
  ('supp-003', 'IMPORT-01',  'Importadora del Norte',      'Luis Hernández', 'luis@importn.gt', '2233-3000', 'Contado', 3, 1);
GO

PRINT 'Seed data inserted successfully.';
GO
