import type { User } from '@prisma/client';
import type { AuthUser, PublicProfile } from '@hoard/shared';

export function toAuthUser(user: User): AuthUser {
  return { id: user.id, email: user.email, username: user.username, name: user.name };
}

export function toPublicProfile(user: User): PublicProfile {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
  };
}
