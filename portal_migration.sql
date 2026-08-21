-- ============================================================
-- DENGO POS — Portal Escolar · Migración SQL Server
-- Base de datos: DENGO_POS
-- Ejecutar una sola vez. Verificar que no existan las tablas
-- antes de correr (el script usa IF NOT EXISTS para seguridad).
-- ============================================================

USE [DENGO_POS];
GO

-- ─────────────────────────────────────────────────────────────
-- 1. PORTAL_CONFIG
--    Configuración visual y de contacto de la landing page.
--    Editable desde el POS (Config. Portal).
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'PORTAL_CONFIG')
BEGIN
    CREATE TABLE [dbo].[PORTAL_CONFIG] (
        [ID]             NVARCHAR(36)  NOT NULL,
        [BUSINESS_NAME]  NVARCHAR(150) NOT NULL,
        [TAGLINE]        NVARCHAR(200) NULL,
        [ABOUT_TEXT]     NVARCHAR(MAX) NULL,
        [LOGO_URL]       NVARCHAR(500) NULL,
        [HERO_IMAGE_URL] NVARCHAR(500) NULL,
        [PRIMARY_COLOR]  NVARCHAR(20)  NOT NULL CONSTRAINT [DF_PORTAL_CONFIG_COLOR] DEFAULT '#F97316',
        [ADDRESS]        NVARCHAR(300) NULL,
        [CITY]           NVARCHAR(100) NULL,
        [PHONE]          NVARCHAR(30)  NULL,
        [WHATSAPP]       NVARCHAR(30)  NULL,
        [EMAIL]          NVARCHAR(150) NULL,
        [FACEBOOK]       NVARCHAR(200) NULL,
        [INSTAGRAM]      NVARCHAR(200) NULL,
        [IS_ACTIVE]      BIT           NOT NULL CONSTRAINT [DF_PORTAL_CONFIG_ACTIVE] DEFAULT 1,
        [CREATED_AT]     DATETIME2     NOT NULL CONSTRAINT [DF_PORTAL_CONFIG_CREATED] DEFAULT GETDATE(),
        [UPDATED_AT]     DATETIME2     NOT NULL CONSTRAINT [DF_PORTAL_CONFIG_UPDATED] DEFAULT GETDATE(),
        CONSTRAINT [PK_PORTAL_CONFIG] PRIMARY KEY ([ID])
    );
    PRINT 'Tabla PORTAL_CONFIG creada.';
END
ELSE
    PRINT 'PORTAL_CONFIG ya existe, se omite.';
GO

-- ─────────────────────────────────────────────────────────────
-- 2. SCHOOLS
--    Escuelas del sector público con las que trabaja el proveedor.
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'SCHOOLS')
BEGIN
    CREATE TABLE [dbo].[SCHOOLS] (
        [ID]           NVARCHAR(36)  NOT NULL,
        [NAME]         NVARCHAR(200) NOT NULL,
        [CODE]         NVARCHAR(30)  NULL,
        [ADDRESS]      NVARCHAR(300) NULL,
        [MUNICIPIO]    NVARCHAR(100) NULL,
        [DEPARTAMENTO] NVARCHAR(100) NULL,
        [OPF_CONTACT]  NVARCHAR(150) NULL,
        [OPF_PHONE]    NVARCHAR(30)  NULL,
        [IS_ACTIVE]    BIT           NOT NULL CONSTRAINT [DF_SCHOOLS_ACTIVE]  DEFAULT 1,
        [CREATED_AT]   DATETIME2     NOT NULL CONSTRAINT [DF_SCHOOLS_CREATED] DEFAULT GETDATE(),
        [UPDATED_AT]   DATETIME2     NOT NULL CONSTRAINT [DF_SCHOOLS_UPDATED] DEFAULT GETDATE(),
        CONSTRAINT [PK_SCHOOLS] PRIMARY KEY ([ID])
    );
    PRINT 'Tabla SCHOOLS creada.';
