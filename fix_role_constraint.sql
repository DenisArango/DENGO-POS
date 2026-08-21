-- ============================================================
-- Extiende el CHECK constraint de USERS.ROLE para incluir TEACHER
-- Ejecutar UNA VEZ antes del portal_seed_data.sql
-- ============================================================

USE [DENGO_POS];
GO

-- 1. Ver el constraint actual (para confirmar el nombre)
SELECT
    cc.name        AS ConstraintName,
    cc.definition  AS Definicion
FROM sys.check_constraints cc
JOIN sys.columns col ON col.object_id = cc.parent_object_id
                     AND col.column_id = cc.parent_column_id
JOIN sys.tables t    ON t.object_id = cc.parent_object_id
WHERE t.name = 'USERS' AND col.name = 'ROLE';
GO

-- 2. Eliminar el constraint existente
--    (el nombre viene del SELECT anterior; el más común es el generado automáticamente)
DECLARE @constraintName NVARCHAR(200);

SELECT TOP 1 @constraintName = cc.name
FROM sys.check_constraints cc
JOIN sys.columns col ON col.object_id = cc.parent_object_id
                     AND col.column_id = cc.parent_column_id
JOIN sys.tables t    ON t.object_id = cc.parent_object_id
WHERE t.name = 'USERS' AND col.name = 'ROLE';

IF @constraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE [dbo].[USERS] DROP CONSTRAINT [' + @constraintName + ']');
    PRINT 'Constraint eliminado: ' + @constraintName;
END
ELSE
    PRINT 'No se encontró constraint en ROLE, continuando...';
GO

-- 3. Agregar el nuevo constraint que incluye TEACHER
ALTER TABLE [dbo].[USERS]
    ADD CONSTRAINT [CK_USERS_ROLE]
    CHECK ([ROLE] IN ('ADMIN', 'OPERATOR', 'AUDITOR', 'INVENTORY_CONTROL', 'TEACHER'));

PRINT 'Nuevo constraint CK_USERS_ROLE creado con TEACHER incluido.';
GO

-- 4. Verificar
SELECT
    cc.name       AS ConstraintName,
    cc.definition AS Definicion
FROM sys.check_constraints cc
JOIN sys.columns col ON col.object_id = cc.parent_object_id
                     AND col.column_id = cc.parent_column_id
JOIN sys.tables t    ON t.object_id = cc.parent_object_id
WHERE t.name = 'USERS' AND col.name = 'ROLE';
GO
