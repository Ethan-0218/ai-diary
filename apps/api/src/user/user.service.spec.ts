import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;
  let repo: { upsert: jest.Mock; findOneOrFail: jest.Mock; findOne: jest.Mock };

  beforeEach(() => {
    repo = { upsert: jest.fn(), findOneOrFail: jest.fn(), findOne: jest.fn() };
    service = new UserService(repo as any);
  });

  describe('upsertByProvider', () => {
    it('email/name이 있으면 그대로 upsert 후 조회', async () => {
      const row = { id: 'u1' };
      repo.upsert.mockResolvedValue({});
      repo.findOneOrFail.mockResolvedValue(row);

      const result = await service.upsertByProvider({
        provider: 'google',
        providerId: 'g-123',
        email: 'a@b.com',
        name: '지우',
      });

      expect(result).toBe(row);
      expect(repo.upsert).toHaveBeenCalledWith(
        { provider: 'google', providerId: 'g-123', email: 'a@b.com', name: '지우' },
        ['provider', 'providerId'],
      );
      expect(repo.findOneOrFail).toHaveBeenCalledWith({
        where: { provider: 'google', providerId: 'g-123' },
      });
    });

    it('email/name이 없으면 null로 채워 upsert', async () => {
      repo.upsert.mockResolvedValue({});
      repo.findOneOrFail.mockResolvedValue({ id: 'u2' });

      await service.upsertByProvider({ provider: 'dev', providerId: 'd-1' });

      expect(repo.upsert).toHaveBeenCalledWith(
        { provider: 'dev', providerId: 'd-1', email: null, name: null },
        ['provider', 'providerId'],
      );
    });
  });

  describe('findById', () => {
    it('id로 findOne 호출', async () => {
      const row = { id: 'u1' };
      repo.findOne.mockResolvedValue(row);
      expect(await service.findById('u1')).toBe(row);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'u1' } });
    });
  });
});
