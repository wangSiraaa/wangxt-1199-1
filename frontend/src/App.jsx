import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Menu, Dropdown, Avatar, Space, theme } from 'antd';
import {
  DashboardOutlined,
  DatabaseOutlined,
  AlertOutlined,
  SafetyCertificateOutlined,
  TruckOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { useUserStore } from './store/user';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import BatteryPacks from './pages/BatteryPacks';
import Alarms from './pages/Alarms';
import Isolations from './pages/Isolations';
import InventorySchedules from './pages/InventorySchedules';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' },
  { key: '/battery-packs', icon: <DatabaseOutlined />, label: '电池包管理' },
  { key: '/alarms', icon: <AlertOutlined />, label: '告警管理' },
  { key: '/isolations', icon: <SafetyCertificateOutlined />, label: '隔离区' },
  { key: '/schedules', icon: <TruckOutlined />, label: '库存调度' },
];

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, token } = useUserStore();
  const [collapsed, setCollapsed] = React.useState(false);
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  useEffect(() => {
    if (!token && location.pathname !== '/login') {
      navigate('/login', { replace: true });
    }
  }, [token, location.pathname, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const userMenu = {
    items: [
      {
        key: 'role',
        icon: <SettingOutlined />,
        label: user?.role ? `${user.realName} · ${user.role === 'ADMIN' ? '管理员' : user.role === 'DUTY' ? '值班员' : user.role === 'QC' ? '质检员' : '调度员'}` : '',
        disabled: true,
      },
      { type: 'divider' },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '退出登录',
        onClick: handleLogout,
      },
    ],
  };

  if (location.pathname === '/login' || !token) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={collapsed} theme="dark">
        <div className="layout-logo">
          {collapsed ? '🔋' : '🔋 换电站系统'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 16px',
            background: colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {React.createElement(collapsed ? MenuUnfoldOutlined : MenuFoldOutlined, {
              className: 'trigger',
              onClick: () => setCollapsed(!collapsed),
              style: { fontSize: 18, cursor: 'pointer' },
            })}
          </div>
          <Dropdown menu={userMenu} placement="bottomRight">
            <Space style={{ cursor: 'pointer' }} size={8}>
              <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1677ff' }} />
              <span style={{ fontWeight: 500 }}>{user?.realName || user?.username}</span>
            </Space>
          </Dropdown>
        </Header>
        <Content
          style={{
            margin: '0',
            padding: 16,
            minHeight: 280,
            background: '#f5f7fa',
            overflow: 'auto',
          }}
        >
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/battery-packs" element={<BatteryPacks />} />
            <Route path="/alarms" element={<Alarms />} />
            <Route path="/isolations" element={<Isolations />} />
            <Route path="/schedules" element={<InventorySchedules />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default App;
