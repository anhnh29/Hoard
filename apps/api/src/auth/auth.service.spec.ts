import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

describe('AuthService', () => {
  let service: AuthService;
  const usersServiceMock = {
    findByEmail: jest.fn(),
    findByUsername: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    setHashedRefreshToken: jest.fn(),
  };
  const jwtServiceMock = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };

  const fakeUser = {
    id: 'u1',
    email: 'alice@example.com',
    name: 'Alice',
    username: 'alice',
    passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
    bio: null,
    avatarUrl: null,
    hashedRefreshToken: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.JWT_ACCESS_SECRET = 'access-secret';
    process.env.JWT_REFRESH_SECRET = 'refresh-secret';
    jwtServiceMock.signAsync.mockResolvedValue('signed-token');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersServiceMock },
        { provide: JwtService, useValue: jwtServiceMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('signup', () => {
    it('rejects a duplicate email', async () => {
      usersServiceMock.findByEmail.mockResolvedValue(fakeUser);

      await expect(
        service.signup({ email: 'alice@example.com', password: 'password123', name: 'Alice', username: 'alice2' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a duplicate username', async () => {
      usersServiceMock.findByEmail.mockResolvedValue(null);
      usersServiceMock.findByUsername.mockResolvedValue(fakeUser);

      await expect(
        service.signup({ email: 'new@example.com', password: 'password123', name: 'Alice', username: 'alice' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates the user with a bcrypt password hash and issues tokens', async () => {
      usersServiceMock.findByEmail.mockResolvedValue(null);
      usersServiceMock.findByUsername.mockResolvedValue(null);
      usersServiceMock.create.mockResolvedValue(fakeUser);

      const result = await service.signup({
        email: 'alice@example.com',
        password: 'password123',
        name: 'Alice',
        username: 'alice',
      });

      expect(usersServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'alice@example.com', name: 'Alice', username: 'alice' }),
      );
      const createCallArg = usersServiceMock.create.mock.calls[0][0];
      expect(createCallArg.passwordHash).not.toBe('password123');
      expect(result.user).toEqual({ id: 'u1', email: 'alice@example.com', username: 'alice', name: 'Alice' });
      expect(result.tokens.accessToken).toBe('signed-token');
      expect(usersServiceMock.setHashedRefreshToken).toHaveBeenCalledWith('u1', expect.any(String));
    });
  });

  describe('validateUser', () => {
    it('throws when email or password is missing, without touching the database', async () => {
      await expect(service.validateUser('', 'password123')).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(service.validateUser('alice@example.com', '')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(usersServiceMock.findByEmail).not.toHaveBeenCalled();
    });

    it('throws when the user does not exist', async () => {
      usersServiceMock.findByEmail.mockResolvedValue(null);
      await expect(service.validateUser('missing@example.com', 'password123')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws when the password does not match', async () => {
      usersServiceMock.findByEmail.mockResolvedValue(fakeUser);
      await expect(service.validateUser('alice@example.com', 'wrong-password')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    it('throws when the refresh token signature is invalid', async () => {
      jwtServiceMock.verifyAsync.mockRejectedValue(new Error('bad signature'));
      await expect(service.refresh('bad-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws when the stored hash does not match', async () => {
      jwtServiceMock.verifyAsync.mockResolvedValue({ sub: 'u1' });
      usersServiceMock.findById.mockResolvedValue({ ...fakeUser, hashedRefreshToken: null });
      await expect(service.refresh('some-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('clears the stored refresh token hash', async () => {
      await service.logout('u1');
      expect(usersServiceMock.setHashedRefreshToken).toHaveBeenCalledWith('u1', null);
    });
  });
});
