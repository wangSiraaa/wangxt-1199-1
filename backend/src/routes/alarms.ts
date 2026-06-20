import { Router } from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import { authMiddleware, AuthRequest, ROLES, requireRoles } from '../auth';
import { updatePackStatus, PACK_STATUS } from '../status';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res) => {
  const { handled, level, packId, isThermal, batchNo } = req.query;

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
  if (batchNo && typeof batchNo === 'string') {
    where.batteryPack = { batchNo };
  }

  const alarms = await prisma.alarm.findMany({
    where,
    include: {
      batteryPack: {
        include: {
          station: { select: { id: true, name: true } },
          batchRisks: {
            where: { batchRisk: { resolved: false } },
            take: 1,
            include: { batchRisk: { select: { id: true, riskLevel: true, abnormalCount: true } } },
          },
        },
      },
      registrant: { select: { id: true, realName: true, username: true } },
      handler: { select: { id: true, realName: true } },
      isolations: { take: 1, orderBy: { createdAt: 'desc' } },
      batchRisks: { take: 1, select: { id: true, riskLevel: true } },
    },
    orderBy: [{ isThermalRunawayRisk: 'desc' }, { createdAt: 'desc' }],
  });

  const openBatchRisks = await prisma.batchRisk.findMany({
    where: { resolved: false },
    select: {
      id: true, batchNo: true, riskLevel: true, abnormalCount: true, totalCount: true,
      scheduleSuggestion: true,
    },
  });

  const stats = {
    total: await prisma.alarm.count({ where }),
    pending: await prisma.alarm.count({ where: { ...where, handled: false } }),
    thermal: await prisma.alarm.count({ where: { ...where, handled: false, isThermalRunawayRisk: true } }),
    handled: await prisma.alarm.count({ where: { ...where, handled: true } }),
  };

  res.json({ alarms, stats, openBatchRisks });
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

    const { alarm, autoIsolation, batchRiskDetection } = await prisma.$transaction(async (tx) => {
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

      let autoIsolation: any = null;
      if (data.isThermalRunawayRisk) {
        autoIsolation = await tx.isolation.create({
          data: {
            id: crypto.randomUUID(),
            packId: data.packId,
            alarmId: newAlarm.id,
            isolationReason: '热失控风险自动隔离',
            reasonDetail: `系统自动触发：${data.description || '检测到热失控风险，立即锁定并移入隔离区'}`,
            judgedBy: userId,
            isEmergency: true,
          },
        });

        await tx.statusTrajectory.create({
          data: {
            id: crypto.randomUUID(),
            packId: data.packId,
            oldStatus: PACK_STATUS.LOCKED,
            newStatus: PACK_STATUS.LOCKED,
            operatorId: userId,
            operation: '自动移入隔离区',
            remark: `热失控告警自动创建隔离记录：${autoIsolation.id.slice(0, 8)}`,
            relatedAlarmId: newAlarm.id,
            relatedIsolationId: autoIsolation.id,
          },
        });

        await tx.alarm.update({
          where: { id: newAlarm.id },
          data: { handled: true, handledAt: new Date(), handledBy: userId, remark: '热失控风险已自动转入隔离区' },
        });
      }

      let batchRiskDetection: any = null;
      if (pack.batchNo) {
        const batchPacks = await tx.batteryPack.findMany({
          where: { batchNo: pack.batchNo },
          select: { id: true, currentStatus: true, packCode: true, batchNo: true },
        });

        const abnormalPacks = batchPacks.filter(p =>
          [PACK_STATUS.ALARM, PACK_STATUS.ISOLATED, PACK_STATUS.LOCKED].includes(p.currentStatus as any)
        );

        const THRESHOLD = 3;
        if (abnormalPacks.length >= THRESHOLD) {
          const existingRisk = await tx.batchRisk.findFirst({
            where: { batchNo: pack.batchNo!, resolved: false },
          });

          if (!existingRisk) {
            const riskLevel = abnormalPacks.some(p => p.currentStatus === PACK_STATUS.LOCKED) ? 'CRITICAL' : 'WARNING';
            const availablePacks = batchPacks.filter(p => p.currentStatus === PACK_STATUS.AVAILABLE);
            const stationsInvolved = await tx.batteryPack.findMany({
              where: { batchNo: pack.batchNo!, stationId: { not: null } },
              select: { stationId: true },
              distinct: ['stationId'],
            });

            const suggestionParts = [];
            suggestionParts.push(`⚠️ 批次 ${pack.batchNo} 发现 ${abnormalPacks.length} 个异常包（阈值${THRESHOLD}）`);
            if (availablePacks.length < 5) {
              suggestionParts.push(`批次剩余可用包仅 ${availablePacks.length} 个，建议紧急补货`);
            }
            suggestionParts.push(`涉及站点 ${stationsInvolved.length} 个，请调度中心评估`);

            batchRiskDetection = await tx.batchRisk.create({
              data: {
                id: crypto.randomUUID(),
                batchNo: pack.batchNo!,
                riskType: data.isThermalRunawayRisk ? 'THERMAL_BATCH' : 'QUALITY_BATCH',
                riskLevel,
                abnormalCount: abnormalPacks.length,
                totalCount: batchPacks.length,
                threshold: THRESHOLD,
                description: `${data.alarmType} 触发批次风险检测，同批次异常率 ${((abnormalPacks.length / batchPacks.length) * 100).toFixed(1)}%`,
                triggerAlarmId: newAlarm.id,
                detectedBy: userId,
                scheduleSuggestion: suggestionParts.join('；'),
              },
            });

            for (const ap of abnormalPacks) {
              const relatedAlarms = await tx.alarm.findMany({
                where: { packId: ap.id, handled: false },
                select: { id: true },
              });
              await tx.batchRiskPack.create({
                data: {
                  id: crypto.randomUUID(),
                  batchRiskId: batchRiskDetection.id,
                  packId: ap.id,
                  packStatus: ap.currentStatus,
                  alarmIds: relatedAlarms.map(a => a.id).join(','),
                },
              });
            }
          } else {
            batchRiskDetection = { id: existingRisk.id, existed: true };
          }
        }
      }

      return { alarm: newAlarm, autoIsolation, batchRiskDetection };
    });

    const result = await prisma.alarm.findUnique({
      where: { id: alarm.id },
      include: { batteryPack: true, registrant: { select: { id: true, realName: true } } },
    });

    const response: any = { alarm: result };
    if (autoIsolation) {
      response.autoIsolation = {
        id: autoIsolation.id,
        message: '热失控风险包已自动锁定并移入隔离区',
      };
    }
    if (batchRiskDetection && !batchRiskDetection.existed) {
      response.batchRisk = {
        id: batchRiskDetection.id,
        batchNo: pack.batchNo,
        abnormalCount: batchRiskDetection.abnormalCount,
        riskLevel: batchRiskDetection.riskLevel,
        suggestion: batchRiskDetection.scheduleSuggestion,
        message: `检测到批次 ${pack.batchNo} 存在批量风险，请通知调度中心调整库存`,
      };
    } else if (batchRiskDetection && batchRiskDetection.existed) {
      response.batchRiskWarning = {
        id: batchRiskDetection.id,
        message: `所属批次 ${pack.batchNo} 已有未处理的批量风险记录`,
      };
    }

    res.json(response);
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
