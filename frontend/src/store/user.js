import { create } from 'zustand';
import axios from '../utils/request';

const initialUser = () => {
  try {
    const saved = localStorage.getItem('battery_user');
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};

const initialToken = () => localStorage.getItem('battery_token') || '';

export const useUserStore = create((set, get) => ({
  user: initialUser(),
  token: initialToken(),

  login: async (username, password) => {
    const { data } = await axios.post('/auth/login', { username, password });
    localStorage.setItem('battery_token', data.token);
    localStorage.setItem('battery_user', JSON.stringify(data.user));
    set({ user: data.user, token: data.token });
    return data.user;
  },

  logout: () => {
    localStorage.removeItem('battery_token');
    localStorage.removeItem('battery_user');
    set({ user: null, token: '' });
  },

  fetchMe: async () => {
    try {
      const { data } = await axios.get('/auth/me');
      set({ user: data.user });
      localStorage.setItem('battery_user', JSON.stringify(data.user));
      return data.user;
    } catch {
      get().logout();
      throw new Error('认证失效');
    }
  },

  hasRole: (...roles) => {
    const user = get().user;
    if (!user) return false;
    if (user.role === 'ADMIN') return true;
    return roles.includes(user.role);
  },
}));
