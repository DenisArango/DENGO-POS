-- ============================================================
-- DENGO POS — Portal Escolar · Datos de Prueba
-- Base de datos: DENGO_POS
-- Ejecutar DESPUÉS de portal_migration.sql
-- ============================================================
--
-- Usuarios creados:
--   maria.garcia@maestros.gt   / Maestro123
--   juan.lopez@maestros.gt     / Profesor456
--   ana.ramirez@maestros.gt    / Docente789
-- ============================================================

USE [DENGO_POS];
GO

-- ─────────────────────────────────────────────────────────────
-- Tomar la primera sucursal disponible para asignar a maestros
-- ─────────────────────────────────────────────────────────────
DECLARE @branchId NVARCHAR(36);
SELECT TOP 1 @branchId = [ID] FROM [dbo].[BRANCHES] WHERE [STATUS] = 'active' ORDER BY [CREATED_AT];

IF @branchId IS NULL
BEGIN
    RAISERROR('No hay sucursales activas en BRANCHES. Crea al menos una sucursal en el POS primero.', 16, 1);
    RETURN;
END

PRINT 'Usando sucursal: ' + @branchId;

-- ─────────────────────────────────────────────────────────────
-- IDs fijos para poder referenciarlos a lo largo del script
-- ─────────────────────────────────────────────────────────────

-- Escuelas
DECLARE @esc1 NVARCHAR(36) = 'portal-school-0001-rabinal-flores--';
DECLARE @esc2 NVARCHAR(36) = 'portal-school-0002-rabinal-sanpabl';
DECLARE @esc3 NVARCHAR(36) = 'portal-school-0003-rabinal-nufed---';

-- Usuarios maestros
DECLARE @usr1 NVARCHAR(36) = 'portal-user-00001-maria-garcia-----';
DECLARE @usr2 NVARCHAR(36) = 'portal-user-00002-juan-lopez------';
DECLARE @usr3 NVARCHAR(36) = 'portal-user-00003-ana-ramirez-----';

-- Perfiles Teacher
DECLARE @tch1 NVARCHAR(36) = 'portal-teacher-001-maria-garcia---';
DECLARE @tch2 NVARCHAR(36) = 'portal-teacher-002-juan-lopez-----';
DECLARE @tch3 NVARCHAR(36) = 'portal-teacher-003-ana-ramirez----';

-- Programas
DECLARE @prg1 NVARCHAR(36) = 'portal-program-001-teaching-kit---';
DECLARE @prg2 NVARCHAR(36) = 'portal-program-002-school-supplies';
DECLARE @prg3 NVARCHAR(36) = 'portal-program-003-food-package---';
DECLARE @prg4 NVARCHAR(36) = 'portal-program-004-gratuity-------';

-- Portal config
DECLARE @cfg1 NVARCHAR(36) = 'portal-config-001-variedades-dayna';

-- ─────────────────────────────────────────────────────────────
-- 1. PORTAL_CONFIG — Datos de Variedades Dayana
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM [dbo].[PORTAL_CONFIG] WHERE [ID] = @cfg1)
BEGIN
    INSERT INTO [dbo].[PORTAL_CONFIG]
        ([ID], [BUSINESS_NAME], [TAGLINE], [ABOUT_TEXT], [PRIMARY_COLOR],
         [ADDRESS], [CITY], [PHONE], [WHATSAPP], [EMAIL],
         [FACEBOOK], [INSTAGRAM], [IS_ACTIVE], [CREATED_AT], [UPDATED_AT])
    VALUES (
        @cfg1,
        'Variedades Dayana',
        'Tu proveedor educativo de confianza en Baja Verapaz',
        'Variedades Dayana es una librería y papelería con más de una década sirviendo a la comunidad educativa de Rabinal, Baja Verapaz. Abastecemos a escuelas del sector público con útiles escolares, libros, materiales de enseñanza y apoyamos los programas educativos del MINEDUC. Nuestra misión es facilitar el acceso a materiales de calidad para maestros y estudiantes de la región.',
        '#F97316',
        '2a. Calle 3-81 zona 4',
        'Rabinal, Baja Verapaz',
        '+502 7938-8807',
        '50279388807',
        'contacto@variedadesdayana.com',
        'https://www.facebook.com/VariedadesDayan/',
        'https://www.instagram.com/variedades_dayana23/',
        1,
        GETDATE(), GETDATE()
    );
    PRINT 'PortalConfig creado.';
