import { AuthController } from './auth.controller';

describe('AuthController', () => {
  let controller: AuthController;
  let auth: { login: jest.Mock; devLogin: jest.Mock };
  let users: { findById: jest.Mock };

  beforeEach(() => {
    auth = { login: jest.fn(), devLogin: jest.fn() };
    users = { findById: jest.fn() };
    controller = new AuthController(auth as any, users as any);
  });

  it('login: auth.login에 provider/token 위임', () => {
    auth.login.mockReturnValue('R');
    expect(controller.login({ provider: 'google', token: 't' })).toBe('R');
    expect(auth.login).toHaveBeenCalledWith('google', 't');
  });

  it('devLogin: body를 그대로 위임', () => {
    auth.devLogin.mockReturnValue('D');
    expect(controller.devLogin({ id: 'x' })).toBe('D');
    expect(auth.devLogin).toHaveBeenCalledWith({ id: 'x' });
  });

  it('devLogin: body가 없으면 빈 객체로 위임', () => {
    controller.devLogin(undefined as any);
    expect(auth.devLogin).toHaveBeenCalledWith({});
  });

  it('me: req.userId로 유저 조회', () => {
    users.findById.mockReturnValue('U');
    expect(controller.me({ userId: 'u1' } as any)).toBe('U');
    expect(users.findById).toHaveBeenCalledWith('u1');
  });
});
