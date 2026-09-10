import { getMigrations } from 'better-auth/db/migration'
import { createHash } from 'node:crypto'
import type pg from 'pg'

import { authOptions } from './auth'
import type { ServerConfig } from './config'

const migrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE invoice_records (
        id uuid PRIMARY KEY,
        owner_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
        revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
        status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued')),
        data jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds', clock_timestamp()),
        updated_at timestamptz NOT NULL DEFAULT now(),
        issued_at timestamptz,
        template_version text,
        pdf bytea,
        pdf_sha256 text,
        issued_from_revision integer,
        idempotency_key text,
        initial_payload_hash text NOT NULL,
        UNIQUE (owner_id, idempotency_key),
        CHECK ((status = 'draft' AND issued_at IS NULL AND pdf IS NULL AND pdf_sha256 IS NULL AND template_version IS NULL AND issued_from_revision IS NULL)
          OR (status = 'issued' AND issued_at IS NOT NULL AND pdf IS NOT NULL AND pdf_sha256 IS NOT NULL AND template_version IS NOT NULL AND issued_from_revision IS NOT NULL))
      );
      CREATE INDEX invoice_owner_list ON invoice_records(owner_id, created_at DESC, id DESC);
      CREATE UNIQUE INDEX invoice_owner_reference ON invoice_records(owner_id, (data->>'reference')) WHERE status = 'issued';
      CREATE TABLE invoice_revisions (
        invoice_id uuid NOT NULL REFERENCES invoice_records(id) ON DELETE RESTRICT,
        revision integer NOT NULL,
        status text NOT NULL CHECK (status IN ('draft', 'issued')),
        data jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (invoice_id, revision)
      );
      CREATE TABLE invoice_counters (
        owner_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
        year integer NOT NULL CHECK (year BETWEEN 2000 AND 2099),
        last_number integer NOT NULL CHECK (last_number > 0),
        PRIMARY KEY (owner_id, year)
      );
      CREATE TABLE invoice_catalog (
        id uuid PRIMARY KEY,
        owner_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
        kind text NOT NULL CHECK (kind IN ('business', 'client', 'preset')),
        name text NOT NULL,
        revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
        data jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX invoice_catalog_owner ON invoice_catalog(owner_id, kind, updated_at DESC);
      CREATE FUNCTION invoice_record_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.status = 'issued' THEN RAISE EXCEPTION 'Issued invoices are immutable'; END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        IF NEW.owner_id <> OLD.owner_id OR NEW.id <> OLD.id OR NEW.revision <> OLD.revision + 1 THEN
          RAISE EXCEPTION 'Invoice identity and revision invariant violated';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER invoice_immutable BEFORE UPDATE OR DELETE ON invoice_records FOR EACH ROW EXECUTE FUNCTION invoice_record_guard();
      CREATE FUNCTION invoice_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Invoice revision history is immutable'; END $$;
      CREATE TRIGGER invoice_revision_immutable BEFORE UPDATE OR DELETE ON invoice_revisions FOR EACH ROW EXECUTE FUNCTION invoice_revision_guard();
    `,
  },
]

export async function migrate(database: pg.Pool, config: ServerConfig) {
  const client = await database.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(734865103)')
    const authMigration = await getMigrations(authOptions(database, config))
    if (authMigration.schemaProblems.length)
      throw new Error('Authentication schema requires manual repair before migration.')
    const authSQL = await authMigration.compileMigrations()
    if (authSQL.trim() !== ';') await client.query(authSQL)
    await client.query(`CREATE TABLE IF NOT EXISTS invoice_schema_migrations (
      version integer PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`)
    const applied = await client.query<{ version: number; checksum: string }>(
      'SELECT version, checksum FROM invoice_schema_migrations ORDER BY version',
    )
    for (const row of applied.rows) {
      const known = migrations.find((item) => item.version === row.version)
      if (!known || createHash('sha256').update(known.sql).digest('hex') !== row.checksum) {
        throw new Error(
          'Unknown or modified invoice migration; refusing to overwrite the active schema.',
        )
      }
    }
    for (const migration of migrations) {
      if (applied.rows.some((row) => row.version === migration.version)) continue
      await client.query(migration.sql)
      await client.query(
        'INSERT INTO invoice_schema_migrations(version, checksum) VALUES ($1, $2)',
        [migration.version, createHash('sha256').update(migration.sql).digest('hex')],
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
