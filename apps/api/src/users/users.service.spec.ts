import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  const prismaMock = {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('create() delegates to prisma.user.create', async () => {
    const input = { email: 'a@b.com', passwordHash: 'hash', name: 'Alice', username: 'alice' };
    prismaMock.user.create.mockResolvedValue({ id: '1', ...input });

    const result = await service.create(input);

    expect(prismaMock.user.create).toHaveBeenCalledWith({ data: input });
    expect(result.id).toBe('1');
  });

  it('findByEmail() looks up by email', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const result = await service.findByEmail('missing@b.com');
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { email: 'missing@b.com' } });
    expect(result).toBeNull();
  });

  it('findByUsername() looks up by username', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await service.findByUsername('alice');
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { username: 'alice' } });
  });

  it('findById() looks up by id', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await service.findById('1');
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { id: '1' } });
  });

  it('updateProfile() updates name/bio', async () => {
    prismaMock.user.update.mockResolvedValue({ id: '1' });
    await service.updateProfile('1', { name: 'New Name', bio: 'New bio' });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { name: 'New Name', bio: 'New bio' },
    });
  });

  it('setHashedRefreshToken() updates the token column', async () => {
    prismaMock.user.update.mockResolvedValue({ id: '1' });
    await service.setHashedRefreshToken('1', 'hashed-token');
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { hashedRefreshToken: 'hashed-token' },
    });
  });
});
