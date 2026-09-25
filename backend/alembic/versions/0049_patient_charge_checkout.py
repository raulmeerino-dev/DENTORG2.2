"""Separate patient charges from invoices; preserve historical cash movements.
Revision ID: 0049
Revises: 0048
"""

from alembic import op

revision = "0049"
down_revision = "0048"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
CREATE TABLE IF NOT EXISTS cargos_paciente (
	paciente_id UUID NOT NULL,
	clinica_id UUID,
	historial_id UUID,
	factura_id UUID,
	factura_legacy_id UUID,
	factura_linea_id UUID,
	cita_id UUID,
	doctor_id UUID,
	tratamiento_id UUID,
	presupuesto_linea_id UUID,
	concepto VARCHAR(250) NOT NULL,
	fecha DATE NOT NULL,
	pieza_dental INTEGER,
	caras VARCHAR(10),
	base NUMERIC(12, 2),
	iva_porcentaje NUMERIC(5, 2) NOT NULL,
	descuento_porcentaje NUMERIC(5, 2) NOT NULL,
	importe NUMERIC(12, 2),
	motivo_cero VARCHAR(500),
	estado VARCHAR(20) NOT NULL,
	origen VARCHAR(30) NOT NULL,
	id UUID DEFAULT uuid_generate_v4() NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE,
	PRIMARY KEY (id),
	CONSTRAINT ck_cargo_importe CHECK (importe IS NULL OR importe >= 0),
	FOREIGN KEY(paciente_id) REFERENCES pacientes (id),
	FOREIGN KEY(clinica_id) REFERENCES clinicas (id),
	UNIQUE (historial_id),
	FOREIGN KEY(historial_id) REFERENCES historial_clinico (id),
	FOREIGN KEY(factura_id) REFERENCES facturas (id),
	UNIQUE (factura_legacy_id),
	FOREIGN KEY(factura_legacy_id) REFERENCES facturas (id),
	UNIQUE (factura_linea_id),
	FOREIGN KEY(factura_linea_id) REFERENCES factura_lineas (id),
	FOREIGN KEY(cita_id) REFERENCES citas (id),
	FOREIGN KEY(doctor_id) REFERENCES doctores (id),
	FOREIGN KEY(tratamiento_id) REFERENCES tratamientos_catalogo (id),
	FOREIGN KEY(presupuesto_linea_id) REFERENCES presupuesto_lineas (id)
)
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_cargos_paciente_cita_id ON cargos_paciente (cita_id)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_cargos_paciente_clinica_id ON cargos_paciente (clinica_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_cargos_paciente_factura_id ON cargos_paciente (factura_id)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_cargos_paciente_fecha ON cargos_paciente (fecha)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_cargos_paciente_paciente_id ON cargos_paciente (paciente_id)"
    )
    op.execute("""
CREATE TABLE IF NOT EXISTS aplicaciones_pago (
	cargo_id UUID NOT NULL,
	cobro_id UUID,
	anticipo_id UUID,
	importe NUMERIC(12, 2) NOT NULL,
	id UUID DEFAULT uuid_generate_v4() NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE,
	PRIMARY KEY (id),
	CONSTRAINT ck_aplicacion_importe CHECK (importe > 0),
	CONSTRAINT ck_aplicacion_origen CHECK ((cobro_id IS NULL) <> (anticipo_id IS NULL)),
	CONSTRAINT uq_aplicacion_cobro_cargo UNIQUE (cargo_id, cobro_id),
	CONSTRAINT uq_aplicacion_anticipo_cargo UNIQUE (cargo_id, anticipo_id),
	FOREIGN KEY(cargo_id) REFERENCES cargos_paciente (id),
	FOREIGN KEY(cobro_id) REFERENCES cobros (id),
	FOREIGN KEY(anticipo_id) REFERENCES pagos_anticipados_paciente (id)
)
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_aplicaciones_pago_anticipo_id ON aplicaciones_pago (anticipo_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_aplicaciones_pago_cargo_id ON aplicaciones_pago (cargo_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_aplicaciones_pago_cobro_id ON aplicaciones_pago (cobro_id)"
    )
    op.execute("""
CREATE TABLE IF NOT EXISTS operaciones_checkout (
	paciente_id UUID NOT NULL,
	clinica_id UUID,
	usuario_id UUID NOT NULL,
	fingerprint VARCHAR(64) NOT NULL,
	resultado JSONB NOT NULL,
	motivo TEXT,
	id UUID DEFAULT uuid_generate_v4() NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE,
	PRIMARY KEY (id),
	FOREIGN KEY(paciente_id) REFERENCES pacientes (id),
	FOREIGN KEY(clinica_id) REFERENCES clinicas (id),
	FOREIGN KEY(usuario_id) REFERENCES usuarios (id)
)
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_operaciones_checkout_paciente_id ON operaciones_checkout (paciente_id)"
    )
    op.execute("ALTER TABLE cobros ALTER COLUMN factura_id DROP NOT NULL")
    op.execute(
        "ALTER TABLE cobros ADD COLUMN IF NOT EXISTS paciente_id uuid REFERENCES pacientes(id)"
    )
    op.execute(
        "ALTER TABLE cobros ADD COLUMN IF NOT EXISTS clinica_id uuid REFERENCES clinicas(id)"
    )
    op.execute("ALTER TABLE cobros ADD COLUMN IF NOT EXISTS request_id uuid")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_cobros_request_id ON cobros(request_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_cobros_paciente_id ON cobros(paciente_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_cobros_clinica_id ON cobros(clinica_id)")
    op.execute(
        "UPDATE cobros c SET paciente_id=f.paciente_id, clinica_id=f.clinica_id FROM facturas f WHERE c.factura_id=f.id AND c.paciente_id IS NULL"
    )
    # Snapshot legacy totals, without reissuing invoices or altering a received payment.
    op.execute("""
      INSERT INTO cargos_paciente (paciente_id,clinica_id,factura_id,factura_legacy_id,concepto,fecha,base,iva_porcentaje,descuento_porcentaje,importe,estado,origen)
      SELECT paciente_id,clinica_id,id,id,'Factura '||serie||'-'||numero,fecha,subtotal,0,0,total,
             CASE WHEN estado='anulada' THEN 'anulado' ELSE 'activo' END,'factura_historica'
      FROM facturas f WHERE NOT EXISTS (SELECT 1 FROM cargos_paciente g WHERE g.factura_id=f.id) ON CONFLICT (factura_legacy_id) DO NOTHING
    """)
    # Unbilled clinical acts retain their recorded price. Unknown historic prices
    # remain unvalued rather than inventing debt from today's catalogue tariff.
    op.execute("""
      INSERT INTO cargos_paciente (paciente_id,clinica_id,historial_id,cita_id,doctor_id,tratamiento_id,presupuesto_linea_id,concepto,fecha,pieza_dental,caras,base,iva_porcentaje,descuento_porcentaje,importe,motivo_cero,estado,origen)
      SELECT h.paciente_id,p.clinica_id,h.id,h.cita_id,h.doctor_id,h.tratamiento_id,h.presupuesto_linea_id,
             t.nombre,h.fecha,h.pieza_dental,h.caras,h.importe,t.iva_porcentaje,COALESCE(l.descuento_porcentaje,0),
             h.importe + round(h.importe*t.iva_porcentaje/100,2),
             CASE WHEN h.importe=0 THEN 'Importe cero conservado del historial' END,'activo','tratamiento'
      FROM historial_clinico h JOIN pacientes p ON p.id=h.paciente_id JOIN tratamientos_catalogo t ON t.id=h.tratamiento_id
      LEFT JOIN presupuesto_lineas l ON l.id=h.presupuesto_linea_id
      WHERE h.estado='realizado' AND h.factura_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM factura_lineas f WHERE f.historial_id=h.id)
      ON CONFLICT (historial_id) DO NOTHING
    """)
    op.execute("""
      INSERT INTO aplicaciones_pago (cargo_id,cobro_id,importe)
      SELECT cargo_id,id,applied FROM (
        SELECT g.id AS cargo_id,c.id,
          LEAST(c.importe,GREATEST(0,g.importe-COALESCE(SUM(c.importe) OVER (
            PARTITION BY c.factura_id ORDER BY c.fecha,c.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0))) AS applied
        FROM cobros c JOIN cargos_paciente g ON g.factura_legacy_id=c.factura_id
        WHERE c.importe>0 AND c.anulado_at IS NULL AND g.estado='activo'
      ) allocations WHERE applied>0 ON CONFLICT (cargo_id,cobro_id) DO NOTHING
    """)


def downgrade():
    # Never discard charges, allocations or idempotency receipts on app rollback.
    # A pre-0049 application cannot account for invoice-independent payments.
    raise RuntimeError(
        "0049 conserva datos económicos: restaurar la aplicación compatible, no eliminar el libro de cargos."
    )
