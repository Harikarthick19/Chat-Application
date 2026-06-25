import { query } from '../config/db';
import { User } from '../types';

export class UserRepository {
  static async createUser(
    username: string,
    email: string,
    passwordHash: string,
    registrationIp?: string
  ): Promise<User> {
    // Ensure column exists for backwards-compatibility without full DB rebuilds
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_ip VARCHAR(45);`);

    const sql = `
      INSERT INTO users (username, email, password_hash, registration_ip)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const res = await query(sql, [username, email, passwordHash, registrationIp || null]);
    return res.rows[0];
  }

  static async findByUsername(username: string): Promise<User | null> {
    const sql = `
      SELECT * FROM users
      WHERE username = $1;
    `;
    const res = await query(sql, [username]);
    return res.rows.length > 0 ? res.rows[0] : null;
  }

  static async findByEmail(email: string): Promise<User | null> {
    const sql = `
      SELECT * FROM users
      WHERE email = $1;
    `;
    const res = await query(sql, [email]);
    return res.rows.length > 0 ? res.rows[0] : null;
  }

  static async findById(id: string): Promise<User | null> {
    const sql = `
      SELECT * FROM users
      WHERE id = $1;
    `;
    const res = await query(sql, [id]);
    return res.rows.length > 0 ? res.rows[0] : null;
  }

  static async updateOnlineStatus(userId: string, isOnline: boolean): Promise<User | null> {
    const sql = `
      UPDATE users
      SET is_online = $2, last_seen = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;
    const res = await query(sql, [userId, isOnline]);
    return res.rows.length > 0 ? res.rows[0] : null;
  }

  static async updateProfile(
    userId: string,
    avatarUrl?: string | null,
    bio?: string | null
  ): Promise<User | null> {
    const sql = `
      UPDATE users
      SET 
        avatar_url = $2,
        bio = $3
      WHERE id = $1
      RETURNING *;
    `;
    const res = await query(sql, [userId, avatarUrl, bio]);
    return res.rows.length > 0 ? res.rows[0] : null;
  }

  static async searchUsers(currentUserId: string, searchQuery: string): Promise<Omit<User, 'password_hash'>[]> {
    const sql = `
      SELECT id, username, email, avatar_url, bio, is_online, last_seen, created_at, updated_at
      FROM users
      WHERE id != $1 AND (username ILIKE $2 OR email ILIKE $2)
      ORDER BY username ASC
      LIMIT 20;
    `;
    const res = await query(sql, [currentUserId, `%${searchQuery}%`]);
    return res.rows;
  }

  static async countAccountsByIp(ip: string): Promise<number> {
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_ip VARCHAR(45);`);
    const sql = `
      SELECT COUNT(*)::INTEGER as count FROM users
      WHERE registration_ip = $1;
    `;
    const res = await query(sql, [ip]);
    return res.rows[0].count;
  }
}

