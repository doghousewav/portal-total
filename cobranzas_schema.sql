-- ===============================================
-- ESTRUCTURA MASTER-DETAIL PARA COBRANZAS (CON SOFT-DELETE)
-- ===============================================

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS detalle_cuotas_cobranzas;
DROP TABLE IF EXISTS gestiones_cobranzas;
DROP TABLE IF EXISTS base_cobranzas;
SET FOREIGN_KEY_CHECKS = 1;

-- 1. Tabla Maestra de Clientes
CREATE TABLE base_cobranzas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ruc VARCHAR(11) NOT NULL UNIQUE,
    nro_cliente VARCHAR(50), -- #CL
    cliente VARCHAR(255) NOT NULL,
    gestor VARCHAR(150),
    oficial VARCHAR(150),
    telefono VARCHAR(50),
    correo1 VARCHAR(150),
    correo2 VARCHAR(150),
    importe_total_consolidado DECIMAL(15,2) DEFAULT 0.00,
    moneda_consolidada VARCHAR(10) DEFAULT 'USD',
    vencimiento DATE,
    estado ENUM('Pendiente', 'En proceso', 'Completado', 'Inubicable') DEFAULT 'Pendiente',
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ruc (ruc)
);

-- 2. Tabla Detalle (31 Columnas del Excel)
CREATE TABLE detalle_cuotas_cobranzas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ruc VARCHAR(11) NOT NULL,
    nro_cl VARCHAR(50),
    cliente VARCHAR(255),
    cliente_cross VARCHAR(255),
    tramo_actual VARCHAR(100),
    tramo_segmentado VARCHAR(100),
    departamento VARCHAR(100),
    contrato VARCHAR(100),
    cuota VARCHAR(50),
    vencimiento DATE,
    mes VARCHAR(20),
    detalle_mes VARCHAR(100),
    moneda VARCHAR(10),
    importe DECIMAL(15,2),
    importe_usd DECIMAL(15,2),
    capital DECIMAL(15,2),
    capital_usd DECIMAL(15,2),
    saldo_k_usd DECIMAL(15,2),
    dias_atraso INT,
    mora DECIMAL(15,2),
    fecha_pago DATE,
    det_pago VARCHAR(255),
    indicador VARCHAR(100),
    cxc DECIMAL(15,2),
    cxc_castigadas DECIMAL(15,2),
    excedente DECIMAL(15,2),
    gestor VARCHAR(150),
    oficial VARCHAR(150),
    telefono VARCHAR(50),
    correo1 VARCHAR(150),
    correo2 VARCHAR(150),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ruc) REFERENCES base_cobranzas(ruc) ON DELETE CASCADE,
    INDEX idx_ruc_detalle (ruc)
);

-- 3. Tabla de Historial de Gestiones
CREATE TABLE gestiones_cobranzas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ruc VARCHAR(11) NOT NULL,
    fecha_gestion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accion ENUM('Llamada', 'Correo', 'WhatsApp', 'Visita') NOT NULL,
    resultado VARCHAR(100), 
    nota TEXT,
    gestor_nombre VARCHAR(100),
    FOREIGN KEY (ruc) REFERENCES base_cobranzas(ruc) ON DELETE CASCADE,
    INDEX idx_ruc_gestion (ruc)
);
