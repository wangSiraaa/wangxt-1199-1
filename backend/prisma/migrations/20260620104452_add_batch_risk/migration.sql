-- AlterTable
ALTER TABLE "BatteryPack" ADD COLUMN "batchNo" TEXT;

-- CreateTable
CREATE TABLE "BatchRisk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchNo" TEXT NOT NULL,
    "riskType" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "abnormalCount" INTEGER NOT NULL DEFAULT 0,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "threshold" INTEGER NOT NULL DEFAULT 3,
    "description" TEXT,
    "triggerAlarmId" TEXT,
    "detectedBy" TEXT NOT NULL,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" DATETIME,
    "resolvedBy" TEXT,
    "scheduleSuggestion" TEXT,
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BatchRisk_detectedBy_fkey" FOREIGN KEY ("detectedBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BatchRisk_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BatchRisk_triggerAlarmId_fkey" FOREIGN KEY ("triggerAlarmId") REFERENCES "Alarm" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BatchRiskPack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchRiskId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "packStatus" TEXT NOT NULL,
    "alarmIds" TEXT,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BatchRiskPack_batchRiskId_fkey" FOREIGN KEY ("batchRiskId") REFERENCES "BatchRisk" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BatchRiskPack_packId_fkey" FOREIGN KEY ("packId") REFERENCES "BatteryPack" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BatchRiskSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchRiskId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "scheduleNo" TEXT NOT NULL,
    "suggestedBy" TEXT NOT NULL,
    "suggestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduleType" TEXT NOT NULL,
    "note" TEXT,
    CONSTRAINT "BatchRiskSchedule_batchRiskId_fkey" FOREIGN KEY ("batchRiskId") REFERENCES "BatchRisk" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BatchRiskSchedule_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "InventorySchedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BatchRiskSchedule_suggestedBy_fkey" FOREIGN KEY ("suggestedBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Alarm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packId" TEXT NOT NULL,
    "alarmType" TEXT NOT NULL,
    "alarmLevel" TEXT NOT NULL,
    "description" TEXT,
    "registeredBy" TEXT NOT NULL,
    "registeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isThermalRunawayRisk" BOOLEAN NOT NULL DEFAULT false,
    "handled" BOOLEAN NOT NULL DEFAULT false,
    "handledAt" DATETIME,
    "handledBy" TEXT,
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Alarm_packId_fkey" FOREIGN KEY ("packId") REFERENCES "BatteryPack" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Alarm_registeredBy_fkey" FOREIGN KEY ("registeredBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Alarm_handledBy_fkey" FOREIGN KEY ("handledBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Alarm" ("alarmLevel", "alarmType", "createdAt", "description", "handled", "handledAt", "handledBy", "id", "isThermalRunawayRisk", "packId", "registeredAt", "registeredBy", "remark", "updatedAt") SELECT "alarmLevel", "alarmType", "createdAt", "description", "handled", "handledAt", "handledBy", "id", "isThermalRunawayRisk", "packId", "registeredAt", "registeredBy", "remark", "updatedAt" FROM "Alarm";
DROP TABLE "Alarm";
ALTER TABLE "new_Alarm" RENAME TO "Alarm";
CREATE INDEX "Alarm_packId_idx" ON "Alarm"("packId");
CREATE INDEX "Alarm_alarmLevel_idx" ON "Alarm"("alarmLevel");
CREATE TABLE "new_InventorySchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleNo" TEXT NOT NULL,
    "scheduleType" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "alarmId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "scheduledDate" DATETIME NOT NULL,
    "actualArrivalDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdBy" TEXT NOT NULL,
    "operatorRemark" TEXT,
    "recipientRemark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventorySchedule_packId_fkey" FOREIGN KEY ("packId") REFERENCES "BatteryPack" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventorySchedule_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventorySchedule_alarmId_fkey" FOREIGN KEY ("alarmId") REFERENCES "Alarm" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventorySchedule_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_InventorySchedule" ("actualArrivalDate", "alarmId", "createdAt", "createdBy", "id", "operatorRemark", "packId", "quantity", "recipientRemark", "scheduleNo", "scheduleType", "scheduledDate", "stationId", "status", "updatedAt") SELECT "actualArrivalDate", "alarmId", "createdAt", "createdBy", "id", "operatorRemark", "packId", "quantity", "recipientRemark", "scheduleNo", "scheduleType", "scheduledDate", "stationId", "status", "updatedAt" FROM "InventorySchedule";
DROP TABLE "InventorySchedule";
ALTER TABLE "new_InventorySchedule" RENAME TO "InventorySchedule";
CREATE UNIQUE INDEX "InventorySchedule_scheduleNo_key" ON "InventorySchedule"("scheduleNo");
CREATE INDEX "InventorySchedule_stationId_idx" ON "InventorySchedule"("stationId");
CREATE INDEX "InventorySchedule_status_idx" ON "InventorySchedule"("status");
CREATE TABLE "new_Isolation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packId" TEXT NOT NULL,
    "alarmId" TEXT,
    "isolationReason" TEXT NOT NULL,
    "reasonDetail" TEXT,
    "judgedBy" TEXT NOT NULL,
    "judgedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "releasedAt" DATETIME,
    "releasedBy" TEXT,
    "releaseRemark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Isolation_packId_fkey" FOREIGN KEY ("packId") REFERENCES "BatteryPack" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Isolation_alarmId_fkey" FOREIGN KEY ("alarmId") REFERENCES "Alarm" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Isolation_judgedBy_fkey" FOREIGN KEY ("judgedBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Isolation_releasedBy_fkey" FOREIGN KEY ("releasedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Isolation" ("alarmId", "createdAt", "id", "isEmergency", "isolationReason", "judgedAt", "judgedBy", "packId", "reasonDetail", "releaseRemark", "released", "releasedAt", "releasedBy", "updatedAt") SELECT "alarmId", "createdAt", "id", "isEmergency", "isolationReason", "judgedAt", "judgedBy", "packId", "reasonDetail", "releaseRemark", "released", "releasedAt", "releasedBy", "updatedAt" FROM "Isolation";
DROP TABLE "Isolation";
ALTER TABLE "new_Isolation" RENAME TO "Isolation";
CREATE INDEX "Isolation_packId_idx" ON "Isolation"("packId");
CREATE INDEX "Isolation_released_idx" ON "Isolation"("released");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "BatchRisk_batchNo_idx" ON "BatchRisk"("batchNo");

-- CreateIndex
CREATE INDEX "BatchRisk_resolved_idx" ON "BatchRisk"("resolved");

-- CreateIndex
CREATE INDEX "BatchRisk_riskLevel_idx" ON "BatchRisk"("riskLevel");

-- CreateIndex
CREATE INDEX "BatchRiskPack_batchRiskId_idx" ON "BatchRiskPack"("batchRiskId");

-- CreateIndex
CREATE INDEX "BatchRiskPack_packId_idx" ON "BatchRiskPack"("packId");

-- CreateIndex
CREATE UNIQUE INDEX "BatchRiskPack_batchRiskId_packId_key" ON "BatchRiskPack"("batchRiskId", "packId");

-- CreateIndex
CREATE INDEX "BatchRiskSchedule_batchRiskId_idx" ON "BatchRiskSchedule"("batchRiskId");

-- CreateIndex
CREATE INDEX "BatchRiskSchedule_scheduleId_idx" ON "BatchRiskSchedule"("scheduleId");

-- CreateIndex
CREATE INDEX "BatteryPack_batchNo_idx" ON "BatteryPack"("batchNo");
