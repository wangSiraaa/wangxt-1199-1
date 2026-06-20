import prisma from './prisma';

export const PACK_STATUS = {
  AVAILABLE: 'AVAILABLE',
  IN_USE: 'IN_USE',
  CHARGING: 'CHARGING',
  ALARM: 'ALARM',
  ISOLATED: 'ISOLATED',
  LOCKED: 'LOCKED',
  IN_TRANSIT: 'IN_TRANSIT',
  MAINTENANCE: 'MAINTENANCE',
  SCRAPPED: 'SCRAPPED',
} as const;

export type PackStatusType = typeof PACK_STATUS[keyof typeof PACK_STATUS];

export interface TrajectoryParams {
  packId: string;
  oldStatus: string;
  newStatus: string;
  operatorId: string;
  operation: string;
  remark?: string;
  relatedAlarmId?: string;
  relatedIsolationId?: string;
  relatedScheduleId?: string;
}

export async function addStatusTrajectory(params: TrajectoryParams) {
  return prisma.statusTrajectory.create({
    data: {
      id: crypto.randomUUID(),
      packId: params.packId,
      oldStatus: params.oldStatus,
      newStatus: params.newStatus,
      operatorId: params.operatorId,
      operation: params.operation,
      remark: params.remark,
      relatedAlarmId: params.relatedAlarmId,
      relatedIsolationId: params.relatedIsolationId,
      relatedScheduleId: params.relatedScheduleId,
    },
  });
}

export async function updatePackStatus(
  packId: string,
  newStatus: PackStatusType,
  trajectoryParams: Omit<TrajectoryParams, 'oldStatus' | 'newStatus' | 'packId'>
) {
  const pack = await prisma.batteryPack.findUnique({
    where: { id: packId },
    select: { currentStatus: true },
  });

  if (!pack) {
    throw new Error('电池包不存在');
  }

  const oldStatus = pack.currentStatus;

  await Promise.all([
    prisma.batteryPack.update({
      where: { id: packId },
      data: { currentStatus: newStatus },
    }),
    addStatusTrajectory({
      packId,
      oldStatus,
      newStatus,
      ...trajectoryParams,
    }),
  ]);

  return { oldStatus, newStatus };
}
