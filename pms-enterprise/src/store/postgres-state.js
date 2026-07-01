import { createSeedData } from "./seed.js";
import { createRepository } from "./repository.js";

const STATE_KEY = "default";

function sslConfig() {
  if (process.env.PGSSLMODE === "disable") return false;
  return process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false };
}

export async function createPostgresRepository() {
  if (!process.env.DATABASE_URL) {
    return { repo: createRepository(), persistence: { enabled: false, save: async () => {} } };
  }

  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslConfig()
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pms_app_state (
      state_key text PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const result = await pool.query("SELECT data FROM pms_app_state WHERE state_key = $1", [STATE_KEY]);
  const initialState = result.rows[0]?.data || createSeedData();
  const repo = createRepository(initialState);

  if (!result.rows[0]) {
    await pool.query(
      "INSERT INTO pms_app_state (state_key, data) VALUES ($1, $2::jsonb)",
      [STATE_KEY, JSON.stringify(repo.state)]
    );
  }

  async function save() {
    await pool.query(
      `
        INSERT INTO pms_app_state (state_key, data, updated_at)
        VALUES ($1, $2::jsonb, now())
        ON CONFLICT (state_key)
        DO UPDATE SET data = EXCLUDED.data, updated_at = now()
      `,
      [STATE_KEY, JSON.stringify(repo.state)]
    );
  }

  return {
    repo,
    persistence: {
      enabled: true,
      save,
      close: () => pool.end()
    }
  };
}
