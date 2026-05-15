import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateItems1778811109110 implements MigrationInterface {
    name = 'CreateItems1778811109110'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(255) NOT NULL, "author" character varying(150) NOT NULL, "isbn" character varying(20), "description" text, "totalCopies" integer NOT NULL DEFAULT '1', "availableCopies" integer NOT NULL DEFAULT '1', "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_efb1aea2faf7d0c2f69bf125373" UNIQUE ("isbn"), CONSTRAINT "PK_ba5885359424c15ca6b9e79bcf6" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "items"`);
    }

}
