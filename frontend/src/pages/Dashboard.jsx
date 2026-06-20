import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, List, Tag, Space, Button, Typography, Empty, Spin } from 'antd';
import {
  DatabaseOutlined,
  AlertOutlined,
  SafetyOutlined,
  TruckOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import axios from '../utils/request';
import { PACK_STATUS, ALARM_LEVEL, formatDate, ROLE_LABELS } from '../utils/constants';
import { useUserStore } from '../store/user';

const { Title, Paragraph } = Typography;

export default function Dashboard() {
  const navigate = useNavigate();
  const hasRole = useUserStore((s) => s.hasRole);
  const user = useUserStore((s) => s.user);
  const [loading, setLoading] = useState(true);
  const [packStats, setPackStats] = useState(null);
  const [alarmStats, setAlarmStats] = useState(null);
  const [isoStats, setIsoStats] = useState(null);
  const [schStats, setSchStats] = useState(null);
  const [recentAlarms, setRecentAlarms] = useState([]);
  const [recentIsolations, setRecentIsolations] = useState([]);
  const [pendingSchedules, setPendingSchedules] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [packsRes, alarmsRes, isosRes, schRes] = await Promise.all([
        axios.get('/battery-packs'),
        axios.get('/alarms'),
        axios.get('/isolations'),
        axios.get('/schedules'),
      ]);
      setPackStats(packsRes.data.stats);
      setAlarmStats(alarmsRes.data.stats);
      setIsoStats(isosRes.data.stats);
      setSchStats(schRes.data.stats);
      setRecentAlarms(alarmsRes.data.alarms.slice(0, 6));
      setRecentIsolations(isosRes.data.isolations.slice(0, 5));
      setPendingSchedules(schRes.data.schedules.filter(s => s.status !== 'COMPLETED' && s.status !== 'CANCELLED').slice(0, 5));
    } finally {
      setLoading(false);
    }
  };

  const statusChartOption = packStats ? {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, icon: 'circle' },
    series: [{
      type: 'pie',
      radius: ['45%', '72%'],
      center: ['50%', '42%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      data: [
        { value: packStats.available, name: '可用', itemStyle: { color: '#52c41a' } },
        { value: packStats.charging, name: '充电中', itemStyle: { color: '#13c2c2' } },
        { value: packStats.inUse, name: '换电中', itemStyle: { color: '#1890ff' } },
        { value: packStats.inTransit, name: '运输中', itemStyle: { color: '#2f54eb' } },
        { value: packStats.alarm, name: '告警', itemStyle: { color: '#fa8c16' } },
        { value: packStats.isolated, name: '已隔离', itemStyle: { color: '#722ed1' } },
        { value: packStats.locked, name: '紧急锁定', itemStyle: { color: '#f5222d' } },
      ].filter(d => d.value > 0),
    }],
  } : {};

  const alarmChartOption = alarmStats ? {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { top: 10, left: 40, right: 10, bottom: 30 },
    xAxis: {
      type: 'category',
      data: ['待处理', '热失控风险', '已处理'],
      axisLabel: { color: '#666' },
    },
    yAxis: { type: 'value', axisLabel: { color: '#666' } },
    series: [{
      type: 'bar',
      data: [
        { value: alarmStats.pending, itemStyle: { color: '#faad14' } },
        { value: alarmStats.thermal, itemStyle: { color: '#ff4d4f' } },
        { value: alarmStats.handled, itemStyle: { color: '#52c41a' } },
      ],
      barWidth: '48%',
      itemStyle: { borderRadius: [6, 6, 0, 0] },
    }],
  } : {};

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
        <Paragraph style={{ marginTop: 16 }} type="secondary">加载工作台数据...</Paragraph>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <Title level={4} style={{ margin: 0 }}>
            👋 欢迎回来，{user?.realName}
            <Tag color={ROLE_LABELS[user?.role]?.color || 'default'} style={{ marginLeft: 12 }}>
              {ROLE_LABELS[user?.role]?.label || user?.role}
            </Tag>
          </Title>
          <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0 }}>
            {formatDate(new Date())} · 今日巡检任务等待处理
          </Paragraph>
        </div>
      </div>

      <Row gutter={[16, 16]} className="stats-row">
        <Col xs={12} md={6}>
          <Card className="dashboard-card">
            <Statistic
              title="电池包总数"
              value={packStats?.total || 0}
              prefix={<DatabaseOutlined style={{ color: '#1677ff' }} />}
              valueStyle={{ color: '#1677ff' }}
            />
            <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
              可用 <Tag color="green">{packStats?.available || 0}</Tag> 个
            </Paragraph>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="dashboard-card">
            <Statistic
              title="待处理告警"
              value={alarmStats?.pending || 0}
              prefix={<AlertOutlined style={{ color: '#fa8c16' }} />}
              valueStyle={{ color: '#fa8c16' }}
            />
            <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
              热失控风险 <Tag color="red">{alarmStats?.thermal || 0}</Tag> 条
            </Paragraph>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="dashboard-card">
            <Statistic
              title="隔离中电池包"
              value={isoStats?.active || 0}
              prefix={<SafetyOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ color: '#722ed1' }}
            />
            <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
              紧急隔离 <Tag color="red">{isoStats?.emergency || 0}</Tag> 个
            </Paragraph>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="dashboard-card">
            <Statistic
              title="待执行调度"
              value={schStats?.pending + (schStats?.inProgress || 0) || 0}
              prefix={<TruckOutlined style={{ color: '#13c2c2' }} />}
              valueStyle={{ color: '#13c2c2' }}
            />
            <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
              本月完成 <Tag color="green">{schStats?.completed || 0}</Tag> 单
            </Paragraph>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={14}>
          <Card
            title={<Space><DatabaseOutlined />电池包状态分布</Space>}
            extra={
              <Button type="link" onClick={() => navigate('/battery-packs')}>
                查看详情 <ArrowRightOutlined />
              </Button>
            }
            style={{ height: 360 }}
          >
            {packStats && packStats.total > 0 ? (
              <ReactECharts option={statusChartOption} style={{ height: 280 }} />
            ) : (
              <Empty />
            )}
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card
            title={<Space><WarningOutlined />告警处理统计</Space>}
            extra={
              <Button type="link" onClick={() => navigate('/alarms')}>
                查看告警 <ArrowRightOutlined />
              </Button>
            }
            style={{ height: 360 }}
          >
            <ReactECharts option={alarmChartOption} style={{ height: 280 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={8}>
          <Card
            title={
              <Space>
                <ExclamationCircleOutlined style={{ color: '#fa8c16' }} />
                最新告警
              </Space>
            }
            size="small"
            extra={<Button size="small" type="link" onClick={() => navigate('/alarms')}>更多</Button>}
          >
            {recentAlarms.length > 0 ? (
              <List
                size="small"
                dataSource={recentAlarms}
                renderItem={(item) => (
                  <List.Item
                    style={{ padding: '10px 0', borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }}
                    onClick={() => navigate('/alarms')}
                  >
                    <List.Item.Meta
                      avatar={
                        <Tag color={ALARM_LEVEL[item.alarmLevel]?.color || 'default'} style={{ margin: 0 }}>
                          {ALARM_LEVEL[item.alarmLevel]?.label}
                        </Tag>
                      }
                      title={
                        <Space>
                          <span style={{ fontWeight: 500 }}>{item.alarmType}</span>
                          {item.isThermalRunawayRisk && <Tag color="red">🔥 热失控</Tag>}
                        </Space>
                      }
                      description={
                        <Space split="·" size={4}>
                          <span style={{ fontSize: 12 }}>{item.batteryPack?.packCode}</span>
                          <span style={{ fontSize: 12, color: '#999' }}>{formatDate(item.registeredAt).slice(5, 16)}</span>
                        </Space>
                      }
                    />
                    {!item.handled && <Tag color="orange" style={{ flexShrink: 0 }}>待处理</Tag>}
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="暂无告警" />
            )}
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card
            title={
              <Space>
                <SafetyOutlined style={{ color: '#722ed1' }} />
                隔离记录
              </Space>
            }
            size="small"
            extra={<Button size="small" type="link" onClick={() => navigate('/isolations')}>更多</Button>}
          >
            {recentIsolations.length > 0 ? (
              <List
                size="small"
                dataSource={recentIsolations}
                renderItem={(item) => (
                  <List.Item style={{ padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <List.Item.Meta
                      avatar={
                        <Tag color={item.isEmergency ? 'red' : 'purple'} style={{ margin: 0 }}>
                          {item.isEmergency ? '紧急' : '常规'}
                        </Tag>
                      }
                      title={<span style={{ fontWeight: 500 }}>{item.isolationReason}</span>}
                      description={
                        <Space split="·" size={4}>
                          <span style={{ fontSize: 12 }}>{item.batteryPack?.packCode}</span>
                          <span style={{ fontSize: 12, color: '#999' }}>
                            {item.judge?.realName} · {formatDate(item.judgedAt).slice(5, 16)}
                          </span>
                        </Space>
                      }
                    />
                    {item.released ? (
                      <Tag color="green">已解除</Tag>
                    ) : (
                      <Tag color="purple">隔离中</Tag>
                    )}
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="暂无隔离记录" />
            )}
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card
            title={
              <Space>
                <TruckOutlined style={{ color: '#13c2c2' }} />
                待办调度
              </Space>
            }
            size="small"
            extra={<Button size="small" type="link" onClick={() => navigate('/schedules')}>更多</Button>}
          >
            {pendingSchedules.length > 0 ? (
              <List
                size="small"
                dataSource={pendingSchedules}
                renderItem={(item) => (
                  <List.Item style={{ padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <List.Item.Meta
                      title={
                        <Space>
                          <span style={{ fontWeight: 500, fontSize: 13 }}>{item.scheduleNo.slice(-6)}</span>
                          <Tag color={item.status === 'PENDING' ? 'orange' : 'blue'}>
                            {item.status === 'PENDING' ? '待执行' : '执行中'}
                          </Tag>
                        </Space>
                      }
                      description={
                        <Space split="·" size={4} wrap>
                          <span style={{ fontSize: 12 }}>{item.station?.name}</span>
                          <span style={{ fontSize: 12, color: '#999' }}>{item.batteryPack?.packCode}</span>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="暂无待办调度" />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
