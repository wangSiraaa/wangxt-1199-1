import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Tag, Button, Space, Card, Row, Col, Statistic, Input, Select, Drawer,
  Descriptions, Modal, Form, Radio, Switch, message, Spin, Empty, Alert, Tooltip,
} from 'antd';
import {
  AlertOutlined, SearchOutlined, PlusOutlined, EyeOutlined,
  WarningOutlined, CheckCircleOutlined, FireOutlined, ReloadOutlined,
  SafetyCertificateOutlined, ClusterOutlined, RiseOutlined,
} from '@ant-design/icons';
import axios from '../utils/request';
import { ALARM_LEVEL, PACK_STATUS, formatDate, ROLE_LABELS, BATCH_RISK_LEVEL } from '../utils/constants';
import { useUserStore } from '../store/user';

const { Option } = Select;
const { TextArea } = Input;

export default function Alarms() {
  const hasRole = useUserStore((s) => s.hasRole);
  const user = useUserStore((s) => s.user);
  const [loading, setLoading] = useState(false);
  const [alarms, setAlarms] = useState([]);
  const [stats, setStats] = useState({});
  const [detail, setDetail] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [isolateOpen, setIsolateOpen] = useState(false);
  const [filterHandled, setFilterHandled] = useState();
  const [filterThermal, setFilterThermal] = useState();
  const [filterLevel, setFilterLevel] = useState();
  const [keyword, setKeyword] = useState('');
  const [batchNoKeyword, setBatchNoKeyword] = useState('');
  const [batteryPacks, setBatteryPacks] = useState([]);
  const [openBatchRisks, setOpenBatchRisks] = useState([]);
  const [form] = Form.useForm();
  const [isoForm] = Form.useForm();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterHandled !== undefined && filterHandled !== null) params.append('handled', String(filterHandled));
      if (filterThermal !== undefined && filterThermal !== null) params.append('isThermal', String(filterThermal));
      if (filterLevel) params.append('level', filterLevel);
      if (batchNoKeyword) params.append('batchNo', batchNoKeyword);
      const { data } = await axios.get(`/alarms?${params.toString()}`);
      let list = data.alarms;
      if (keyword) {
        list = list.filter(a =>
          a.alarmType.includes(keyword) ||
          a.batteryPack?.packCode?.includes(keyword) ||
          a.description?.includes(keyword) ||
          a.batteryPack?.batchNo?.includes(keyword)
        );
      }
      setAlarms(list);
      setStats(data.stats);
      setOpenBatchRisks(data.openBatchRisks || []);
    } finally {
      setLoading(false);
    }
  }, [filterHandled, filterThermal, filterLevel, keyword, batchNoKeyword]);

  useEffect(() => {
    loadData();
    loadPacks();
  }, [loadData]);

  const loadPacks = async () => {
    const { data } = await axios.get('/battery-packs');
    setBatteryPacks(data.packs.filter(p =>
      p.currentStatus === 'AVAILABLE' || p.currentStatus === 'CHARGING' || p.currentStatus === 'IN_USE'
    ));
  };

  const openDetail = async (id) => {
    setDrawerOpen(true);
    const { data } = await axios.get(`/alarms/${id}`);
    setDetail(data.alarm);
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const { data } = await axios.post('/alarms', values);

      Modal.success({
        title: '告警登记成功',
        width: 560,
        content: (
          <div>
            <div style={{ marginBottom: 12 }}>
              <Tag color="green" icon={<CheckCircleOutlined />}> 告警记录 #{data.alarm?.id?.slice(0, 8)} 已创建</Tag>
            </div>
            {data.autoIsolation && (
              <Alert
                style={{ marginBottom: 12 }}
                message={
                  <span>
                    <FireOutlined style={{ color: '#f5222d' }} /> <b>热失控风险自动处理：</b>
                    电池包已自动锁定并移入隔离区，隔离记录 #{data.autoIsolation.id?.slice(0, 8)}
                  </span>
                }
                type="error"
                showIcon
                description={data.autoIsolation.isolationReason}
              />
            )}
            {data.batchRisk && (
              <Alert
                style={{ marginBottom: 12 }}
                message={
                  <span>
                    <ClusterOutlined style={{ color: BATCH_RISK_LEVEL[data.batchRisk.riskLevel]?.color === 'red' ? '#f5222d' : '#fa8c16' }} /> <b>批次风险已检测：</b>
                    批次 {data.batchRisk.batchNo} 共 {data.batchRisk.abnormalCount} 个包异常
                    <Tag color={BATCH_RISK_LEVEL[data.batchRisk.riskLevel]?.color} style={{ marginLeft: 8 }}>
                      {BATCH_RISK_LEVEL[data.batchRisk.riskLevel]?.label}
                    </Tag>
                  </span>
                }
                type="warning"
                showIcon
                description={
                  <Space direction="vertical" size={4}>
                    <span style={{ color: '#666' }}>
                      <RiseOutlined /> 调度建议：{data.batchRisk.scheduleSuggestion}
                    </span>
                    {data.batchRiskWarning && (
                      <span style={{ color: '#fa8c16', fontWeight: 500 }}>⚠️ {data.batchRiskWarning}</span>
                    )}
                  </Space>
                }
              />
            )}
            {!data.autoIsolation && !data.batchRisk && (
              <Alert message="电池包状态已更新为告警" type="info" showIcon />
            )}
          </div>
        ),
        onOk: () => {
          setCreateOpen(false);
          form.resetFields();
          loadData();
        },
      });
    } catch (e) { /* handled */ }
  };

  const handleMarkHandled = async (id, handled) => {
    try {
      await axios.patch(`/alarms/${id}/handle`, { handled, remark: `由${user?.realName}标记处理` });
      message.success(handled ? '已标记为处理完成' : '已恢复为待处理');
      if (drawerOpen && detail?.id === id) openDetail(id);
      loadData();
    } catch (e) { /* handled */ }
  };

  const handleCreateIsolation = async () => {
    try {
      const values = await isoForm.validateFields();
      await axios.post('/isolations', {
        ...values,
        alarmId: detail?.id,
        packId: detail?.packId,
      });
      message.success('隔离判定成功！电池包已进入隔离状态');
      setIsolateOpen(false);
      isoForm.resetFields();
      if (drawerOpen) openDetail(detail.id);
      loadData();
    } catch (e) { /* handled */ }
  };

  const columns = [
    {
      title: '',
      dataIndex: 'isThermalRunawayRisk',
      key: 'thermal',
      width: 48,
      align: 'center',
      render: (v) => v ? (
        <Tooltip title="热失控风险 - 请立即处理">
          <FireOutlined style={{ color: '#f5222d', fontSize: 18 }} />
        </Tooltip>
      ) : <AlertOutlined style={{ color: '#fa8c16' }} />,
    },
    {
      title: '告警类型',
      dataIndex: 'alarmType',
      key: 'alarmType',
      width: 140,
      render: (v, r) => (
        <Space>
          <a onClick={() => openDetail(r.id)} style={{ fontWeight: 500 }}>{v}</a>
        </Space>
      ),
    },
    {
      title: '级别',
      dataIndex: 'alarmLevel',
      key: 'alarmLevel',
      width: 90,
      align: 'center',
      render: (v) => (
        <Tag color={ALARM_LEVEL[v]?.color} style={{ fontWeight: 500 }}>
          {ALARM_LEVEL[v]?.label}
        </Tag>
      ),
    },
    {
      title: '电池包',
      key: 'pack',
      width: 150,
      render: (_, r) => (
        <Space direction="vertical" size={2}>
          <span style={{ fontWeight: 500 }}>{r.batteryPack?.packCode}</span>
          {r.batteryPack?.batchNo && (
            <Tooltip title={`批次号：${r.batteryPack.batchNo}`}>
              <Tag color="blue" style={{ fontSize: 10, margin: 0, padding: '0 6px' }}>
                <ClusterOutlined /> {r.batteryPack.batchNo}
              </Tag>
            </Tooltip>
          )}
          <Tag color={PACK_STATUS[r.batteryPack?.currentStatus]?.color} style={{ fontSize: 11, margin: 0 }}>
            {PACK_STATUS[r.batteryPack?.currentStatus]?.label}
          </Tag>
        </Space>
      ),
    },
    {
      title: '所属站点',
      dataIndex: ['batteryPack', 'station', 'name'],
      key: 'station',
      width: 150,
      ellipsis: true,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (v) => v || <span style={{ color: '#bbb' }}>无描述</span>,
    },
    {
      title: '登记人',
      key: 'registrant',
      width: 110,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontSize: 13 }}>{r.registrant?.realName}</span>
          <span style={{ fontSize: 11, color: '#999' }}>
            <Tag color={ROLE_LABELS[r.registrant?.role]?.color} style={{ fontSize: 10, margin: 0, padding: '0 4px' }}>
              {ROLE_LABELS[r.registrant?.role]?.label}
            </Tag>
          </span>
        </Space>
      ),
    },
    {
      title: '登记时间',
      dataIndex: 'registeredAt',
      key: 'registeredAt',
      width: 150,
      render: (v) => formatDate(v).slice(5),
    },
    {
      title: '状态',
      key: 'status',
      width: 90,
      align: 'center',
      render: (_, r) => r.handled ? (
        <Tag color="green" icon={<CheckCircleOutlined />}>已处理</Tag>
      ) : (
        <Tag color="orange" icon={<WarningOutlined />}>待处理</Tag>
      ),
    },
    {
      title: '隔离',
      key: 'iso',
      width: 80,
      align: 'center',
      render: (_, r) => r.isolations && r.isolations.length > 0 ? (
        <Tag color="purple" icon={<SafetyCertificateOutlined />}>已隔离</Tag>
      ) : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openDetail(r.id)}>详情</Button>
          {!r.handled && hasRole('QC', 'ADMIN') && (
            <Button size="small" type="link" onClick={() => handleMarkHandled(r.id, true)}>标处理</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title"><AlertOutlined style={{ color: '#fa8c16' }} /> 告警管理</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          {hasRole('DUTY', 'ADMIN') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setCreateOpen(true); form.resetFields(); }}>
              登记告警
            </Button>
          )}
        </Space>
      </div>

      {stats.thermal > 0 && (
        <Alert
          message={<span><FireOutlined style={{ color: '#f5222d' }} /> 有 {stats.thermal} 条热失控风险告警待紧急处理！</span>}
          type="error"
          showIcon
          closable
          style={{ marginBottom: 12 }}
          action={
            <Button size="small" danger onClick={() => { setFilterThermal(true); setFilterHandled(false); }}>
              立即查看
            </Button>
          }
        />
      )}

      {openBatchRisks.length > 0 && (
        <Card
          size="small"
          style={{ marginBottom: 12, borderColor: BATCH_RISK_LEVEL[openBatchRisks[0].riskLevel]?.color === 'red' ? '#ffccc7' : '#ffe58f' }}
          title={
            <Space>
              <ClusterOutlined style={{ color: '#d4380d' }} />
              <b>批次风险预警（共 {openBatchRisks.length} 个未解决批次）</b>
              <Tag color="orange">请调度中心及时调整库存</Tag>
            </Space>
          }
          type="inner"
        >
          <Space wrap size={[8, 8]}>
            {openBatchRisks.map(r => (
              <Alert
                key={r.id}
                type={r.riskLevel === 'CRITICAL' ? 'error' : 'warning'}
                showIcon
                style={{ width: 380 }}
                message={
                  <Space size={6}>
                    <Tag color={BATCH_RISK_LEVEL[r.riskLevel]?.color}>
                      {BATCH_RISK_LEVEL[r.riskLevel]?.label}
                    </Tag>
                    <b>批次 {r.batchNo}</b>
                    <span>异常 {r.abnormalCount}/{r.totalCount} 个包</span>
                    <span style={{ color: '#888' }}>
                      {r.schedules && r.schedules.length > 0 ? `（已关联${r.schedules.length}个调度）` : '（未创建调度）'}
                    </span>
                  </Space>
                }
                description={r.scheduleSuggestion}
                action={
                  hasRole('DISPATCH', 'ADMIN') ? (
                    <Button size="small" type="primary" onClick={() => {
                      window.openBatchRiskCreateSchedule = r;
                      message.info('请前往库存调度创建补货计划');
                    }}>去调度</Button>
                  ) : null
                }
              />
            ))}
          </Space>
        </Card>
      )}

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="告警总数" value={stats.total || 0} valueStyle={{ color: '#1677ff' }} prefix={<AlertOutlined />} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="待处理" value={stats.pending || 0} valueStyle={{ color: '#fa8c16' }} prefix={<WarningOutlined />} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="🔥 热失控风险" value={stats.thermal || 0} valueStyle={{ color: '#f5222d' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="已处理" value={stats.handled || 0} valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card size="small">
        <div className="table-toolbar">
          <Input
            allowClear
            placeholder="搜索类型/电池包"
            prefix={<SearchOutlined />}
            style={{ width: 180 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Input
            allowClear
            placeholder="批次号筛选"
            prefix={<ClusterOutlined />}
            style={{ width: 160 }}
            value={batchNoKeyword}
            onChange={(e) => setBatchNoKeyword(e.target.value)}
          />
          <Select
            allowClear
            placeholder="处理状态"
            style={{ width: 120 }}
            value={filterHandled}
            onChange={setFilterHandled}
          >
            <Option value={false}>待处理</Option>
            <Option value={true}>已处理</Option>
          </Select>
          <Select
            allowClear
            placeholder="告警级别"
            style={{ width: 120 }}
            value={filterLevel}
            onChange={setFilterLevel}
          >
            {Object.entries(ALARM_LEVEL).map(([k, v]) => (
              <Option key={k} value={k}>{v.label}</Option>
            ))}
          </Select>
          <Select
            allowClear
            placeholder="热失控风险"
            style={{ width: 130 }}
            value={filterThermal}
            onChange={setFilterThermal}
          >
            <Option value={true}>🔥 仅热失控</Option>
            <Option value={false}>排除热失控</Option>
          </Select>
          <Button type="primary" onClick={loadData}>查询</Button>
          <Button onClick={() => {
            setFilterHandled(undefined); setFilterThermal(undefined); setFilterLevel(undefined);
            setKeyword(''); setBatchNoKeyword('');
          }}>重置</Button>
        </div>

        <Table
          rowKey="id"
          loading={loading}
          dataSource={alarms}
          columns={columns}
          scroll={{ x: 1300 }}
          size="small"
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          rowClassName={(r) => r.isThermalRunawayRisk && !r.handled ? 'bg-red-50' : ''}
        />
      </Card>

      <Drawer
        title="告警详情"
        width={640}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={
          <Space>
            {hasRole('QC', 'ADMIN') && detail && (!detail.isolations || detail.isolations.filter(i => !i.released).length === 0) && (
              <Button type="primary" icon={<SafetyCertificateOutlined />} onClick={() => setIsolateOpen(true)}>
                判定隔离
              </Button>
            )}
            {detail && !detail.handled && hasRole('QC', 'ADMIN') && (
              <Button onClick={() => handleMarkHandled(detail.id, true)} icon={<CheckCircleOutlined />}>
                标记处理
              </Button>
            )}
          </Space>
        }
      >
        {detail ? (
          <>
            {detail.isThermalRunawayRisk && (
              <Alert
                message="⚠️ 热失控风险警告 - 此电池包已自动紧急锁定，禁止参与换电"
                type="error"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}
            <Descriptions title="告警信息" bordered column={2} size="small">
              <Descriptions.Item label="告警类型" span={2}>
                <Space>
                  <b style={{ fontSize: 15 }}>{detail.alarmType}</b>
                  <Tag color={ALARM_LEVEL[detail.alarmLevel]?.color}>
                    {ALARM_LEVEL[detail.alarmLevel]?.label}
                  </Tag>
                  {detail.isThermalRunawayRisk && <Tag color="red" icon={<FireOutlined />}>热失控风险</Tag>}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="电池包编码">
                <b>{detail.batteryPack?.packCode}</b>
              </Descriptions.Item>
              <Descriptions.Item label="批次号">
                {detail.batteryPack?.batchNo ? (
                  <Tag color="blue"><ClusterOutlined /> {detail.batteryPack?.batchNo}</Tag>
                ) : <span style={{ color: '#999' }}>-</span>}
              </Descriptions.Item>
              <Descriptions.Item label="当前状态">
                <Tag color={PACK_STATUS[detail.batteryPack?.currentStatus]?.color}>
                  {PACK_STATUS[detail.batteryPack?.currentStatus]?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="所属站点">{detail.batteryPack?.station?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="仓位位置">{detail.batteryPack?.location || '-'}</Descriptions.Item>
              <Descriptions.Item label="告警描述" span={2}>{detail.description || '-'}</Descriptions.Item>
              <Descriptions.Item label="登记人">
                {detail.registrant?.realName}
                <Tag color={ROLE_LABELS[detail.registrant?.role]?.color} style={{ marginLeft: 6 }}>
                  {ROLE_LABELS[detail.registrant?.role]?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="登记时间">{formatDate(detail.registeredAt)}</Descriptions.Item>
              {detail.handled && (
                <>
                  <Descriptions.Item label="处理人">{detail.handler?.realName || '-'}</Descriptions.Item>
                  <Descriptions.Item label="处理时间">{formatDate(detail.handledAt)}</Descriptions.Item>
                </>
              )}
              {detail.remark && <Descriptions.Item label="处理备注" span={2}>{detail.remark}</Descriptions.Item>}
            </Descriptions>

            {detail.isolations && detail.isolations.length > 0 && (
              <>
                <div style={{ marginTop: 20, fontWeight: 600, marginBottom: 8 }}>
                  <SafetyCertificateOutlined style={{ color: '#722ed1' }} /> 质检隔离判定
                </div>
                <Alert
                  message={
                    <Space>
                      <Tag color={detail.isolations[0].isEmergency ? 'red' : 'purple'}>
                        {detail.isolations[0].isEmergency ? '紧急隔离' : '常规隔离'}
                      </Tag>
                      <b>{detail.isolations[0].isolationReason}</b>
                      <span style={{ color: '#888' }}>· 质检员：{detail.isolations[0].judge?.realName}</span>
                    </Space>
                  }
                  description={detail.isolations[0].reasonDetail}
                  type="info"
                  showIcon
                />
              </>
            )}

            {detail.batchRisks && detail.batchRisks.length > 0 && (
              <>
                <div style={{ marginTop: 20, fontWeight: 600, marginBottom: 8 }}>
                  <ClusterOutlined style={{ color: '#d4380d' }} /> 关联批次风险
                </div>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  {detail.batchRisks.map(r => (
                    <Alert
                      key={r.id}
                      type={r.riskLevel === 'CRITICAL' ? 'error' : 'warning'}
                      showIcon
                      message={
                        <Space>
                          <Tag color={BATCH_RISK_LEVEL[r.riskLevel]?.color}>
                            {BATCH_RISK_LEVEL[r.riskLevel]?.label}
                          </Tag>
                          <b>批次 {r.batchNo}</b>
                          <span style={{ color: '#888' }}>异常 {r.abnormalCount}/{r.totalCount} 个包</span>
                          {!r.resolved ? <Tag color="red">未解决</Tag> : <Tag color="green">已解决</Tag>}
                        </Space>
                      }
                      description={r.scheduleSuggestion}
                    />
                  ))}
                </Space>
              </>
            )}
          </>
        ) : <Spin />}
      </Drawer>

      <Modal
        title="登记告警（值班员）"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        footer={null}
        width={520}
      >
        <Alert
          message="值班员登记告警后，电池包将自动切换状态；热失控风险包会立即锁定"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item label="电池包" name="packId" rules={[{ required: true, message: '请选择电池包' }]}>
            <Select showSearch placeholder="选择告警的电池包" optionFilterProp="label">
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
          <Form.Item label="告警类型" name="alarmType" rules={[{ required: true }]}>
            <Select placeholder="选择告警类型">
              {['电压异常', '温度过高', '绝缘阻值低', '通讯故障', 'BMS告警', '冒烟风险', '鼓包变形', '容量衰减过快', '其他'].map(t => (
                <Option key={t}>{t}</Option>
              ))}
            </Select>
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="告警级别" name="alarmLevel" rules={[{ required: true }]} initialValue="WARNING">
                <Radio.Group>
                  <Radio value="INFO">提示</Radio>
                  <Radio value="WARNING">警告</Radio>
                  <Radio value="CRITICAL">严重</Radio>
                  <Radio value="EMERGENCY">紧急</Radio>
                </Radio.Group>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="热失控风险"
                name="isThermalRunawayRisk"
                valuePropName="checked"
                initialValue={false}
              >
                <Switch checkedChildren="🔥 是" unCheckedChildren="否" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="详细描述" name="description">
            <TextArea rows={3} placeholder="请详细描述告警现象..." />
          </Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Space>
              <Button onClick={() => setCreateOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit" danger={form.getFieldValue('isThermalRunawayRisk')}>
                确认登记
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="质检隔离判定"
        open={isolateOpen}
        onCancel={() => setIsolateOpen(false)}
        footer={null}
        width={520}
      >
        <Alert
          message="质检隔离后电池包将禁止参与换电，解除隔离前无法使用"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={isoForm} layout="vertical" onFinish={handleCreateIsolation}>
          <Form.Item label="隔离原因" name="isolationReason" rules={[{ required: true, message: '请选择隔离原因' }]}>
            <Select placeholder="选择隔离原因">
              {['电芯温度异常', '绝缘检测失败', 'BMS通讯中断', '电压异常', '容量衰减过快', '鼓包变形', '热失控预警', '其他原因'].map(r => (
                <Option key={r}>{r}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="紧急程度" name="isEmergency" initialValue={detail?.isThermalRunawayRisk || false}>
            <Radio.Group>
              <Radio value={false}>常规隔离</Radio>
              <Radio value={true} style={{ color: '#f5222d' }}>🔥 紧急锁定</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item label="判定详情" name="reasonDetail">
            <TextArea rows={4} placeholder="请详细说明判定依据、检测数据、建议处理方式..." />
          </Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Space>
              <Button onClick={() => setIsolateOpen(false)}>取消</Button>
              <Button type="primary" danger={isoForm.getFieldValue('isEmergency')} htmlType="submit">
                确认隔离
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
