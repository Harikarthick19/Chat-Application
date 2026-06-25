import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Railway provides DATABASE_URL; fall back to individual vars for local dev
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // required for Railway PostgreSQL
    })
  : new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_DATABASE,
      password: process.env.DB_PASSWORD || undefined,
      port: parseInt(process.env.DB_PORT || '5432'),
    });

pool.on('error', (err) => {
  console.error('Unexpected error on idle pg client', err);
});

export const query = (text: string, params?: any[]) => pool.query(text, params);

export const getClient = () => pool.connect();

// Run startup database schema migrations
(async () => {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_ip VARCHAR(45);`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_deletions (
        message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id    UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
        deleted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (message_id, user_id)
      );
    `);
    console.log("🎒 DB Migrations (registration_ip, message_deletions) checked/created successfully.");
  } catch (err) {
    console.error("❌ Error running database migrations on startup:", err);
  }
})();

export default pool;
