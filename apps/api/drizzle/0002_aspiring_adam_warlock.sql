ALTER TABLE "ledger" ADD COLUMN "source_task_id" uuid;--> statement-breakpoint
ALTER TABLE "ledger" ADD COLUMN "streak_start" date;--> statement-breakpoint
ALTER TABLE "ledger" ADD COLUMN "streak_days" smallint;--> statement-breakpoint
CREATE INDEX "ledger_source_task_id_idx" ON "ledger" USING btree ("source_task_id");--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_streak_fields" CHECK (("ledger"."kind" = 'streak_bonus') = ("ledger"."streak_start" is not null and "ledger"."streak_days" is not null));