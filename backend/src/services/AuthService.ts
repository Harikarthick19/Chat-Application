import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserRepository } from '../repositories/UserRepository';
import { User, UserTokenPayload } from '../types';

export class AuthService {
  private static getJwtSecret(): string {
    return process.env.JWT_SECRET || 'chat_app_jwt_secret_key_extremely_secure_2026_xyz';
  }

  private static getJwtExpiration(): string {
    return process.env.JWT_EXPIRATION || '7d';
  }

  static generateToken(user: UserTokenPayload): string {
    return jwt.sign(user, this.getJwtSecret(), {
      expiresIn: this.getJwtExpiration() as any,
    });
  }

  static async register(username: string, email: string, password: string, registrationIp?: string) {
    // Check if email already exists
    const existingEmail = await UserRepository.findByEmail(email);
    if (existingEmail) {
      throw new Error('Email is already registered');
    }

    // Check if username already exists
    const existingUsername = await UserRepository.findByUsername(username);
    if (existingUsername) {
      throw new Error('Username is already taken');
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Save to DB
    const user = await UserRepository.createUser(username, email, passwordHash, registrationIp);

    const payload: UserTokenPayload = {
      id: user.id,
      username: user.username,
      email: user.email,
    };

    const token = this.generateToken(payload);

    const { password_hash, ...safeUser } = user;
    return { user: safeUser, token };
  }

  static async login(identifier: string, password: string) {
    // Find user by username or email
    let user = await UserRepository.findByEmail(identifier);
    if (!user) {
      user = await UserRepository.findByUsername(identifier);
    }

    if (!user) {
      throw new Error('Invalid username/email or password');
    }

    // Validate password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new Error('Invalid username/email or password');
    }

    const payload: UserTokenPayload = {
      id: user.id,
      username: user.username,
      email: user.email,
    };

    const token = this.generateToken(payload);

    const { password_hash, ...safeUser } = user;
    return { user: safeUser, token };
  }

  static async getUserProfile(userId: string) {
    const user = await UserRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const { password_hash, ...safeUser } = user;
    return safeUser;
  }
}
