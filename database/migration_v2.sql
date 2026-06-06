-- ============================================================
--  DENGO POS  ·  Migration v2  (2026-06-05)
--  Seguro: verifica existencia antes de agregar cada columna/tabla
-- ============================================================

USE DENGO_POS;
GO

-- ============================================================
--  1.  BRANCHES  ·  branding / info empresa por sucursal
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('BRANCHES') AND name = 'LOGO')
    ALTER TABLE BRANCHES ADD LOGO NVARCHAR(MAX) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('BRANCHES') AND name = 'COMPANY_NAME')
    ALTER TABLE BRANCHES ADD COMPANY_NAME NVARCHAR(150) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('BRANCHES') AND name = 'COMPANY_TAX_ID')
    ALTER TABLE BRANCHES ADD COMPANY_TAX_ID NVARCHAR(30) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('BRANCHES') AND name = 'COMPANY_TAGLINE')
    ALTER TABLE BRANCHES ADD COMPANY_TAGLINE NVARCHAR(200) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('BRANCHES') AND name = 'COMPANY_WEBSITE')
    ALTER TABLE BRANCHES ADD COMPANY_WEBSITE NVARCHAR(150) NULL;
GO

-- ============================================================
--  2.  CASH_REGISTERS  ·  varias cajas por sucursal
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('CASH_REGISTERS') AND name = 'NAME')
    ALTER TABLE CASH_REGISTERS ADD NAME NVARCHAR(60) NOT NULL DEFAULT 'Caja';
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('CASH_REGISTERS') AND name = 'REGISTER_NUMBER')
    ALTER TABLE CASH_REGISTERS ADD REGISTER_NUMBER NVARCHAR(20) NOT NULL DEFAULT '1';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('CASH_REGISTERS') AND name = 'IX_CASH_REGISTERS_REGISTER_NUMBER')
    CREATE INDEX IX_CASH_REGISTERS_REGISTER_NUMBER ON CASH_REGISTERS (BRANCH_ID, REGISTER_NUMBER, STATUS);
GO

-- ============================================================
--  3.  SALES  ·  desglose de pago + motivo de anulación
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('SALES') AND name = 'CASH_AMOUNT')
    ALTER TABLE SALES ADD CASH_AMOUNT DECIMAL(18,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('SALES') AND name = 'CARD_AMOUNT')
    ALTER TABLE SALES ADD CARD_AMOUNT DECIMAL(18,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('SALES') AND name = 'TRANSFER_AMOUNT')
    ALTER TABLE SALES ADD TRANSFER_AMOUNT DECIMAL(18,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('SALES') AND name = 'TRANSFER_DOCUMENT_NUMBER')
    ALTER TABLE SALES ADD TRANSFER_DOCUMENT_NUMBER NVARCHAR(100) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('SALES') AND name = 'VOID_REASON')
    ALTER TABLE SALES ADD VOID_REASON NVARCHAR(500) NULL;
GO

-- ============================================================
--  4.  PRODUCT_BARCODES  ·  códigos de barras alternos
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'PRODUCT_BARCODES')
BEGIN
    CREATE TABLE PRODUCT_BARCODES (
        ID          NVARCHAR(36)  NOT NULL  PRIMARY KEY,
        PRODUCT_ID  NVARCHAR(36)  NOT NULL  REFERENCES PRODUCTS(ID),
        BARCODE     NVARCHAR(50)  NOT NULL  UNIQUE,
        DESCRIPTION NVARCHAR(100)     NULL
    );
    CREATE INDEX IX_PRODUCT_BARCODES_PRODUCT_ID ON PRODUCT_BARCODES(PRODUCT_ID);
    CREATE INDEX IX_PRODUCT_BARCODES_BARCODE    ON PRODUCT_BARCODES(BARCODE);
END
GO