END
ELSE
    PRINT 'PortalConfig ya existe.';
GO

-- ─────────────────────────────────────────────────────────────
-- 2. ESCUELAS — 3 escuelas de Rabinal, Baja Verapaz
-- ─────────────────────────────────────────────────────────────
DECLARE @esc1 NVARCHAR(36) = 'portal-school-0001-rabinal-flores--';
DECLARE @esc2 NVARCHAR(36) = 'portal-school-0002-rabinal-sanpabl';
DECLARE @esc3 NVARCHAR(36) = 'portal-school-0003-rabinal-nufed---';

IF NOT EXISTS (SELECT 1 FROM [dbo].[SCHOOLS] WHERE [ID] = @esc1)
    INSERT INTO [dbo].[SCHOOLS]
        ([ID], [NAME], [CODE], [ADDRESS], [MUNICIPIO], [DEPARTAMENTO], [OPF_CONTACT], [OPF_PHONE], [IS_ACTIVE], [CREATED_AT], [UPDATED_AT])
    VALUES (@esc1, 'EORM Niña de las Flores', 'RAB-001', 'Zona 1, Rabinal', 'Rabinal', 'Baja Verapaz', 'Comité OPF Flores', '50270000001', 1, GETDATE(), GETDATE());

IF NOT EXISTS (SELECT 1 FROM [dbo].[SCHOOLS] WHERE [ID] = @esc2)
    INSERT INTO [dbo].[SCHOOLS]
        ([ID], [NAME], [CODE], [ADDRESS], [MUNICIPIO], [DEPARTAMENTO], [OPF_CONTACT], [OPF_PHONE], [IS_ACTIVE], [CREATED_AT], [UPDATED_AT])
    VALUES (@esc2, 'EORM San Pablo', 'RAB-002', 'Aldea San Pablo, Rabinal', 'Rabinal', 'Baja Verapaz', 'Comité OPF San Pablo', '50270000002', 1, GETDATE(), GETDATE());

IF NOT EXISTS (SELECT 1 FROM [dbo].[SCHOOLS] WHERE [ID] = @esc3)
    INSERT INTO [dbo].[SCHOOLS]
        ([ID], [NAME], [CODE], [ADDRESS], [MUNICIPIO], [DEPARTAMENTO], [OPF_CONTACT], [OPF_PHONE], [IS_ACTIVE], [CREATED_AT], [UPDATED_AT])
    VALUES (@esc3, 'Instituto NUFED No. 85', 'RAB-003', 'Zona 3, Rabinal', 'Rabinal', 'Baja Verapaz', 'Comité OPF NUFED', '50270000003', 1, GETDATE(), GETDATE());

PRINT '3 escuelas insertadas.';
GO

-- ─────────────────────────────────────────────────────────────
-- 3. USUARIOS con role = TEACHER
-- ─────────────────────────────────────────────────────────────
DECLARE @branchId NVARCHAR(36);
SELECT TOP 1 @branchId = [ID] FROM [dbo].[BRANCHES] WHERE [STATUS] = 'active' ORDER BY [CREATED_AT];

DECLARE @usr1 NVARCHAR(36) = 'portal-user-00001-maria-garcia-----';
DECLARE @usr2 NVARCHAR(36) = 'portal-user-00002-juan-lopez------';
DECLARE @usr3 NVARCHAR(36) = 'portal-user-00003-ana-ramirez-----';

-- María García — contraseña: Maestro123
IF NOT EXISTS (SELECT 1 FROM [dbo].[USERS] WHERE [ID] = @usr1)
    INSERT INTO [dbo].[USERS]
        ([ID], [EMAIL], [NAME], [PASSWORD_HASH], [ROLE], [BRANCH_ID], [IS_ACTIVE], [CREATED_AT], [UPDATED_AT])
    VALUES (
        @usr1,
        'maria.garcia@maestros.gt',
        'María García',
        '$2a$10$R.lTIS7Izu3JiAq6YlKOMONHq9IdmJNAnmomJ06gL9LasePKaeCNC',
        'TEACHER',
        @branchId,
        1, GETDATE(), GETDATE()
    );

