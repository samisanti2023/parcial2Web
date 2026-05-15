import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterItems1778857039595 implements MigrationInterface {
  name = 'AlterItems1778857039595';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "items" DROP COLUMN "author"`);
    await queryRunner.query(`ALTER TABLE "items" DROP CONSTRAINT "UQ_efb1aea2faf7d0c2f69bf125373"`);
    await queryRunner.query(`ALTER TABLE "items" DROP COLUMN "isbn"`);
    await queryRunner.query(`ALTER TABLE "items" DROP COLUMN "description"`);
    await queryRunner.query(`ALTER TABLE "items" DROP COLUMN "totalCopies"`);
    await queryRunner.query(`ALTER TABLE "items" DROP COLUMN "availableCopies"`);
    await queryRunner.query(`TRUNCATE TABLE "items" CASCADE`);
    await queryRunner.query(`ALTER TABLE "items" ADD "code" character varying(32) NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "items" ADD CONSTRAINT "UQ_1b0a705ce0dc5430c020a0ec31f" UNIQUE ("code")`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."items_type_enum" AS ENUM('book', 'magazine', 'equipment')`,
    );
    await queryRunner.query(`ALTER TABLE "items" ADD "type" "public"."items_type_enum" NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_1b0a705ce0dc5430c020a0ec31" ON "items" ("code") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_1b0a705ce0dc5430c020a0ec31"`);
    await queryRunner.query(`ALTER TABLE "items" DROP COLUMN "type"`);
    await queryRunner.query(`DROP TYPE "public"."items_type_enum"`);
    await queryRunner.query(`ALTER TABLE "items" DROP CONSTRAINT "UQ_1b0a705ce0dc5430c020a0ec31f"`);
    await queryRunner.query(`ALTER TABLE "items" DROP COLUMN "code"`);
    await queryRunner.query(
      `ALTER TABLE "items" ADD "availableCopies" integer NOT NULL DEFAULT '1'`,
    );
    await queryRunner.query(`ALTER TABLE "items" ADD "totalCopies" integer NOT NULL DEFAULT '1'`);
    await queryRunner.query(`ALTER TABLE "items" ADD "description" text`);
    await queryRunner.query(`ALTER TABLE "items" ADD "isbn" character varying(20)`);
    await queryRunner.query(
      `ALTER TABLE "items" ADD CONSTRAINT "UQ_efb1aea2faf7d0c2f69bf125373" UNIQUE ("isbn")`,
    );
    await queryRunner.query(`ALTER TABLE "items" ADD "author" character varying(150) NOT NULL`);
  }
}
