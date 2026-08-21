-- ============================================================
-- DENGO POS — Portal Escolar · Migración v2
-- Nuevas funcionalidades:
--   1. Campos de entrega en PORTAL_ORDERS (fecha, hora, notas)
--   2. Tabla PROGRAM_OPTIONS  (paquetes predefinidos por programa)
--   3. Tabla PROGRAM_OPTION_ITEMS (productos de cada paquete)
-- Ejecutar DESPUÉS de portal_migration.sql
-- ============================================================

USE [DENGO_POS];
GO

-- ─────────────────────────────────────────────────────────────
-- 1. Campos de entrega en PORTAL_ORDERS
--    El admin los completa al aprobar un pedido.
--    El maestro los ve en el detalle de su pedido aprobado.
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('PORTAL_ORDERS') AND name = 'DELIVERY_DATE')
BEGIN
    ALTER TABLE [dbo].[PORTAL_ORDERS] ADD [DELIVERY_DATE] DATETIME2 NULL;
    PRINT 'Columna DELIVERY_DATE agregada a PORTAL_ORDERS.';
END
ELSE
    PRINT 'DELIVERY_DATE ya existe en PORTAL_ORDERS, se omite.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('PORTAL_ORDERS') AND name = 'DELIVERY_TIME')
BEGIN
    ALTER TABLE [dbo].[PORTAL_ORDERS] ADD [DELIVERY_TIME] NVARCHAR(10) NULL;
    PRINT 'Columna DELIVERY_TIME agregada a PORTAL_ORDERS.';
END
ELSE
    PRINT 'DELIVERY_TIME ya existe en PORTAL_ORDERS, se omite.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('PORTAL_ORDERS') AND name = 'DELIVERY_NOTES')
BEGIN
    ALTER TABLE [dbo].[PORTAL_ORDERS] ADD [DELIVERY_NOTES] NVARCHAR(500) NULL;
    PRINT 'Columna DELIVERY_NOTES agregada a PORTAL_ORDERS.';
END
ELSE
    PRINT 'DELIVERY_NOTES ya existe en PORTAL_ORDERS, se omite.';
GO

-- ─────────────────────────────────────────────────────────────
-- 2. PROGRAM_OPTIONS
--    Paquetes predefinidos por tipo de programa.
--    FOOD_PACKAGE / SCHOOL_SUPPLIES → maestro DEBE elegir uno.
--    TEACHING_KIT / GRATUITY        → son punto de partida opcional.
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'PROGRAM_OPTIONS')
BEGIN
    CREATE TABLE [dbo].[PROGRAM_OPTIONS] (
        [ID]           NVARCHAR(36)  NOT NULL,
        [PROGRAM_TYPE] NVARCHAR(30)  NOT NULL,
        [NAME]         NVARCHAR(150) NOT NULL,
        [DESCRIPTION]  NVARCHAR(500) NULL,
        [IS_ACTIVE]    BIT           NOT NULL CONSTRAINT [DF_PROGRAM_OPTIONS_ACTIVE]  DEFAULT 1,
        [SORT_ORDER]   INT           NOT NULL CONSTRAINT [DF_PROGRAM_OPTIONS_SORT]    DEFAULT 0,
        [CREATED_AT]   DATETIME2     NOT NULL CONSTRAINT [DF_PROGRAM_OPTIONS_CREATED] DEFAULT GETDATE(),
        [UPDATED_AT]   DATETIME2     NOT NULL CONSTRAINT [DF_PROGRAM_OPTIONS_UPDATED] DEFAULT GETDATE(),
        CONSTRAINT [PK_PROGRAM_OPTIONS] PRIMARY KEY ([ID])
    );
    PRINT 'Tabla PROGRAM_OPTIONS creada.';
END
ELSE
    PRINT 'PROGRAM_OPTIONS ya existe, se omite.';
GO

-- ─────────────────────────────────────────────────────────────
-- 3. PROGRAM_OPTION_ITEMS
--    Productos que componen cada paquete.
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'PROGRAM_OPTION_ITEMS')
BEGIN
    CREATE TABLE [dbo].[PROGRAM_OPTION_ITEMS] (
        [ID]                NVARCHAR(36)  NOT NULL,
        [PROGRAM_OPTION_ID] NVARCHAR(36)  NOT NULL,
        [PRODUCT_ID]        NVARCHAR(36)  NOT NULL,
        [PRODUCT_NAME]      NVARCHAR(200) NOT NULL,
        [QUANTITY]          DECIMAL(18,4) NOT NULL,
        CONSTRAINT [PK_PROGRAM_OPTION_ITEMS] PRIMARY KEY ([ID]),
        CONSTRAINT [FK_PROG_OPT_ITEMS_OPTIONS]  FOREIGN KEY ([PROGRAM_OPTION_ID])
            REFERENCES [dbo].[PROGRAM_OPTIONS] ([ID])
            ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT [FK_PROG_OPT_ITEMS_PRODUCTS] FOREIGN KEY ([PRODUCT_ID])
            REFERENCES [dbo].[PRODUCTS] ([ID])
            ON DELETE NO ACTION ON UPDATE NO ACTION
    );
    PRINT 'Tabla PROGRAM_OPTION_ITEMS creada.';
END
ELSE
    PRINT 'PROGRAM_OPTION_ITEMS ya existe, se omite.';
GO

-- ─────────────────────────────────────────────────────────────
-- VERIFICACIÓN FINAL
-- ─────────────────────────────────────────────────────────────
SELECT t.name AS Tabla, t.create_date AS FechaCreacion
FROM sys.tables t
WHERE t.name IN ('PROGRAM_OPTIONS', 'PROGRAM_OPTION_ITEMS')
ORDER BY t.create_date;
GO

SELECT col.name AS Columna, tp.name AS Tipo, col.is_nullable AS EsNullable
FROM sys.columns col
JOIN sys.types tp ON tp.user_type_id = col.user_type_id
WHERE col.object_id = OBJECT_ID('PORTAL_ORDERS')
  AND col.name IN ('DELIVERY_DATE', 'DELIVERY_TIME', 'DELIVERY_NOTES');
GO

PRINT '=============================================';
PRINT 'Migración Portal v2 completada.';
PRINT 'Recuerda ejecutar: npx prisma generate';
PRINT 'en dengo-backend/ para regenerar el cliente.';
PRINT '=============================================';
GO