-- Juan López — contraseña: Profesor456
IF NOT EXISTS (SELECT 1 FROM [dbo].[USERS] WHERE [ID] = @usr2)
    INSERT INTO [dbo].[USERS]
        ([ID], [EMAIL], [NAME], [PASSWORD_HASH], [ROLE], [BRANCH_ID], [IS_ACTIVE], [CREATED_AT], [UPDATED_AT])
    VALUES (
        @usr2,
        'juan.lopez@maestros.gt',
        'Juan López',
        '$2a$10$zlenx7L2UsyYVA8mxu.6V.lzLn9bRhWrHmFpdsSEnuTNH6siLI2h2',
        'TEACHER',
        @branchId,
        1, GETDATE(), GETDATE()
    );

-- Ana Ramírez — contraseña: Docente789
IF NOT EXISTS (SELECT 1 FROM [dbo].[USERS] WHERE [ID] = @usr3)
    INSERT INTO [dbo].[USERS]
        ([ID], [EMAIL], [NAME], [PASSWORD_HASH], [ROLE], [BRANCH_ID], [IS_ACTIVE], [CREATED_AT], [UPDATED_AT])
    VALUES (
        @usr3,
        'ana.ramirez@maestros.gt',
        'Ana Ramírez',
        '$2a$10$j7Q7u8cMMgsGxQ3pFfDSbO.y1Se1PZr4r0ZNixS8o8KoAKGrd.PKm',
        'TEACHER',
        @branchId,
        1, GETDATE(), GETDATE()
    );

PRINT '3 usuarios TEACHER insertados.';
GO

-- ─────────────────────────────────────────────────────────────
-- 4. PERFILES TEACHER
-- ─────────────────────────────────────────────────────────────
DECLARE @usr1 NVARCHAR(36) = 'portal-user-00001-maria-garcia-----';
DECLARE @usr2 NVARCHAR(36) = 'portal-user-00002-juan-lopez------';
DECLARE @usr3 NVARCHAR(36) = 'portal-user-00003-ana-ramirez-----';

DECLARE @tch1 NVARCHAR(36) = 'portal-teacher-001-maria-garcia---';
DECLARE @tch2 NVARCHAR(36) = 'portal-teacher-002-juan-lopez-----';
DECLARE @tch3 NVARCHAR(36) = 'portal-teacher-003-ana-ramirez----';

IF NOT EXISTS (SELECT 1 FROM [dbo].[TEACHERS] WHERE [ID] = @tch1)
    INSERT INTO [dbo].[TEACHERS] ([ID], [USER_ID], [PHONE], [IS_ACTIVE], [CREATED_AT], [UPDATED_AT])
    VALUES (@tch1, @usr1, '+502 5000-0001', 1, GETDATE(), GETDATE());

IF NOT EXISTS (SELECT 1 FROM [dbo].[TEACHERS] WHERE [ID] = @tch2)
    INSERT INTO [dbo].[TEACHERS] ([ID], [USER_ID], [PHONE], [IS_ACTIVE], [CREATED_AT], [UPDATED_AT])
    VALUES (@tch2, @usr2, '+502 5000-0002', 1, GETDATE(), GETDATE());

IF NOT EXISTS (SELECT 1 FROM [dbo].[TEACHERS] WHERE [ID] = @tch3)
    INSERT INTO [dbo].[TEACHERS] ([ID], [USER_ID], [PHONE], [IS_ACTIVE], [CREATED_AT], [UPDATED_AT])
    VALUES (@tch3, @usr3, '+502 5000-0003', 1, GETDATE(), GETDATE());

PRINT '3 perfiles TEACHERS insertados.';
GO

-- ─────────────────────────────────────────────────────────────
-- 5. ASIGNACIÓN DE ESCUELAS A MAESTROS
--
--   María García  → EORM Flores  (1ro Primaria)
--   María García  → EORM Flores  (2do Primaria)
--   Juan López    → EORM San Pablo (3ro Primaria)
--   Juan López    → NUFED        (Básicos)
--   Ana Ramírez   → EORM Flores  (Preprimaria)
--   Ana Ramírez   → EORM San Pablo (Preprimaria)
-- ─────────────────────────────────────────────────────────────
DECLARE @tch1 NVARCHAR(36) = 'portal-teacher-001-maria-garcia---';
DECLARE @tch2 NVARCHAR(36) = 'portal-teacher-002-juan-lopez-----';
DECLARE @tch3 NVARCHAR(36) = 'portal-teacher-003-ana-ramirez----';

