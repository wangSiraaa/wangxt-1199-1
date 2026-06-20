import { Router } from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import { authMiddleware, AuthRequest, ROLES, requireRoles } from '../auth';
import { PACK_STATUS } from '../status';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res) => {
  const { resolved, riskLevel, batchNo } = req.query;

  const where: any = {};
  if (resolved !== undefined && typeof resolved === 'string') {
    where.resolved = resolved === 'true';
  }
  if (riskLevel && typeof riskLevel === 'string') {
    where.riskLevel = riskLevel;
  }
  if (batchNo && typeof batchNo === 'string') {
    where.batchNo = { contains: batchNo };
  }

  const risks = await prisma.batchRisk.findMany({
    where,
    include: {
      detector: { select: { id: true, realName: true, username: true } },
      resolver: { select: { id: true, realName: true } },
      packs: {
        include: {
          batteryPack: {
            select: { id: true, packCode: true, currentStatus: true, stationId: true, batchNo: true },
          },
        },
      },
      schedules: {
        include: {
          inventorySched: { select: { id: true, scheduleNo: true, status: true, scheduleType: true } },
        },
      },
      triggerAlarm: {
        select: { id: true, alarmType: true, isThermalRunawayRisk: true },
      },
    },
    orderBy: [{ resolved: 'asc' }, { detectedAt: 'desc' }],
  });

  const stats = {
    total: await prisma.batchRisk.count({ where }),
    open: await prisma.batchRisk.count({ where: { ...where, resolved: false } }),
    critical: await prisma.batchRisk.count({ where: { ...where, resolved: false, riskLevel: 'CRITICAL' } }),
    resolved: await prisma.batchRisk.count({ where: { ...where, resolved: true } }),
  };

  res.json({ risks, stats });
});

router.get('/summary', async (_req: AuthRequest, res) => {
  const openRisks = await prisma.batchRisk.findMany({
    where: { resolved: false },
    select: {
      id: true, batchNo: true, riskLevel: true, abnormalCount: true, totalCount: true,
      scheduleSuggestion: true, detectedAt: true,
      packs: { select: { packId: true } },
    },
    orderBy: [{ riskLevel: 'desc' }, { detectedAt: 'desc' }],
  });

  const affectedStationCount = new Set<string>();
  let totalAffectedPacks = 0;

  for (const risk of openRisks) {
    totalAffectedPacks += risk.abnormalCount;
    const packs = await prisma.batteryPack.findMany({
      where: { batchNo: risk.batchNo, currentStatus: { in: [PACK_STATUS.LOCKED, PACK_STATUS.ISOLATED, PACK_STATUS.ALARM] } },
      select: { stationId: true },
    });
    packs.forEach(p => p.stationId && affectedStationCount.add(p.stationId));
  }

  res.json({
    openRisks,
    summary: {
      openCount: openRisks.length,
      criticalCount: openRisks.filter(r => r.riskLevel === 'CRITICAL').length,
      totalAffectedPacks,
      affectedStationCount: affectedStationCount.size,
    },
  });
});

router.get('/:id', async (req: AuthRequest, res) => {
  const risk = await prisma.batchRisk.findUnique({
    where: { id: req.params.id },
    include: {
      detector: { select: { id: true, realName: true, username: true, role: true, phone: true } },
      resolver: { select: { id: true, realName: true, phone: true } },
      triggerAlarm: {
        include: {
          batteryPack: { select: { packCode: true } },
          registrant: { select: { realName: true } },
        },
      },
      packs: {
        include: {
          batteryPack: {
            include: {
              station: { select: { id: true, name: true, code: true } },
              alarms: { where: { handled: false }, take: 1, orderBy: { createdAt: 'desc' } },
              isolations: { where: { released: false }, take: 1 },
            },
          },
        },
      },
      schedules: {
        include: {
          inventorySched: {
            include: {
              station: { select: { name: true, code: true } },
              creator: { select: { realName: true } },
            },
          },
          suggester: { select: { realName: true } },
        },
      },
    },
  });
  if (!risk) {
    return res.status(404).json({ error: '批量风险记录不存在' });
  }
  res.json({ risk });
});

const detectSchema = z.object({
  batchNo: z.string().min(1, '批次号不能为空'),
  threshold: z.number().int().min(1).max(100).default(3),
  triggerAlarmId: z.string().optional(),
});

