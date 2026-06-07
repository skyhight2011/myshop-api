import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const scryptAsync = promisify(scrypt);
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(registerDto: RegisterDto) {
    const passwordHash = await this.hashPassword(registerDto.password);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: registerDto.email,
          name: registerDto.name,
          passwordHash,
        },
      });

      return {
        user: this.toPublicUser(user),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A user with this email already exists');
      }

      throw error;
    }
  }

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValidPassword = await this.verifyPassword(
      loginDto.password,
      user.passwordHash,
    );

    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = randomBytes(32).toString('hex');
    await this.prisma.authSession.create({
      data: {
        token: accessToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      },
    });

    return {
      accessToken,
      user: this.toPublicUser(user),
    };
  }

  async logout(token: string) {
    const deletedSession = await this.prisma.authSession.deleteMany({
      where: { token },
    });

    if (deletedSession.count === 0) {
      throw new UnauthorizedException('Invalid token');
    }

    return { message: 'Logged out successfully' };
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;

    return `${salt}:${derivedKey.toString('hex')}`;
  }

  private async verifyPassword(
    password: string,
    storedPasswordHash: string,
  ): Promise<boolean> {
    const [salt, hash] = storedPasswordHash.split(':');

    if (!salt || !hash) {
      return false;
    }

    const storedKey = Buffer.from(hash, 'hex');
    const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;

    if (storedKey.length !== derivedKey.length) {
      return false;
    }

    return timingSafeEqual(storedKey, derivedKey);
  }

  private toPublicUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
