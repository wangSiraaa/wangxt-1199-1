import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, message, Select } from 'antd';
import { UserOutlined, LockOutlined, LoginOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../store/user';

const { Title, Paragraph } = Typography;
const { Option } = Select;

const quickAccounts = [
  { username: 'admin', password: '123456', label: '管理员（全部权限）' },
  { username: 'duty01', password: '123456', label: '值班员（登记告警）' },
  { username: 'qc01', password: '123456', label: '质检员（隔离判断）' },
  { username: 'dispatch01', password: '123456', label: '调度员（库存调度）' },
];

export default function Login() {
  const navigate = useNavigate();
  const login = useUserStore((s) => s.login);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const onFinish = async (values) => {
    setLoading(true);
    try {
      await login(values.username, values.password);
      message.success('登录成功！');
      setTimeout(() => navigate('/dashboard'), 300);
    } catch (e) {
      // error handled by interceptor
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (account) => {
    form.setFieldsValue({ username: account.username, password: account.password });
  };

  return (
    <div className="login-container">
      <Card className="login-card" variant="borderless">
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 48 }}>🔋</div>
        </div>
        <Title level={3} className="login-title">
          新能源换电站
        </Title>
        <Paragraph className="login-subtitle">
          电池包隔离协作系统
        </Paragraph>

        <Form form={form} layout="vertical" onFinish={onFinish} size="large">
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="请输入用户名" allowClear />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              icon={<LoginOutlined />}
              loading={loading}
              style={{ height: 44, fontSize: 15, fontWeight: 600 }}
            >
              登 录
            </Button>
          </Form.Item>
        </Form>

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #f0f0f0' }}>
          <Paragraph type="secondary" style={{ marginBottom: 8, fontSize: 12 }}>
            快速登录（测试账号）：
          </Paragraph>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {quickAccounts.map((acc) => (
              <Button
                key={acc.username}
                size="small"
                onClick={() => handleQuickLogin(acc)}
                style={{ fontSize: 11 }}
              >
                {acc.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
