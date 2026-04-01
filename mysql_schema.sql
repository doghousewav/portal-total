-- ESQUEMA PARA MYSQL (AWS RDS)

-- 0. Perfiles de usuario (Incluye Autenticación)
CREATE TABLE IF NOT EXISTS profiles (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('comercial', 'gerencia') DEFAULT 'comercial',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 1. Tabla principal de informes
CREATE TABLE IF NOT EXISTS informe_visita (
    id VARCHAR(36) PRIMARY KEY,
    comercial_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- DATOS GENERALES
    estado ENUM('Borrador', 'Completo') DEFAULT 'Borrador',
    ruc VARCHAR(11),
    razon_social VARCHAR(255),
    fecha_visita DATE,
    lugar_visita VARCHAR(255),
    departamento VARCHAR(100),
    provincia VARCHAR(100),
    distrito VARCHAR(100),
    referencia_direccion TEXT,
    google_maps_url TEXT,
    tipo_visita VARCHAR(100),
    lugar_visita_cat VARCHAR(100),
    local_visita VARCHAR(100),
    validacion_negativa BOOLEAN DEFAULT FALSE,
    servicios_adicionales BOOLEAN DEFAULT FALSE,
    historia TEXT,
    ciclo_negocio TEXT,
    activos_empresa TEXT,
    
    -- PARTICIPANTES (Aplanados)
    entrevistado1_nombres VARCHAR(255),
    entrevistado1_apellidos VARCHAR(255),
    entrevistado1_cargo VARCHAR(255),
    entrevistado1_contacto VARCHAR(255),
    entrevistado2_nombres VARCHAR(255),
    entrevistado2_apellidos VARCHAR(255),
    entrevistado2_cargo VARCHAR(255),
    entrevistado2_contacto VARCHAR(255),
    entrevistado3_nombres VARCHAR(255),
    entrevistado3_apellidos VARCHAR(255),
    entrevistado3_cargo VARCHAR(255),
    entrevistado3_contacto VARCHAR(255),
    
    ejecutivo1_nombre VARCHAR(255),
    ejecutivo1_cargo VARCHAR(255),
    ejecutivo2_nombre VARCHAR(255),
    ejecutivo2_cargo VARCHAR(255),
    ejecutivo3_nombre VARCHAR(255),
    ejecutivo3_cargo VARCHAR(255),
    
    funcionario_nombre VARCHAR(255),
    valido_hasta DATE,
    firma_url TEXT,
    
    -- FOTOS (JSON)
    fotografias JSON -- Almacena array de objetos {etiqueta, url_storage}
);

-- INDEXACIÓN PARA MEJOR RENDIMIENTO
CREATE INDEX idx_comercial ON informe_visita(comercial_id);
CREATE INDEX idx_estado ON informe_visita(estado);
