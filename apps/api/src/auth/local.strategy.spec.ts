import { LocalStrategy } from './local.strategy';
import { AuthService } from './auth.service';

describe('LocalStrategy', () => {
  it('delegates validation to AuthService.validateUser', async () => {
    const authServiceMock = {
      validateUser: jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        username: 'alice',
        name: 'Alice',
      }),
    } as unknown as AuthService;
    const strategy = new LocalStrategy(authServiceMock);

    const result = await strategy.validate('a@b.com', 'password123');

    expect(authServiceMock.validateUser).toHaveBeenCalledWith(
      'a@b.com',
      'password123',
    );
    expect(result.username).toBe('alice');
  });
});