END
ELSE
    PRINT 'SCHOOLS ya existe, se omite.';
GO

-- ─────────────────────────────────────────────────────────────
-- 3. TEACHERS
--    Perfil adicional para usuarios con role = 'TEACHER'.
--    Vinculado 1:1 con USERS.
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'TEACHERS')
BEGIN
    CREATE TABLE [dbo].[TEACHERS] (
        [ID]         NVARCHAR(36) NOT NULL,
        [USER_ID]    NVARCHAR(36) NOT NULL,
        [PHONE]      NVARCHAR(30) NULL,
        [IS_ACTIVE]  BIT          NOT NULL CONSTRAINT [DF_TEACHERS_ACTIVE]  DEFAULT 1,
        [CREATED_AT] DATETIME2    NOT NULL CONSTRAINT [DF_TEACHERS_CREATED] DEFAULT GETDATE(),
        [UPDATED_AT] DATETIME2    NOT NULL CONSTRAINT [DF_TEACHERS_UPDATED] DEFAULT GETDATE(),
        CONSTRAINT [PK_TEACHERS] PRIMARY KEY ([ID]),
        CONSTRAINT [UQ_TEACHERS_USER_ID] UNIQUE ([USER_ID]),
        CONSTRAINT [FK_TEACHERS_USERS] FOREIGN KEY ([USER_ID])
            REFERENCES [dbo].[USERS] ([ID])
            ON DELETE NO ACTION ON UPDATE NO ACTION
    );
    PRINT 'Tabla TEACHERS creada.';
END
ELSE
    PRINT 'TEACHERS ya existe, se omite.';
GO

-- ─────────────────────────────────────────────────────────────
-- 4. TEACHER_SCHOOLS
--    Relación N:N entre maestros y escuelas.
--    Un maestro puede tener múltiples escuelas/grados.
--
--    NOTA: La restricción única es (TEACHER_ID, SCHOOL_ID, GRADE).
--    En SQL Server, valores NULL en GRADE no se comparan como iguales
--    en UNIQUE constraints, por lo que se usan dos índices filtrados
--    para cubrir ambos casos (con grado y sin grado).
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'TEACHER_SCHOOLS')
BEGIN
    CREATE TABLE [dbo].[TEACHER_SCHOOLS] (
        [ID]         NVARCHAR(36)  NOT NULL,
        [TEACHER_ID] NVARCHAR(36)  NOT NULL,
        [SCHOOL_ID]  NVARCHAR(36)  NOT NULL,
        [GRADE]      NVARCHAR(100) NULL,   -- "1ro Primaria", "Kinder", etc.
        [SECTION]    NVARCHAR(10)  NULL,
        [IS_ACTIVE]  BIT           NOT NULL CONSTRAINT [DF_TEACHER_SCHOOLS_ACTIVE] DEFAULT 1,
        CONSTRAINT [PK_TEACHER_SCHOOLS] PRIMARY KEY ([ID]),
        CONSTRAINT [FK_TEACHER_SCHOOLS_TEACHERS] FOREIGN KEY ([TEACHER_ID])
            REFERENCES [dbo].[TEACHERS] ([ID])
            ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT [FK_TEACHER_SCHOOLS_SCHOOLS] FOREIGN KEY ([SCHOOL_ID])
            REFERENCES [dbo].[SCHOOLS] ([ID])
            ON DELETE NO ACTION ON UPDATE NO ACTION
    );

    -- Unicidad cuando GRADE tiene valor
    CREATE UNIQUE INDEX [UQ_TEACHER_SCHOOLS_WITH_GRADE]
        ON [dbo].[TEACHER_SCHOOLS] ([TEACHER_ID], [SCHOOL_ID], [GRADE])
        WHERE [GRADE] IS NOT NULL;

    -- Unicidad cuando GRADE es NULL (solo un registro sin grado por teacher+school)
    CREATE UNIQUE INDEX [UQ_TEACHER_SCHOOLS_NO_GRADE]
        ON [dbo].[TEACHER_SCHOOLS] ([TEACHER_ID], [SCHOOL_ID])
        WHERE [GRADE] IS NULL;

    PRINT 'Tabla TEACHER_SCHOOLS creada.';
