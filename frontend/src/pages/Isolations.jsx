import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Tag, Button, Space, Card, Row, Col, Statistic, Input, Select, Drawer,
  Descriptions, Modal, Form, Radio, Switch, message, Spin, Empty, Alert, Timeline,
} from 'antd';
import {
  SafetyCertificateOutlined, SearchOutlined, PlusOutlined, EyeOutlined,
  WarningOutlined, UnlockOutlined, FireOutlined, ReloadOutlined,
  LockOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import axios from '../utils/request';
import { PACK_STATUS, ISOLATION_REASONS, formatDate, ROLE_LABELS } from '../utils/constants';
import { useUserStore } from '../store/user';

const { Option } = Select;
const { TextArea } = Input;

export default function Isolations() {
  const hasRole = useUserStore((s) => s.hasRole);
  const user = useUserStore((s) => s.user);
  const [loading, setLoading] = useState(false);
  const [isolations, setIsolations] = useState([]);
  const [stats, setStats] = useState({});
  const [detail, setDetail] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [filterReleased, setFilterReleased] = useState();
  const [filterEmergency, setFilterEmergency] = useState();
  const [keyword, setKeyword] = useState('');
  const [batteryPacks, setBatteryPacks] = useState([]);
  const [alarms, setAlarms] = useState([]);
  const [form] = Form.useForm();
  const [releaseForm] = Form.useForm();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterReleased !== undefined && filterReleased !== null) params.append('released', String(filterReleased));
      if (filterEmergency !== undefined && filterEmergency !== null) params.append('isEmergency', String(filterEmergency));
      const { data } = await axios.get(`/isolations?${params.toString()}`);
      let list = data.isolations;
      if (keyword) {
        list = list.filter(i =>
          i.isolationReason.includes(keyword) ||
          i.batteryPack?.packCode?.includes(keyword) ||
          i.reasonDetail?.includes(keyword)
        );
      }
      setIsolations(list);
      setStats(data.stats);
    } finally {
      setLoading(false);
    }
  }, [filterReleased, filterEmergency, keyword]);

  useEffect(() => {
    loadData();
    loadRelatedData();
  }, [loadData]);

  const loadRelatedData = async () => {
    const [packsRes, alarmsRes] = await Promise.all([
      axios.get('/battery-packs'),
      axios.get('/alarms?handled=false'),
    ]);
    setBatteryPacks(packsRes.data.packs.filter(p => p.currentStatus === 'ALARM' || p.currentStatus === 'AVAILABLE'));
    setAlarms(alarmsRes.data.alarms.filter(a => !a.handled));
  };

  const openDetail = async (id) => {
    setDrawerOpen(true);
    const { data } = await axios.get(`/isolations/${id}`);
    setDetail(data.isolation);
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      await axios.post('/isolations', values);
      message.success('隔离判定成功！电池包已隔离，无法参与换电');
      setCreateOpen(false);
      form.resetFields();
      loadData();
    } catch (e) { /* handled */ }
  };

  const handleRelease = async () => {
    try {
      const values = await releaseForm.validateFields();
      await axios.patch(`/isolations/${detail?.id}/release`, values);
      message.success('解除隔离成功！电池包状态已更新');
      setReleaseOpen(false);
      releaseForm.resetFields();
      if (drawerOpen) openDetail(detail.id);
      loadData();
    } catch (e) { /* handled */ }
  };

  const columns = [
    {
      title: '紧急度',
      dataIndex: 'isEmergency',
      key: 'emergency',
      width: 80,
      align: 'center',
      render: (v) => (
        <Tag color={v ? 'red' : 'purple'} icon={v ? <FireOutlined /> : <SafetyCertificateOutlined />}>
          {v ? '紧急' : '常规'}
        </Tag>
      ),
    },
    {
      title: '隔离原因',
      dataIndex: 'isolationReason',
      key: 'isolationReason',
      width: 140,
      render: (v, r) => (
        <a onClick={() => openDetail(r.id)} style={{ fontWeight: 500 }}>{v}</a>
      ),
    },
    {
      title: '电池包',
      key: 'pack',
      width: 140,
      render: (_, r) => (
        <Space direction="vertical" size={2}>
          <span style={{ fontWeight: 500 }}>{r.batteryPack?.packCode}</span>
          <Tag color={PACK_STATUS[r.batteryPack?.currentStatus]?.color} style={{ fontSize: 11, margin: 0 }}>
            {r.isEmergency ? '🔥 紧急锁定' : PACK_STATUS[r.batteryPack?.currentStatus]?.label}
          </Tag>
        </Space>
      ),
    },
    {
      title: '所属站点',
      dataIndex: ['batteryPack', 'station', 'name'],
      key: 'station',
      width: 140,
    },
    {
      title: '详情',
      dataIndex: 'reasonDetail',
      key: 'reasonDetail',
      ellipsis: true,
      render: (v) => v || <span style={{ color: '#bbb' }}>无</span>,
    },
    {
      title: '质检员',
      key: 'judge',
      width: 100,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span>{r.judge?.realName}</span>
          <Tag color={ROLE_LABELS[r.judge?.role]?.color} style={{ fontSize: 10, margin: 0, padding: '0 4px' }}>
            {ROLE_LABELS[r.judge?.role]?.label}
          </Tag>
        </Space>
      ),
    },
    {
      title: '判定时间',
      dataIndex: 'judgedAt',
      key: 'judgedAt',
      width: 150,
      render: (v) => formatDate(v).slice(5),
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      align: 'center',
      render: (_, r) => r.released ? (
        <Tag color="green" icon={<UnlockOutlined />}>已解除</Tag>
      ) : (
        <Tag color="purple" icon={<LockOutlined />}>隔离中</Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openDetail(r.id)}>详情</Button>
          {!r.released && hasRole('QC', 'ADMIN') && (
            <Button size="small" type="link" onClick={() => { setDetail(r); setReleaseOpen(true); }}>解除</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title"><SafetyCertificateOutlined style={{ color: '#722ed1' }} /> 隔离区</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          {hasRole('QC', 'ADMIN') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setCreateOpen(true); form.resetFields(); }}>
              新增隔离判定
            </Button>
          )}
        </Space>
      </div>

      {stats.emergency > 0 && (
        <Alert
          message={<span><LockOutlined /> 有 {stats.emergency} 个电池包处于紧急隔离状态，请尽快处理！</span>}
          type="error"
          showIcon
          closable
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="隔离记录" value={stats.total || 0} valueStyle={{ color: '#1677ff' }} prefix={<SafetyCertificateOutlined />} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="隔离中" value={stats.active || 0} valueStyle={{ color: '#722ed1' }} prefix={<LockOutlined />} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="🔥 紧急隔离" value={stats.emergency || 0} valueStyle={{ color: '#f5222d' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="已解除" value={stats.released || 0} valueStyle={{ color: '#52c41a' }} prefix={<UnlockOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card size="small">
        <div className="table-toolbar">
          <Input
            allowClear
            placeholder="搜索原因/电池包"
            prefix={<SearchOutlined />}
            style={{ width: 200 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Select
            allowClear
            placeholder="隔离状态"
            style={{ width: 120 }}
            value={filterReleased}
            onChange={setFilterReleased}
          >
            <Option value={false}>隔离中</Option>
            <Option value={true}>已解除</Option>
          </Select>
          <Select
            allowClear
            placeholder="紧急程度"
            style={{ width: 130 }}
            value={filterEmergency}
            onChange={setFilterEmergency}
          >
            <Option value={true}>🔥 仅紧急</Option>
            <Option value={false}>仅常规</Option>
          </Select>
          <Button type="primary" onClick={loadData}>查询</Button>
          <Button onClick={() => { setFilterReleased(undefined); setFilterEmergency(undefined); setKeyword(''); }}>
            重置
          </Button>
        </div>

        <Table
          rowKey="id"
          loading={loading}
          dataSource={isolations}
          columns={columns}
          scroll={{ x: 1300 }}
          size="small"
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          rowClassName={(r) => r.isEmergency && !r.released ? '!bg-red-50' : ''}
        />
      </Card>

      <Drawer
        title="隔离详情"
        width={640}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={
          detail && !detail.released && hasRole('QC', 'ADMIN') ? (
            <Button type="primary" icon={<UnlockOutlined />} onClick={() => setReleaseOpen(true)}>
              解除隔离
            </Button>
          ) : null
        }
      >
        {detail ? (
          <>
            {detail.isEmergency && !detail.released && (
              <Alert
                message="🚨 紧急隔离状态 - 电池包已锁定，禁止参与任何换电操作"
                type="error"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}
            {!detail.released && !detail.isEmergency && (
              <Alert
                message="⛔ 隔离中 - 此电池包暂不可参与换电，解除后恢复"
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}
            {detail.released && (
              <Alert
                message="✅ 已解除隔离"
                type="success"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}
            <Descriptions title="隔离信息" bordered column={2} size="small">
              <Descriptions.Item label="紧急程度" span={2}>
                <Space>
                  <Tag color={detail.isEmergency ? 'red' : 'purple'} style={{ fontSize: 13 }}>
                    {detail.isEmergency ? '🔥 紧急锁定' : '常规隔离'}
                  </Tag>
                  <Tag color={detail.released ? 'green' : 'orange'}>
                    {detail.released ? '已解除' : '隔离中'}
                  </Tag>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="隔离原因" span={2}>
                <b style={{ fontSize: 14 }}>{detail.isolationReason}</b>
              </Descriptions.Item>
              <Descriptions.Item label="判定详情" span={2}>{detail.reasonDetail || '-'}</Descriptions.Item>
              <Descriptions.Item label="电池包编码"><b>{detail.batteryPack?.packCode}</b></Descriptions.Item>
              <Descriptions.Item label="当前状态">
                <Tag color={PACK_STATUS[detail.batteryPack?.currentStatus]?.color}>
                  {PACK_STATUS[detail.batteryPack?.currentStatus]?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="所属站点">{detail.batteryPack?.station?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="仓位">{detail.batteryPack?.location || '-'}</Descriptions.Item>
              <Descriptions.Item label="判定质检员">
                {detail.judge?.realName}
                <Tag color={ROLE_LABELS[detail.judge?.role]?.color} style={{ marginLeft: 6 }}>
                  {ROLE_LABELS[detail.judge?.role]?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="判定时间">{formatDate(detail.judgedAt)}</Descriptions.Item>
              {detail.released && (
                <>
                  <Descriptions.Item label="解除人员">
                    {detail.releaser?.realName || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="解除时间">{formatDate(detail.releasedAt)}</Descriptions.Item>
                  <Descriptions.Item label="解除备注" span={2}>{detail.releaseRemark || '-'}</Descriptions.Item>
                </>
              )}
            </Descriptions>

            {detail.alarm && (
              <>
                <div style={{ marginTop: 20, fontWeight: 600, marginBottom: 8 }}>关联告警</div>
                <Alert
                  message={
                    <Space>
                      <b>{detail.alarm.alarmType}</b>
                      <span style={{ color: '#888' }}>登记人：{detail.alarm.registrant?.realName}</span>
                    </Space>
                  }
                  description={detail.alarm.description}
                  type="warning"
                  showIcon
                />
              </>
            )}
          </>
        ) : <Spin />}
      </Drawer>

      <Modal
        title="质检隔离判定"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        footer={null}
        width={520}
      >
        <Alert
          message="电池包隔离后将无法参与换电，需质检员解除后才能恢复使用"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item label="选择电池包" name="packId" rules={[{ required: true }]}>
            <Select showSearch placeholder="选择要隔离的电池包" optionFilterProp="label">
              {batteryPacks.map(p => (
                <Option key={p.id} value={p.id} label={p.packCode}>
                  <Space>
                    <b>{p.packCode}</b>
                    <Tag color={PACK_STATUS[p.currentStatus]?.color}>{PACK_STATUS[p.currentStatus]?.label}</Tag>
                    <span style={{ color: '#888' }}>{p.model}</span>
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="关联告警" name="alarmId">
            <Select allowClear showSearch placeholder="可关联告警记录（可选）" optionFilterProp="label">
              {alarms.map(a => (
                <Option key={a.id} value={a.id} label={a.alarmType}>
                  <Space>
                    <b>{a.alarmType}</b>
                    <Tag color={a.isThermalRunawayRisk ? 'red' : 'orange'}>
                      {a.isThermalRunawayRisk ? '热失控' : a.alarmLevel}
                    </Tag>
                    <span style={{ color: '#888' }}>{a.batteryPack?.packCode}</span>
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="隔离原因" name="isolationReason" rules={[{ required: true }]}>
            <Select placeholder="选择主要原因">
              {ISOLATION_REASONS.map(r => <Option key={r}>{r}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item label="紧急程度" name="isEmergency" initialValue={false}>
            <Radio.Group>
              <Radio value={false}>常规隔离（ISOLATED）</Radio>
              <Radio value={true} style={{ color: '#f5222d' }}>🔥 紧急锁定（LOCKED）</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item label="判定详情" name="reasonDetail">
            <TextArea rows={4} placeholder="检测数据、判定依据、建议处理方式..." />
          </Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Space>
              <Button onClick={() => setCreateOpen(false)}>取消</Button>
              <Button type="primary" danger={form.getFieldValue('isEmergency')} htmlType="submit">
                确认隔离
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="解除隔离"
        open={releaseOpen}
        onCancel={() => setReleaseOpen(false)}
        footer={null}
        width={480}
      >
        <Alert
          message="解除隔离后电池包将重新参与换电调度，请确保问题已修复"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <div style={{ marginBottom: 16 }}>
          <Descriptions size="small" column={2} bordered>
            <Descriptions.Item label="电池包">{detail?.batteryPack?.packCode}</Descriptions.Item>
            <Descriptions.Item label="原状态">
              <Tag color={detail?.isEmergency ? 'red' : 'purple'}>
                {detail?.isEmergency ? '紧急锁定' : '常规隔离'}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
        </div>
        <Form form={releaseForm} layout="vertical" onFinish={handleRelease}>
          <Form.Item label="解除后状态" name="releaseToStatus" initialValue="AVAILABLE" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio value="AVAILABLE">
                <CheckCircleOutlined /> 恢复可用（直接参与换电）
              </Radio>
              <br />
              <Radio value="CHARGING">
                ⚡ 转入充电
              </Radio>
              <br />
              <Radio value="MAINTENANCE">
                🔧 转入维护观察
              </Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item label="解除备注" name="releaseRemark">
            <TextArea rows={3} placeholder="问题修复情况、复检数据..." />
          </Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Space>
              <Button onClick={() => setReleaseOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit">确认解除</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
