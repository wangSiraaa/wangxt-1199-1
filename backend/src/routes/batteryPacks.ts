import { Router } from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import { authMiddleware, AuthRequest, ROLES, requireRoles } from '../auth';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res) => {
  const { status, stationId, keyword, batchNo, hasBatchRisk } = req.query;

  const where: any = {};
  if (status && typeof status === 'string') {
    where.currentStatus = status;
  }
  if (stationId && typeof stationId === 'string') {
    where.stationId = stationId;
  }
  if (batchNo && typeof batchNo === 'string') {
    where.batchNo = { contains: batchNo };
  }
  if (keyword && typeof keyword === 'string') {
    where.OR = [
      { packCode: { contains: keyword } },
      { model: { contains: keyword } },
      { batchNo: { contains: keyword } },
    ];
  }

  const packs = await prisma.batteryPack.findMany({
    where,
    include: {
      station: { select: { id: true, name: true, code: true } },
      isolations: {
        where: { released: false },
        take: 1,
        include: { judge: { select: { id: true, realName: true } } },
      },
      alarms: {
        where: { handled: false },
        take: 1,
        orderBy: { createdAt: 'desc' },
      },
      batchRisks: {
        where: { batchRisk: { resolved: false } },
        take: 1,
        include: { batchRisk: { select: { id: true, riskLevel: true, abnormalCount: true, batchNo: true } } },
      },
    },
    orderBy: [{ currentStatus: 'asc' }, { updatedAt: 'desc' }],
  });

  let resultPacks = packs;
  if (hasBatchRisk !== undefined && typeof hasBatchRisk === 'string') {
    const needRisk = hasBatchRisk === 'true';
    resultPacks = packs.filter(p =>
      needRisk
        ? (p.batchRisks && p.batchRisks.length > 0)
        : !(p.batchRisks && p.batchRisks.length > 0)
    );
  }

  const whereCount = { ...where };
  const stats = {
    total: await prisma.batteryPack.count({ where: whereCount }),
    available: await prisma.batteryPack.count({ where: { ...whereCount, currentStatus: 'AVAILABLE' } }),
    alarm: await prisma.batteryPack.count({ where: { ...whereCount, currentStatus: 'ALARM' } }),
    isolated: await prisma.batteryPack.count({ where: { ...whereCount, currentStatus: 'ISOLATED' } }),
    locked: await prisma.batteryPack.count({ where: { ...whereCount, currentStatus: 'LOCKED' } }),
    charging: await prisma.batteryPack.count({ where: { ...whereCount, currentStatus: 'CHARGING' } }),
    inUse: await prisma.batteryPack.count({ where: { ...whereCount, currentStatus: 'IN_USE' } }),
    inTransit: await prisma.batteryPack.count({ where: { ...whereCount, currentStatus: 'IN_TRANSIT' } }),
    withBatchRisk: packs.filter(p => p.batchRisks && p.batchRisks.length > 0).length,
  };

  res.json({ packs: resultPacks, stats });
});

router.get('/:id', async (req: AuthRequest, res) => {
  const pack = await prisma.batteryPack.findUnique({
    where: { id: req.params.id },
    include: {
      station: true,
      alarms: {
        orderBy: { createdAt: 'desc' },
        include: {
          registrant: { select: { id: true, realName: true, username: true } },
          handler: { select: { id: true, realName: true } },
        },
      },
      isolations: {
        orderBy: { createdAt: 'desc' },
        include: {
          judge: { select: { id: true, realName: true } },
          releaser: { select: { id: true, realName: true } },
          alarm: true,
        },
      },
      schedules: {
        orderBy: { createdAt: 'desc' },
        include: {
          station: { select: { id: true, name: true } },
          creator: { select: { id: true, realName: true } },
        },
      },
      trajectories: {
        orderBy: { operatedAt: 'desc' },
        take: 50,
        include: {
          operator: { select: { id: true, realName: true, role: true } },
        },
      },
    },
  });

  if (!pack) {
    return res.status(404).json({ error: '电池包不存在' });
  }
  res.json({ pack });
});

const createPackSchema = z.object({
  packCode: z.string().min(1, '电池包编码不能为空'),
  batchNo: z.string().optional(),
  model: z.string().min(1, '型号不能为空'),
  capacity: z.number().int().min(1, '容量必须大于0'),
  healthLevel: z.number().int().min(0).max(100),
  stationId: z.string().optional(),
  location: z.string().optional(),
  cycleCount: z.number().int().default(0),
  manufactureDate: z.string().optional(),
});

router.post('/', requireRoles(ROLES.ADMIN, ROLES.QC), async (req: AuthRequest, res) => {
  try {
    const data = createPackSchema.parse(req.body);
    const pack = await prisma.batteryPack.create({
      data: {
        id: crypto.randomUUID(),
        currentStatus: 'AVAILABLE',
        lastCheckDate: new Date(),
        ...data,
        manufactureDate: data.manufactureDate ? new Date(data.manufactureDate) : undefined,
      },
    });
    res.json({ pack });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: '创建电池包失败' });
  }
});

const updatePackSchema = z.object({
  batchNo: z.string().nullable().optional(),
  model: z.string().optional(),
  capacity: z.number().int().min(1).optional(),
  healthLevel: z.number().int().min(0).max(100).optional(),
  stationId: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  cycleCount: z.number().int().optional(),
});

router.put('/:id', requireRoles(ROLES.ADMIN, ROLES.QC), async (req: AuthRequest, res) => {
  try {
    const data = updatePackSchema.parse(req.body);
    const pack = await prisma.batteryPack.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ pack });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: '更新电池包失败' });
  }
});

router.get('/:id/trajectories', async (req: AuthRequest, res) => {
  const trajectories = await prisma.statusTrajectory.findMany({
    where: { packId: req.params.id },
    include: {
      operator: { select: { id: true, realName: true, role: true } },
    },
    orderBy: { operatedAt: 'desc' },
  });
  res.json({ trajectories });
});

export default router;
