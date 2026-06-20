import axios from 'axios';
import { message } from 'antd';

const request = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('battery_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

request.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const msg = error.response?.data?.error || error.message || '请求失败';

    if (status === 401) {
      localStorage.removeItem('battery_token');
      localStorage.removeItem('battery_user');
      if (!window.location.pathname.startsWith('/login')) {
        message.error('登录已过期，请重新登录');
        setTimeout(() => {
          window.location.href = '/login';
        }, 1000);
      }
    } else if (status === 403) {
      message.error('权限不足：' + msg);
    } else {
      message.error(msg);
    }

    return Promise.reject(error);
  }
);

export default request;
