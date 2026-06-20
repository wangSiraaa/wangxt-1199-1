import { Router } from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import { authMiddleware, AuthRequest, ROLES, requireRoles } from '../auth';
import { PACK_STATUS } from '../status';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res) => {
  const { released, packId, stationId, isEmergency } = req.query;

  const where: any = {};
  if (released !== undefined && typeof released === 'string') {
    where.released = released === 'true';
  }
  if (packId && typeof packId === 'string') {
    where.packId = packId;
  }
  if (isEmergency !== undefined && typeof isEmergency === 'string') {
    where.isEmergency = isEmergency === 'true';
  }
  if (stationId && typeof stationId === 'string') {
    where.batteryPack = { stationId };
  }

  const isolations = await prisma.isolation.findMany({
    where,
    include: {
      batteryPack: {
        include: { station: { select: { id: true, name: true, code: true } } },
      },
      alarm: true,
      judge: { select: { id: true, realName: true, username: true } },
      releaser: { select: { id: true, realName: true } },
    },
    orderBy: [{ isEmergency: 'desc' }, { judgedAt: 'desc' }],
  });

  const stats = {
    total: await prisma.isolation.count({ where }),
    active: await prisma.isolation.count({ where: { ...where, released: false } }),
    emergency: await prisma.isolation.count({ where: { ...where, released: false, isEmergency: true } }),
    released: await prisma.isolation.count({ where: { ...where, released: true } }),
  };

  res.json({ isolations, stats });
});

router.get('/:id', async (req: AuthRequest, res) => {
  const isolation = await prisma.isolation.findUnique({
    where: { id: req.params.id },
    include: {
      batteryPack: {
        include: {
          station: true,
          trajectories: { take: 10, orderBy: { operatedAt: 'desc' } },
        },
      },
      alarm: {
        include: { registrant: { select: { id: true, realName: true } } },
      },
      judge: { select: { id: true, realName: true, username: true, phone: true } },
      releaser: { select: { id: true, realName: true, phone: true } },
    },
  });
  if (!isolation) {
    return res.status(404).json({ error: '隔离记录不存在' });
  }
  res.json({ isolation });
});

const createIsolationSchema = z.object({
  packId: z.string().min(1, '电池包ID不能为空'),
  alarmId: z.string().optional(),
  isolationReason: z.string().min(1, '隔离原因不能为空'),
  reasonDetail: z.string().optional(),
  isEmergency: z.boolean().default(false),
});

router.post('/', requireRoles(ROLES.QC, ROLES.ADMIN), async (req: AuthRequest, res) => {
  try {
    const data = createIsolationSchema.parse(req.body);
    const userId = req.user!.id;

    const pack = await prisma.batteryPack.findUnique({ where: { id: data.packId } });
    if (!pack) {
      return res.status(404).json({ error: '电池包不存在' });
    }

    const existingActive = await prisma.isolation.findFirst({
      where: { packId: data.packId, released: false },
    });
    if (existingActive) {
      return res.status(400).json({ error: '该电池包已存在未解除的隔离' });
    }

    const isolation = await prisma.$transaction(async (tx) => {
      const newIsolation = await tx.isolation.create({
        data: {
          id: crypto.randomUUID(),
          packId: data.packId,
          alarmId: data.alarmId,
          isolationReason: data.isolationReason,
          reasonDetail: data.reasonDetail,
          judgedBy: userId,
          isEmergency: data.isEmergency,
        },
      });

      const newStatus = data.isEmergency ? PACK_STATUS.LOCKED : PACK_STATUS.ISOLATED;
      const oldStatus = pack.currentStatus;

      await tx.batteryPack.update({
        where: { id: data.packId },
        data: { currentStatus: newStatus },
      });

      await tx.statusTrajectory.create({
        data: {
          id: crypto.randomUUID(),
          packId: data.packId,
          oldStatus,
          newStatus,
          operatorId: userId,
          operation: data.isEmergency ? '紧急隔离锁定' : '质检隔离',
          remark: `${data.isolationReason}: ${data.reasonDetail || ''}`,
          relatedAlarmId: data.alarmId,
          relatedIsolationId: newIsolation.id,
        },
      });

      if (data.alarmId) {
        await tx.alarm.update({
          where: { id: data.alarmId },
          data: { handled: true, handledAt: new Date(), handledBy: userId },
        });
      }

      return newIsolation;
    });

    const result = await prisma.isolation.findUnique({
      where: { id: isolation.id },
      include: {
        batteryPack: true,
        judge: { select: { id: true, realName: true } },
      },
    });

    res.json({ isolation: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Create isolation error:', error);
    res.status(500).json({ error: '创建隔离失败' });
  }
});

const releaseIsolationSchema = z.object({
  releaseRemark: z.string().optional(),
  releaseToStatus: z.enum([PACK_STATUS.AVAILABLE, PACK_STATUS.MAINTENANCE, PACK_STATUS.CHARGING]).default(PACK_STATUS.AVAILABLE),
});

router.patch('/:id/release', requireRoles(ROLES.QC, ROLES.ADMIN), async (req: AuthRequest, res) => {
  try {
    const { releaseRemark, releaseToStatus } = releaseIsolationSchema.parse(req.body);
    const userId = req.user!.id;
    const isolationId = req.params.id;

    const isolation = await prisma.isolation.findUnique({
      where: { id: isolationId },
      include: { batteryPack: true },
    });
    if (!isolation) {
      return res.status(404).json({ error: '隔离记录不存在' });
    }
    if (isolation.released) {
      return res.status(400).json({ error: '该隔离已解除' });
    }

    const pack = isolation.batteryPack;
    const oldStatus = pack.currentStatus;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.batteryPack.update({
        where: { id: pack.id },
        data: { currentStatus: releaseToStatus, lastCheckDate: new Date() },
      });

      await tx.statusTrajectory.create({
        data: {
          id: crypto.randomUUID(),
          packId: pack.id,
          oldStatus,
          newStatus: releaseToStatus,
          operatorId: userId,
          operation: '解除隔离',
          remark: releaseRemark,
          relatedIsolationId: isolationId,
        },
      });

      const updatedIsolation = await tx.isolation.update({
        where: { id: isolationId },
        data: {
          released: true,
          releasedAt: new Date(),
          releasedBy: userId,
          releaseRemark,
        },
        include: {
          batteryPack: true,
          releaser: { select: { id: true, realName: true } },
        },
      });

      return updatedIsolation;
    });

    res.json({ isolation: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: '解除隔离失败' });
  }
});

export default router;
