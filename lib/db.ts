import { Pool, type QueryResult, type QueryResultRow } from "pg";

declare global {
  // Reuse the pool across Next.js hot reloads in development.
  var kaahuPostgresPool: Pool | undefined;
}

function createPool() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  const connectionUrl = new URL(databaseUrl);
  connectionUrl.searchParams.delete("sslmode");

  return new Pool({
    connectionString: connectionUrl.toString(),
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export function getDatabasePool() {
  if (!globalThis.kaahuPostgresPool) {
    globalThis.kaahuPostgresPool = createPool();
  }

  return globalThis.kaahuPostgresPool;
}

export function queryDatabase<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: readonly unknown[],
): Promise<QueryResult<Row>> {
  return getDatabasePool().query<Row>(text, values ? [...values] : undefined);
}
