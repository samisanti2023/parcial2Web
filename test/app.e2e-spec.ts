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

describe('Full flow (e2e)', () => {
  let app: INestApplication;

  // shared state across sequential it() blocks
  let memberToken: string;
  let memberRefreshToken: string;
  let memberId: string;
  let adminToken: string;
  let itemId: string;
  let loanId: string;

  beforeAll(async () => {
    app = await bootstrapApp();

    const ds = app.get(DataSource);
    await ds.query(
      `TRUNCATE TABLE reservations, loans, items, refresh_tokens, users RESTART IDENTITY CASCADE`,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  // ── 1. Register ───────────────────────────────────────────────────────────
  it('POST /api/auth/register → 201 con accessToken, refreshToken y user', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/register').send({
      email: 'member@e2e.com',
      password: 'Password123!',
      firstName: 'Member',
      lastName: 'E2E',
    });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.id).toBeDefined();
    expect(res.body.user.role).toBe('member');

    memberToken = res.body.accessToken;
    memberRefreshToken = res.body.refreshToken;
    memberId = res.body.user.id;
  });

  // ── 2. Login ──────────────────────────────────────────────────────────────
  it('POST /api/auth/login → 200 con accessToken y refreshToken', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'member@e2e.com', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  // ── 2b. Refresh token stateful (B2) ───────────────────────────────────────
  it('POST /api/auth/refresh → renueva accessToken con refresh válido', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: memberRefreshToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  // ── 3. Create admin for item management ───────────────────────────────────
  it('POST /api/users → crea usuario admin (autenticado)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        email: 'admin@e2e.com',
        password: 'Password123!',
        firstName: 'Admin',
        lastName: 'E2E',
        role: 'admin',
      });

    expect(res.status).toBe(201);

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@e2e.com', password: 'Password123!' });
    adminToken = loginRes.body.accessToken;
  });

  // ── 4. Create item (requires admin) ───────────────────────────────────────
  it('POST /api/items → 201 con admin token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'BOOK-E2E-001', title: 'Clean Code', type: 'book' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    itemId = res.body.id;
  });

  // ── 5. Create loan ────────────────────────────────────────────────────────
  it('POST /api/loans → 201 con préstamo activo', async () => {
    const dueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const res = await request(app.getHttpServer())
      .post('/api/loans')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ userId: memberId, itemId, dueAt });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('active');
    loanId = res.body.id;
  });

  // ── 6. Return loan — verify fineAmount ────────────────────────────────────
  it('PATCH /api/loans/:id/return → respuesta incluye fineAmount numérico', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/loans/${loanId}/return`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('returned');
    expect(res.body).toHaveProperty('fineAmount');
    expect(parseFloat(res.body.fineAmount)).toBeGreaterThanOrEqual(0);
    // devuelto antes del vencimiento → multa = 0
    expect(parseFloat(res.body.fineAmount)).toBe(0);
  });

  // ── 7. Second return must fail ─────────────────────────────────────────────
  it('PATCH /api/loans/:id/return segunda vez → 400 (terminal state)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/loans/${loanId}/return`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(400);
  });
});
