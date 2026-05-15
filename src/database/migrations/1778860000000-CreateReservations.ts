import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReservations1778860000000 implements MigrationInterface {
  name = 'CreateReservations1778860000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "reservations" (
        "id"          uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "userId"      uuid        NOT NULL,
        "itemId"      uuid        NOT NULL,
        "createdAt"   TIMESTAMP   NOT NULL DEFAULT now(),
        "fulfilledAt" TIMESTAMP WITH TIME ZONE,
        "cancelledAt" TIMESTAMP WITH TIME ZONE,
        "expiresAt"   TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_reservations" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_reservations_itemId" ON "reservations" ("itemId")`);
    await queryRunner.query(`CREATE INDEX "IDX_reservations_userId" ON "reservations" ("userId")`);
    await queryRunner.query(`
      ALTER TABLE "reservations"
        ADD CONSTRAINT "FK_reservations_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        ADD CONSTRAINT "FK_reservations_itemId" FOREIGN KEY ("itemId")
          REFERENCES "items"("id") ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reservations" DROP CONSTRAINT "FK_reservations_itemId"`);
    await queryRunner.query(`ALTER TABLE "reservations" DROP CONSTRAINT "FK_reservations_userId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_reservations_userId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_reservations_itemId"`);
    await queryRunner.query(`DROP TABLE "reservations"`);
  }
}
