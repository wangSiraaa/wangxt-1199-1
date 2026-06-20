import { Router } from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import { authMiddleware, AuthRequest, ROLES, requireRoles } from '../auth';
import { PACK_STATUS } from '../status';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res) => {
  const { status, stationId, scheduleType } = req.query;

  const where: any = {};
  if (status && typeof status === 'string') {
    where.status = status;
  }
  if (stationId && typeof stationId === 'string') {
    where.stationId = stationId;
  }
  if (scheduleType && typeof scheduleType === 'string') {
    where.scheduleType = scheduleType;
  }

  const schedules = await prisma.inventorySchedule.findMany({
    where,
    include: {
      batteryPack: {
        include: { alarms: { where: { handled: false }, take: 1 } },
      },
      station: { select: { id: true, name: true, code: true, capacity: true } },
      alarm: true,
      creator: { select: { id: true, realName: true, username: true } },
    },
    orderBy: [{ status: 'asc' }, { scheduledDate: 'desc' }],
  });

  const stats = {
    total: await prisma.inventorySchedule.count({ where }),
    pending: await prisma.inventorySchedule.count({ where: { ...where, status: 'PENDING' } }),
    inProgress: await prisma.inventorySchedule.count({ where: { ...where, status: 'IN_PROGRESS' } }),
    completed: await prisma.inventorySchedule.count({ where: { ...where, status: 'COMPLETED' } }),
    cancelled: await prisma.inventorySchedule.count({ where: { ...where, status: 'CANCELLED' } }),
  };

  res.json({ schedules, stats });
});

router.get('/:id', async (req: AuthRequest, res) => {
  const schedule = await prisma.inventorySchedule.findUnique({
    where: { id: req.params.id },
    include: {
      batteryPack: {
        include: {
          station: true,
          isolations: { where: { released: false }, take: 1 },
        },
      },
      station: true,
      alarm: true,
      creator: { select: { id: true, realName: true, username: true, phone: true } },
    },
  });
  if (!schedule) {
    return res.status(404).json({ error: '调度单不存在' });
  }
  res.json({ schedule });
});

const createScheduleSchema = z.object({
  scheduleType: z.enum(['REPLENISH', 'TRANSFER_OUT', 'TRANSFER_IN', 'RECALL', 'MAINTENANCE']),
  packId: z.string().min(1, '电池包ID不能为空'),
  stationId: z.string().min(1, '站点ID不能为空'),
  alarmId: z.string().optional(),
  quantity: z.number().int().min(1).default(1),
  scheduledDate: z.string().min(1, '计划日期不能为空'),
  operatorRemark: z.string().optional(),
});

router.post('/', requireRoles(ROLES.DISPATCH, ROLES.ADMIN), async (req: AuthRequest, res) => {
  try {
    const data = createScheduleSchema.parse(req.body);
    const userId = req.user!.id;

    const pack = await prisma.batteryPack.findUnique({ where: { id: data.packId } });
    if (!pack) {
      return res.status(404).json({ error: '电池包不存在' });
    }

    const station = await prisma.station.findUnique({ where: { id: data.stationId } });
    if (!station) {
      return res.status(404).json({ error: '目标站点不存在' });
    }

    const count = await prisma.inventorySchedule.count();
    const scheduleNo = `SCH${Date.now()}${String(count + 1).padStart(4, '0')}`;

    const schedule = await prisma.$transaction(async (tx) => {
      const newSchedule = await tx.inventorySchedule.create({
        data: {
          id: crypto.randomUUID(),
          scheduleNo,
          scheduleType: data.scheduleType,
          packId: data.packId,
          stationId: data.stationId,
          alarmId: data.alarmId,
          quantity: data.quantity,
          scheduledDate: new Date(data.scheduledDate),
          status: 'PENDING',
          createdBy: userId,
          operatorRemark: data.operatorRemark,
        },
      });

      if (data.scheduleType !== undefined || true) {
        const protectedStatuses = [PACK_STATUS.LOCKED, PACK_STATUS.ISOLATED];
        if (!protectedStatuses.includes(pack.currentStatus as any)) {
          const oldStatus = pack.currentStatus;
          await tx.batteryPack.update({
            where: { id: data.packId },
            data: { currentStatus: PACK_STATUS.IN_TRANSIT },
          });

          await tx.statusTrajectory.create({
            data: {
              id: crypto.randomUUID(),
              packId: data.packId,
              oldStatus,
              newStatus: PACK_STATUS.IN_TRANSIT,
              operatorId: userId,
              operation: `调度发起-${data.scheduleType}`,
              remark: data.operatorRemark,
              relatedScheduleId: newSchedule.id,
              relatedAlarmId: data.alarmId,
            },
          });
        }
      }

      return newSchedule;
    });

    const result = await prisma.inventorySchedule.findUnique({
      where: { id: schedule.id },
      include: {
        batteryPack: true,
        station: true,
        creator: { select: { id: true, realName: true } },
      },
    });

    res.json({ schedule: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Create schedule error:', error);
    res.status(500).json({ error: '创建调度单失败' });
  }
});

const updateScheduleSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  actualArrivalDate: z.string().optional(),
  operatorRemark: z.string().optional(),
  recipientRemark: z.string().optional(),
});

