import { Router } from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import { authMiddleware, AuthRequest, ROLES, requireRoles } from '../auth';
import { updatePackStatus, PACK_STATUS } from '../status';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res) => {
  const { handled, level, packId, isThermal } = req.query;

  const where: any = {};
  if (handled !== undefined && typeof handled === 'string') {
    where.handled = handled === 'true';
  }
  if (level && typeof level === 'string') {
    where.alarmLevel = level;
  }
  if (packId && typeof packId === 'string') {
    where.packId = packId;
  }
  if (isThermal !== undefined && typeof isThermal === 'string') {
    where.isThermalRunawayRisk = isThermal === 'true';
  }

  const alarms = await prisma.alarm.findMany({
    where,
    include: {
      batteryPack: {
        include: { station: { select: { id: true, name: true } } },
      },
      registrant: { select: { id: true, realName: true, username: true } },
      handler: { select: { id: true, realName: true } },
      isolations: { take: 1, orderBy: { createdAt: 'desc' } },
    },
    orderBy: [{ isThermalRunawayRisk: 'desc' }, { createdAt: 'desc' }],
  });

  const stats = {
    total: await prisma.alarm.count({ where }),
    pending: await prisma.alarm.count({ where: { ...where, handled: false } }),
    thermal: await prisma.alarm.count({ where: { ...where, handled: false, isThermalRunawayRisk: true } }),
    handled: await prisma.alarm.count({ where: { ...where, handled: true } }),
  };

  res.json({ alarms, stats });
});

router.get('/:id', async (req: AuthRequest, res) => {
  const alarm = await prisma.alarm.findUnique({
    where: { id: req.params.id },
    include: {
      batteryPack: { include: { station: true } },
      registrant: { select: { id: true, realName: true, username: true, phone: true } },
      handler: { select: { id: true, realName: true, phone: true } },
      isolation: {
        include: {
          judge: { select: { id: true, realName: true } },
        },
      },
    },
  });
  if (!alarm) {
    return res.status(404).json({ error: '告警不存在' });
  }
  res.json({ alarm });
});

const createAlarmSchema = z.object({
  packId: z.string().min(1, '电池包ID不能为空'),
  alarmType: z.string().min(1, '告警类型不能为空'),
  alarmLevel: z.enum(['INFO', 'WARNING', 'CRITICAL', 'EMERGENCY']),
  description: z.string().optional(),
  isThermalRunawayRisk: z.boolean().default(false),
});

router.post('/', requireRoles(ROLES.DUTY, ROLES.ADMIN), async (req: AuthRequest, res) => {
  try {
    const data = createAlarmSchema.parse(req.body);
    const userId = req.user!.id;

    const pack = await prisma.batteryPack.findUnique({ where: { id: data.packId } });
    if (!pack) {
      return res.status(404).json({ error: '电池包不存在' });
    }

    const alarm = await prisma.$transaction(async (tx) => {
      const newAlarm = await tx.alarm.create({
        data: {
          id: crypto.randomUUID(),
          packId: data.packId,
          alarmType: data.alarmType,
          alarmLevel: data.alarmLevel,
          description: data.description,
          registeredBy: userId,
          isThermalRunawayRisk: data.isThermalRunawayRisk,
        },
      });

      const targetStatus = data.isThermalRunawayRisk ? PACK_STATUS.LOCKED : PACK_STATUS.ALARM;

      await tx.batteryPack.update({
        where: { id: data.packId },
        data: { currentStatus: targetStatus },
      });

      await tx.statusTrajectory.create({
        data: {
          id: crypto.randomUUID(),
          packId: data.packId,
          oldStatus: pack.currentStatus,
          newStatus: targetStatus,
          operatorId: userId,
          operation: data.isThermalRunawayRisk ? '热失控风险锁定' : '告警登记',
          remark: data.description,
          relatedAlarmId: newAlarm.id,
        },
      });

      return newAlarm;
    });

    const result = await prisma.alarm.findUnique({
      where: { id: alarm.id },
      include: { batteryPack: true, registrant: { select: { id: true, realName: true } } },
    });

    res.json({ alarm: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Create alarm error:', error);
    res.status(500).json({ error: '登记告警失败' });
  }
});

const handleAlarmSchema = z.object({
  handled: z.boolean(),
  remark: z.string().optional(),
});

router.patch('/:id/handle', requireRoles(ROLES.QC, ROLES.ADMIN), async (req: AuthRequest, res) => {
  try {
    const { handled, remark } = handleAlarmSchema.parse(req.body);
    const userId = req.user!.id;

    const alarm = await prisma.alarm.findUnique({ where: { id: req.params.id } });
    if (!alarm) {
      return res.status(404).json({ error: '告警不存在' });
    }

    const updated = await prisma.alarm.update({
      where: { id: req.params.id },
      data: {
        handled,
        handledAt: handled ? new Date() : null,
        handledBy: handled ? userId : null,
        remark,
      },
      include: {
        batteryPack: true,
        handler: { select: { id: true, realName: true } },
      },
    });

    res.json({ alarm: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: '处理告警失败' });
  }
});

export default router;
