"""Initial schema — todas las tablas de Eurodent 2.0

Revision ID: 0001
Revises:
Create Date: 2026-04-09
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# SQL completo en raw — evita los quirks de SQLAlchemy con ENUM types en migraciones
UPGRADE_SQL = """

-- ─── Extensiones ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── ENUM types (idempotentes) ───────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE rol_usuario AS ENUM ('recepcion', 'doctor', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE tipo_dia AS ENUM ('laborable', 'semilaborable', 'festivo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE estado_cita AS ENUM ('programada', 'confirmada', 'en_clinica', 'atendida', 'falta', 'anulada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE tipo_falta AS ENUM ('falta', 'anulacion_paciente', 'anulacion_clinica');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE estado_presupuesto AS ENUM ('borrador', 'presentado', 'aceptado', 'rechazado', 'parcial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE tipo_factura AS ENUM ('paciente', 'iguala', 'entidad');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE estado_factura AS ENUM ('emitida', 'cobrada', 'parcial', 'anulada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── doctores ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doctores (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre      VARCHAR(100) NOT NULL,
    especialidad VARCHAR(100),
    color_agenda VARCHAR(7),
    es_auxiliar BOOLEAN NOT NULL DEFAULT false,
    porcentaje  NUMERIC(5,2),
    activo      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ
);

-- ─── gabinetes ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gabinetes (
    id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre  VARCHAR(50) NOT NULL,
    activo  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ
);

-- ─── entidades ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entidades (
    id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre    VARCHAR(150) NOT NULL,
    cif       VARCHAR(15),
    direccion TEXT,
    telefono  VARCHAR(20),
    contacto  VARCHAR(100),
    activo    BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ
);

-- ─── usuarios ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username      VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre        VARCHAR(100) NOT NULL,
    rol           rol_usuario NOT NULL,
    doctor_id     UUID REFERENCES doctores(id),
    activo        BOOLEAN NOT NULL DEFAULT true,
    ultimo_acceso TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_usuarios_username ON usuarios(username);

-- ─── pacientes ───────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS pacientes_num_historial_seq;
CREATE TABLE IF NOT EXISTS pacientes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo          VARCHAR(20) UNIQUE,
    num_historial   INTEGER UNIQUE NOT NULL DEFAULT nextval('pacientes_num_historial_seq'),
    nombre          VARCHAR(100) NOT NULL,
    apellidos       VARCHAR(150) NOT NULL,
    fecha_nacimiento DATE,
    dni_nie         BYTEA,
    telefono        BYTEA,
    telefono2       BYTEA,
    email           BYTEA,
    direccion       TEXT,
    codigo_postal   VARCHAR(10),
    ciudad          VARCHAR(100),
    provincia       VARCHAR(100),
    entidad_id      UUID REFERENCES entidades(id),
    entidad_alt_id  UUID REFERENCES entidades(id),
    no_correo       BOOLEAN NOT NULL DEFAULT false,
    foto_path       VARCHAR(500),
    observaciones   TEXT,
    activo          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_pacientes_codigo         ON pacientes(codigo);
CREATE INDEX IF NOT EXISTS ix_pacientes_num_historial  ON pacientes(num_historial);
CREATE INDEX IF NOT EXISTS ix_pacientes_nombre         ON pacientes(nombre);
CREATE INDEX IF NOT EXISTS ix_pacientes_apellidos      ON pacientes(apellidos);
CREATE INDEX IF NOT EXISTS ix_pacientes_apellidos_trgm ON pacientes USING gin(apellidos gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_pacientes_nombre_trgm    ON pacientes USING gin(nombre gin_trgm_ops);

-- ─── horarios_doctor ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS horarios_doctor (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doctor_id    UUID NOT NULL REFERENCES doctores(id),
    dia_semana   SMALLINT NOT NULL,
    tipo_dia     tipo_dia NOT NULL DEFAULT 'laborable',
    bloques      JSONB NOT NULL DEFAULT '[]',
    intervalo_min SMALLINT NOT NULL DEFAULT 10,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ,
    CONSTRAINT uq_doctor_dia UNIQUE(doctor_id, dia_semana)
);

-- ─── horarios_excepciones ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS horarios_excepciones (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doctor_id  UUID NOT NULL REFERENCES doctores(id),
    fecha      DATE NOT NULL,
    tipo_dia   tipo_dia NOT NULL,
    bloques    JSONB,
    no_trabaja BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_horarios_excepciones_fecha ON horarios_excepciones(fecha);

-- ─── citas ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS citas (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    paciente_id  UUID NOT NULL REFERENCES pacientes(id),
    doctor_id    UUID NOT NULL REFERENCES doctores(id),
    gabinete_id  UUID REFERENCES gabinetes(id),
    fecha_hora   TIMESTAMPTZ NOT NULL,
    duracion_min SMALLINT NOT NULL DEFAULT 30,
    estado       estado_cita NOT NULL DEFAULT 'programada',
    es_urgencia  BOOLEAN NOT NULL DEFAULT false,
    motivo       TEXT,
    observaciones TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_citas_doctor_fecha   ON citas(doctor_id, fecha_hora);
CREATE INDEX IF NOT EXISTS ix_citas_paciente_fecha ON citas(paciente_id, fecha_hora);
CREATE INDEX IF NOT EXISTS ix_citas_fecha_hora     ON citas(fecha_hora);

-- ─── citas_telefonear ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS citas_telefonear (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cita_original_id UUID NOT NULL REFERENCES citas(id),
    paciente_id      UUID NOT NULL REFERENCES pacientes(id),
    doctor_id        UUID NOT NULL REFERENCES doctores(id),
    motivo           TEXT,
    reubicada        BOOLEAN NOT NULL DEFAULT false,
    nueva_cita_id    UUID REFERENCES citas(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ
);

-- ─── historial_faltas ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS historial_faltas (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id),
    cita_id     UUID NOT NULL REFERENCES citas(id),
    tipo        tipo_falta NOT NULL,
    fecha       TIMESTAMPTZ NOT NULL,
    notas       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_historial_faltas_paciente ON historial_faltas(paciente_id);

-- ─── familias_tratamiento ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS familias_tratamiento (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre     VARCHAR(100) NOT NULL,
    icono      VARCHAR(50),
    orden      SMALLINT NOT NULL DEFAULT 0,
    activo     BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ
);

-- ─── tratamientos_catalogo ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tratamientos_catalogo (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    familia_id       UUID NOT NULL REFERENCES familias_tratamiento(id),
    codigo           VARCHAR(20) UNIQUE,
    nombre           VARCHAR(150) NOT NULL,
    precio           NUMERIC(10,2) NOT NULL DEFAULT 0,
    iva_porcentaje   NUMERIC(4,2) NOT NULL DEFAULT 0,
    requiere_pieza   BOOLEAN NOT NULL DEFAULT false,
    requiere_caras   BOOLEAN NOT NULL DEFAULT false,
    activo           BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ
);

-- ─── entidades_baremo ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entidades_baremo (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entidad_id     UUID NOT NULL REFERENCES entidades(id),
    tratamiento_id UUID NOT NULL REFERENCES tratamientos_catalogo(id),
    precio         NUMERIC(10,2) NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ
);

-- ─── historial_clinico ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS historial_clinico (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    paciente_id    UUID NOT NULL REFERENCES pacientes(id),
    tratamiento_id UUID NOT NULL REFERENCES tratamientos_catalogo(id),
    doctor_id      UUID NOT NULL REFERENCES doctores(id),
    gabinete_id    UUID REFERENCES gabinetes(id),
    pieza_dental   SMALLINT,
    caras          VARCHAR(10),
    fecha          DATE NOT NULL,
    observaciones  TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_historial_clinico_paciente ON historial_clinico(paciente_id);
CREATE INDEX IF NOT EXISTS ix_historial_clinico_fecha    ON historial_clinico(fecha);

-- ─── presupuestos ────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS presupuestos_numero_seq;
CREATE TABLE IF NOT EXISTS presupuestos (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id),
    numero      INTEGER UNIQUE NOT NULL DEFAULT nextval('presupuestos_numero_seq'),
    fecha       DATE NOT NULL,
    estado      estado_presupuesto NOT NULL DEFAULT 'borrador',
    pie_pagina  TEXT,
    doctor_id   UUID NOT NULL REFERENCES doctores(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_presupuestos_paciente ON presupuestos(paciente_id);

-- ─── presupuesto_lineas ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS presupuesto_lineas (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    presupuesto_id          UUID NOT NULL REFERENCES presupuestos(id),
    tratamiento_id          UUID NOT NULL REFERENCES tratamientos_catalogo(id),
    pieza_dental            SMALLINT,
    caras                   VARCHAR(10),
    precio_unitario         NUMERIC(10,2) NOT NULL,
    descuento_porcentaje    NUMERIC(5,2) NOT NULL DEFAULT 0,
    aceptado                BOOLEAN NOT NULL DEFAULT false,
    pasado_trabajo_pendiente BOOLEAN NOT NULL DEFAULT false,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ
);

-- ─── trabajo_pendiente ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trabajo_pendiente (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    paciente_id         UUID NOT NULL REFERENCES pacientes(id),
    presupuesto_linea_id UUID NOT NULL REFERENCES presupuesto_lineas(id),
    tratamiento_id      UUID NOT NULL REFERENCES tratamientos_catalogo(id),
    pieza_dental        SMALLINT,
    caras               VARCHAR(10),
    realizado           BOOLEAN NOT NULL DEFAULT false,
    historial_id        UUID REFERENCES historial_clinico(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_trabajo_pendiente_paciente ON trabajo_pendiente(paciente_id);

-- ─── formas_pago ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS formas_pago (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre     VARCHAR(50) NOT NULL,
    activo     BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ
);

-- ─── facturas ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturas (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    paciente_id  UUID NOT NULL REFERENCES pacientes(id),
    entidad_id   UUID REFERENCES entidades(id),
    serie        VARCHAR(5) NOT NULL DEFAULT 'A',
    numero       INTEGER NOT NULL,
    fecha        DATE NOT NULL,
    tipo         tipo_factura NOT NULL DEFAULT 'paciente',
    subtotal     NUMERIC(10,2) NOT NULL,
    iva_total    NUMERIC(10,2) NOT NULL,
    total        NUMERIC(10,2) NOT NULL,
    estado       estado_factura NOT NULL DEFAULT 'emitida',
    forma_pago_id UUID REFERENCES formas_pago(id),
    observaciones TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_facturas_paciente ON facturas(paciente_id);
CREATE INDEX IF NOT EXISTS ix_facturas_fecha    ON facturas(fecha);

-- ─── factura_lineas ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS factura_lineas (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    factura_id       UUID NOT NULL REFERENCES facturas(id),
    historial_id     UUID REFERENCES historial_clinico(id),
    concepto         VARCHAR(200) NOT NULL,
    concepto_ficticio VARCHAR(200),
    cantidad         SMALLINT NOT NULL DEFAULT 1,
    precio_unitario  NUMERIC(10,2) NOT NULL,
    iva_porcentaje   NUMERIC(4,2) NOT NULL,
    subtotal         NUMERIC(10,2) NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ
);

-- ─── cobros ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cobros (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    factura_id    UUID NOT NULL REFERENCES facturas(id),
    fecha         TIMESTAMPTZ NOT NULL,
    importe       NUMERIC(10,2) NOT NULL,
    forma_pago_id UUID NOT NULL REFERENCES formas_pago(id),
    usuario_id    UUID NOT NULL REFERENCES usuarios(id),
    notas         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ
);

-- ─── referencias ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referencias (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre     VARCHAR(100) NOT NULL,
    color      VARCHAR(7),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ
);

-- ─── paciente_referencias (M2M) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS paciente_referencias (
    paciente_id  UUID NOT NULL REFERENCES pacientes(id),
    referencia_id UUID NOT NULL REFERENCES referencias(id),
    PRIMARY KEY (paciente_id, referencia_id)
);

-- ─── consentimientos ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consentimientos (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    paciente_id      UUID NOT NULL REFERENCES pacientes(id),
    tipo             VARCHAR(100) NOT NULL,
    fecha_firma      DATE NOT NULL,
    documento_path   VARCHAR(500),
    revocado         BOOLEAN NOT NULL DEFAULT false,
    fecha_revocacion DATE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_consentimientos_paciente ON consentimientos(paciente_id);

-- ─── audit_log (INSERT ONLY — RGPD) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL PRIMARY KEY,
    usuario_id  UUID REFERENCES usuarios(id),
    accion      VARCHAR(10) NOT NULL,
    tabla       VARCHAR(50) NOT NULL,
    registro_id UUID,
    datos_antes JSONB,
    datos_despues JSONB,
    ip          VARCHAR(45),
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_audit_log_timestamp ON audit_log(timestamp);

-- ─── Seed: formas de pago base ───────────────────────────────────────────────
INSERT INTO formas_pago (nombre, activo, created_at)
SELECT nombre, true, now()
FROM (VALUES ('Efectivo'), ('Tarjeta'), ('Transferencia'), ('Financiado')) AS t(nombre)
WHERE NOT EXISTS (SELECT 1 FROM formas_pago LIMIT 1);
"""

DOWNGRADE_SQL = """
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS consentimientos CASCADE;
DROP TABLE IF EXISTS paciente_referencias CASCADE;
DROP TABLE IF EXISTS referencias CASCADE;
DROP TABLE IF EXISTS cobros CASCADE;
DROP TABLE IF EXISTS factura_lineas CASCADE;
DROP TABLE IF EXISTS facturas CASCADE;
DROP TABLE IF EXISTS formas_pago CASCADE;
DROP TABLE IF EXISTS trabajo_pendiente CASCADE;
DROP TABLE IF EXISTS presupuesto_lineas CASCADE;
DROP TABLE IF EXISTS presupuestos CASCADE;
DROP TABLE IF EXISTS historial_clinico CASCADE;
DROP TABLE IF EXISTS entidades_baremo CASCADE;
DROP TABLE IF EXISTS tratamientos_catalogo CASCADE;
DROP TABLE IF EXISTS familias_tratamiento CASCADE;
DROP TABLE IF EXISTS historial_faltas CASCADE;
DROP TABLE IF EXISTS citas_telefonear CASCADE;
DROP TABLE IF EXISTS citas CASCADE;
DROP TABLE IF EXISTS horarios_excepciones CASCADE;
DROP TABLE IF EXISTS horarios_doctor CASCADE;
DROP TABLE IF EXISTS pacientes CASCADE;
DROP SEQUENCE IF EXISTS pacientes_num_historial_seq;
DROP TABLE IF EXISTS usuarios CASCADE;
DROP TABLE IF EXISTS entidades CASCADE;
DROP TABLE IF EXISTS gabinetes CASCADE;
DROP TABLE IF EXISTS doctores CASCADE;
DROP TYPE IF EXISTS estado_factura;
DROP TYPE IF EXISTS tipo_factura;
DROP TYPE IF EXISTS estado_presupuesto;
DROP TYPE IF EXISTS tipo_falta;
DROP TYPE IF EXISTS estado_cita;
DROP TYPE IF EXISTS tipo_dia;
DROP TYPE IF EXISTS rol_usuario;
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
