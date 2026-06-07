import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { scryptSync } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  const prismaMock = {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    authSession: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('register should create user and return public data', async () => {
    prismaMock.user.create.mockResolvedValue({
      id: 1,
      email: 'rick@example.com',
      name: 'Rick',
      passwordHash: 'salt:hash',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.register({
      email: 'rick@example.com',
      password: 'password123',
      name: 'Rick',
    });

    expect(result.user).toEqual({
      id: 1,
      email: 'rick@example.com',
      name: 'Rick',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('register should throw conflict on duplicate email', async () => {
    prismaMock.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Duplicate email', {
        code: 'P2002',
        clientVersion: '6.16.0',
      }),
    );

    await expect(
      service.register({
        email: 'rick@example.com',
        password: 'password123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('login should return token and user for valid credentials', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-01T00:00:00.000Z');
    const salt = 'testsalt';
    const passwordHash = `${salt}:${scryptSync('password123', salt, 64).toString('hex')}`;

    prismaMock.user.findUnique.mockResolvedValue({
      id: 1,
      email: 'rick@example.com',
      name: 'Rick',
      passwordHash,
      createdAt,
      updatedAt,
    });
    prismaMock.authSession.create.mockResolvedValue({
      id: 1,
      token: 'token',
      userId: 1,
      createdAt,
      expiresAt: updatedAt,
    });

    const result = await service.login({
      email: 'rick@example.com',
      password: 'password123',
    });

    expect(typeof result.accessToken).toBe('string');
    expect(result.user).toEqual({
      id: 1,
      email: 'rick@example.com',
      name: 'Rick',
      createdAt,
      updatedAt,
    });
    expect(prismaMock.authSession.create).toHaveBeenCalledTimes(1);
  });

  it('login should throw unauthorized for invalid credentials', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 1,
      email: 'rick@example.com',
      name: 'Rick',
      passwordHash: 'bad:hash',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await expect(
      service.login({
        email: 'rick@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logout should delete session for valid token', async () => {
    prismaMock.authSession.deleteMany.mockResolvedValue({ count: 1 });

    const result = await service.logout('valid-token');

    expect(result).toEqual({ message: 'Logged out successfully' });
  });

  it('logout should throw unauthorized for invalid token', async () => {
    prismaMock.authSession.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.logout('invalid-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