DECLARE @esc1 NVARCHAR(36) = 'portal-school-0001-rabinal-flores--';
DECLARE @esc2 NVARCHAR(36) = 'portal-school-0002-rabinal-sanpabl';
DECLARE @esc3 NVARCHAR(36) = 'portal-school-0003-rabinal-nufed---';

IF NOT EXISTS (SELECT 1 FROM [dbo].[TEACHER_SCHOOLS] WHERE [TEACHER_ID] = @tch1 AND [SCHOOL_ID] = @esc1 AND [GRADE] = '1ro Primaria')
    INSERT INTO [dbo].[TEACHER_SCHOOLS] ([ID], [TEACHER_ID], [SCHOOL_ID], [GRADE], [SECTION], [IS_ACTIVE])
    VALUES (NEWID(), @tch1, @esc1, '1ro Primaria', 'A', 1);

IF NOT EXISTS (SELECT 1 FROM [dbo].[TEACHER_SCHOOLS] WHERE [TEACHER_ID] = @tch1 AND [SCHOOL_ID] = @esc1 AND [GRADE] = '2do Primaria')
    INSERT INTO [dbo].[TEACHER_SCHOOLS] ([ID], [TEACHER_ID], [SCHOOL_ID], [GRADE], [SECTION], [IS_ACTIVE])
    VALUES (NEWID(), @tch1, @esc1, '2do Primaria', 'A', 1);

IF NOT EXISTS (SELECT 1 FROM [dbo].[TEACHER_SCHOOLS] WHERE [TEACHER_ID] = @tch2 AND [SCHOOL_ID] = @esc2 AND [GRADE] = '3ro Primaria')
    INSERT INTO [dbo].[TEACHER_SCHOOLS] ([ID], [TEACHER_ID], [SCHOOL_ID], [GRADE], [SECTION], [IS_ACTIVE])
    VALUES (NEWID(), @tch2, @esc2, '3ro Primaria', 'B', 1);

IF NOT EXISTS (SELECT 1 FROM [dbo].[TEACHER_SCHOOLS] WHERE [TEACHER_ID] = @tch2 AND [SCHOOL_ID] = @esc3 AND [GRADE] = 'Básicos')
    INSERT INTO [dbo].[TEACHER_SCHOOLS] ([ID], [TEACHER_ID], [SCHOOL_ID], [GRADE], [SECTION], [IS_ACTIVE])
    VALUES (NEWID(), @tch2, @esc3, 'Básicos', NULL, 1);

IF NOT EXISTS (SELECT 1 FROM [dbo].[TEACHER_SCHOOLS] WHERE [TEACHER_ID] = @tch3 AND [SCHOOL_ID] = @esc1 AND [GRADE] = 'Preprimaria')
    INSERT INTO [dbo].[TEACHER_SCHOOLS] ([ID], [TEACHER_ID], [SCHOOL_ID], [GRADE], [SECTION], [IS_ACTIVE])
    VALUES (NEWID(), @tch3, @esc1, 'Preprimaria', NULL, 1);

IF NOT EXISTS (SELECT 1 FROM [dbo].[TEACHER_SCHOOLS] WHERE [TEACHER_ID] = @tch3 AND [SCHOOL_ID] = @esc2 AND [GRADE] = 'Preprimaria')
    INSERT INTO [dbo].[TEACHER_SCHOOLS] ([ID], [TEACHER_ID], [SCHOOL_ID], [GRADE], [SECTION], [IS_ACTIVE])
    VALUES (NEWID(), @tch3, @esc2, 'Preprimaria', NULL, 1);

PRINT '6 asignaciones TEACHER_SCHOOLS insertadas.';
GO

-- ─────────────────────────────────────────────────────────────
-- 6. PROGRAM_CONFIGS — Los 4 programas del MINEDUC
-- ─────────────────────────────────────────────────────────────
DECLARE @prg1 NVARCHAR(36) = 'portal-program-001-teaching-kit---';
DECLARE @prg2 NVARCHAR(36) = 'portal-program-002-school-supplies';
DECLARE @prg3 NVARCHAR(36) = 'portal-program-003-food-package---';
DECLARE @prg4 NVARCHAR(36) = 'portal-program-004-gratuity-------';

