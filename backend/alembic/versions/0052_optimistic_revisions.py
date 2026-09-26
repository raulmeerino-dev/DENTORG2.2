"""Row revisions catch stale ORM writes and raw SQL writers.

Revision ID: 0052
Revises: 0051
"""
from alembic import op

revision = "0052"
down_revision = "0051"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE FUNCTION increment_row_revision() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN NEW.revision := OLD.revision + 1; RETURN NEW; END $$;
        DO $$ DECLARE t record; BEGIN
            FOR t IN SELECT table_name FROM information_schema.columns
                WHERE table_schema = 'public' AND column_name IN ('created_at', 'updated_at')
                GROUP BY table_name HAVING count(*) = 2
            LOOP
                EXECUTE format('ALTER TABLE %I ADD COLUMN revision integer NOT NULL DEFAULT 1', t.table_name);
                EXECUTE format('CREATE TRIGGER row_revision BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION increment_row_revision()', t.table_name);
            END LOOP;
        END $$;
    """)


def downgrade():
    op.execute("""
        DO $$ DECLARE t record; BEGIN
            FOR t IN SELECT event_object_table AS name FROM information_schema.triggers
                WHERE trigger_schema = 'public' AND trigger_name = 'row_revision'
            LOOP
                EXECUTE format('DROP TRIGGER row_revision ON %I', t.name);
                EXECUTE format('ALTER TABLE %I DROP COLUMN revision', t.name);
            END LOOP;
        END $$;
        DROP FUNCTION increment_row_revision();
    """)
