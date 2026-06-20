export const PACK_STATUS = {
  AVAILABLE: { label: '可用', color: 'green' },
  IN_USE: { label: '换电中', color: 'blue' },
  CHARGING: { label: '充电中', color: 'cyan' },
  ALARM: { label: '告警', color: 'orange' },
  ISOLATED: { label: '已隔离', color: 'purple' },
  LOCKED: { label: '紧急锁定', color: 'red' },
  IN_TRANSIT: { label: '运输中', color: 'geekblue' },
  MAINTENANCE: { label: '维护中', color: 'default' },
  SCRAPPED: { label: '已报废', color: 'default' },
};

export const ALARM_LEVEL = {
  INFO: { label: '提示', color: 'blue' },
  WARNING: { label: '警告', color: 'orange' },
  CRITICAL: { label: '严重', color: 'volcano' },
  EMERGENCY: { label: '紧急', color: 'red' },
};

export const ISOLATION_REASONS = [
  '电芯温度异常',
  '绝缘检测失败',
  'BMS通讯中断',
  '电压异常',
  '容量衰减过快',
  '鼓包变形',
  '热失控预警',
  '其他原因',
];

export const SCHEDULE_TYPE = {
  REPLENISH: { label: '补货到站', color: 'green' },
  TRANSFER_OUT: { label: '转出', color: 'orange' },
  TRANSFER_IN: { label: '转入', color: 'cyan' },
  RECALL: { label: '召回检修', color: 'red' },
  MAINTENANCE: { label: '维护送检', color: 'purple' },
};

export const SCHEDULE_STATUS = {
  PENDING: { label: '待执行', color: 'orange' },
  IN_PROGRESS: { label: '执行中', color: 'blue' },
  COMPLETED: { label: '已完成', color: 'green' },
  CANCELLED: { label: '已取消', color: 'default' },
};

export const ROLE_LABELS = {
  ADMIN: { label: '系统管理员', color: 'magenta' },
  DUTY: { label: '值班员', color: 'blue' },
  QC: { label: '质检员', color: 'purple' },
  DISPATCH: { label: '调度员', color: 'green' },
};

export const formatDate = (date) => {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleString('zh-CN', { hour12: false });
};

export const formatDateShort = (date) => {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('zh-CN');
};
