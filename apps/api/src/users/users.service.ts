import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
  username: string;
}

interface UpdateProfileInput {
  name?: string;
  bio?: string | null;
  avatarUrl?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateUserInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  updateProfile(id: string, data: UpdateProfileInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  setHashedRefreshToken(id: string, hashedRefreshToken: string | null): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { hashedRefreshToken } });
  }
}
