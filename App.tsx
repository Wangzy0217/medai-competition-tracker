import React, { useState, useEffect, useCallback } from 'react';
import { Phase, Status, MainTask } from './types';
import { STATUS_CONFIG, STATUS_ORDER } from './constants';
import { 
  CheckCircle2, RotateCcw, Save, Layers, Download, Clock, AlertTriangle, AlertCircle, Pause, Play,
  ChevronDown, Users, Briefcase, Calendar, Plus, Trash2, Edit2, X, MoreVertical 
} from 'lucide-react';
import { io } from 'socket.io-client';

// --- Modals & Helper Components ---

const StatusSelect = ({ status, onChange }: { status: Status; onChange: (s: Status) => void }) => {
  const config = STATUS_CONFIG[status];
  return (
    <div className="relative inline-block group w-[140px] max-w-full">
      <select
        value={status}
        onChange={(e) => onChange(e.target.value as Status)}
        className={`
          w-full appearance-none cursor-pointer pl-3 pr-8 py-2 rounded-lg text-xs font-bold border transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500/50
          ${config.color}
        `}
      >
        {STATUS_ORDER.map((key) => {
          const conf = STATUS_CONFIG[key];
          return (
            <option key={key} value={key}>
              {conf.label}
            </option>
          );
        })}
      </select>
      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
        <ChevronDown size={14} />
      </div>
    </div>
  );
};

const StatusDot = ({ status, className = '', animated = false }: { status: Status; className?: string; animated?: boolean }) => {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-block rounded-full ${config.dot} ${animated ? 'status-dot-animated' : ''} ${className}`}
      style={
        animated
          ? ({
              '--status-glow': config.glow,
              '--status-glow-strong': config.glowStrong
            } as React.CSSProperties)
          : undefined
      }
    />
  );
};

const PhaseLine = () => (
  <div className="absolute left-0 top-2 bottom-2 w-[2px] bg-tech-blue opacity-20 hidden md:block" />
);

const Toast = ({ type, message }: { type: 'success' | 'error'; message: string }) => {
  const styles = type === 'success'
    ? 'bg-emerald-50/90 text-emerald-700 border-emerald-200'
    : 'bg-red-50/90 text-red-700 border-red-200';
  const Icon = type === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div className={`toast-shell relative flex items-start gap-2 px-4 py-3 rounded-xl border ${styles}`}>
      <span className="toast-sheen" aria-hidden="true" />
      <Icon size={18} className="mt-0.5" />
      <div className="text-sm font-medium leading-relaxed">{message}</div>
    </div>
  );
};

const StatCard = ({ title, value, total, colorClass, icon: Icon, hover }: any) => (
  <div className="relative bg-white p-6 rounded-2xl shadow-sm border border-slate-100 transition-all duration-300 group overflow-hidden hover:shadow-md">
    <div className="flex items-center justify-between transition-all duration-300 group-hover:opacity-0 group-hover:-translate-y-1">
      <div>
        <p className="text-slate-400 text-sm font-medium mb-1">{title}</p>
        <div className="flex items-baseline gap-2">
          <span className={`text-4xl font-bold ${colorClass} tracking-tight`}>{value}</span>
          {total && <span className="text-slate-300 text-lg">/ {total}</span>}
        </div>
      </div>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorClass.replace('text-', 'bg-').replace('600', '100').replace('500', '100')} group-hover:scale-110 transition-transform`}>
        <Icon size={24} className={colorClass} />
      </div>
    </div>
    {hover && (
      <div className={`absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-all duration-300 ${hover.bgClass}`}>
        <div className="h-full w-full p-6 flex flex-col justify-center text-white">
          <div className="text-sm font-semibold">{hover.title}</div>
          <div className="mt-2 text-xs leading-relaxed text-white/90">{hover.desc}</div>
        </div>
      </div>
    )}
  </div>
);

type UserInfo = {
  id: number;
  name: string;
  phone: string;
  group: string;
  roleTitle: string;
  role: 'admin' | 'user';
};

const Avatar = ({ seed, name }: { seed: string; name: string }) => {
  const colors = ['#1f7ae0', '#12a150', '#f97316', '#e11d48', '#7c3aed', '#0ea5e9'];
  const idx = seed.charCodeAt(0) % colors.length;
  const initials = name ? name.slice(-2) : '用户';
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: colors[idx] }}>
      {initials}
    </div>
  );
};

