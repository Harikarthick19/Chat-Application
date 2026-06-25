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

// Auto-create full schema on startup (safe with IF NOT EXISTS — works on fresh Render DB too)
(async () => {
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    await pool.query(`
      CREATE OR REPLACE FUNCTION update_modified_column()
      RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = now(); RETURN NEW; END;
      $$ language 'plpgsql';
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        avatar_url VARCHAR(500),
        bio VARCHAR(255) DEFAULT 'Hello there! I am using this chat app.',
        is_online BOOLEAN DEFAULT FALSE,
        last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        registration_ip VARCHAR(45),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_modtime') THEN
          CREATE TRIGGER update_users_modtime BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
        END IF;
      END $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS chats (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        type VARCHAR(20) NOT NULL DEFAULT 'one-to-one',
        name VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_chats_modtime') THEN
          CREATE TRIGGER update_chats_modtime BEFORE UPDATE ON chats FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
        END IF;
      END $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS participants (
        chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (chat_id, user_id)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message_type VARCHAR(20) NOT NULL DEFAULT 'text',
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP WITH TIME ZONE
      );
    `);
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_messages_modtime') THEN
          CREATE TRIGGER update_messages_modtime BEFORE UPDATE ON messages FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
        END IF;
      END $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_status (
        message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'sent',
        status_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (message_id, user_id)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS media (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_url VARCHAR(500) NOT NULL,
        width INTEGER,
        height INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS voice_messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_url VARCHAR(500) NOT NULL,
        duration DECIMAL(6,2) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_deletions (
        message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        deleted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (message_id, user_id)
      );
    `);

    // Indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_participants_user_id ON participants(user_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_chat_id_created_at ON messages(chat_id, created_at DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_message_status_user_id_status ON message_status(user_id, status);`);

    // Safe column migrations
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_ip VARCHAR(45);`);
    await pool.query(`ALTER TABLE users ALTER COLUMN avatar_url TYPE VARCHAR(500);`);

    console.log('✅ Database schema auto-initialized successfully.');
  } catch (err) {
    console.error('❌ Error initializing database schema:', err);
  }
})();


export default pool;
