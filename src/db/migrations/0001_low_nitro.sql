ALTER TABLE "project_payments" DROP CONSTRAINT "project_payments_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "project_payments" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_payments" ADD CONSTRAINT "project_payments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;