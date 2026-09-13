ALTER TABLE "Notification" ADD COLUMN "businessKey" TEXT NOT NULL;
CREATE UNIQUE INDEX "Notification_businessKey_key" ON "Notification"("businessKey");
