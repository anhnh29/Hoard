import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = 'access-secret';
  });

  it('maps a JWT payload to an AuthUser', () => {
    const strategy = new JwtStrategy();
    const result = strategy.validate({
      sub: 'u1',
      email: 'a@b.com',
      username: 'alice',
      name: 'Alice',
    });
    expect(result).toEqual({
      id: 'u1',
      email: 'a@b.com',
      username: 'alice',
      name: 'Alice',
    });
  });
});
