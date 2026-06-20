import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth';
import stationRoutes from './routes/stations';
import batteryPackRoutes from './routes/batteryPacks';
import alarmRoutes from './routes/alarms';
import isolationRoutes from './routes/isolations';
import scheduleRoutes from './routes/inventorySchedules';
import batchRiskRoutes from './routes/batchRisks';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '19499', 10);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));

app.use('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/stations', stationRoutes);
app.use('/api/battery-packs', batteryPackRoutes);
app.use('/api/alarms', alarmRoutes);
app.use('/api/isolations', isolationRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/batch-risks', batchRiskRoutes);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: '服务器内部错误',
    message: err.message || '未知错误',
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
    ============================================
    🚀 电池包隔离协作系统 - 后端服务启动
    ============================================
    服务地址: http://0.0.0.0:${PORT}
    健康检查: http://localhost:${PORT}/api/health
    API 前缀: /api/*
    启动时间: ${new Date().toLocaleString('zh-CN')}
    ============================================
  `);
});

export default app;
