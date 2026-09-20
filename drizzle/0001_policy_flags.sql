ALTER TABLE "inquiries" ADD COLUMN "buyer_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "staff_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "content_changed_at" timestamp with time zone;