END
ELSE
    PRINT 'TEACHER_SCHOOLS ya existe, se omite.';
GO

-- ─────────────────────────────────────────────────────────────
-- 5. PROGRAM_CONFIGS
--    Configuración de cada programa educativo del MINEDUC.
--    Tipos: FOOD_PACKAGE | SCHOOL_SUPPLIES | TEACHING_KIT | GRATUITY
--    Gestionado desde el POS (Programas).
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'PROGRAM_CONFIGS')
BEGIN
    CREATE TABLE [dbo].[PROGRAM_CONFIGS] (
        [ID]                     NVARCHAR(36)  NOT NULL,
        [TYPE]                   NVARCHAR(30)  NOT NULL, -- FOOD_PACKAGE | SCHOOL_SUPPLIES | TEACHING_KIT | GRATUITY
        [NAME]                   NVARCHAR(150) NOT NULL,
        [DESCRIPTION]            NVARCHAR(500) NULL,
        [MAX_AMOUNT_PER_TEACHER] DECIMAL(18,2) NULL,     -- NULL = sin límite
        [ALLOWED_CATEGORY_IDS]   NVARCHAR(MAX) NULL,     -- JSON: ["id1","id2"] — NULL = todas las categorías
        [IS_ACTIVE]              BIT           NOT NULL CONSTRAINT [DF_PROGRAM_CONFIGS_ACTIVE]  DEFAULT 1,
        [CREATED_AT]             DATETIME2     NOT NULL CONSTRAINT [DF_PROGRAM_CONFIGS_CREATED] DEFAULT GETDATE(),
        [UPDATED_AT]             DATETIME2     NOT NULL CONSTRAINT [DF_PROGRAM_CONFIGS_UPDATED] DEFAULT GETDATE(),
        CONSTRAINT [PK_PROGRAM_CONFIGS] PRIMARY KEY ([ID])
    );
    PRINT 'Tabla PROGRAM_CONFIGS creada.';
END
ELSE
    PRINT 'PROGRAM_CONFIGS ya existe, se omite.';
GO

-- ─────────────────────────────────────────────────────────────
-- 6. PORTAL_ORDERS
--    Pedidos enviados por maestros desde el portal.
--    Estados: PENDING → APPROVED/REJECTED → QUOTED → INVOICED
--    Numeración: PED-YYYY-NNN
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'PORTAL_ORDERS')
BEGIN
    CREATE TABLE [dbo].[PORTAL_ORDERS] (
        [ID]              NVARCHAR(36)  NOT NULL,
        [ORDER_NUMBER]    NVARCHAR(30)  NOT NULL,
        [TEACHER_ID]      NVARCHAR(36)  NOT NULL,
        [SCHOOL_ID]       NVARCHAR(36)  NOT NULL,
        [GRADE]           NVARCHAR(100) NULL,
        [PROGRAM_TYPE]    NVARCHAR(30)  NOT NULL, -- FOOD_PACKAGE | SCHOOL_SUPPLIES | TEACHING_KIT | GRATUITY
        [STATUS]          NVARCHAR(20)  NOT NULL CONSTRAINT [DF_PORTAL_ORDERS_STATUS] DEFAULT 'PENDING',
        [NOTES]           NVARCHAR(MAX) NULL,
        [TOTAL_AMOUNT]    DECIMAL(18,2) NOT NULL CONSTRAINT [DF_PORTAL_ORDERS_TOTAL] DEFAULT 0,
        [ADMIN_NOTES]     NVARCHAR(MAX) NULL,
        [APPROVED_BY_ID]  NVARCHAR(36)  NULL,
        [APPROVED_AT]     DATETIME2     NULL,
        [CREATED_AT]      DATETIME2     NOT NULL CONSTRAINT [DF_PORTAL_ORDERS_CREATED] DEFAULT GETDATE(),
        [UPDATED_AT]      DATETIME2     NOT NULL CONSTRAINT [DF_PORTAL_ORDERS_UPDATED] DEFAULT GETDATE(),
        CONSTRAINT [PK_PORTAL_ORDERS] PRIMARY KEY ([ID]),
        CONSTRAINT [UQ_PORTAL_ORDERS_NUMBER] UNIQUE ([ORDER_NUMBER]),
        CONSTRAINT [FK_PORTAL_ORDERS_TEACHERS] FOREIGN KEY ([TEACHER_ID])
            REFERENCES [dbo].[TEACHERS] ([ID])
            ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT [FK_PORTAL_ORDERS_SCHOOLS] FOREIGN KEY ([SCHOOL_ID])
            REFERENCES [dbo].[SCHOOLS] ([ID])
            ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT [FK_PORTAL_ORDERS_APPROVED_BY] FOREIGN KEY ([APPROVED_BY_ID])
            REFERENCES [dbo].[USERS] ([ID])
            ON DELETE NO ACTION ON UPDATE NO ACTION
    );
    PRINT 'Tabla PORTAL_ORDERS creada.';