router.post('/detect', requireRoles(ROLES.QC, ROLES.ADMIN, ROLES.DISPATCH), async (req: AuthRequest, res) => {
  try {
    const data = detectSchema.parse(req.body);
    const userId = req.user!.id;

    const batchPacks = await prisma.batteryPack.findMany({
      where: { batchNo: data.batchNo },
      include: {
        alarms: { where: { handled: false }, select: { id: true } },
        isolations: { where: { released: false }, select: { id: true } },
      },
    });

    if (batchPacks.length === 0) {
      return res.status(404).json({ error: '未找到该批次的电池包' });
    }

    const abnormalPacks = batchPacks.filter(p =>
      [PACK_STATUS.ALARM, PACK_STATUS.ISOLATED, PACK_STATUS.LOCKED].includes(p.currentStatus as any)
    );

    const hasRisk = abnormalPacks.length >= data.threshold;
    let createdRisk: any = null;

    if (hasRisk) {
      const existing = await prisma.batchRisk.findFirst({
        where: { batchNo: data.batchNo, resolved: false },
      });

      if (!existing) {
        const riskLevel = abnormalPacks.some(p => p.currentStatus === PACK_STATUS.LOCKED) ? 'CRITICAL' : 'WARNING';
        const availablePacks = batchPacks.filter(p => p.currentStatus === PACK_STATUS.AVAILABLE);
        const stationsInvolved = new Set(batchPacks.filter(p => p.stationId).map(p => p.stationId!));

        const suggestionParts = [];
        suggestionParts.push(`批次 ${data.batchNo} 异常包 ${abnormalPacks.length}/${batchPacks.length}（阈值${data.threshold}）`);
        if (availablePacks.length < 5) {
          suggestionParts.push(`可用包仅${availablePacks.length}个，建议紧急补货`);
        } else {
          suggestionParts.push(`剩余可用包${availablePacks.length}个`);
        }
        suggestionParts.push(`涉及${stationsInvolved.size}个站点，请调度评估`);

        createdRisk = await prisma.$transaction(async (tx) => {
          const risk = await tx.batchRisk.create({
            data: {
              id: crypto.randomUUID(),
              batchNo: data.batchNo,
              riskType: abnormalPacks.some(p => p.currentStatus === PACK_STATUS.LOCKED) ? 'THERMAL_BATCH' : 'QUALITY_BATCH',
              riskLevel,
              abnormalCount: abnormalPacks.length,
              totalCount: batchPacks.length,
              threshold: data.threshold,
              description: `手动触发批次风险检测：异常率 ${((abnormalPacks.length / batchPacks.length) * 100).toFixed(1)}%`,
              triggerAlarmId: data.triggerAlarmId,
              detectedBy: userId,
              scheduleSuggestion: suggestionParts.join('；'),
            },
          });

          for (const ap of abnormalPacks) {
            await tx.batchRiskPack.create({
              data: {
                id: crypto.randomUUID(),
                batchRiskId: risk.id,
                packId: ap.id,
                packStatus: ap.currentStatus,
                alarmIds: ap.alarms.map(a => a.id).join(','),
              },
            });
          }
          return risk;
        });
      }
    }

    res.json({
      batchNo: data.batchNo,
      totalCount: batchPacks.length,
      abnormalCount: abnormalPacks.length,
      threshold: data.threshold,
      hasRisk,
      risk: createdRisk,
      message: hasRisk
        ? (createdRisk ? `已创建批量风险记录：${abnormalPacks.length}个异常包` : `该批次存在未处理的批量风险记录`)
        : `批次正常，异常包${abnormalPacks.length}未超过阈值${data.threshold}`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Batch risk detect error:', error);
    res.status(500).json({ error: '批量风险检测失败' });
  }
});

const resolveSchema = z.object({
  resolved: z.boolean(),
  remark: z.string().optional(),
});

router.patch('/:id/resolve', requireRoles(ROLES.QC, ROLES.ADMIN), async (req: AuthRequest, res) => {
  try {
    const { resolved, remark } = resolveSchema.parse(req.body);
    const userId = req.user!.id;
    const riskId = req.params.id;

    const risk = await prisma.batchRisk.findUnique({ where: { id: riskId } });
    if (!risk) {
      return res.status(404).json({ error: '批量风险记录不存在' });
    }

    const updated = await prisma.batchRisk.update({
      where: { id: riskId },
      data: {
        resolved,
        resolvedAt: resolved ? new Date() : null,
        resolvedBy: resolved ? userId : null,
        remark,
      },
      include: {
        detector: { select: { id: true, realName: true } },
        resolver: { select: { id: true, realName: true } },
      },
    });

    res.json({ risk: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: '更新批量风险状态失败' });
  }
});

const linkScheduleSchema = z.object({
  scheduleId: z.string().min(1, '调度单ID不能为空'),
  note: z.string().optional(),
});

router.post('/:id/link-schedule', requireRoles(ROLES.DISPATCH, ROLES.ADMIN), async (req: AuthRequest, res) => {
  try {
    const { scheduleId, note } = linkScheduleSchema.parse(req.body);
    const userId = req.user!.id;
    const riskId = req.params.id;

    const [risk, schedule] = await Promise.all([
      prisma.batchRisk.findUnique({ where: { id: riskId } }),
      prisma.inventorySchedule.findUnique({ where: { id: scheduleId } }),
    ]);

    if (!risk) return res.status(404).json({ error: '批量风险记录不存在' });
    if (!schedule) return res.status(404).json({ error: '调度单不存在' });

    const link = await prisma.batchRiskSchedule.create({
      data: {
        id: crypto.randomUUID(),
        batchRiskId: riskId,
        scheduleId,
        scheduleNo: schedule.scheduleNo,
        suggestedBy: userId,
        scheduleType: schedule.scheduleType,
        note,
      },
      include: {
        inventorySched: { select: { id: true, scheduleNo: true, status: true } },
        suggester: { select: { id: true, realName: true } },
      },
    });

    res.json({ link });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: '关联调度单失败' });
  }
});

export default router;
