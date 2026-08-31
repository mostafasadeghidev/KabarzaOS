-- R-PEOPLE-01 — وضعیتِ عضو سه‌حالته می‌شود و جای بولینِ is_active را می‌گیرد.
-- تبدیل داده‌محافظ است: کاربرِ غیرفعالِ قبلی «قطع‌شده» می‌شود.
ALTER TABLE "users" ADD COLUMN "phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "member_state" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
UPDATE "users" SET "member_state" = 'locked' WHERE "is_active" = false;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "is_active";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_member_state_ck" CHECK ("users"."member_state" in ('active','finance','locked'));--> statement-breakpoint

-- دفاترِ یک نفر — چندتایی، با پرچمِ «تحتِ مدیریت».
CREATE TABLE "user_offices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"office_id" integer NOT NULL,
	"manages" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "user_offices" ADD CONSTRAINT "user_offices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_offices_uq" ON "user_offices" USING btree ("user_id","office_id");