END
ELSE
    PRINT 'PORTAL_ORDERS ya existe, se omite.';
GO

-- ─────────────────────────────────────────────────────────────
-- 7. PORTAL_ORDER_ITEMS
--    Líneas de detalle de cada pedido del portal.
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'PORTAL_ORDER_ITEMS')
BEGIN
    CREATE TABLE [dbo].[PORTAL_ORDER_ITEMS] (
        [ID]               NVARCHAR(36)  NOT NULL,
        [PORTAL_ORDER_ID]  NVARCHAR(36)  NOT NULL,
        [PRODUCT_ID]       NVARCHAR(36)  NOT NULL,
        [PRODUCT_NAME]     NVARCHAR(200) NOT NULL,
        [QUANTITY]         DECIMAL(18,4) NOT NULL,
        [UNIT_PRICE]       DECIMAL(18,2) NOT NULL,
        [TOTAL]            DECIMAL(18,2) NOT NULL,
        [NOTES]            NVARCHAR(500) NULL,
        CONSTRAINT [PK_PORTAL_ORDER_ITEMS] PRIMARY KEY ([ID]),
        CONSTRAINT [FK_PORTAL_ORDER_ITEMS_ORDERS] FOREIGN KEY ([PORTAL_ORDER_ID])
            REFERENCES [dbo].[PORTAL_ORDERS] ([ID])
            ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT [FK_PORTAL_ORDER_ITEMS_PRODUCTS] FOREIGN KEY ([PRODUCT_ID])
            REFERENCES [dbo].[PRODUCTS] ([ID])
            ON DELETE NO ACTION ON UPDATE NO ACTION
    );
    PRINT 'Tabla PORTAL_ORDER_ITEMS creada.';
END
ELSE
    PRINT 'PORTAL_ORDER_ITEMS ya existe, se omite.';
GO

-- ─────────────────────────────────────────────────────────────
-- VERIFICACIÓN FINAL
-- ─────────────────────────────────────────────────────────────
SELECT
    name AS Tabla,
    create_date AS FechaCreacion
FROM sys.tables
WHERE name IN (
    'PORTAL_CONFIG',
    'SCHOOLS',
    'TEACHERS',
    'TEACHER_SCHOOLS',
    'PROGRAM_CONFIGS',
    'PORTAL_ORDERS',
    'PORTAL_ORDER_ITEMS'
)
ORDER BY create_date;
GO

PRINT '=============================================';
PRINT 'Migración Portal Escolar completada.';
PRINT 'Recuerda ejecutar: npx prisma generate';
PRINT 'en dengo-backend/ para regenerar el cliente.';
PRINT '=============================================';
GO
