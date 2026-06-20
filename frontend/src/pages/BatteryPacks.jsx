import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Tag, Button, Space, Card, Row, Col, Statistic, Input, Select, Drawer,
  Descriptions, List, Timeline, Modal, Form, InputNumber, DatePicker, message, Empty, Spin, Tooltip, Popconfirm, Divider,
} from 'antd';
import {
  DatabaseOutlined, SearchOutlined, PlusOutlined, EyeOutlined,
  ExclamationCircleOutlined, LockOutlined, SafetyCertificateOutlined, TruckOutlined,
  ReloadOutlined, ClusterOutlined, WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from '../utils/request';
import { PACK_STATUS, formatDate, ROLE_LABELS, BATCH_RISK_LEVEL } from '../utils/constants';
import { useUserStore } from '../store/user';

const { Option } = Select;
const { RangePicker } = DatePicker;

export default function BatteryPacks() {
  const hasRole = useUserStore((s) => s.hasRole);
  const [loading, setLoading] = useState(false);
  const [packs, setPacks] = useState([]);
  const [stats, setStats] = useState({});
  const [detail, setDetail] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState();
  const [keyword, setKeyword] = useState('');
  const [stationId, setStationId] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [hasBatchRisk, setHasBatchRisk] = useState();
  const [stations, setStations] = useState([]);
  const [form] = Form.useForm();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);
      if (keyword) params.append('keyword', keyword);
      if (stationId) params.append('stationId', stationId);
      if (batchNo) params.append('batchNo', batchNo);
      if (hasBatchRisk !== undefined && hasBatchRisk !== '') params.append('hasBatchRisk', String(hasBatchRisk));
      const { data } = await axios.get(`/battery-packs?${params.toString()}`);
      setPacks(data.packs);
      setStats(data.stats);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, keyword, stationId, batchNo, hasBatchRisk]);

  useEffect(() => {
    loadStations();
    loadData();
  }, [loadData]);

  const loadStations = async () => {
    const { data } = await axios.get('/stations');
    setStations(data.stations);
  };

  const openDetail = async (id) => {
    setDrawerOpen(true);
    const { data } = await axios.get(`/battery-packs/${id}`);
    setDetail(data.pack);
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      await axios.post('/battery-packs', {
        ...values,
        manufactureDate: values.manufactureDate ? values.manufactureDate.toISOString() : undefined,
      });
      message.success('创建电池包成功');
      setCreateOpen(false);
      form.resetFields();
      loadData();
    } catch (e) {
      // handled
    }
  };

  const columns = [
    {
      title: '电池包编码',
      dataIndex: 'packCode',
      key: 'packCode',
      width: 140,
      fixed: 'left',
      render: (v, r) => (
        <Space>
          <DatabaseOutlined style={{ color: '#1677ff' }} />
          <a onClick={() => openDetail(r.id)} style={{ fontWeight: 500 }}>{v}</a>
        </Space>
      ),
    },
    {
      title: '型号',
      dataIndex: 'model',
      key: 'model',
      width: 120,
    },
    {
      title: '批次号',
      dataIndex: 'batchNo',
      key: 'batchNo',
      width: 130,
      render: (v, r) => v ? (
        <Tooltip title={`批次号：${v}`}>
          <Tag color="blue" style={{ margin: 0 }}>
            <ClusterOutlined /> {v}
          </Tag>
        </Tooltip>
      ) : <span style={{ color: '#bbb' }}>-</span>,
    },
    {
      title: '容量(kWh)',
      dataIndex: 'capacity',
      key: 'capacity',
      width: 90,
      align: 'center',
    },
    {
      title: '健康度',
      dataIndex: 'healthLevel',
      key: 'healthLevel',
      width: 100,
      align: 'center',
      render: (v) => {
        const color = v >= 90 ? 'green' : v >= 80 ? 'blue' : v >= 70 ? 'orange' : 'red';
        return <Tag color={color}>{v}%</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'currentStatus',
      key: 'currentStatus',
      width: 110,
      align: 'center',
      filters: Object.entries(PACK_STATUS).map(([k, v]) => ({ text: v.label, value: k })),
      onFilter: (value, record) => record.currentStatus === value,
      render: (v) => {
        const s = PACK_STATUS[v] || { label: v, color: 'default' };
        const icon = v === 'LOCKED' ? <LockOutlined /> : v === 'ISOLATED' ? <SafetyCertificateOutlined /> : v === 'ALARM' ? <ExclamationCircleOutlined /> : null;
        return (
          <Tag color={s.color} icon={icon} style={{ fontWeight: 500 }}>
            {s.label}
          </Tag>
        );
      },
    },
    {
      title: '所属站点',
      dataIndex: ['station', 'name'],
      key: 'station',
      width: 160,
      render: (v, r) => v || (r.currentStatus === 'IN_TRANSIT' ? <Tag color="geekblue"><TruckOutlined /> 运输中</Tag> : '-'),
    },
    {
      title: '位置',
      dataIndex: 'location',
      key: 'location',
      width: 80,
      align: 'center',
    },
    {
      title: '循环次数',
      dataIndex: 'cycleCount',
      key: 'cycleCount',
      width: 90,
      align: 'center',
    },
    {
      title: '最近检查',
      dataIndex: 'lastCheckDate',
      key: 'lastCheckDate',
      width: 120,
      render: (v) => formatDate(v).slice(0, 10),
    },
    {
      title: '告警/隔离',
      key: 'alert',
      width: 120,
      align: 'center',
      render: (_, r) => (
        <Space direction="vertical" size={2}>
          {r.alarms && r.alarms.length > 0 && <Tag color="orange" icon={<ExclamationCircleOutlined />}>有告警</Tag>}
          {r.isolations && r.isolations.length > 0 && <Tag color="purple" icon={<SafetyCertificateOutlined />}>隔离中</Tag>}
        </Space>
      ),
    },
    {
      title: '批次风险',
      key: 'batchRisk',
      width: 110,
      align: 'center',
      render: (_, r) => (
        r.batchRisks && r.batchRisks.length > 0 ? (
          <Tooltip title={`批次${r.batchRisks[0].batchRisk.batchNo}异常${r.batchRisks[0].batchRisk.abnormalCount}个`}>
            <Tag
              color={BATCH_RISK_LEVEL[r.batchRisks[0].batchRisk.riskLevel]?.color}
              icon={<WarningOutlined />}
            >
              {BATCH_RISK_LEVEL[r.batchRisks[0].batchRisk.riskLevel]?.label}
            </Tag>
          </Tooltip>
        ) : <span style={{ color: '#bbb' }}>正常</span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_, r) => (
        <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openDetail(r.id)}>
          详情
        </Button>
      ),
    },
  ];

  const StatsCard = ({ title, value, color, icon }) => (
    <Col xs={8} md={4}>
      <Card size="small" style={{ textAlign: 'center' }}>
        <Statistic value={value} valueStyle={{ color, fontSize: 20 }} prefix={icon} />
        <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{title}</div>
      </Card>
    </Col>
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title"><DatabaseOutlined /> 电池包管理</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          {hasRole('ADMIN', 'QC') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新增电池包
            </Button>
          )}
        </Space>
      </div>

      <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
        <StatsCard title="总数" value={stats.total || 0} color="#1677ff" icon={<DatabaseOutlined />} />
        <StatsCard title="可用" value={stats.available || 0} color="#52c41a" />
        <StatsCard title="充电中" value={stats.charging || 0} color="#13c2c2" />
        <StatsCard title="换电中" value={stats.inUse || 0} color="#1890ff" />
        <StatsCard title="告警" value={stats.alarm || 0} color="#fa8c16" icon={<ExclamationCircleOutlined />} />
        <StatsCard title="隔离" value={stats.isolated || 0} color="#722ed1" icon={<SafetyCertificateOutlined />} />
        <StatsCard title="锁定" value={stats.locked || 0} color="#f5222d" icon={<LockOutlined />} />
        <StatsCard title="批次风险" value={stats.withBatchRisk || 0} color="#d4380d" icon={<ClusterOutlined />} />
      </Row>

      <Card size="small">
        <div className="table-toolbar">
          <Input
            allowClear
            placeholder="搜索编码/型号"
            prefix={<SearchOutlined />}
            style={{ width: 180 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={loadData}
          />
          <Input
            allowClear
            placeholder="批次号"
            prefix={<ClusterOutlined />}
            style={{ width: 150 }}
            value={batchNo}
            onChange={(e) => setBatchNo(e.target.value)}
            onPressEnter={loadData}
          />
          <Select
            allowClear
            placeholder="状态筛选"
            style={{ width: 120 }}
            value={filterStatus}
            onChange={setFilterStatus}
          >
            {Object.entries(PACK_STATUS).map(([k, v]) => (
              <Option key={k} value={k}>{v.label}</Option>
            ))}
          </Select>
          <Select
            allowClear
            placeholder="批次风险"
            style={{ width: 120 }}
            value={hasBatchRisk}
            onChange={setHasBatchRisk}
          >
            <Option value={true}>仅风险包</Option>
            <Option value={false}>无风险</Option>
          </Select>
          <Select
            allowClear
            placeholder="所属站点"
            style={{ width: 180 }}
            value={stationId}
            onChange={setStationId}
          >
            {stations.map(s => (
              <Option key={s.id} value={s.id}>{s.code} - {s.name}</Option>
            ))}
          </Select>
          <Button type="primary" onClick={loadData}>查询</Button>
          <Button onClick={() => {
            setKeyword(''); setBatchNo(''); setFilterStatus(); setHasBatchRisk(); setStationId('');
          }}>重置</Button>
        </div>

        <Table
          rowKey="id"
          loading={loading}
          dataSource={packs}
          columns={columns}
          scroll={{ x: 1200 }}
          size="small"
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
        />
      </Card>

      <Drawer
        title="电池包详情"
        width={720}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={
          <Space>
            {detail?.currentStatus !== 'LOCKED' && detail?.currentStatus !== 'ISOLATED' && hasRole('QC', 'ADMIN') && (
              <Popconfirm title="确认可用于换电？" onConfirm={async () => {
                await axios.patch(`/battery-packs/${detail.id}`, { currentStatus: 'AVAILABLE' });
                message.success('状态已更新');
                openDetail(detail.id);
                loadData();
              }}>
                <Button type="primary">标记可用</Button>
              </Popconfirm>
            )}
          </Space>
        }
      >
        {detail ? (
          <Spin spinning={false}>
            <Descriptions title="基本信息" bordered column={2} size="small">
              <Descriptions.Item label="电池包编码"><b>{detail.packCode}</b></Descriptions.Item>
              <Descriptions.Item label="型号">{detail.model}</Descriptions.Item>
              <Descriptions.Item label="批次号">
                {detail.batchNo ? (
                  <Tag color="blue"><ClusterOutlined /> {detail.batchNo}</Tag>
                ) : <span style={{ color: '#999' }}>未设置</span>}
              </Descriptions.Item>
              <Descriptions.Item label="容量">{detail.capacity} kWh</Descriptions.Item>
              <Descriptions.Item label="健康度">
                <Tag color={detail.healthLevel >= 80 ? 'green' : 'orange'}>{detail.healthLevel}%</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="当前状态" span={2}>
                <Tag color={PACK_STATUS[detail.currentStatus]?.color} style={{ fontSize: 13, padding: '2px 10px' }}>
                  {PACK_STATUS[detail.currentStatus]?.label || detail.currentStatus}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="所属站点">{detail.station?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="仓位">{detail.location || '-'}</Descriptions.Item>
              <Descriptions.Item label="循环次数">{detail.cycleCount} 次</Descriptions.Item>
              <Descriptions.Item label="出厂日期">{formatDate(detail.manufactureDate).slice(0, 10)}</Descriptions.Item>
              <Descriptions.Item label="最近检查">{formatDate(detail.lastCheckDate).slice(0, 10)}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{formatDate(detail.createdAt)}</Descriptions.Item>
            </Descriptions>

            <Divider orientation="left" plain>告警记录</Divider>
            {detail.alarms && detail.alarms.length > 0 ? (
              <List
                size="small"
                bordered
                dataSource={detail.alarms}
                renderItem={(a) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space>
                          <Tag color={a.alarmLevel === 'EMERGENCY' ? 'red' : a.alarmLevel === 'CRITICAL' ? 'volcano' : 'orange'}>
                            {a.alarmLevel}
                          </Tag>
                          <b>{a.alarmType}</b>
                          {a.isThermalRunawayRisk && <Tag color="red" icon={<LockOutlined />}>热失控风险</Tag>}
                          {a.handled ? <Tag color="green">已处理</Tag> : <Tag color="orange">待处理</Tag>}
                        </Space>
                      }
                      description={
                        <Space split="·" size={4} wrap>
                          <span>登记人：{a.registrant?.realName}</span>
                          <span>{formatDate(a.registeredAt)}</span>
                          {a.handledBy && <span>处理人：{a.handler?.realName}</span>}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : <Empty description="暂无告警记录" />}

            <Divider orientation="left" plain>隔离记录</Divider>
            {detail.isolations && detail.isolations.length > 0 ? (
              <List
                size="small"
                bordered
                dataSource={detail.isolations}
                renderItem={(iso) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space>
                          <Tag color={iso.isEmergency ? 'red' : 'purple'}>{iso.isEmergency ? '紧急隔离' : '常规隔离'}</Tag>
                          <b>{iso.isolationReason}</b>
                          {iso.released ? <Tag color="green">已解除</Tag> : <Tag color="purple">隔离中</Tag>}
                        </Space>
                      }
                      description={
                        <div>
                          <div style={{ color: '#666', marginBottom: 4 }}>{iso.reasonDetail}</div>
                          <Space split="·" size={4}>
                            <span>质检员：{iso.judge?.realName}</span>
                            <span>{formatDate(iso.judgedAt)}</span>
                            {iso.releasedBy && <span>解除人：{iso.releaser?.realName} · {formatDate(iso.releasedAt)}</span>}
                          </Space>
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : <Empty description="暂无隔离记录" />}

            <Divider orientation="left" plain>调度记录</Divider>
            {detail.schedules && detail.schedules.length > 0 ? (
              <List
                size="small"
                bordered
                dataSource={detail.schedules}
                renderItem={(sch) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space>
                          <Tag>{sch.scheduleType}</Tag>
                          <b>{sch.scheduleNo}</b>
                          <Tag color={sch.status === 'COMPLETED' ? 'green' : sch.status === 'PENDING' ? 'orange' : 'blue'}>{sch.status}</Tag>
                        </Space>
                      }
                      description={
                        <Space split="·" size={4}>
                          <span>{sch.station?.name}</span>
                          <span>调度员：{sch.creator?.realName}</span>
                          <span>{formatDate(sch.scheduledDate).slice(0, 10)}</span>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : <Empty description="暂无调度记录" />}

            <Divider orientation="left" plain>批次风险记录</Divider>
            {detail.batchRisks && detail.batchRisks.length > 0 ? (
              <List
                size="small"
                bordered
                dataSource={detail.batchRisks}
                renderItem={(br) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space>
                          <ClusterOutlined style={{ color: '#d4380d' }} />
                          <Tag color={BATCH_RISK_LEVEL[br.batchRisk.riskLevel]?.color}>
                            {BATCH_RISK_LEVEL[br.batchRisk.riskLevel]?.label}
                          </Tag>
                          <b>批次 {br.batchRisk.batchNo}</b>
                          <span style={{ color: '#888' }}>异常 {br.batchRisk.abnormalCount}/{br.batchRisk.totalCount} 个</span>
                          {br.batchRisk.resolved
                            ? <Tag color="green">已解决</Tag>
                            : <Tag color="red">未解决</Tag>}
                        </Space>
                      }
                      description={
                        <Space split="·" size={4} wrap>
                          <span>检测人：{br.batchRisk.detectedByUser?.realName || '系统自动检测'}</span>
                          <span>{formatDate(br.batchRisk.detectedAt)}</span>
                          <span>{br.packStatus && `处理状态：${br.packStatus}`}</span>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : <Empty description="暂无批次风险记录" />}

            <Divider orientation="left" plain>状态轨迹</Divider>
            <div className="trajectory-timeline">
              {detail.trajectories && detail.trajectories.length > 0 ? (
                <Timeline
                  mode="left"
                  items={detail.trajectories.map((t) => ({
                    color: t.newStatus === 'LOCKED' ? 'red' : t.newStatus === 'ISOLATED' ? 'purple' : t.newStatus === 'AVAILABLE' ? 'green' : 'blue',
                    label: <span style={{ color: '#888', fontSize: 12 }}>{formatDate(t.operatedAt)}</span>,
                    children: (
                      <div>
                        <div style={{ fontWeight: 500 }}>
                          <Tag style={{ marginRight: 8 }} color={PACK_STATUS[t.oldStatus]?.color}>{PACK_STATUS[t.oldStatus]?.label}</Tag>
                          →
                          <Tag style={{ marginLeft: 8 }} color={PACK_STATUS[t.newStatus]?.color}>{PACK_STATUS[t.newStatus]?.label}</Tag>
                        </div>
                        <div style={{ color: '#666', marginTop: 4 }}>
                          <b>{t.operation}</b>
                          {t.remark && <span style={{ marginLeft: 8 }}>· {t.remark}</span>}
                        </div>
                        <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                          操作人：{t.operator?.realName}
                          <Tag color={ROLE_LABELS[t.operator?.role]?.color} style={{ marginLeft: 6 }}>
                            {ROLE_LABELS[t.operator?.role]?.label}
                          </Tag>
                        </div>
                      </div>
                    ),
                  }))}
                />
              ) : <Empty description="暂无状态变化" />}
            </div>
          </Spin>
        ) : <Spin />}
      </Drawer>

      <Modal
        title="新增电池包"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        footer={null}
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="电池包编码" name="packCode" rules={[{ required: true }]}>
                <Input placeholder="例如：BAT000041" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="批次号" name="batchNo" tooltip="供应商批次号，用于批量风险检测">
                <Input placeholder="例如：CATL-2026-W23" prefix={<ClusterOutlined />} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="型号" name="model" rules={[{ required: true }]}>
                <Select>
                  {['CATL-100kWh', 'BYD-85kWh', 'GOTION-75kWh', 'CALB-95kWh', 'EVE-80kWh'].map(m => <Option key={m}>{m}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="容量(kWh)" name="capacity" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={1} max={200} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="健康度(%)" name="healthLevel" rules={[{ required: true }]} initialValue={95}>
                <InputNumber style={{ width: '100%' }} min={0} max={100} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="所属站点" name="stationId">
                <Select allowClear placeholder="选择站点">
                  {stations.map(s => <Option key={s.id} value={s.id}>{s.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="仓位位置" name="location">
                <Input placeholder="例如：A-01" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="循环次数" name="cycleCount" initialValue={0}>
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="出厂日期" name="manufactureDate">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Space>
              <Button onClick={() => { setCreateOpen(false); form.resetFields(); }}>取消</Button>
              <Button type="primary" htmlType="submit">确认创建</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
