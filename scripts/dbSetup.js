#!/usr/bin/env node

const dotenv = require("dotenv");
const postgres = require("postgres");

// Load base .env then override with environment-specific files if present
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });
dotenv.config({ path: ".env.development", override: true });
dotenv.config({ path: ".env.production", override: true });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("[db:setup] Missing DATABASE_URL env var. Please set it in your environment file.");
  process.exit(1);
}

let parsedUrl;
try {
  parsedUrl = new URL(databaseUrl);
} catch (error) {
  console.error(`[db:setup] Invalid DATABASE_URL: ${error.message}`);
  process.exit(1);
}

const databaseName = parsedUrl.pathname.replace(/^\//, "");
if (!databaseName) {
  console.error("[db:setup] DATABASE_URL does not include a database name.");
  process.exit(1);
}

const adminUrl = new URL(parsedUrl.toString());
adminUrl.pathname = "/postgres";

const createDatabaseIfMissing = async () => {
  const sql = postgres(adminUrl.toString(), { max: 1 });
  try {
    await sql`SELECT 1`;
  } catch (error) {
    console.error("[db:setup] Unable to connect to Postgres with provided credentials.");
    console.error(error.message);
    process.exit(1);
  }

  try {
    const existing = await sql`
      SELECT 1 FROM pg_database WHERE datname = ${databaseName}
    `;

    if (existing.length > 0) {
      console.log(`[db:setup] Database \"${databaseName}\" already exists.`);
      return;
    }

    const safeDbName = databaseName.replace(/"/g, '""');
    await sql.unsafe(`CREATE DATABASE "${safeDbName}"`);
    console.log(`[db:setup] Database \"${databaseName}\" created successfully.`);
  } catch (error) {
    console.error("[db:setup] Failed to create database:");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    try {
      await sql.end();
    } catch (error) {
      console.error("[db:setup] Failed to close admin connection:");
      console.error(error.message);
    }
  }
};

createDatabaseIfMissing().catch((error) => {
  console.error("[db:setup] Unexpected error:");
  console.error(error);
  process.exit(1);
});
