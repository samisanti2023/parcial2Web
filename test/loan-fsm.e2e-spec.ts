import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

async function bootstrapApp(): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
  return app;
}

describe('Loan FSM transitions (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let memberId: string;
  let itemCounter = 0;

  beforeAll(async () => {
    app = await bootstrapApp();

    const ds = app.get(DataSource);
    await ds.query(
      `TRUNCATE TABLE reservations, loans, items, refresh_tokens, users RESTART IDENTITY CASCADE`,
    );

    // Register member
    const memberRes = await request(app.getHttpServer()).post('/api/auth/register').send({
      email: 'fsm-member@e2e.com',
      password: 'Password123!',
      firstName: 'FSM',
      lastName: 'Member',
    });
    memberId = memberRes.body.user.id;
    const memberToken: string = memberRes.body.accessToken;

    // Create admin via users endpoint (no @Roles guard on UsersController.create)
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        email: 'fsm-admin@e2e.com',
        password: 'Password123!',
        firstName: 'FSM',
        lastName: 'Admin',
        role: 'admin',
      });

    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'fsm-admin@e2e.com', password: 'Password123!' });
    adminToken = adminLoginRes.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  // ── helpers ───────────────────────────────────────────────────────────────

  async function createItem(): Promise<string> {
    itemCounter += 1;
    const res = await request(app.getHttpServer())
      .post('/api/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `FSM-ITEM-${itemCounter}`, title: `Item ${itemCounter}`, type: 'book' });
    return res.body.id as string;
  }

  async function createActiveLoan(iid: string): Promise<string> {
    const dueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const res = await request(app.getHttpServer())
      .post('/api/loans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: memberId, itemId: iid, dueAt });
    return res.body.id as string;
  }

  async function loanInState(targetState: 'active' | 'returned' | 'lost'): Promise<string> {
    const iid = await createItem();
    const lid = await createActiveLoan(iid);
    if (targetState === 'returned') {
      await request(app.getHttpServer())
        .patch(`/api/loans/${lid}/return`)
        .set('Authorization', `Bearer ${adminToken}`);
    } else if (targetState === 'lost') {
      await request(app.getHttpServer())
        .patch(`/api/loans/${lid}/mark-lost`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
    return lid;
  }

  // ── valid transitions (2) ─────────────────────────────────────────────────

  it.each<[string, string, number]>([
    ['active', 'return', 200],
    ['active', 'mark-lost', 200],
  ])(
    'transición válida: %s → PATCH /%s devuelve %d',
    async (_fromState, action, expectedStatus) => {
      const lid = await loanInState('active');
      const res = await request(app.getHttpServer())
        .patch(`/api/loans/${lid}/${action}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(expectedStatus);
    },
  );

  // ── invalid transitions (3) ───────────────────────────────────────────────

  it.each<[string, string]>([
    ['returned', 'return'],
    ['returned', 'mark-lost'],
    ['lost', 'return'],
  ])('transición inválida: %s → PATCH /%s devuelve 400', async (fromState, action) => {
    const lid = await loanInState(fromState as 'returned' | 'lost');
    const res = await request(app.getHttpServer())
      .patch(`/api/loans/${lid}/${action}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});
