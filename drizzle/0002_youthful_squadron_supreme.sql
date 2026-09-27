ALTER TABLE "orders" ADD COLUMN "product_title_ko" text;--> statement-breakpoint
UPDATE "orders" AS o SET "product_title_ko" = p."title_ko" FROM "products" AS p WHERE o."product_id" = p."id" AND o."product_title_ko" IS NULL;
