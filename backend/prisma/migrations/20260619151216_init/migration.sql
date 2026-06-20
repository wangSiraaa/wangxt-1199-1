-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "realName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Station" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "capacity" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BatteryPack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packCode" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "currentStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "healthLevel" INTEGER NOT NULL,
    "stationId" TEXT,
    "location" TEXT,
    "cycleCount" INTEGER NOT NULL DEFAULT 0,
    "manufactureDate" DATETIME,
    "lastCheckDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BatteryPack_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Alarm" (
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
    CONSTRAINT "Alarm_registeredBy_fkey" FOREIGN KEY ("registeredBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Isolation" (
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
    CONSTRAINT "Isolation_judgedBy_fkey" FOREIGN KEY ("judgedBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Isolation_releasedBy_fkey" FOREIGN KEY ("releasedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventorySchedule" (
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
    CONSTRAINT "InventorySchedule_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StatusTrajectory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packId" TEXT NOT NULL,
    "oldStatus" TEXT NOT NULL,
    "newStatus" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "remark" TEXT,
    "relatedAlarmId" TEXT,
    "relatedIsolationId" TEXT,
    "relatedScheduleId" TEXT,
    "operatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StatusTrajectory_packId_fkey" FOREIGN KEY ("packId") REFERENCES "BatteryPack" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StatusTrajectory_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Station_code_key" ON "Station"("code");

-- CreateIndex
CREATE UNIQUE INDEX "BatteryPack_packCode_key" ON "BatteryPack"("packCode");

-- CreateIndex
CREATE INDEX "BatteryPack_currentStatus_idx" ON "BatteryPack"("currentStatus");

-- CreateIndex
CREATE INDEX "BatteryPack_stationId_idx" ON "BatteryPack"("stationId");

-- CreateIndex
CREATE INDEX "Alarm_packId_idx" ON "Alarm"("packId");

-- CreateIndex
CREATE INDEX "Alarm_alarmLevel_idx" ON "Alarm"("alarmLevel");

-- CreateIndex
CREATE INDEX "Isolation_packId_idx" ON "Isolation"("packId");

-- CreateIndex
CREATE INDEX "Isolation_released_idx" ON "Isolation"("released");

-- CreateIndex
CREATE UNIQUE INDEX "InventorySchedule_scheduleNo_key" ON "InventorySchedule"("scheduleNo");

-- CreateIndex
CREATE INDEX "InventorySchedule_stationId_idx" ON "InventorySchedule"("stationId");

-- CreateIndex
CREATE INDEX "InventorySchedule_status_idx" ON "InventorySchedule"("status");

-- CreateIndex
CREATE INDEX "StatusTrajectory_packId_idx" ON "StatusTrajectory"("packId");
