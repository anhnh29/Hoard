import type { Profile } from 'passport-google-oauth20';
import { GoogleStrategy } from './google.strategy';
import { AuthService } from './auth.service';

describe('GoogleStrategy', () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    process.env.GOOGLE_CALLBACK_URL = 'http://localhost:3001/auth/google/callback';
  });

  it('finds or creates a user from the Google profile and calls done with it', async () => {
    const authServiceMock = {
      findOrCreateGoogleUser: jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'alice@example.com',
        username: 'alice',
        name: 'Alice',
      }),
    } as unknown as AuthService;
    const strategy = new GoogleStrategy(authServiceMock);
    const done = jest.fn();

    await strategy.validate(
      'access-token',
      'refresh-token',
      { emails: [{ value: 'alice@example.com' }], displayName: 'Alice' } as unknown as Profile,
      done,
    );

    expect(authServiceMock.findOrCreateGoogleUser).toHaveBeenCalledWith({
      email: 'alice@example.com',
      name: 'Alice',
    });
    expect(done).toHaveBeenCalledWith(null, {
      id: 'u1',
      email: 'alice@example.com',
      username: 'alice',
      name: 'Alice',
    });
  });

  it('calls done with an error when the Google profile has no email', async () => {
    const authServiceMock = { findOrCreateGoogleUser: jest.fn() } as unknown as AuthService;
    const strategy = new GoogleStrategy(authServiceMock);
    const done = jest.fn();

    await strategy.validate(
      'access-token',
      'refresh-token',
      { emails: [], displayName: 'Alice' } as unknown as Profile,
      done,
    );

    expect(authServiceMock.findOrCreateGoogleUser).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledWith(expect.any(Error), false);
  });
});
