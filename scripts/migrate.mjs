import { readFile, readdir } from 'fs/promises'
import path from 'path'
import postgres from 'postgres'

const databaseUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL
if (!databaseUrl) throw new Error('Set POSTGRES_URL or DATABASE_URL before running migrations')

const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  ...(process.env.NODE_ENV === 'production' ? { ssl: 'require' } : {}),
})

try {
  const root = path.join(process.cwd(), 'db', 'migrations')
  const migrations = (await readdir(root)).filter(name => name.endsWith('.sql')).sort()
  await sql`create table if not exists schema_migrations (
    migration_id text primary key,
    applied_at timestamptz not null default now()
  )`
  for (const migration of migrations) {
    const applied = await sql`select 1 from schema_migrations where migration_id = ${migration}`
    if (applied.length) continue
    const source = await readFile(path.join(root, migration), 'utf8')
    await sql.begin(async transaction => {
      await transaction.unsafe(source)
      await transaction`insert into schema_migrations (migration_id) values (${migration})`
    })
    process.stdout.write(`Applied ${migration}\n`)
  }
} finally {
  await sql.end()
}
