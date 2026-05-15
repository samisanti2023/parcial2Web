# Library Loans API

Sistema de préstamos de biblioteca — ISIS 3710 Parcial 2.

## Arranque

```bash
cp .env.example .env          # 1. Variables de entorno
docker compose up -d          # 2. PostgreSQL en Docker (puerto 5433)
npm install                   # 3. Dependencias
npm run migration:run         # 4. Migraciones
npm run start:dev             # 5. Servidor en modo desarrollo
```

Swagger UI en **http://localhost:3000/api/docs**

## Tests

```bash
npm test            # tests unitarios
npm run test:cov    # con reporte de cobertura
```

## Credenciales de prueba

No hay seed automático. Registra un usuario con `POST /auth/register` y luego
eleva su rol en BD si necesitas `admin`:

```sql
UPDATE users SET role = 'admin' WHERE email = 'tu@email.com';
```

`POST /auth/register` siempre crea usuarios con `role = member`.

## Decisión: transición automática a `overdue` (R5)

La transición `active → overdue` **se persiste en BD al momento de leer**:

- `GET /loans` ejecuta `UPDATE loans SET status = 'overdue' WHERE status = 'active' AND dueAt < now()` antes de retornar.
- `GET /loans/:id` actualiza el registro individual si aplica.

**Ventaja:** el estado en BD es siempre consistente sin un job cron externo; R2/R3 (que usan `IN [active, overdue]`) funcionan correctamente.  
**Trade-off:** cada lectura genera una escritura. Para cargas altas se recomendaría un job cron dedicado.

## Bonos implementados

### B1 — Cola FIFO de reservas (+8%)

Nueva entidad `Reservation` (tabla `reservations`) y endpoints:

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/reservations` | Reservar item ya prestado |
| `GET` | `/reservations` | Propias para `member`; todas para `admin`/`librarian` |
| `DELETE` | `/reservations/:id` | Cancelar reserva |

Reglas implementadas:

- **R-B1.1** — Un usuario no puede tener más de 1 reserva activa por item.
- **R-B1.2** — Al devolver (`PATCH /loans/:id/return`) se hace `fulfilledAt = now()` y `expiresAt = now() + 48h` en la primera reserva pendiente.
- **R-B1.3** — Las reservas con `expiresAt < now()` se ignoran en la cola.
- **R-B1.4** — Al crear un préstamo con reservas activas para ese item, solo el primero en cola puede tomarlo; otros reciben `403 Forbidden`.

---

## Qué incluye este scaffold

- **NestJS 10** inicializado.
- **Docker Compose** con Postgres 16-alpine.
- **`ConfigModule`** con validación Joi al arranque (todas las variables requeridas están en `.env.example`).
- **`ValidationPipe`** global con `whitelist`, `forbidNonWhitelisted`, `transform`.
- **Swagger UI** montado en `/api/docs`.
- **Módulo `health`** con `/api/health/live` y `/api/health/ready` como referencia mínima de un módulo NestJS.
- **`@Public()` decorator** en [src/common/decorators/public.decorator.ts](src/common/decorators/public.decorator.ts) listo para usar cuando implementes auth.
- **CLI de TypeORM** configurado en [src/database/data-source.ts](src/database/data-source.ts) — corre `npm run migration:generate` para crear migraciones.

## Qué NO incluye (lo implementas tú)

- Módulo `auth` (entidad `User`, register, login, JWT strategy, guards).
- Entidades `Item` y `Loan`.
- Cualquier migración.
- Tests.

Ver el enunciado para los pesos exactos de cada parte.

## Arranque rápido

```bash
# 1) Variables de entorno
cp .env.example .env

# 2) Base de datos
docker compose up -d

# 3) Dependencias
npm install

# 4) Build
npm run build

# 5) Arrancar la app en modo desarrollo
npm run start:dev
```

Abre [http://localhost:3000/api/docs](http://localhost:3000/api/docs) y deberías ver el Swagger UI con el módulo `health` ya disponible.

## Scripts disponibles

| Script | Descripción |
|---|---|
| `npm run start:dev` | Arranca con hot reload. |
| `npm run start:prod` | Arranca el build de producción (requiere `npm run build` antes). |
| `npm run build` | Compila TypeScript a `dist/`. |
| `npm run lint` | ESLint con autofix. |
| `npm run format` | Prettier. |
| `npm test` | Tests unitarios. |
| `npm run test:cov` | Tests con coverage. |
| `npm run test:e2e` | Tests e2e con `jest-e2e.json`. |
| `npm run migration:generate src/database/migrations/NombreDeLaMigracion` | Genera migración a partir del diff entre entidades y BD. |
| `npm run migration:run` | Aplica migraciones pendientes. |
| `npm run migration:revert` | Revierte la última migración. |

## Estructura

```
library-loans-scaffold/
├── docker-compose.yml          # Postgres 16-alpine
├── .env.example                # plantilla de variables (cópiala a .env)
├── package.json
├── tsconfig.json
├── nest-cli.json
├── src/
│   ├── main.ts                 # bootstrap: ValidationPipe + Swagger + /api prefix
│   ├── app.module.ts           # ConfigModule + TypeOrmModule + HealthModule
│   ├── config/
│   │   ├── configuration.ts    # AppConfig interface + factory
│   │   └── validation.schema.ts # Joi schema
│   ├── database/
│   │   ├── data-source.ts      # DataSource para CLI de TypeORM
│   │   └── migrations/         # (vacío — aquí van tus migraciones)
│   ├── common/
│   │   └── decorators/
│   │       └── public.decorator.ts
│   └── modules/
│       └── health/
│           ├── health.module.ts
│           └── health.controller.ts
└── test/
    └── jest-e2e.json
```

## Aliases de path

Configurados en `tsconfig.json` para imports limpios:

```typescript
import { ItemsModule } from '@modules/items/items.module';
import { Public } from '@common/decorators/public.decorator';
import configuration from '@config/configuration';
import { AppDataSource } from '@database/data-source';
```

## Configuración: variables que el scaffold ya valida

El `validationSchema` de Joi exige al arranque:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (todas requeridas, sin defaults).
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (mínimo 32 caracteres).
- `BCRYPT_SALT_ROUNDS` (4-15, default 10).
- `MAX_ACTIVE_LOANS` (default 3), `DAILY_FINE_RATE` (default 0.50), `MAX_LOAN_DAYS` (default 30) — usadas por las reglas de negocio que implementarás (ver enunciado §4.4).

Si falta alguna requerida o no cumple el formato, la app **falla al arrancar** con un mensaje claro.

## Siguiente paso

Lee el enunciado completo:

```bash
open ../meditrack-api/docs/enunciado-parcial.md
```

Empieza por implementar la entidad `User` y el módulo `auth` (§4.1 del enunciado). Sin auth, los demás endpoints no se pueden probar.

¡Éxitos!
