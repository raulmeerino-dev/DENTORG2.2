"""Exercise the real 0049 backfill against pre-ledger fixture data."""

import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations


async def backfill_account_ledger(db):
    path = Path(__file__).resolve().parents[1] / "alembic/versions/0049_patient_charge_checkout.py"
    spec = importlib.util.spec_from_file_location("patient_account_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    await db.flush()
    connection = await db.connection()

    def upgrade(sync_connection):
        with Operations.context(MigrationContext.configure(sync_connection)):
            module.upgrade()

    await connection.run_sync(upgrade)
