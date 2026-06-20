import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Tag, Button, Space, Card, Row, Col, Statistic, Input, Select, Drawer,
  Descriptions, Modal, Form, DatePicker, message, Spin, Empty, Alert, Timeline, Popconfirm, InputNumber, Tooltip,
} from 'antd';
import {
  TruckOutlined, SearchOutlined, PlusOutlined, EyeOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined,
  ReloadOutlined, SafetyCertificateOutlined,
  ImportOutlined, ExportOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from '../utils/request';
import { PACK_STATUS, SCHEDULE_STATUS, SCHEDULE_TYPE, formatDate, ROLE_LABELS, formatDateShort } from '../utils/constants';
import { useUserStore } from '../store/user';

const { Option } = Select;
const { TextArea } = Input;

export default function InventorySchedules() {
  const hasRole = useUserStore((s) => s.hasRole);
  const user = useUserStore((s) => s.user);
  const [loading, setLoading] = useState(false);
  const [schedules, setSchedules] = useState([]);
  const [stats, setStats] = useState({});
  const [detail, setDetail] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState();
  const [filterType, setFilterType] = useState();
  const [keyword, setKeyword] = useState('');
  const [stations, setStations] = useState([]);
  const [batteryPacks, setBatteryPacks] = useState([]);
  const [form] = Form.useForm();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);
      if (filterType) params.append('scheduleType', filterType);
      const { data } = await axios.get(`/schedules?${params.toString()}`);
      let list = data.schedules;
      if (keyword) {
        list = list.filter(s =>
          s.scheduleNo.includes(keyword) ||
          s.batteryPack?.packCode?.includes(keyword) ||
          s.station?.name?.includes(keyword)
        );
      }
      setSchedules(list);
      setStats(data.stats);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType, keyword]);

  useEffect(() => {
    loadData();
    loadOptions();
  }, [loadData]);

  const loadOptions = async () => {
    const [stationsRes, packsRes] = await Promise.all([
      axios.get('/stations'),
      axios.get('/battery-packs'),
    ]);
    setStations(stationsRes.data.stations);
    setBatteryPacks(packsRes.data.packs);
  };

  const openDetail = async (id) => {
    setDrawerOpen(true);
    const { data } = await axios.get(`/schedules/${id}`);
    setDetail(data.schedule);
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      await axios.post('/schedules', {
        ...values,
        scheduledDate: values.scheduledDate ? values.scheduledDate.toISOString() : undefined,
      });
      message.success('调度单创建成功！');
      setCreateOpen(false);
      form.resetFields();
      loadData();
    } catch (e) { /* handled */ }
  };

  const updateSchedule = async (id, data) => {
    try {
      await axios.patch(`/schedules/${id}`, data);
      message.success('调度状态已更新');
      if (drawerOpen && detail?.id === id) openDetail(id);
      loadData();
    } catch (e) { /* handled */ }
  };

  const handleConfirmArrival = (record) => {
    const pack = record.batteryPack;
    const hasActiveAlarm = pack?.alarms && pack.alarms.length > 0;
    const isLocked = pack?.currentStatus === 'LOCKED' || pack?.currentStatus === 'ISOLATED';

    if (isLocked || hasActiveAlarm) {
      Modal.warning({
        title: '⚠️ 电池包存在告警/隔离记录',
        content: (
          <div>
            <p>该电池包存在未处理的告警或隔离状态：</p>
            <p>
              <Tag color={PACK_STATUS[pack?.currentStatus]?.color}>
                当前状态：{PACK_STATUS[pack?.currentStatus]?.label}
              </Tag>
            </p>
            <Alert
              message="✅ 系统将保留原告警记录，不会被覆盖！"
              description="电池包到站后将保持原告警/隔离状态，需值班员和质检员另行处理后方可参与换电。"
              type="success"
              showIcon
              style={{ marginTop: 8 }}
            />
          </div>
        ),
        okText: '确认到站（保留告警）',
        onOk: () => updateSchedule(record.id, {
          status: 'COMPLETED',
          actualArrivalDate: new Date().toISOString(),
          recipientRemark: `电池包到站签收 - 当前状态保留：${PACK_STATUS[pack?.currentStatus]?.label}，原告警记录未覆盖`,
        }),
      });
    } else {
      updateSchedule(record.id, {
        status: 'COMPLETED',
        actualArrivalDate: new Date().toISOString(),
        recipientRemark: `${user?.realName} 到站签收，电池包状态正常`,
      });
    }
  };

  const columns = [
    {
      title: '调度单号',
      dataIndex: 'scheduleNo',
      key: 'scheduleNo',
      width: 150,
      fixed: 'left',
      render: (v, r) => (
        <a onClick={() => openDetail(r.id)} style={{ fontWeight: 500, fontFamily: 'monospace' }}>
          {v.slice(-8)}
        </a>
      ),
    },
    {
      title: '类型',
      dataIndex: 'scheduleType',
      key: 'scheduleType',
      width: 110,
      align: 'center',
      render: (v) => {
        const s = SCHEDULE_TYPE[v] || { label: v, color: 'default' };
        const icon = v === 'REPLENISH' || v === 'TRANSFER_IN' ? <ImportOutlined /> : <ExportOutlined />;
        return <Tag color={s.color} icon={icon} style={{ fontWeight: 500 }}>{s.label}</Tag>;
      },
    },
    {
      title: '电池包',
      key: 'pack',
      width: 150,
      render: (_, r) => (
        <Space direction="vertical" size={2}>
          <span style={{ fontWeight: 500 }}>{r.batteryPack?.packCode}</span>
          <Space size={4}>
            <Tag color={PACK_STATUS[r.batteryPack?.currentStatus]?.color} style={{ fontSize: 11, margin: 0 }}>
              {PACK_STATUS[r.batteryPack?.currentStatus]?.label}
            </Tag>
            {r.batteryPack?.alarms && r.batteryPack.alarms.length > 0 && (
              <Tooltip title="该电池包存在未处理告警">
                <Tag color="orange" style={{ fontSize: 11, margin: 0 }}><WarningOutlined /> 有告警</Tag>
              </Tooltip>
            )}
          </Space>
        </Space>
      ),
    },
    {
      title: '目标站点',
      dataIndex: ['station', 'name'],
      key: 'station',
      width: 160,
      render: (v, r) => (
        <Space direction="vertical" size={0}>
          <span>{v}</span>
          <span style={{ fontSize: 11, color: '#999' }}>{r.station?.code}</span>
        </Space>
      ),
    },
    {
      title: '计划日期',
      dataIndex: 'scheduledDate',
      key: 'scheduledDate',
      width: 110,
      render: (v) => formatDateShort(v),
    },
    {
      title: '实际到站',
      dataIndex: 'actualArrivalDate',
      key: 'actualArrivalDate',
      width: 110,
      render: (v) => v ? formatDateShort(v) : <span style={{ color: '#bbb' }}>-</span>,
    },
    {
      title: '调度员',
      key: 'creator',
      width: 90,
      render: (_, r) => r.creator?.realName,
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      align: 'center',
      render: (_, r) => {
        const s = SCHEDULE_STATUS[r.status] || { label: r.status, color: 'default' };
        let icon = null;
        if (r.status === 'COMPLETED') icon = <CheckCircleOutlined />;
        else if (r.status === 'PENDING') icon = <ClockCircleOutlined />;
        else if (r.status === 'CANCELLED') icon = <CloseCircleOutlined />;
        return <Tag color={s.color} icon={icon} style={{ fontWeight: 500 }}>{s.label}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openDetail(r.id)}>详情</Button>
          {hasRole('DISPATCH', 'ADMIN') && r.status === 'PENDING' && (
            <Button size="small" type="link" onClick={() => updateSchedule(r.id, { status: 'IN_PROGRESS' })}>
              开始执行
            </Button>
          )}
          {(hasRole('DUTY', 'DISPATCH', 'ADMIN')) && r.status === 'IN_PROGRESS' &&
           (r.scheduleType === 'REPLENISH' || r.scheduleType === 'TRANSFER_IN') && (
            <Button size="small" type="link" onClick={() => handleConfirmArrival(r)}>
              确认到站
            </Button>
          )}
          {hasRole('DISPATCH', 'ADMIN') && r.status === 'PENDING' && (
            <Popconfirm title="确认取消此调度单？" onConfirm={() => updateSchedule(r.id, { status: 'CANCELLED' })}>
              <Button size="small" type="link" danger>取消</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title"><TruckOutlined style={{ color: '#13c2c2' }} /> 库存调度</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          {hasRole('DISPATCH', 'ADMIN') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setCreateOpen(true); form.resetFields(); }}>
              创建调度单
            </Button>
          )}
        </Space>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="调度单总数" value={stats.total || 0} valueStyle={{ color: '#1677ff' }} prefix={<TruckOutlined />} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="待执行" value={stats.pending || 0} valueStyle={{ color: '#fa8c16' }} prefix={<ClockCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="执行中" value={stats.inProgress || 0} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="已完成" value={stats.completed || 0} valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
      </Row>

      <Alert
        message="📋 调度规则"
        description={
          <Space size={16}>
            <span>• 补货/转入到站时，如电池包带告警/隔离，<b>原告警记录不会被覆盖</b></span>
            <span>• 隔离/锁定状态的电池包无法参与换电</span>
          </Space>
        }
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Card size="small">
        <div className="table-toolbar">
          <Input
            allowClear
            placeholder="搜索单号/电池包/站点"
            prefix={<SearchOutlined />}
            style={{ width: 240 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Select
            allowClear
            placeholder="调度类型"
            style={{ width: 140 }}
            value={filterType}
            onChange={setFilterType}
          >
            {Object.entries(SCHEDULE_TYPE).map(([k, v]) => (
              <Option key={k} value={k}>{v.label}</Option>
            ))}
          </Select>
          <Select
            allowClear
            placeholder="执行状态"
            style={{ width: 120 }}
            value={filterStatus}
            onChange={setFilterStatus}
          >
            {Object.entries(SCHEDULE_STATUS).map(([k, v]) => (
              <Option key={k} value={k}>{v.label}</Option>
            ))}
          </Select>
          <Button type="primary" onClick={loadData}>查询</Button>
          <Button onClick={() => { setFilterStatus(undefined); setFilterType(undefined); setKeyword(''); }}>重置</Button>
        </div>

        <Table
          rowKey="id"
          loading={loading}
          dataSource={schedules}
          columns={columns}
          scroll={{ x: 1300 }}
          size="small"
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
        />
      </Card>

      <Drawer
        title="调度单详情"
        width={640}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={
          detail && (detail.status === 'PENDING' || detail.status === 'IN_PROGRESS') && (
            <Space>
              {detail.status === 'PENDING' && hasRole('DISPATCH', 'ADMIN') && (
                <Button onClick={() => updateSchedule(detail.id, { status: 'IN_PROGRESS' })}>
                  开始执行
                </Button>
              )}
              {detail.status === 'IN_PROGRESS' &&
               (detail.scheduleType === 'REPLENISH' || detail.scheduleType === 'TRANSFER_IN') && (
                <Button type="primary" onClick={() => handleConfirmArrival(detail)}>
                  确认到站签收
                </Button>
              )}
            </Space>
          )
        }
      >
        {detail ? (
          <>
            {detail.status === 'COMPLETED' && (
              <Alert message="✅ 调度已完成" type="success" showIcon style={{ marginBottom: 16 }} />
            )}
            {detail.batteryPack?.currentStatus !== 'AVAILABLE' && detail.status === 'COMPLETED' &&
             (detail.batteryPack?.currentStatus === 'LOCKED' || detail.batteryPack?.currentStatus === 'ISOLATED' || detail.alarmId) && (
              <Alert
                message={
                  <span>
                    <SafetyCertificateOutlined /> 电池包到站后<b>保留原告警/隔离状态</b>，未被覆盖
                  </span>
                }
                description={
                  <Space>
                    <Tag color={PACK_STATUS[detail.batteryPack?.currentStatus]?.color}>
                      当前状态：{PACK_STATUS[detail.batteryPack?.currentStatus]?.label}
                    </Tag>
                    {detail.alarmId && <Tag color="orange">关联告警ID：{detail.alarmId.slice(0, 8)}...</Tag>}
                  </Space>
                }
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}
            <Descriptions title="调度信息" bordered column={2} size="small">
              <Descriptions.Item label="调度单号" span={2}>
                <b style={{ fontFamily: 'monospace', fontSize: 14 }}>{detail.scheduleNo}</b>
              </Descriptions.Item>
              <Descriptions.Item label="调度类型">
                <Tag color={SCHEDULE_TYPE[detail.scheduleType]?.color}>
                  {SCHEDULE_TYPE[detail.scheduleType]?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={SCHEDULE_STATUS[detail.status]?.color}>
                  {SCHEDULE_STATUS[detail.status]?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="电池包">
                <Space direction="vertical" size={2}>
                  <b>{detail.batteryPack?.packCode}</b>
                  <Tag color={PACK_STATUS[detail.batteryPack?.currentStatus]?.color} style={{ margin: 0 }}>
                    {PACK_STATUS[detail.batteryPack?.currentStatus]?.label}
                  </Tag>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="目标站点">{detail.station?.name}</Descriptions.Item>
              <Descriptions.Item label="电池包型号">{detail.batteryPack?.model}</Descriptions.Item>
              <Descriptions.Item label="容量/健康度">
                {detail.batteryPack?.capacity}kWh / {detail.batteryPack?.healthLevel}%
              </Descriptions.Item>
              <Descriptions.Item label="计划日期">{formatDateShort(detail.scheduledDate)}</Descriptions.Item>
              <Descriptions.Item label="实际到站">
                {detail.actualArrivalDate ? formatDate(detail.actualArrivalDate) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="创建调度员">
                {detail.creator?.realName}
                <Tag color={ROLE_LABELS[detail.creator?.role]?.color} style={{ marginLeft: 6 }}>
                  {ROLE_LABELS[detail.creator?.role]?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">{formatDate(detail.createdAt)}</Descriptions.Item>
              {detail.operatorRemark && (
                <Descriptions.Item label="调度备注" span={2}>{detail.operatorRemark}</Descriptions.Item>
              )}
              {detail.recipientRemark && (
                <Descriptions.Item label="签收/备注" span={2}>{detail.recipientRemark}</Descriptions.Item>
              )}
            </Descriptions>

            {detail.batteryPack?.isolations && detail.batteryPack.isolations.filter(i => !i.released).length > 0 && (
              <>
                <div style={{ marginTop: 20, fontWeight: 600, marginBottom: 8 }}>
                  <SafetyCertificateOutlined style={{ color: '#722ed1' }} /> 关联未解除隔离
                </div>
                <Alert
                  message={detail.batteryPack.isolations.filter(i => !i.released).map(i => i.isolationReason).join('、')}
                  type="warning"
                  showIcon
                />
              </>
            )}
          </>
        ) : <Spin />}
      </Drawer>

      <Modal
        title="创建库存调度单"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        footer={null}
        width={560}
      >
        <Alert
          message={
            <div>
              <p>• 转出/召回/维护类调度：电池包立即转入「运输中」状态</p>
              <p>• 补货/转入类调度：<b>如电池包带告警/隔离，到站时原告警记录不会被覆盖</b></p>
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item label="调度类型" name="scheduleType" rules={[{ required: true }]} initialValue="REPLENISH">
            <Select>
              <Option value="REPLENISH">📦 补货到站（调入新电池）</Option>
              <Option value="TRANSFER_IN">🔄 站点转入（站内调拨）</Option>
              <Option value="TRANSFER_OUT">📤 站点转出（调往他站）</Option>
              <Option value="RECALL">🚨 召回检修（问题电池）</Option>
              <Option value="MAINTENANCE">🔧 维护送检（定期保养）</Option>
            </Select>
          </Form.Item>
          <Form.Item label="选择电池包" name="packId" rules={[{ required: true, message: '请选择要调度的电池包' }]}>
            <Select showSearch placeholder="选择电池包" optionFilterProp="label">
              {batteryPacks.map(p => (
                <Option key={p.id} value={p.id} label={p.packCode}>
                  <Space>
                    <b>{p.packCode}</b>
                    <Tag color={PACK_STATUS[p.currentStatus]?.color}>{PACK_STATUS[p.currentStatus]?.label}</Tag>
                    <span style={{ color: '#888' }}>{p.model} {p.capacity}kWh</span>
                    {p.station?.name && <span style={{ color: '#aaa' }}>· {p.station.name}</span>}
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item label="目标站点" name="stationId" rules={[{ required: true }]}>
                <Select placeholder="选择目标站点">
                  {stations.map(s => (
                    <Option key={s.id} value={s.id}>
                      <Space>
                        <b>{s.name}</b>
                        <span style={{ color: '#888' }}>{s.code} 容量{s.capacity}</span>
                      </Space>
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="数量" name="quantity" initialValue={1}>
                <InputNumber style={{ width: '100%' }} min={1} max={10} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="计划到达日期" name="scheduledDate" rules={[{ required: true }]} initialValue={dayjs()}>
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => d && d.valueOf() < dayjs().startOf('day').valueOf()} />
          </Form.Item>
          <Form.Item label="调度备注" name="operatorRemark">
            <TextArea rows={2} placeholder="调度原因、特殊要求等..." />
          </Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Space>
              <Button onClick={() => setCreateOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit">创建调度单</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
