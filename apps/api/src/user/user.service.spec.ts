import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UserService', () => {
  let service: UserService;
  let prisma: { user: { upsert: jest.Mock; findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { upsert: jest.fn(), findUnique: jest.fn() } };
    service = new UserService(prisma as unknown as PrismaService);
  });

  describe('upsertByProvider', () => {
    it('email/name이 있으면 그대로 upsert', async () => {
      const row = { id: 'u1' };
      prisma.user.upsert.mockResolvedValue(row);

      const result = await service.upsertByProvider({
        provider: 'google',
        providerId: 'g-123',
        email: 'a@b.com',
        name: '지우',
      });

      expect(result).toBe(row);
      expect(prisma.user.upsert).toHaveBeenCalledWith({
        where: { provider_providerId: { provider: 'google', providerId: 'g-123' } },
        create: { provider: 'google', providerId: 'g-123', email: 'a@b.com', name: '지우' },
        update: { email: 'a@b.com', name: '지우' },
      });
    });

    it('email/name이 없으면 null로 채워 upsert', async () => {
      prisma.user.upsert.mockResolvedValue({ id: 'u2' });

      await service.upsertByProvider({ provider: 'dev', providerId: 'd-1' });

      expect(prisma.user.upsert).toHaveBeenCalledWith({
        where: { provider_providerId: { provider: 'dev', providerId: 'd-1' } },
        create: { provider: 'dev', providerId: 'd-1', email: null, name: null },
        update: { email: null, name: null },
      });
    });
  });

  describe('findById', () => {
    it('id로 findUnique 호출', async () => {
      const row = { id: 'u1' };
      prisma.user.findUnique.mockResolvedValue(row);

      const result = await service.findById('u1');

      expect(result).toBe(row);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' } });
    });
  });
});
