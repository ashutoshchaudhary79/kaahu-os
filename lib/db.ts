import { Pool, type QueryResult, type QueryResultRow } from "pg";

declare global {
  // Reuse the pool across Next.js hot reloads in development.
  var kaahuPostgresPool: Pool | undefined;
}

function createPool() {
  const configuredDatabaseUrl = process.env.DATABASE_URL;

  if (!configuredDatabaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  // Environment dashboards are often populated by pasting a complete .env
  // line rather than only its value. Accept both forms while keeping the
  // credential server-side and out of error messages.
  let databaseUrl = configuredDatabaseUrl.trim();
  if (databaseUrl.startsWith("DATABASE_URL=")) {
    databaseUrl = databaseUrl.slice("DATABASE_URL=".length).trim();
  }
  if (
    databaseUrl.length >= 2 &&
    ((databaseUrl.startsWith('"') && databaseUrl.endsWith('"')) ||
      (databaseUrl.startsWith("'") && databaseUrl.endsWith("'")))
  ) {
    databaseUrl = databaseUrl.slice(1, -1);
  }

  const connectionUrl = new URL(databaseUrl);
  connectionUrl.searchParams.delete("sslmode");

  return new Pool({
    connectionString: connectionUrl.toString(),
    ssl: { rejectUnauthorized: false },
    // Vercel can run several isolated function instances for one page load.
    // Keep each instance deliberately small so Supabase's serverless pool is
    // not exhausted when the four dashboard APIs and background sync overlap.
    max: process.env.VERCEL ? 1 : 5,
    idleTimeoutMillis: process.env.VERCEL ? 5_000 : 30_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
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