router.patch('/:id', requireRoles(ROLES.DISPATCH, ROLES.ADMIN, ROLES.DUTY), async (req: AuthRequest, res) => {
  try {
    const data = updateScheduleSchema.parse(req.body);
    const userId = req.user!.id;
    const scheduleId = req.params.id;

    const schedule = await prisma.inventorySchedule.findUnique({
      where: { id: scheduleId },
      include: { batteryPack: true },
    });
    if (!schedule) {
      return res.status(404).json({ error: '调度单不存在' });
    }

    const pack = schedule.batteryPack;
    const updateData: any = {};

    if (data.status !== undefined) updateData.status = data.status;
    if (data.actualArrivalDate !== undefined) {
      updateData.actualArrivalDate = new Date(data.actualArrivalDate);
    }
    if (data.operatorRemark !== undefined) updateData.operatorRemark = data.operatorRemark;
    if (data.recipientRemark !== undefined) updateData.recipientRemark = data.recipientRemark;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.inventorySchedule.update({
        where: { id: scheduleId },
        data: updateData,
      });

      if (data.status === 'COMPLETED') {
        const oldStatus = pack.currentStatus;
        let newStatus = PACK_STATUS.AVAILABLE;

        if (schedule.scheduleType === 'REPLENISH' || schedule.scheduleType === 'TRANSFER_IN') {
          if (pack.currentStatus === PACK_STATUS.LOCKED || pack.currentStatus === PACK_STATUS.ISOLATED) {
            newStatus = pack.currentStatus;
          } else {
            newStatus = PACK_STATUS.AVAILABLE;
          }

          await tx.batteryPack.update({
            where: { id: pack.id },
            data: {
              currentStatus: newStatus,
              stationId: schedule.stationId,
            },
          });

          await tx.statusTrajectory.create({
            data: {
              id: crypto.randomUUID(),
              packId: pack.id,
              oldStatus,
              newStatus,
              operatorId: userId,
              operation: `调度到货-${schedule.scheduleType}`,
              remark: `到站签收。${newStatus !== PACK_STATUS.AVAILABLE ? '保留原告警/隔离状态，未覆盖' : '恢复可用状态'}`,
              relatedScheduleId: scheduleId,
            },
          });
        } else if (schedule.scheduleType === 'RECALL' || schedule.scheduleType === 'MAINTENANCE') {
          newStatus = PACK_STATUS.MAINTENANCE;
          await tx.batteryPack.update({
            where: { id: pack.id },
            data: { currentStatus: newStatus },
          });
          await tx.statusTrajectory.create({
            data: {
              id: crypto.randomUUID(),
              packId: pack.id,
              oldStatus,
              newStatus,
              operatorId: userId,
              operation: `调度完成-${schedule.scheduleType}`,
              remark: data.recipientRemark,
              relatedScheduleId: scheduleId,
            },
          });
        }
      }

      if (data.status === 'CANCELLED') {
        if (pack.currentStatus === PACK_STATUS.IN_TRANSIT) {
          await tx.batteryPack.update({
            where: { id: pack.id },
            data: { currentStatus: PACK_STATUS.AVAILABLE },
          });
          await tx.statusTrajectory.create({
            data: {
              id: crypto.randomUUID(),
              packId: pack.id,
              oldStatus: pack.currentStatus,
              newStatus: PACK_STATUS.AVAILABLE,
              operatorId: userId,
              operation: '调度取消',
              remark: data.operatorRemark,
              relatedScheduleId: scheduleId,
            },
          });
        }
      }

      return tx.inventorySchedule.findUnique({
        where: { id: scheduleId },
        include: {
          batteryPack: true,
          station: true,
          creator: { select: { id: true, realName: true } },
        },
      });
    });

    res.json({ schedule: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Update schedule error:', error);
    res.status(500).json({ error: '更新调度单失败' });
  }
});

export default router;