const AuthCard = ({
  onLogin,
  onRegister,
  loading
}: {
  onLogin: (phone: string, password: string) => void;
  onRegister: (payload: { name: string; phone: string; group: string; roleTitle: string; password: string }) => void;
  loading: boolean;
}) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [loginForm, setLoginForm] = useState({ phone: '', password: '' });
  const groupOptions = [
    '组委会办公室',
    '数据收集与标注组',
    '专家工作组',
    '技术环境保障组',
    '宣传工作组',
    '赛事运行和大型活动组',
    '服务保障组',
    '监督与法务组',
    '外事工作组',
    '成果转化组'
  ];
  const [regForm, setRegForm] = useState({ name: '', phone: '', group: groupOptions[0], roleTitle: '', password: '' });

  return (
    <div className="bg-white/55 backdrop-blur-2xl rounded-2xl border border-white/60 shadow-[0_18px_50px_rgba(15,23,42,0.18)] p-6 w-full max-w-md">
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setTab('login')}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${tab === 'login' ? 'bg-tech-blue text-white' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          登录
        </button>
        <button
          onClick={() => setTab('register')}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${tab === 'register' ? 'bg-tech-blue text-white' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          注册
        </button>
      </div>

      {tab === 'login' ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">手机号 / 用户名</label>
            <input
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-tech-blue/50 outline-none text-slate-900"
              value={loginForm.phone}
              onChange={e => setLoginForm({ ...loginForm, phone: e.target.value })}
              placeholder="例如: 13800000000 或 admin"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">密码</label>
            <input
              type="password"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-tech-blue/50 outline-none text-slate-900"
              value={loginForm.password}
              onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
              placeholder="请输入密码"
            />
          </div>
          <button
            onClick={() => onLogin(loginForm.phone, loginForm.password)}
            disabled={loading}
            className="w-full bg-tech-blue text-white font-bold py-2.5 rounded-lg hover:bg-blue-900 transition-colors disabled:opacity-60"
          >
            登录
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">姓名</label>
            <input
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-tech-blue/50 outline-none text-slate-900"
              value={regForm.name}
              onChange={e => setRegForm({ ...regForm, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">手机号</label>
            <input
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-tech-blue/50 outline-none text-slate-900"
              value={regForm.phone}
              onChange={e => setRegForm({ ...regForm, phone: e.target.value })}
            />
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">组别</label>
              <select
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-tech-blue/50 outline-none text-slate-900 bg-white"
                value={regForm.group}
                onChange={e => setRegForm({ ...regForm, group: e.target.value })}
              >
                {groupOptions.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">组内职务</label>
              <input
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-tech-blue/50 outline-none text-slate-900"
                value={regForm.roleTitle}
                onChange={e => setRegForm({ ...regForm, roleTitle: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">密码</label>
            <input
              type="password"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-tech-blue/50 outline-none text-slate-900"
              value={regForm.password}
              onChange={e => setRegForm({ ...regForm, password: e.target.value })}
            />
          </div>
          <button
            onClick={() => onRegister(regForm)}
            disabled={loading}
            className="w-full bg-tech-blue text-white font-bold py-2.5 rounded-lg hover:bg-blue-900 transition-colors disabled:opacity-60"
          >
            注册并登录
          </button>
        </div>
      )}
    </div>
  );
};

const AdminPanel = ({
  token,
  apiRequest
}: {
  token: string;
  apiRequest: (path: string, options?: RequestInit) => Promise<Response>;
}) => {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [editUser, setEditUser] = useState<UserInfo | null>(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', group: '', roleTitle: '', role: 'user', password: '' });

  const loadAdmin = useCallback(async () => {
    const userRes = await apiRequest('/api/admin/users');
    const logRes = await apiRequest('/api/admin/logs');
    setUsers(await userRes.json());
    setLogs(await logRes.json());
  }, [apiRequest]);

  useEffect(() => {
    loadAdmin();
  }, [loadAdmin]);

  const openEdit = (u: UserInfo) => {
    setEditUser(u);
    setEditForm({ name: u.name, phone: u.phone, group: u.group, roleTitle: u.roleTitle, role: u.role, password: '' });
  };

  const submitEdit = async () => {
    if (!editUser) return;
    await apiRequest(`/api/admin/users/${editUser.id}`, {
      method: 'PATCH',
      body: JSON.stringify(editForm)
    });
    setEditUser(null);
    await loadAdmin();
  };

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">用户管理</h2>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="text-left py-2">姓名</th>
                <th className="text-left py-2">手机号</th>
                <th className="text-left py-2">组别</th>
                <th className="text-left py-2">职务</th>
                <th className="text-left py-2">角色</th>
                <th className="text-left py-2">操作</th>
              </tr>
            </thead>
            <tbody className="text-slate-700">
              {users.map(u => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="py-2">{u.name}</td>
                  <td className="py-2">{u.phone}</td>
                  <td className="py-2">{u.group}</td>
                  <td className="py-2">{u.roleTitle}</td>
                  <td className="py-2">{u.role}</td>
                  <td className="py-2">
                    <button onClick={() => openEdit(u)} className="text-tech-blue hover:underline">编辑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">操作记录</h2>
        <div className="space-y-3 max-h-[420px] overflow-auto">
          {logs.map((l) => (
            <div key={l.id} className="text-sm text-slate-600 border-b border-slate-100 pb-2">
              <div className="font-semibold text-slate-700">{l.userName} · {l.action}</div>
              <div className="text-xs text-slate-400">{l.createdAt}</div>
              {l.details && <div className="mt-1">{l.details}</div>}
            </div>
          ))}
        </div>
      </div>

      <Modal isOpen={!!editUser} onClose={() => setEditUser(null)} title="编辑用户">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">姓名</label>
              <input className="w-full px-3 py-2 border border-slate-300 rounded-lg" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">手机号</label>
              <input className="w-full px-3 py-2 border border-slate-300 rounded-lg" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">组别</label>
              <input className="w-full px-3 py-2 border border-slate-300 rounded-lg" value={editForm.group} onChange={e => setEditForm({ ...editForm, group: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">组内职务</label>
              <input className="w-full px-3 py-2 border border-slate-300 rounded-lg" value={editForm.roleTitle} onChange={e => setEditForm({ ...editForm, roleTitle: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">角色</label>
              <select className="w-full px-3 py-2 border border-slate-300 rounded-lg" value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}>
                <option value="user">用户</option>
                <option value="admin">管理员</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">重置密码</label>
              <input type="password" className="w-full px-3 py-2 border border-slate-300 rounded-lg" value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })} placeholder="留空不修改" />
            </div>
          </div>
          <button onClick={submitEdit} className="w-full bg-tech-blue text-white font-bold py-2.5 rounded-lg hover:bg-blue-900 transition-colors">
            保存修改
          </button>
        </div>
      </Modal>
    </div>
  );
};

// --- Modals ---

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden transition-all duration-200 transform scale-100 opacity-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5001';
  const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5001';

  const [data, setData] = useState<Phase[]>([]);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('auth-token'));
  const [authLoading, setAuthLoading] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [avatarSeed, setAvatarSeed] = useState(() => localStorage.getItem('avatar-seed') || String(Math.random()).slice(2, 8));
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '' });

  const [stats, setStats] = useState({ total: 0, completed: 0, progress: 0, risk: 0, warning: 0, inProgress: 0, pending: 0 });
  const [statusFilter, setStatusFilter] = useState<Status | 'ALL'>('ALL');
  const [activePhaseId, setActivePhaseId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; type: 'success' | 'error'; message: string } | null>(null);
  
  // Modal States
  const [activeModal, setActiveModal] = useState<'task' | 'group' | null>(null);
  const [modalTarget, setModalTarget] = useState<{ phaseId: string, mainTaskId?: string, subTaskId?: string, type?: 'add' | 'edit' }>({ phaseId: '' });
  
  // Form States
  const [taskForm, setTaskForm] = useState({ description: '', group: '', name: '', deadline: '' });
  const [groupForm, setGroupForm] = useState({ title: '', dateRange: '' });

  // --- Effects ---
  const apiRequest = useCallback(async (path: string, options?: RequestInit) => {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options?.headers || {})
      }
    });
    if (!res.ok) {
      const message = await res.text();
      throw new Error(message || `Request failed: ${res.status}`);
    }
    return res;
  }, [API_BASE, token]);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ id: Date.now(), type, message });
  }, []);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiRequest('/api/phases');
      const payload = await res.json();
      setData(payload);
    } catch (e) {
      console.error(e);
    }
  }, [apiRequest, token]);

  useEffect(() => {
    if (!token) return;
    fetchData();
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socket.on('data:updated', (payload: Phase[] | null) => {
      if (Array.isArray(payload)) setData(payload);
      else fetchData();
    });
    socket.on('connect_error', () => fetchData());
    socket.on('disconnect', () => fetchData());
    return () => socket.disconnect();
  }, [SOCKET_URL, fetchData, token]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast?.id]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await apiRequest('/api/auth/me');
        const payload = await res.json();
        setUser(payload.user);
      } catch (e) {
        setUser(null);
        setToken(null);
        localStorage.removeItem('auth-token');
      }
    })();
  }, [token, apiRequest]);

  useEffect(() => {
    localStorage.setItem('avatar-seed', avatarSeed);
  }, [avatarSeed]);

  useEffect(() => {
    if (data.length === 0) return;
    setActivePhaseId((prev) => prev ?? data[0].id);
    const elements = data
      .map((phase) => document.getElementById(`phase-${phase.id}`))
      .filter((el): el is HTMLElement => Boolean(el));
    if (elements.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          const id = visible[0].target.id.replace('phase-', '');
          setActivePhaseId(id);
        }
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: [0.1, 0.3, 0.6] }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [data]);

  useEffect(() => {
    let total = 0, completed = 0, risk = 0, warning = 0, inProgress = 0, pending = 0;
    data.forEach(phase => {
      phase.mainTasks.forEach(mt => {
        mt.subTasks.forEach(st => {
          total++;
          if (st.status === Status.COMPLETED) completed++;
          if (st.status === Status.RISK) risk++;
          if (st.status === Status.WARNING) warning++;
          if (st.status === Status.IN_PROGRESS) inProgress++;
          if (st.status === Status.PENDING) pending++;
        });
      });
    });

    setStats({
      total,
      completed,
      progress: Math.round(total === 0 ? 0 : (completed / total) * 100),
      risk,
      warning,
      inProgress,
      pending
    });
  }, [data]);

  // --- Actions ---
  const handleLogin = async (phone: string, password: string) => {
    setAuthLoading(true);
    try {
      const res = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone, password })
      });
      const payload = await res.json();
      setUser(payload.user);
      setToken(payload.token);
      localStorage.setItem('auth-token', payload.token);
      setAvatarSeed(String(Math.random()).slice(2, 8));
    } catch (e) {
      alert('登录失败，请检查账号密码');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (payload: { name: string; phone: string; group: string; roleTitle: string; password: string }) => {
    setAuthLoading(true);
    try {
      const res = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setUser(data.user);
      setToken(data.token);
      localStorage.setItem('auth-token', data.token);
      setAvatarSeed(String(Math.random()).slice(2, 8));
    } catch (e) {
      alert('注册失败，请检查信息');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('auth-token');
  };

  const resetData = async () => {
    if (!confirm('确定要重置所有进度到初始状态吗？此操作无法撤销。')) return;
    try {
      await apiRequest('/api/reset', { method: 'POST' });
      await fetchData();
    } catch (e) {
      alert('重置失败，请检查后端');
    }
  };

  const normalizeStatusValue = (value: Status | string) => {
    if (!value) return null;
    if (typeof value !== 'string') return value as Status;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const upper = trimmed.toUpperCase();
    if (STATUS_CONFIG[upper as Status]) return upper as Status;
    const match = Object.entries(STATUS_CONFIG).find(([, conf]) => conf.label === trimmed);
    return match ? (match[0] as Status) : null;
  };

  const updateStatus = useCallback(async (_phaseId: string, _mainTaskId: string, subTaskId: string, newStatus: Status) => {
    try {
      const normalizedStatus = normalizeStatusValue(newStatus);
      if (!normalizedStatus) {
        throw new Error(`invalid status: ${String(newStatus)}`);
      }
      await apiRequest(`/api/sub-tasks/${subTaskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: normalizedStatus })
      });
      await fetchData();
      showToast('success', '状态切换成功');
    } catch (e) {
      const message = e instanceof Error ? e.message : '未知错误';
      showToast('error', `状态切换失败：${message}`);
    }
  }, [apiRequest, fetchData, showToast]);

  const handleDeleteTask = async (_phaseId: string, _mainTaskId: string, subTaskId: string) => {
    if (!confirm('确定删除此任务吗？')) return;
    try {
      await apiRequest(`/api/sub-tasks/${subTaskId}`, { method: 'DELETE' });
      await fetchData();
    } catch (e) {
      alert('删除任务失败');
    }
  };

  const handleDeleteGroup = async (_phaseId: string, mainTaskId: string) => {
    if (!confirm('确定删除此分组及其所有任务吗？')) return;
    try {
      await apiRequest(`/api/main-tasks/${mainTaskId}`, { method: 'DELETE' });
      await fetchData();
    } catch (e) {
      alert('删除分组失败');
    }
  };

  // --- Modal Opening Handlers ---

  const openAddTask = (phaseId: string, mainTaskId: string) => {
    setModalTarget({ phaseId, mainTaskId, type: 'add' });
    setTaskForm({ description: '', group: '通用', name: '', deadline: '' });
    setActiveModal('task');
  };

  const openEditTask = (phaseId: string, mainTaskId: string, subTask: MainTask['subTasks'][number]) => {
    const owner = getOwnerInfo(subTask.owner);
    setModalTarget({ phaseId, mainTaskId, subTaskId: subTask.id, type: 'edit' });
    setTaskForm({
      description: subTask.description,
      group: owner.group,
      name: owner.name,
      deadline: toInputDate(subTask.deadline)
    });
    setActiveModal('task');
  };

  const openAddGroup = (phaseId: string) => {
    setModalTarget({ phaseId, type: 'add' });
    setGroupForm({ title: '', dateRange: '' });
    setActiveModal('group');
  };

  const openEditGroup = (phaseId: string, mainTaskId: string, currentTitle: string, currentDate: string) => {
    setModalTarget({ phaseId, mainTaskId, type: 'edit' });
    setGroupForm({ title: currentTitle, dateRange: currentDate });
    setActiveModal('group');
  };

  // --- Form Submissions ---

  const submitTask = async () => {
    if (!taskForm.description) return alert('请填写任务描述');
    if (!taskForm.deadline) return alert('请选择截止时间');
    const owner = `${taskForm.group}/${taskForm.name}`;
    
    try {
      if (modalTarget.type === 'edit' && modalTarget.subTaskId) {
        await apiRequest(`/api/sub-tasks/${modalTarget.subTaskId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            description: taskForm.description,
            owner: owner,
            deadline: taskForm.deadline
          })
        });
      } else {
        await apiRequest('/api/sub-tasks', {
          method: 'POST',
          body: JSON.stringify({
            mainTaskId: modalTarget.mainTaskId,
            description: taskForm.description,
            owner: owner,
            deadline: taskForm.deadline,
            status: Status.PENDING
          })
        });
      }
      await fetchData();
      setActiveModal(null);
    } catch (e) {
      alert('保存任务失败');
    }
  };

  const submitGroup = async () => {
    if (!groupForm.title) return alert('请填写分组名称');

    try {
      if (modalTarget.type === 'edit' && modalTarget.mainTaskId) {
        await apiRequest(`/api/main-tasks/${modalTarget.mainTaskId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: groupForm.title,
            dateRange: groupForm.dateRange || '待定'
          })
        });
      } else {
        await apiRequest('/api/main-tasks', {
          method: 'POST',
          body: JSON.stringify({
            phaseId: modalTarget.phaseId,
            title: groupForm.title,
            dateRange: groupForm.dateRange || '待定'
          })
        });
      }
      await fetchData();
      setActiveModal(null);
    } catch (e) {
      alert('保存分组失败');
    }
  };

  // Helper
  const getOwnerInfo = (ownerStr: string) => {
    const parts = ownerStr.split('/');
    if (parts.length > 1) {
      return { group: parts[0], name: parts.slice(1).join('/') };
    }
    return { group: '通用', name: ownerStr };
  };

  const parseDeadline = (value: string) => {
    if (!value) return null;
    const trimmed = value.trim();
    if (trimmed === '待定') return null;
    const match = trimmed.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!year || !month || !day) return null;
    return { year, month, day };
  };

  const toInputDate = (value: string) => {
    const parsed = parseDeadline(value);
    if (!parsed) return '';
    const mm = String(parsed.month).padStart(2, '0');
    const dd = String(parsed.day).padStart(2, '0');
    return `${parsed.year}-${mm}-${dd}`;
  };

  const formatDeadline = (value: string) => {
    const parsed = parseDeadline(value);
    if (!parsed) return value || '待定';
    const mm = String(parsed.month).padStart(2, '0');
    const dd = String(parsed.day).padStart(2, '0');
    return `${parsed.year}.${mm}.${dd}`;
  };

  const statusCounts = {
    [Status.PENDING]: stats.pending,
    [Status.IN_PROGRESS]: stats.inProgress,
    [Status.WARNING]: stats.warning,
    [Status.RISK]: stats.risk,
    [Status.COMPLETED]: stats.completed
  };

  if (!user) {
    return (
      <div className="min-h-screen text-slate-900 flex items-center justify-center px-6 relative overflow-hidden">
        <style>{`
          @keyframes drift {
            0% { transform: translate3d(0, 0, 0) scale(1); }
            50% { transform: translate3d(30px, -20px, 0) scale(1.04); }
            100% { transform: translate3d(0, 0, 0) scale(1); }
          }
          @keyframes ripple {
            0% { transform: translateX(-10%) scaleY(1); opacity: .25; }
            50% { transform: translateX(10%) scaleY(1.05); opacity: .35; }
            100% { transform: translateX(-10%) scaleY(1); opacity: .25; }
          }
        `}</style>
        <div className="absolute inset-0 bg-sky-50" />
        <div
          className="absolute -top-40 -right-40 w-[520px] h-[520px] rounded-full bg-sky-200/60 blur-3xl"
          style={{ animation: 'drift 12s ease-in-out infinite' }}
        />
        <div
          className="absolute -bottom-56 -left-40 w-[640px] h-[640px] rounded-full bg-blue-200/50 blur-3xl"
          style={{ animation: 'drift 16s ease-in-out infinite' }}
        />
        <div className="absolute inset-x-0 bottom-0 h-56">
          <div
            className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-r from-sky-200/40 via-blue-200/30 to-sky-200/40 rounded-[100%]"
            style={{ animation: 'ripple 8s ease-in-out infinite' }}
          />
          <div
            className="absolute inset-x-0 bottom-6 h-32 bg-gradient-to-r from-blue-100/40 via-sky-100/30 to-blue-100/40 rounded-[100%]"
            style={{ animation: 'ripple 10s ease-in-out infinite' }}
          />
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.08),transparent_55%),radial-gradient(circle_at_80%_30%,rgba(14,165,233,0.08),transparent_50%)]" />

        <div className="w-full max-w-[1200px] grid grid-cols-1 lg:grid-cols-2 gap-10 items-center relative z-10">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-tech-blue/80 mb-4">AI Competition</p>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight">
              全国医保影像AI识图大赛<br />进度管理平台
            </h1>
            <p className="mt-6 text-slate-600 leading-relaxed">
              简约、清晰、科技感的赛事进度管理系统。支持多用户协作、实时更新与审计记录。
            </p>
            <div className="mt-8 flex items-center gap-3 text-slate-500 text-sm">
              <div className="w-2 h-2 bg-tech-blue rounded-full"></div>
              实时协作 · 过程可追溯 · 权限可控
            </div>
          </div>
          <AuthCard onLogin={handleLogin} onRegister={handleRegister} loading={authLoading} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans text-slate-700 pb-20 bg-slate-50/50">
      <style>{`
        @keyframes statusGlow {
          0%, 100% { transform: scale(1); box-shadow: var(--status-glow); opacity: 0.85; }
          50% { transform: scale(1.22); box-shadow: var(--status-glow-strong); opacity: 1; }
        }
        @keyframes ringSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes ringPulse {
          0%, 100% { box-shadow: 0 0 10px rgba(59, 130, 246, 0.25); opacity: 0.9; }
          50% { box-shadow: 0 0 20px rgba(59, 130, 246, 0.55); opacity: 1; }
        }
        @keyframes corePulse {
          0%, 100% { transform: scale(0.98); opacity: 0.95; }
          50% { transform: scale(1.05); opacity: 1; }
        }
        .five-color-ring {
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          background: conic-gradient(#94a3b8, #38bdf8, #fbbf24, #ef4444, #10b981, #94a3b8);
          animation: ringSpin 10s linear infinite, ringPulse 2.8s ease-in-out infinite;
          filter: saturate(1.2);
        }
        .five-color-core {
          position: absolute;
          inset: 6px;
          border-radius: 9999px;
          background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.95), rgba(248,250,252,0.9));
          animation: corePulse 2.8s ease-in-out infinite;
        }
        .status-dot-animated {
          animation: statusGlow 2.4s ease-in-out infinite;
          transform-origin: center;
        }
        @keyframes toastIn {
          0% { transform: translateY(-10px) scale(0.96); opacity: 0; }
          60% { transform: translateY(0) scale(1.02); opacity: 1; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes toastGlow {
          0%, 100% { box-shadow: 0 10px 26px rgba(15, 23, 42, 0.14), 0 0 0 rgba(59, 130, 246, 0); }
          50% { box-shadow: 0 14px 34px rgba(15, 23, 42, 0.2), 0 0 18px rgba(59, 130, 246, 0.25); }
        }
        @keyframes toastSheen {
          0% { transform: translateX(-140%); opacity: 0; }
          30% { opacity: 0.35; }
          100% { transform: translateX(140%); opacity: 0; }
        }
        .toast-shell {
          animation: toastIn 0.45s ease-out, toastGlow 2.4s ease-in-out infinite;
          backdrop-filter: blur(8px);
          overflow: hidden;
        }
        .toast-sheen {
          position: absolute;
          inset: 0;
          background: linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.6) 45%, transparent 70%);
          transform: translateX(-140%);
          animation: toastSheen 1.8s ease-in-out infinite;
          pointer-events: none;
        }
      `}</style>
      
      {/* --- Sticky Header --- */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm relative">
        {toast && (
          <div className="absolute inset-x-0 top-0 h-16 flex items-center justify-center z-10 pointer-events-none">
            <div className="max-w-[340px] w-[320px]">
              <Toast type={toast.type} message={toast.message} />
            </div>
          </div>
        )}
        <div className="w-full max-w-[98%] xl:max-w-[2000px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-tech-blue rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-900/20">
              <Layers size={18} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-none">全国医保影像AI识图大赛 进度管理平台</h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
             <div className="hidden md:block text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                总进度: <span className="text-tech-blue font-bold">{stats.progress}%</span>
             </div>
            {user.role === 'admin' && (
              <button onClick={resetData} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600" title="重置数据">
                <RotateCcw size={18} />
              </button>
            )}
            {user.role === 'admin' && (
              <button onClick={() => setShowAdmin(!showAdmin)} className="px-3 py-1.5 text-xs font-semibold rounded-full border border-slate-200 bg-white hover:bg-slate-50">
                {showAdmin ? '返回进度' : '管理员后台'}
              </button>
            )}
            <div className="flex items-center gap-2">
              <Avatar seed={avatarSeed} name={user.name} />
              <button onClick={() => setShowPasswordModal(true)} className="text-sm font-medium text-slate-700 hover:text-tech-blue">
                {user.name} · {user.group}
              </button>
              <button onClick={handleLogout} className="text-xs text-slate-400 hover:text-slate-600">退出</button>
            </div>
          </div>
        </div>
        <div className="h-[2px] w-full bg-slate-100">
          <div className="h-full bg-gradient-to-r from-tech-blue to-emerald-400 transition-all duration-700 ease-out" style={{ width: `${stats.progress}%` }} />
        </div>
      </header>

      {/* --- Main Content --- */}
      <main className="w-full max-w-[98%] xl:max-w-[2000px] mx-auto px-6 py-10">
        {showAdmin ? (
          <AdminPanel token={token || ''} apiRequest={apiRequest} />
        ) : (
        <>
          {/* --- Dashboard Stats --- */}
          <div className="mb-6 flex items-center gap-3">
            <div className="relative w-10 h-10">
              <div className="five-color-ring" />
              <div className="five-color-core" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-slate-400">Five Color Method</div>
              <h2 className="text-lg font-bold text-slate-800">五色项目管理法</h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-10">
            <StatCard
              title="未开始"
              value={stats.pending}
              total={stats.total}
              colorClass="text-slate-500"
              icon={Pause}
              hover={{
                title: '灰色：未开始',
                desc: '任务尚未启动，等待资源或排期。',
                bgClass: 'bg-slate-500'
              }}
            />
            <StatCard
              title="已完成任务"
              value={stats.completed}
              total={stats.total}
              colorClass="text-emerald-600"
              icon={CheckCircle2}
              hover={{
                title: '绿色：已完成',
                desc: '任务已闭环完成，可归档与复盘。',
                bgClass: 'bg-emerald-600'
              }}
            />
            <StatCard
              title="进行中"
              value={stats.inProgress}
              colorClass="text-sky-600"
              icon={Play}
              hover={{
                title: '蓝色：进行中',
                desc: '任务正在推进，持续跟进进度。',
                bgClass: 'bg-sky-600'
              }}
            />
            <StatCard
              title="需关注"
              value={stats.warning}
              colorClass="text-amber-500"
              icon={AlertTriangle}
              hover={{
                title: '黄色：需关注',
                desc: '任务接近逾期或有风险，需要关注。',
                bgClass: 'bg-amber-500'
              }}
            />
            <StatCard
              title="已逾期"
              value={stats.risk}
              colorClass="text-red-500"
              icon={AlertCircle}
              hover={{
                title: '红色：已逾期',
                desc: '任务已逾期，请优先处理。',
                bgClass: 'bg-red-600'
              }}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">
            <aside className="hidden lg:block sticky top-[94px] self-start z-40 max-h-[calc(100vh-120px)]">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 w-full max-w-[250px]">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">关键节点</div>
                <div className="space-y-1.5 max-h-[calc(100vh-180px)] overflow-auto pr-1">
                  {data.map((phase, idx) => {
                    const isActive = activePhaseId === phase.id;
                    return (
                      <a
                        key={phase.id}
                        href={`#phase-${phase.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          const el = document.getElementById(`phase-${phase.id}`);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            history.replaceState(null, '', `#phase-${phase.id}`);
                          }
                          setActivePhaseId(phase.id);
                        }}
                        className={`grid grid-cols-[26px_1fr] gap-2 items-center px-2.5 py-2 rounded-lg text-[13px] transition-colors ${
                          isActive
                            ? 'font-semibold text-tech-blue bg-slate-100'
                            : 'text-slate-600 hover:text-tech-blue hover:bg-slate-50'
                        }`}
                      >
                        <span className={`w-6 h-6 rounded-full border text-xs font-bold flex items-center justify-center ${
                          isActive ? 'border-tech-blue/40 text-tech-blue bg-blue-50' : 'border-slate-200 text-slate-500 bg-slate-50'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="whitespace-normal leading-snug text-left">{phase.title}</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            </aside>

            <div className="min-w-0">
              <div className="sticky top-[94px] z-40">
                <div className="mb-4 lg:hidden">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 w-full max-w-[250px]">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">关键节点</div>
                    <div className="space-y-1.5 max-h-[260px] overflow-auto pr-1">
                      {data.map((phase, idx) => {
                        const isActive = activePhaseId === phase.id;
                        return (
                          <a
                            key={phase.id}
                            href={`#phase-${phase.id}`}
                            onClick={(e) => {
                              e.preventDefault();
                              const el = document.getElementById(`phase-${phase.id}`);
                              if (el) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                history.replaceState(null, '', `#phase-${phase.id}`);
                              }
                              setActivePhaseId(phase.id);
                            }}
                            className={`grid grid-cols-[26px_1fr] gap-2 px-2.5 py-2 rounded-lg text-[13px] transition-colors ${
                              isActive
                                ? 'font-semibold text-tech-blue bg-slate-100'
                                : 'text-slate-600 hover:text-tech-blue hover:bg-slate-50'
                            }`}
                          >
                            <span className={`w-6 h-6 mt-0.5 rounded-full border text-xs font-bold flex items-center justify-center ${
                              isActive ? 'border-tech-blue/40 text-tech-blue bg-blue-50' : 'border-slate-200 text-slate-500 bg-slate-50'
                            }`}>
                              {idx + 1}
                            </span>
                            <span className="whitespace-normal leading-snug text-left">{phase.title}</span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="relative bg-white/95 backdrop-blur rounded-2xl border border-slate-200 shadow-[0_10px_24px_rgba(15,23,42,0.08)] px-4 py-[17px]">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">状态筛选</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setStatusFilter('ALL')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                          statusFilter === 'ALL'
                            ? 'bg-tech-blue text-white border-tech-blue shadow-sm'
                            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                        }`}
                      >
                        <span>全部</span>
                        <span className={`text-[11px] ${statusFilter === 'ALL' ? 'text-white/80' : 'text-slate-400'}`}>({stats.total})</span>
                      </button>
                      {STATUS_ORDER.map((status) => {
                        const conf = STATUS_CONFIG[status];
                        const isActive = statusFilter === status;
                        return (
                          <button
                            key={status}
                            onClick={() => setStatusFilter(status)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                              isActive
                                ? `${conf.color} shadow-sm`
                                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                            }`}
                          >
                            <StatusDot status={status} className="w-2 h-2" />
                            <span>{conf.label}</span>
                            <span className={`text-[11px] ${isActive ? 'opacity-70' : 'text-slate-400'}`}>({statusCounts[status]})</span>
                          </button>
                        );
                    })}
                  </div>
                </div>
              </div>
              </div>

              <div className="space-y-16 mt-5">
                {data.map((phase, pIdx) => (
            <div key={phase.id} id={`phase-${phase.id}`} className="relative scroll-mt-[170px]">

              <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 relative">
                
                {/* Left Column: Phase Title & Add Group Button */}
                <div className="relative z-10 mb-6 lg:mb-0 pl-6">
                  {pIdx !== data.length - 1 && <PhaseLine />}
                  <div className="lg:sticky lg:top-[170px]">
                    <div className="flex lg:flex-col items-center lg:items-start gap-4 lg:gap-2">
                      <div className="w-14 h-14 bg-white border-2 border-tech-blue text-tech-blue rounded-2xl flex items-center justify-center font-bold text-2xl shadow-lg shadow-blue-900/5">
                        {pIdx + 1}
                      </div>
                      <div>
                          <h2 className="text-xl font-bold text-slate-900">{phase.title}</h2>
                          <p className="text-sm font-mono text-slate-500 mt-1">{phase.dateRange}</p>
                      </div>
                    </div>
                    
                    {/* Add Group Button for this Phase */}
                    <button 
                      onClick={() => openAddGroup(phase.id)}
                      className="mt-6 hidden lg:flex items-center gap-2 text-xs font-semibold text-tech-blue bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg transition-colors border border-blue-200"
                    >
                      <Plus size={14} />
                      <span>添加分组</span>
                    </button>
                    {/* Mobile Button */}
                    <button onClick={() => openAddGroup(phase.id)} className="lg:hidden ml-auto flex items-center gap-1 text-xs text-tech-blue bg-blue-50 px-3 py-1 rounded-full"><Plus size={12}/>添加组</button>
                  </div>
                </div>

                {/* Right Column: Tasks */}
                <div className="space-y-8">
                  {(() => {
                    const visibleTasks = statusFilter === 'ALL'
                      ? phase.mainTasks
                      : phase.mainTasks.filter((task) => task.subTasks.some((subTask) => subTask.status === statusFilter));

                    return (
                    <>
                    {visibleTasks.map((task) => {
                      const visibleSubTasks = statusFilter === 'ALL'
                        ? task.subTasks
                        : task.subTasks.filter((subTask) => subTask.status === statusFilter);

                      return (
                      <div key={task.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-lg transition-all duration-300 group">
                      {/* Group Header */}
                      <div className="p-6 border-b border-slate-100 bg-slate-50/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
                         <div className="flex items-center gap-3">
                           <div className="w-1.5 h-6 bg-tech-blue rounded-full"></div>
                           <h3 className="text-lg font-bold text-slate-800">{task.title}</h3>
                           <button 
                            onClick={() => openAddTask(phase.id, task.id)}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-tech-blue text-xs rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors"
                           >
                             <Plus size={12} />
                             <span>添加任务</span>
                           </button>
                           <button onClick={() => openEditGroup(phase.id, task.id, task.title, task.dateRange)} className="p-1.5 text-slate-400 hover:text-tech-blue hover:bg-white rounded-md transition-colors opacity-0 group-hover:opacity-100" title="修改组名">
                              <Edit2 size={14} />
                           </button>
                           <button onClick={() => handleDeleteGroup(phase.id, task.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-white rounded-md transition-colors opacity-0 group-hover:opacity-100" title="删除分组">
                              <Trash2 size={14} />
                           </button>
                         </div>
                         <div className="flex items-center gap-4">
                           <div className="flex items-center gap-2 text-sm text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-100 shadow-sm">
                              <Clock size={14} className="text-tech-blue" />
                              <span className="font-medium">{task.dateRange}</span>
                           </div>
                         </div>
                      </div>

                      {/* Subtasks List */}
                      <div className="divide-y divide-slate-100">
                        {/* Table Header */}
                        <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50/30 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            <div className="col-span-4">任务描述</div>
                            <div className="col-span-2">责任组</div>
                            <div className="col-span-2">责任人</div>
                            <div className="col-span-2">截止时间</div>
                            <div className="col-span-2 text-center">状态</div>
                        </div>

                        {visibleSubTasks.map((subTask) => {
                          const { group, name } = getOwnerInfo(subTask.owner);
                          return (
                            <div key={subTask.id} className="p-6 grid grid-cols-1 md:grid-cols-12 gap-4 items-center hover:bg-blue-50/30 transition-colors group/row relative">
                                
                                {/* Row Actions */}
                                <div className="absolute right-2 top-2 md:top-auto md:right-2 flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                  <button 
                                    onClick={() => openEditTask(phase.id, task.id, subTask)}
                                    className="p-2 text-slate-300 hover:text-tech-blue"
                                    title="编辑任务"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteTask(phase.id, task.id, subTask.id)}
                                    className="p-2 text-slate-300 hover:text-red-500"
                                    title="删除任务"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>

                                {/* Column 1: Description */}
                                <div className="md:col-span-4 pr-4">
                                    <div className="flex items-start gap-3">
                                        <StatusDot status={subTask.status} animated className="mt-1.5 w-3.5 h-3.5 shrink-0 ring-2 ring-white/80" />
                                        <p className="text-base font-medium text-slate-700 leading-relaxed">{subTask.description}</p>
                                    </div>
                                </div>
                                
                                {/* Column 2: Group */}
                                <div className="md:col-span-2 flex items-center gap-2 text-sm text-slate-600">
                                    <span className="md:hidden text-xs font-bold text-slate-400 bg-slate-100 px-1.5 rounded">组别:</span>
                                    <Briefcase size={14} className="text-slate-400 hidden md:block" />
                                    <span>{group}</span>
                                </div>

                                {/* Column 3: Person */}
                                <div className="md:col-span-2 flex items-center gap-2 text-sm text-slate-600">
                                    <span className="md:hidden text-xs font-bold text-slate-400 bg-slate-100 px-1.5 rounded">责任人:</span>
                                    <Users size={14} className="text-slate-400 hidden md:block" />
                                    <span className="truncate" title={name}>{name}</span>
                                </div>

                                {/* Column 4: Deadline (Separate Column) */}
                                <div className="md:col-span-2 flex items-center gap-2 text-sm text-slate-600">
                                    <span className="md:hidden text-xs font-bold text-slate-400 bg-slate-100 px-1.5 rounded">截止:</span>
                                    <Calendar size={14} className="text-slate-400 hidden md:block" />
                                    <span className="font-mono">{formatDeadline(subTask.deadline)}</span>
                                </div>

                                {/* Column 5: Status */}
                                <div className="md:col-span-2">
                                    <StatusSelect 
                                        status={subTask.status} 
                                        onChange={(s) => updateStatus(phase.id, task.id, subTask.id, s)} 
                                    />
                                </div>
                            </div>
                          );
                        })}
                        {statusFilter === 'ALL' && task.subTasks.length === 0 && (
                          <div className="p-8 text-center text-slate-400 text-sm">
                            暂无任务，请点击右上角添加
                          </div>
                        )}
                      </div>
                    </div>
                    );
                    })}
                    {statusFilter !== 'ALL' && visibleTasks.length === 0 && phase.mainTasks.length > 0 && (
                      <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400">
                        此阶段暂无符合筛选条件的任务
                      </div>
                    )}
                    </>
                  );
                })()}
                  {phase.mainTasks.length === 0 && (
                     <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400">
                        此阶段暂无分组，请点击左侧添加分组
                     </div>
                  )}
                </div>
              </div>
            </div>
          ))}
                </div>
              </div>
            </div>
        </>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-10 mt-20">
        <div className="w-full max-w-[98%] xl:max-w-[2000px] mx-auto px-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-4 text-tech-blue font-bold text-lg">
                <Layers size={24} />
                <span>全国医保影像AI识别大赛</span>
            </div>
          <p className="text-slate-400 text-sm">© 2026 组委会 · 内部项目管理系统</p>
        </div>
      </footer>

      {/* --- Task Modal --- */}
      <Modal isOpen={activeModal === 'task'} onClose={() => setActiveModal(null)} title={modalTarget.type === 'edit' ? '编辑任务' : '添加新任务'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">任务描述</label>
            <textarea 
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-tech-blue/50 focus:border-tech-blue outline-none transition-all"
              rows={3}
              placeholder="请输入具体任务内容..."
              value={taskForm.description}
              onChange={e => setTaskForm({...taskForm, description: e.target.value})}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">责任组</label>
              <input 
                type="text" 
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-tech-blue/50 outline-none"
                placeholder="例如: 专家组"
                value={taskForm.group}
                onChange={e => setTaskForm({...taskForm, group: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">责任人</label>
              <input 
                type="text" 
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-tech-blue/50 outline-none"
                placeholder="例如: 张三"
                value={taskForm.name}
                onChange={e => setTaskForm({...taskForm, name: e.target.value})}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">截止时间</label>
            <input 
              type="date" 
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-tech-blue/50 outline-none text-slate-900"
              value={taskForm.deadline}
              onChange={e => setTaskForm({...taskForm, deadline: e.target.value})}
            />
          </div>
          <button 
            onClick={submitTask}
            className="w-full bg-tech-blue text-white font-bold py-2.5 rounded-lg hover:bg-blue-900 transition-colors mt-2"
          >
            {modalTarget.type === 'edit' ? '保存修改' : '确认添加'}
          </button>
        </div>
      </Modal>

      {/* --- Group Modal --- */}
      <Modal 
        isOpen={activeModal === 'group'} 
        onClose={() => setActiveModal(null)} 
        title={modalTarget.type === 'edit' ? '修改分组' : '添加新分组'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">分组名称 (Main Task)</label>
            <input 
              type="text" 
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-tech-blue/50 outline-none"
              placeholder="例如: 赛事筹备..."
              value={groupForm.title}
              onChange={e => setGroupForm({...groupForm, title: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">时间范围</label>
            <input 
              type="text" 
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-tech-blue/50 outline-none"
              placeholder="例如: 2026年1月 - 3月"
              value={groupForm.dateRange}
              onChange={e => setGroupForm({...groupForm, dateRange: e.target.value})}
            />
          </div>
          <button 
            onClick={submitGroup}
            className="w-full bg-tech-blue text-white font-bold py-2.5 rounded-lg hover:bg-blue-900 transition-colors mt-2"
          >
            {modalTarget.type === 'edit' ? '保存修改' : '确认添加'}
          </button>
        </div>
      </Modal>

      {/* --- Password Modal --- */}
      <Modal isOpen={showPasswordModal} onClose={() => setShowPasswordModal(false)} title="修改密码">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">原密码</label>
            <input
              type="password"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-tech-blue/50 outline-none"
              value={passwordForm.oldPassword}
              onChange={e => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">新密码</label>
            <input
              type="password"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-tech-blue/50 outline-none"
              value={passwordForm.newPassword}
              onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
            />
          </div>
          <button
            onClick={async () => {
              try {
                await apiRequest('/api/auth/change-password', {
                  method: 'POST',
                  body: JSON.stringify(passwordForm)
                });
                setShowPasswordModal(false);
                setPasswordForm({ oldPassword: '', newPassword: '' });
              } catch {
                alert('修改密码失败');
              }
            }}
            className="w-full bg-tech-blue text-white font-bold py-2.5 rounded-lg hover:bg-blue-900 transition-colors mt-2"
          >
            保存修改
          </button>
        </div>
      </Modal>

    </div>
  );
}
