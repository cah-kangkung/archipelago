ALTER TABLE "api_tokens" ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();--> statement-breakpoint
ALTER TABLE "buildings" ALTER COLUMN "placed_at" SET DEFAULT clock_timestamp();--> statement-breakpoint
ALTER TABLE "ledger" ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();--> statement-breakpoint
ALTER TABLE "milestones" ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "updated_at" SET DEFAULT clock_timestamp();--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();--> statement-breakpoint
ALTER TABLE "milestones" ADD COLUMN "district_q" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "milestones" ADD COLUMN "district_r" integer NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "milestones_project_district_unique" ON "milestones" USING btree ("project_id","district_q","district_r");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_user_slot_unique" ON "projects" USING btree ("user_id","archipelago_x","archipelago_y");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_project_plot_unique" ON "tasks" USING btree ("project_id","plot_x","plot_y");