-- ============================================================
--  5.  CREDIT_PAYMENTS  ·  abonos a ventas al crédito
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CREDIT_PAYMENTS')
BEGIN
    CREATE TABLE CREDIT_PAYMENTS (
        ID                       NVARCHAR(36)  NOT NULL  PRIMARY KEY,
        SALE_ID                  NVARCHAR(36)  NOT NULL  REFERENCES SALES(ID),
        AMOUNT                   DECIMAL(18,2) NOT NULL,
        PAYMENT_METHOD           NVARCHAR(20)  NOT NULL  CHECK (PAYMENT_METHOD IN ('CASH','TRANSFER')),
        TRANSFER_DOCUMENT_NUMBER NVARCHAR(100)     NULL,
        TRANSFER_BANK            NVARCHAR(100)     NULL,
        NOTES                    NVARCHAR(500)     NULL,
        PAID_BY_ID               NVARCHAR(36)  NOT NULL  REFERENCES USERS(ID),
        CREATED_AT               DATETIME2(7)  NOT NULL  DEFAULT GETUTCDATE()
    );
    CREATE INDEX IX_CREDIT_PAYMENTS_SALE_ID    ON CREDIT_PAYMENTS(SALE_ID);
    CREATE INDEX IX_CREDIT_PAYMENTS_CREATED_AT ON CREDIT_PAYMENTS(CREATED_AT DESC);
END
GO

-- ============================================================
--  6.  Vista actualizada con desglose por método de pago
-- ============================================================

CREATE OR ALTER VIEW VW_DAILY_SALES_SUMMARY AS
SELECT
    CAST(s.CREATED_AT AS DATE) AS SALE_DATE,
    s.BRANCH_ID,
    b.NAME                     AS BRANCH_NAME,
    s.CASH_REGISTER_ID,
    COUNT(s.ID)                AS SALES_COUNT,
    SUM(s.TOTAL)               AS TOTAL_REVENUE,
    SUM(s.DISCOUNT)            AS TOTAL_DISCOUNTS,
    SUM(CASE
        WHEN s.PAYMENT_METHOD = 'CASH'  THEN s.TOTAL
        WHEN s.PAYMENT_METHOD = 'MIXED' THEN ISNULL(s.CASH_AMOUNT, 0)
        ELSE 0 END)            AS CASH_REVENUE,
    SUM(CASE
        WHEN s.PAYMENT_METHOD = 'CARD'  THEN s.TOTAL
        WHEN s.PAYMENT_METHOD = 'MIXED' THEN ISNULL(s.CARD_AMOUNT, 0)
        ELSE 0 END)            AS CARD_REVENUE,
    SUM(CASE
        WHEN s.PAYMENT_METHOD = 'TRANSFER' THEN s.TOTAL
        WHEN s.PAYMENT_METHOD = 'MIXED'    THEN ISNULL(s.TRANSFER_AMOUNT, 0)
        ELSE 0 END)            AS TRANSFER_REVENUE,
    SUM(CASE
        WHEN s.PAYMENT_METHOD = 'CREDIT' THEN s.TOTAL
        ELSE 0 END)            AS CREDIT_REVENUE
FROM SALES s
INNER JOIN BRANCHES b ON b.ID = s.BRANCH_ID
WHERE s.IS_VOIDED = 0
GROUP BY
    CAST(s.CREATED_AT AS DATE),
    s.BRANCH_ID,
    b.NAME,
    s.CASH_REGISTER_ID;
GO

-- ============================================================
--  FIN  ·  Verificación  (todos deben devolver el count esperado)
-- ============================================================

SELECT 'BRANCHES cols (esperado 5)'       AS [Check],
       COUNT(*) AS total
FROM   sys.columns
WHERE  object_id = OBJECT_ID('BRANCHES')
  AND  name IN ('LOGO','COMPANY_NAME','COMPANY_TAX_ID','COMPANY_TAGLINE','COMPANY_WEBSITE');

SELECT 'CASH_REGISTERS cols (esperado 2)' AS [Check],
       COUNT(*) AS total
FROM   sys.columns
WHERE  object_id = OBJECT_ID('CASH_REGISTERS')
  AND  name IN ('NAME','REGISTER_NUMBER');

SELECT 'SALES cols (esperado 5)'          AS [Check],
       COUNT(*) AS total
FROM   sys.columns
WHERE  object_id = OBJECT_ID('SALES')
  AND  name IN ('CASH_AMOUNT','CARD_AMOUNT','TRANSFER_AMOUNT','TRANSFER_DOCUMENT_NUMBER','VOID_REASON');

SELECT 'PRODUCT_BARCODES (esperado 1)'    AS [Check],
       COUNT(*) AS total
FROM   sys.tables WHERE name = 'PRODUCT_BARCODES';

SELECT 'CREDIT_PAYMENTS (esperado 1)'     AS [Check],
       COUNT(*) AS total
FROM   sys.tables WHERE name = 'CREDIT_PAYMENTS';
GO
