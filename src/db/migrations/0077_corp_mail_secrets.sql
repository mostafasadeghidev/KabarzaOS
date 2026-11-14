CREATE TABLE IF NOT EXISTS "corp_mail_secrets" (
	"account_id" text PRIMARY KEY NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"secret_enc" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
