import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('开始初始化种子数据...');

  const hashedPassword = await bcrypt.hash('123456', 10);

  const users = [
    {
      id: 'user-admin-001',
      username: 'admin',
      password: hashedPassword,
      realName: '系统管理员',
      role: 'ADMIN',
      phone: '13800000001',
    },
    {
      id: 'user-duty-001',
      username: 'duty01',
      password: hashedPassword,
      realName: '张值班',
      role: 'DUTY',
      phone: '13800000002',
    },
    {
      id: 'user-duty-002',
      username: 'duty02',
      password: hashedPassword,
      realName: '李值班',
      role: 'DUTY',
      phone: '13800000003',
    },
    {
      id: 'user-qc-001',
      username: 'qc01',
      password: hashedPassword,
      realName: '王质检',
      role: 'QC',
      phone: '13800000004',
    },
    {
      id: 'user-qc-002',
      username: 'qc02',
      password: hashedPassword,
      realName: '赵质检',
      role: 'QC',
      phone: '13800000005',
    },
    {
      id: 'user-dispatch-001',
      username: 'dispatch01',
      password: hashedPassword,
      realName: '陈调度',
      role: 'DISPATCH',
      phone: '13800000006',
    },
    {
      id: 'user-dispatch-002',
      username: 'dispatch02',
      password: hashedPassword,
      realName: '刘调度',
      role: 'DISPATCH',
      phone: '13800000007',
    },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { username: user.username },
      update: user,
      create: user,
    });
  }
  console.log(`✅ 初始化 ${users.length} 个用户完成`);

  const stations = [
    {
      id: 'station-001',
      code: 'BJ-CY-001',
      name: '北京朝阳换电站',
      address: '北京市朝阳区建国路88号',
      capacity: 20,
    },
    {
      id: 'station-002',
      code: 'BJ-HD-002',
      name: '北京海淀换电站',
      address: '北京市海淀区中关村大街1号',
      capacity: 25,
    },
    {
      id: 'station-003',
      code: 'SH-PD-003',
      name: '上海浦东换电站',
      address: '上海市浦东新区陆家嘴环路1000号',
      capacity: 30,
    },
    {
      id: 'station-004',
      code: 'GZ-TH-004',
      name: '广州天河换电站',
      address: '广州市天河区珠江新城华夏路16号',
      capacity: 20,
    },
  ];

  for (const station of stations) {
    await prisma.station.upsert({
      where: { code: station.code },
      update: station,
      create: station,
    });
  }
  console.log(`✅ 初始化 ${stations.length} 个换电站完成`);

  const statusOptions = ['AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'CHARGING', 'IN_USE', 'ALARM', 'ISOLATED', 'LOCKED'];
  const models = ['CATL-100kWh', 'BYD-85kWh', 'GOTION-75kWh', 'CALB-95kWh', 'EVE-80kWh'];
  const locations = ['A-01', 'A-02', 'A-03', 'B-01', 'B-02', 'B-03', 'C-01', 'C-02'];

  const batchNos = [
    'CATL-2026-W23', 'BYD-2026-W22', 'GOTION-2026-W21', 'CALB-2026-W23', 'EVE-2026-W20',
    'CATL-2026-W22', 'BYD-2026-W23',
  ];

  const batteryPacks = [];
  for (let i = 1; i <= 40; i++) {
    const stationIndex = (i - 1) % stations.length;
    const statusIndex = i % statusOptions.length;

    let currentStatus = statusOptions[statusIndex];
    let batchNo = batchNos[i % batchNos.length];

    if (i >= 5 && i <= 7) {
      currentStatus = i === 5 ? 'ALARM' : i === 6 ? 'ISOLATED' : 'LOCKED';
      batchNo = 'CATL-2026-W23-DEFECT';
    } else if (i === 12 || i === 13) {
      batchNo = 'CATL-2026-W23-DEFECT';
    }

    batteryPacks.push({
      id: `pack-${String(i).padStart(4, '0')}`,
      packCode: `BAT${String(i).padStart(6, '0')}`,
      batchNo,
      model: models[i % models.length],
      capacity: [75, 80, 85, 95, 100][i % 5],
      currentStatus,
      healthLevel: 80 + (i % 21),
      stationId: stations[stationIndex].id,
      location: locations[i % locations.length],
      cycleCount: 100 + i * 15,
      manufactureDate: new Date(2023, (i % 12), 1 + (i % 28)),
      lastCheckDate: new Date(2026, 5, 1 + (i % 15)),
    });
  }

  for (const pack of batteryPacks) {
    await prisma.batteryPack.upsert({
      where: { packCode: pack.packCode },
      update: pack,
      create: pack,
    });
  }
  console.log(`✅ 初始化 ${batteryPacks.length} 个电池包完成`);

  const alarmPackIds = batteryPacks
    .filter(p => p.currentStatus === 'ALARM' || p.currentStatus === 'ISOLATED' || p.currentStatus === 'LOCKED')
    .map(p => p.id);

  const alarmTypes = [
    { type: '电压异常', level: 'WARNING', thermal: false },
    { type: '温度过高', level: 'CRITICAL', thermal: true },
    { type: '绝缘阻值低', level: 'WARNING', thermal: false },
    { type: '通讯故障', level: 'INFO', thermal: false },
    { type: 'BMS告警', level: 'WARNING', thermal: false },
    { type: '冒烟风险', level: 'EMERGENCY', thermal: true },
    { type: '鼓包变形', level: 'CRITICAL', thermal: false },
    { type: '容量衰减', level: 'INFO', thermal: false },
  ];

  for (let i = 0; i < alarmPackIds.length; i++) {
    const alarmType = alarmTypes[i % alarmTypes.length];
    await prisma.alarm.upsert({
      where: { id: `alarm-test-${i + 1}` },
      update: {},
      create: {
        id: `alarm-test-${i + 1}`,
        packId: alarmPackIds[i],
        alarmType: alarmType.type,
        alarmLevel: alarmType.level,
        description: `检测到${alarmType.type}，需要质检人员进一步判断`,
        registeredBy: i % 2 === 0 ? 'user-duty-001' : 'user-duty-002',
        isThermalRunawayRisk: alarmType.thermal,
        handled: false,
      },
    });
  }
  console.log(`✅ 初始化 ${alarmPackIds.length} 条告警记录完成`);

  const isolationReasons = [
    { reason: '电芯温度异常', detail: '3号电芯温度超过55℃，需进一步检查冷却系统', emergency: true },
    { reason: '绝缘检测失败', detail: '绝缘阻值低于阈值，存在漏电风险', emergency: false },
    { reason: 'BMS通讯中断', detail: 'BMS持续无响应，疑似硬件故障', emergency: false },
    { reason: '热失控预警', detail: '温度上升速率异常，触发热失控预警', emergency: true },
  ];

  const isolatedPackIds = batteryPacks
    .filter(p => p.currentStatus === 'ISOLATED' || p.currentStatus === 'LOCKED')
    .map(p => p.id);

  for (let i = 0; i < isolatedPackIds.length; i++) {
    const reason = isolationReasons[i % isolationReasons.length];
    const relatedAlarm = await prisma.alarm.findFirst({
      where: { packId: isolatedPackIds[i], handled: false },
    });

    await prisma.isolation.upsert({
      where: { id: `iso-test-${i + 1}` },
      update: {},
      create: {
        id: `iso-test-${i + 1}`,
        packId: isolatedPackIds[i],
        alarmId: relatedAlarm?.id,
        isolationReason: reason.reason,
        reasonDetail: reason.detail,
        judgedBy: i % 2 === 0 ? 'user-qc-001' : 'user-qc-002',
        isEmergency: reason.emergency,
        released: false,
      },
    });
  }
  console.log(`✅ 初始化 ${isolatedPackIds.length} 条隔离记录完成`);

  const scheduleTypes = ['REPLENISH', 'TRANSFER_OUT', 'RECALL', 'MAINTENANCE'];

  for (let i = 1; i <= 6; i++) {
    const scheduleType = scheduleTypes[(i - 1) % scheduleTypes.length];
    const targetStation = stations[(i - 1) % stations.length];
    const sourcePack = batteryPacks.find((_, idx) => idx === 20 + i) || batteryPacks[i];
    const count = await prisma.inventorySchedule.count();

    await prisma.inventorySchedule.upsert({
      where: { id: `sch-test-${i}` },
      update: {},
      create: {
        id: `sch-test-${i}`,
        scheduleNo: `SCH202606${String(1000 + i).padStart(4, '0')}`,
        scheduleType,
        packId: sourcePack.id,
        stationId: targetStation.id,
        quantity: 1,
        scheduledDate: new Date(2026, 5, 20 + i),
        status: i <= 3 ? 'PENDING' : i <= 5 ? 'IN_PROGRESS' : 'COMPLETED',
        actualArrivalDate: i > 5 ? new Date(2026, 5, 19 + i) : null,
        createdBy: i % 2 === 0 ? 'user-dispatch-001' : 'user-dispatch-002',
        operatorRemark: scheduleType === 'REPLENISH' ? '补充库存' : scheduleType === 'RECALL' ? '召回检修' : '日常维护',
      },
    });
  }
  console.log(`✅ 初始化 6 条库存调度记录完成`);

  const defectBatchNo = 'CATL-2026-W23-DEFECT';
  const defectBatchPacks = batteryPacks.filter(p => p.batchNo === defectBatchNo);
  const abnormalPacks = defectBatchPacks.filter(p =>
    p.currentStatus === 'ALARM' || p.currentStatus === 'ISOLATED' || p.currentStatus === 'LOCKED'
  );
  const relatedAlarm = await prisma.alarm.findFirst({
    where: { packId: { in: abnormalPacks.map(p => p.id) }, handled: false },
  });

  if (abnormalPacks.length >= 3) {
    const existingRisk = await prisma.batchRisk.findFirst({
      where: { batchNo: defectBatchNo, resolved: false },
    });

    if (!existingRisk) {
      const availableInBatch = defectBatchPacks.filter(p => p.currentStatus === 'AVAILABLE' || p.currentStatus === 'CHARGING').length;

      const batchRisk = await prisma.batchRisk.create({
        data: {
          id: 'batch-risk-demo-001',
          batchNo: defectBatchNo,
          riskType: 'QUALITY_BATCH',
          riskLevel: abnormalPacks.length >= 4 ? 'CRITICAL' : 'WARNING',
          abnormalCount: abnormalPacks.length,
          totalCount: defectBatchPacks.length,
          threshold: 3,
          triggerAlarmId: relatedAlarm?.id,
          detectedBy: 'user-qc-001',
          detectedAt: new Date(),
          resolved: false,
          description: `批次 ${defectBatchNo} 存在批量质量风险，已检测到 ${abnormalPacks.length} 个电池包处于异常状态（告警/隔离/锁定）`,
          scheduleSuggestion: availableInBatch < 3
            ? `批次可用库存不足（剩余${availableInBatch}个可用），建议立即创建紧急补货单，同时暂停该批次的换电使用，对全部${defectBatchPacks.length}个包进行质检`
            : `批次剩余可用${availableInBatch}个，建议对该批次所有包进行全面复检，视复检结果决定是否启动召回流程`,
          packs: {
            create: abnormalPacks.map(p => ({
              id: `brp-seed-${p.id}`,
              packId: p.id,
              packStatus: p.currentStatus,
              alarmIds: JSON.stringify([`batch-seed-${p.id}`]),
            })),
          },
        },
      });
      console.log(`✅ 创建批次风险记录完成: ${batchRisk.id} (${defectBatchNo}, ${abnormalPacks.length}/${defectBatchPacks.length}异常)`);
    }
  }

  console.log('\n============================================');
  console.log('🎉 种子数据初始化完成！');
  console.log('============================================');
  console.log('');
  console.log('测试账号（密码均为: 123456）:');
  console.log('  📋 管理员:   admin / 123456    (全部权限)');
  console.log('  👷 值班员:   duty01 / 123456   (登记告警)');
  console.log('              duty02 / 123456');
  console.log('  🔍 质检员:   qc01 / 123456     (判断隔离原因)');
  console.log('              qc02 / 123456');
  console.log('  🚚 调度员:   dispatch01 / 123456  (库存调度)');
  console.log('              dispatch02 / 123456');
  console.log('');
  console.log('演示数据说明:');
  console.log(`  ⚠️  批次 ${defectBatchNo}: 预置了 ${abnormalPacks.length} 个异常包，可在调度页面看到批次风险建议`);
  console.log('  🔥 在告警管理页面登记热失控风险告警，将自动锁定并移入隔离区');
  console.log('  📊 在告警管理页面点击"批次风险"按钮，可手动触发批次检测');
  console.log('');
}

main()
  .catch((e) => {
    console.error('种子数据初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