IF NOT EXISTS (SELECT 1 FROM [dbo].[PROGRAM_CONFIGS] WHERE [ID] = @prg1)
    INSERT INTO [dbo].[PROGRAM_CONFIGS]
        ([ID], [TYPE], [NAME], [DESCRIPTION], [MAX_AMOUNT_PER_TEACHER], [ALLOWED_CATEGORY_IDS], [IS_ACTIVE], [CREATED_AT], [UPDATED_AT])
    VALUES (
        @prg1, 'TEACHING_KIT', 'Valija Didáctica',
        'Materiales de enseñanza para docentes alineados al Currículo Nacional Base (CNB). Monto asignado por MINEDUC: Q600 por maestro.',
        600.00, NULL, 1, GETDATE(), GETDATE()
    );

IF NOT EXISTS (SELECT 1 FROM [dbo].[PROGRAM_CONFIGS] WHERE [ID] = @prg2)
    INSERT INTO [dbo].[PROGRAM_CONFIGS]
        ([ID], [TYPE], [NAME], [DESCRIPTION], [MAX_AMOUNT_PER_TEACHER], [ALLOWED_CATEGORY_IDS], [IS_ACTIVE], [CREATED_AT], [UPDATED_AT])
    VALUES (
        @prg2, 'SCHOOL_SUPPLIES', 'Útiles Escolares',
        'Cuadernos, lápices, colores y materiales básicos para el aula. Gestionados por la OPF de cada establecimiento.',
        200.00, NULL, 1, GETDATE(), GETDATE()
    );

IF NOT EXISTS (SELECT 1 FROM [dbo].[PROGRAM_CONFIGS] WHERE [ID] = @prg3)
    INSERT INTO [dbo].[PROGRAM_CONFIGS]
        ([ID], [TYPE], [NAME], [DESCRIPTION], [MAX_AMOUNT_PER_TEACHER], [ALLOWED_CATEGORY_IDS], [IS_ACTIVE], [CREATED_AT], [UPDATED_AT])
    VALUES (
        @prg3, 'FOOD_PACKAGE', 'Alimentación Escolar',
        'Paquetes de alimentos nutritivos para estudiantes del sector público durante la jornada escolar.',
        NULL, NULL, 1, GETDATE(), GETDATE()
    );

IF NOT EXISTS (SELECT 1 FROM [dbo].[PROGRAM_CONFIGS] WHERE [ID] = @prg4)
    INSERT INTO [dbo].[PROGRAM_CONFIGS]
        ([ID], [TYPE], [NAME], [DESCRIPTION], [MAX_AMOUNT_PER_TEACHER], [ALLOWED_CATEGORY_IDS], [IS_ACTIVE], [CREATED_AT], [UPDATED_AT])
    VALUES (
        @prg4, 'GRATUITY', 'Gratuidades',
        'Materiales educativos de entrega gratuita a establecimientos del sector público.',
        100.00, NULL, 1, GETDATE(), GETDATE()
    );

PRINT '4 programas insertados.';
GO

-- ─────────────────────────────────────────────────────────────
-- VERIFICACIÓN FINAL
-- ─────────────────────────────────────────────────────────────
SELECT 'PORTAL_CONFIG'   AS Tabla, COUNT(*) AS Registros FROM [dbo].[PORTAL_CONFIG]   UNION ALL
SELECT 'SCHOOLS',                  COUNT(*)               FROM [dbo].[SCHOOLS]          UNION ALL
SELECT 'TEACHERS',                 COUNT(*)               FROM [dbo].[TEACHERS]         UNION ALL
SELECT 'TEACHER_SCHOOLS',          COUNT(*)               FROM [dbo].[TEACHER_SCHOOLS]  UNION ALL
SELECT 'PROGRAM_CONFIGS',          COUNT(*)               FROM [dbo].[PROGRAM_CONFIGS];

SELECT u.[NAME] AS Maestro, u.[EMAIL], ts.[GRADE] AS Grado, s.[NAME] AS Escuela
FROM [dbo].[USERS] u
JOIN [dbo].[TEACHERS] t ON t.[USER_ID] = u.[ID]
JOIN [dbo].[TEACHER_SCHOOLS] ts ON ts.[TEACHER_ID] = t.[ID]
JOIN [dbo].[SCHOOLS] s ON s.[ID] = ts.[SCHOOL_ID]
ORDER BY u.[NAME], s.[NAME];
GO

PRINT '=============================================';
PRINT 'Datos de prueba Portal Escolar cargados OK.';
PRINT '=============================================';
GO
