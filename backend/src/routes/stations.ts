import { Router } from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../auth';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res) => {
  const stations = await prisma.station.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { batteryPacks: true },
      },
    },
  });
  res.json({ stations });
});

router.get('/:id', async (req: AuthRequest, res) => {
  const station = await prisma.station.findUnique({
    where: { id: req.params.id },
    include: {
      batteryPacks: {
        orderBy: { currentStatus: 'asc' },
      },
    },
  });
  if (!station) {
    return res.status(404).json({ error: '站点不存在' });
  }
  res.json({ station });
});

const createStationSchema = z.object({
  code: z.string().min(1, '站点编码不能为空'),
  name: z.string().min(1, '站点名称不能为空'),
  address: z.string().optional(),
  capacity: z.number().int().min(1, '容量必须大于0'),
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const data = createStationSchema.parse(req.body);
    const station = await prisma.station.create({
      data: {
        id: crypto.randomUUID(),
        ...data,
      },
    });
    res.json({ station });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: '创建站点失败' });
  }
});

export default router;
