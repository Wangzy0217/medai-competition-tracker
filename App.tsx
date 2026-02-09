import React, { useState, useEffect, useCallback } from 'react';
import { Phase, Status, MainTask } from './types';
import { STATUS_CONFIG, STATUS_ORDER } from './constants';
import { 
  CheckCircle2, RotateCcw, Save, Layers, Download, Clock, AlertTriangle, AlertCircle, Pause, Play,
  ChevronDown, Users, Briefcase, Calendar, Plus, Trash2, Edit2, X, MoreVertical 
} from 'lucide-react';
import { io } from 'socket.io-client';

// --- Modals & Helper Components ---
const SELECTABLE_STATUS_ORDER: Status[] = [
  Status.PENDING,
  Status.IN_PROGRESS,
  Status.COMPLETED
];

const GROUP_OPTIONS = [
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

const DEFAULT_EXPORT_STATUS_SELECTION: Record<Status, boolean> = {
  [Status.PENDING]: true,
  [Status.IN_PROGRESS]: true,
  [Status.WARNING]: true,
  [Status.REVIEWING]: true,
  [Status.RISK]: true,
  [Status.COMPLETED]: true,
};

const StatusSelect = ({
  status,
  onChange,
  showWithdraw = false,
  onWithdraw
}: {
  status: Status;
  onChange: (s: Status) => void;
  showWithdraw?: boolean;
  onWithdraw?: () => void;
}) => {
  const config = STATUS_CONFIG[status];
  const isSystemStatus = status === Status.WARNING || status === Status.RISK || status === Status.REVIEWING;
  const isReadOnly = showWithdraw || status === Status.REVIEWING;
  const selectValue = isSystemStatus ? '__SYSTEM__' : status;
  return (
    <div className="relative inline-block group w-full min-w-[96px] sm:min-w-[120px] max-w-[140px] sm:max-w-[160px]">
      <select
        value={selectValue}
        disabled={isReadOnly}
        onChange={(e) => {
          if (e.target.value === '__SYSTEM__') return;
          onChange(e.target.value as Status);
        }}
        className={`
          w-full appearance-none cursor-pointer pl-3 pr-8 py-2 rounded-lg text-xs font-bold border transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500/50
          ${isReadOnly ? 'pointer-events-none' : ''}
          ${config.color}
        `}
      >
        {isSystemStatus && (
          <option value="__SYSTEM__" disabled>
            {config.label}
          </option>
        )}
        {SELECTABLE_STATUS_ORDER.map((key) => {
          const conf = STATUS_CONFIG[key];
          return (
            <option key={key} value={key}>
              {conf.label}
            </option>
          );
        })}
      </select>
      {!isReadOnly && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
          <ChevronDown size={14} />
        </div>
      )}
      {showWithdraw && (
        <div className="absolute inset-0 rounded-lg bg-white/85 opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
          <button
            type="button"
            onClick={onWithdraw}
            className="w-full h-full rounded-lg text-xs font-bold text-slate-700 hover:text-orange-700 transition-colors"
          >
            撤回
          </button>
        </div>
      )}
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
  role: 'admin' | 'sub_admin' | 'user';
};

type PendingReviewItem = {
  subTaskId: string;
  phaseTitle: string;
  mainTaskTitle: string;
  description: string;
  owner: string;
  deadline: string;
  status: Status;
  reviewFromStatus: Status;
  reviewFromLabel: string;
  applicantName: string;
  applicantGroup: string;
  requestedAt: string;
};

type ReviewResultItem = {
  id: number;
  subTaskId: string;
  phaseTitle: string;
  mainTaskTitle: string;
  description: string;
  owner: string;
  deadline: string;
  decision: 'approve' | 'reject';
  decisionLabel: string;
  reviewerName: string;
  reviewedAt: string;
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
  const [regForm, setRegForm] = useState({ name: '', phone: '', group: GROUP_OPTIONS[0], roleTitle: '', password: '' });

  return (
    <div className="bg-white/55 backdrop-blur-2xl rounded-2xl border border-white/60 shadow-[0_18px_50px_rgba(15,23,42,0.18)] p-4 sm:p-6 w-full max-w-md">
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
                {GROUP_OPTIONS.map((g) => (
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
  apiRequest,
  role
}: {
  token: string;
  apiRequest: (path: string, options?: RequestInit) => Promise<Response>;
  role: UserInfo['role'];
}) => {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [editUser, setEditUser] = useState<UserInfo | null>(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', group: '', roleTitle: '', role: 'user', password: '' });
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [createForm, setCreateForm] = useState<{ name: string; phone: string; group: string; roleTitle: string; role: UserInfo['role'] }>({
    name: '',
    phone: '',
    group: GROUP_OPTIONS[0],
    roleTitle: '',
    role: 'user',
  });
  const [creatingUser, setCreatingUser] = useState(false);
  const canManageUsers = role === 'admin';
  const canViewLogs = role === 'admin' || role === 'sub_admin';
  const adminGroupOptions = Array.from(new Set([...GROUP_OPTIONS, ...users.map((u) => u.group).filter(Boolean)]));

  const loadAdmin = useCallback(async () => {
    if (canManageUsers) {
      const userRes = await apiRequest('/api/admin/users');
      setUsers(await userRes.json());
    } else {
      setUsers([]);
    }
    if (canViewLogs) {
      const logRes = await apiRequest('/api/admin/logs');
      setLogs(await logRes.json());
    } else {
      setLogs([]);
    }
  }, [apiRequest, canManageUsers, canViewLogs]);

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

  const openCreateUserModal = () => {
    setCreateForm({
      name: '',
      phone: '',
      group: adminGroupOptions[0] || GROUP_OPTIONS[0],
      roleTitle: '',
      role: 'user',
    });
    setShowCreateUserModal(true);
  };

  const submitCreateUser = async () => {
    if (!createForm.name || !createForm.phone || !createForm.group || !createForm.roleTitle) {
      alert('请完整填写姓名、手机号、组别、职务和角色');
      return;
    }
    setCreatingUser(true);
    try {
      await apiRequest('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(createForm),
      });
      setShowCreateUserModal(false);
      await loadAdmin();
      alert('新增成员成功，初始密码为 123456');
    } catch (e) {
      const message = e instanceof Error ? e.message : '未知错误';
      alert(`新增成员失败：${message}`);
    } finally {
      setCreatingUser(false);
    }
  };

  return (
    <div className="space-y-8">
      {canManageUsers && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-800">用户管理</h2>
            <button
              onClick={openCreateUserModal}
              className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-tech-blue text-white hover:bg-blue-900 transition-colors"
            >
              新增成员
            </button>
          </div>
          <div className="overflow-auto">
            <table className="min-w-[720px] w-full text-sm">
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
      )}

      {canViewLogs && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">操作记录</h2>
          <div className="space-y-3 max-h-[420px] overflow-auto">
            {logs.map((l) => (
              <div key={l.id} className="text-sm text-slate-600 border-b border-slate-100 pb-2">
                <div className="font-semibold text-slate-700">{l.userName} · {l.actionLabel || l.action}</div>
                <div className="text-xs text-slate-400">{l.createdAt}</div>
                {l.details && <div className="mt-1 break-words">内容：{l.details}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {canManageUsers && (
        <Modal isOpen={showCreateUserModal} onClose={() => setShowCreateUserModal(false)} title="新增成员">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">姓名</label>
                <input className="w-full px-3 py-2 border border-slate-300 rounded-lg" value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">手机号</label>
                <input className="w-full px-3 py-2 border border-slate-300 rounded-lg" value={createForm.phone} onChange={e => setCreateForm({ ...createForm, phone: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">组别</label>
                <select className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white" value={createForm.group} onChange={e => setCreateForm({ ...createForm, group: e.target.value })}>
                  {adminGroupOptions.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">组内职务</label>
                <input className="w-full px-3 py-2 border border-slate-300 rounded-lg" value={createForm.roleTitle} onChange={e => setCreateForm({ ...createForm, roleTitle: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">角色</label>
              <select className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white" value={createForm.role} onChange={e => setCreateForm({ ...createForm, role: e.target.value as UserInfo['role'] })}>
                <option value="user">用户</option>
                <option value="sub_admin">子管理员</option>
                <option value="admin">管理员</option>
              </select>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              新成员初始密码默认为 123456，可在“编辑用户”中重置。
            </div>
            <button onClick={submitCreateUser} disabled={creatingUser} className="w-full bg-tech-blue text-white font-bold py-2.5 rounded-lg hover:bg-blue-900 transition-colors disabled:opacity-60">
              {creatingUser ? '创建中...' : '确认新增'}
            </button>
          </div>
        </Modal>
      )}

      {canManageUsers && (
        <Modal isOpen={!!editUser} onClose={() => setEditUser(null)} title="编辑用户">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">姓名</label>
                <input className="w-full px-3 py-2 border border-slate-300 rounded-lg" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">手机号</label>
                <input className="w-full px-3 py-2 border border-slate-300 rounded-lg" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">组别</label>
                <input className="w-full px-3 py-2 border border-slate-300 rounded-lg" value={editForm.group} onChange={e => setEditForm({ ...editForm, group: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">组内职务</label>
                <input className="w-full px-3 py-2 border border-slate-300 rounded-lg" value={editForm.roleTitle} onChange={e => setEditForm({ ...editForm, roleTitle: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">角色</label>
                <select className="w-full px-3 py-2 border border-slate-300 rounded-lg" value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}>
                  <option value="user">用户</option>
                  <option value="sub_admin">子管理员</option>
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
      )}
    </div>
  );
};

// --- Modals ---

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidthClass = 'max-w-lg',
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidthClass?: string;
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${maxWidthClass} max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh] flex flex-col overflow-hidden transition-all duration-200 transform scale-100 opacity-100`}>
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 shrink-0">
          <h3 className="text-base sm:text-lg font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto">
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

  const [stats, setStats] = useState({ total: 0, completed: 0, progress: 0, risk: 0, warning: 0, reviewing: 0, inProgress: 0, pending: 0 });
  const [statusFilter, setStatusFilter] = useState<Status | 'ALL'>('ALL');
  const [taskScopeFilter, setTaskScopeFilter] = useState<'ALL' | 'MY_GROUP'>('ALL');
  const [exportStatusSelection, setExportStatusSelection] = useState<Record<Status, boolean>>({ ...DEFAULT_EXPORT_STATUS_SELECTION });
  const [exportingPdf, setExportingPdf] = useState(false);
  const [activePhaseId, setActivePhaseId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; type: 'success' | 'error'; message: string } | null>(null);
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [pendingReviews, setPendingReviews] = useState<PendingReviewItem[]>([]);
  const [reviewResults, setReviewResults] = useState<ReviewResultItem[]>([]);
  const [reviewResultsSeenAt, setReviewResultsSeenAt] = useState(0);
  const [reviewActionLoadingId, setReviewActionLoadingId] = useState<string | null>(null);
  
  // Modal States
  const [activeModal, setActiveModal] = useState<'task' | 'group' | 'review-complete' | 'review-center' | 'review-results' | 'export-pdf' | null>(null);
  const [modalTarget, setModalTarget] = useState<{ phaseId: string, mainTaskId?: string, subTaskId?: string, type?: 'add' | 'edit' }>({ phaseId: '' });
  const [reviewTarget, setReviewTarget] = useState<{ subTaskId: string; fromStatus: Status } | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  
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

  const fetchPendingReviews = useCallback(async () => {
    if (!token || !user || (user.role !== 'admin' && user.role !== 'sub_admin')) {
      setPendingReviews([]);
      return;
    }
    try {
      const res = await apiRequest('/api/reviews/pending');
      const payload = await res.json();
      if (Array.isArray(payload)) {
        setPendingReviews(payload as PendingReviewItem[]);
      } else {
        setPendingReviews([]);
      }
    } catch (e) {
      console.error(e);
    }
  }, [apiRequest, token, user]);

  const fetchReviewResults = useCallback(async () => {
    if (!token || !user || user.role !== 'user') {
      setReviewResults([]);
      return;
    }
    try {
      const res = await apiRequest('/api/reviews/my-results');
      const payload = await res.json();
      if (Array.isArray(payload)) {
        setReviewResults(payload as ReviewResultItem[]);
      } else {
        setReviewResults([]);
      }
    } catch (e) {
      console.error(e);
    }
  }, [apiRequest, token, user]);

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
    socket.on('data:updated', () => fetchData());
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
    fetchPendingReviews();
  }, [fetchPendingReviews, data]);

  useEffect(() => {
    fetchReviewResults();
  }, [fetchReviewResults, data]);

  useEffect(() => {
    if (!user || user.role !== 'user') {
      setReviewResultsSeenAt(0);
      return;
    }
    const raw = localStorage.getItem(`review-results-seen-at:${user.id}`) || '0';
    const value = Number(raw);
    setReviewResultsSeenAt(Number.isFinite(value) ? value : 0);
  }, [user]);
  
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-action-menu]')) return;
      setOpenActionId(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenActionId(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

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
    let total = 0, completed = 0, risk = 0, warning = 0, reviewing = 0, inProgress = 0, pending = 0;
    data.forEach(phase => {
      phase.mainTasks.forEach(mt => {
        mt.subTasks.forEach(st => {
          total++;
          if (st.status === Status.COMPLETED) completed++;
          if (st.status === Status.RISK) risk++;
          if (st.status === Status.WARNING) warning++;
          if (st.status === Status.REVIEWING) reviewing++;
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
      reviewing,
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

  const openReviewResultsModal = useCallback(() => {
    setActiveModal('review-results');
    if (!user || user.role !== 'user') return;
    const now = Date.now();
    setReviewResultsSeenAt(now);
    localStorage.setItem(`review-results-seen-at:${user.id}`, String(now));
  }, [user]);

  const openExportModal = () => {
    setActiveModal('export-pdf');
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

  const updateStatus = useCallback(async (
    _phaseId: string,
    _mainTaskId: string,
    subTaskId: string,
    currentStatus: Status,
    newStatus: Status
  ) => {
    try {
      const normalizedStatus = normalizeStatusValue(newStatus);
      if (!normalizedStatus) {
        throw new Error(`invalid status: ${String(newStatus)}`);
      }
      if (user?.role === 'user' && currentStatus === Status.REVIEWING && normalizedStatus !== Status.REVIEWING) {
        showToast('error', '审核中任务请使用“撤回”按钮');
        return;
      }
      if (user?.role === 'user' && normalizedStatus === Status.REVIEWING && currentStatus !== Status.REVIEWING) {
        showToast('error', '请先选择“已完成”并提交审核');
        return;
      }
      if (user?.role === 'user' && normalizedStatus === Status.COMPLETED) {
        if (currentStatus === Status.REVIEWING) {
          showToast('error', '该任务已在审核中');
          return;
        }
        setReviewTarget({ subTaskId, fromStatus: currentStatus });
        setActiveModal('review-complete');
        return;
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
  }, [apiRequest, fetchData, showToast, user?.role]);

  const submitCompletionReview = useCallback(async () => {
    if (!reviewTarget) return;
    setReviewSubmitting(true);
    try {
      await apiRequest(`/api/sub-tasks/${reviewTarget.subTaskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: Status.REVIEWING, submitReview: true }),
      });
      await fetchData();
      await fetchPendingReviews();
      showToast('success', '已提交完成审核');
      setReviewTarget(null);
      setActiveModal(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : '未知错误';
      showToast('error', `提交审核失败：${message}`);
    } finally {
      setReviewSubmitting(false);
    }
  }, [apiRequest, fetchData, fetchPendingReviews, reviewTarget, showToast]);

  const withdrawCompletionReview = useCallback(async (subTaskId: string) => {
    if (user?.role === 'user' && !window.confirm('确定要撤回该审核申请吗？')) {
      return;
    }
    try {
      await apiRequest(`/api/sub-tasks/${subTaskId}/withdraw-review`, {
        method: 'POST',
      });
      await fetchData();
      await fetchPendingReviews();
      showToast('success', '已撤回审核申请');
    } catch (e) {
      const message = e instanceof Error ? e.message : '未知错误';
      showToast('error', `撤回失败：${message}`);
    }
  }, [apiRequest, fetchData, fetchPendingReviews, showToast, user?.role]);

  const handleReviewDecision = useCallback(async (subTaskId: string, decision: 'approve' | 'reject') => {
    const loadingKey = `${subTaskId}:${decision}`;
    setReviewActionLoadingId(loadingKey);
    try {
      await apiRequest(`/api/sub-tasks/${subTaskId}/review-decision`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      await fetchData();
      await fetchPendingReviews();
      showToast('success', decision === 'approve' ? '审核通过成功' : '已驳回审核申请');
    } catch (e) {
      const message = e instanceof Error ? e.message : '未知错误';
      showToast('error', `审核操作失败：${message}`);
    } finally {
      setReviewActionLoadingId(null);
    }
  }, [apiRequest, fetchData, fetchPendingReviews, showToast]);

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

  const formatReviewTime = (value: string) => {
    if (!value) return '未知';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}.${m}.${day} ${hh}:${mm}`;
  };

  const selectedExportStatuses = STATUS_ORDER.filter((status) => exportStatusSelection[status]);
  const exportRows = data.flatMap((phase) =>
    phase.mainTasks.flatMap((mainTask) =>
      mainTask.subTasks
        .filter((subTask) => selectedExportStatuses.includes(subTask.status))
        .map((subTask) => {
          const ownerInfo = getOwnerInfo(subTask.owner);
          return {
            phaseTitle: phase.title,
            mainTaskTitle: mainTask.title,
            description: subTask.description,
            group: ownerInfo.group,
            ownerName: ownerInfo.name,
            deadline: formatDeadline(subTask.deadline),
            status: subTask.status,
          };
        })
    )
  );

  const toggleExportStatus = (status: Status) => {
    setExportStatusSelection((prev) => ({ ...prev, [status]: !prev[status] }));
  };

  const setAllExportStatuses = (checked: boolean) => {
    setExportStatusSelection(
      STATUS_ORDER.reduce((acc, status) => {
        acc[status] = checked;
        return acc;
      }, {} as Record<Status, boolean>)
    );
  };

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const exportToPdf = async () => {
    if (selectedExportStatuses.length === 0) {
      showToast('error', '请至少选择一个状态');
      return;
    }
    if (exportRows.length === 0) {
      showToast('error', '当前筛选条件下没有可导出的任务');
      return;
    }
    setExportingPdf(true);
    const selectedLabels = selectedExportStatuses.map((status) => STATUS_CONFIG[status].label).join('、');
    const nowForHeader = new Date();
    const exportDateTitle = `${nowForHeader.getFullYear()}.${String(nowForHeader.getMonth() + 1).padStart(2, '0')}.${String(nowForHeader.getDate()).padStart(2, '0')}`;
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
      const host = document.createElement('div');
      host.style.position = 'fixed';
      host.style.left = '-10000px';
      host.style.top = '0';
      host.style.width = '1180px';
      host.style.padding = '28px';
      host.style.background = '#ffffff';
      host.style.color = '#0f172a';
      host.style.fontFamily = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';

      const tableRowsHtml = exportRows
        .map(
          (row, index) => `
            <tr data-status="${row.status}">
              <td>${index + 1}</td>
              <td>${escapeHtml(row.phaseTitle)}</td>
              <td>${escapeHtml(row.mainTaskTitle)}</td>
              <td>${escapeHtml(row.description)}</td>
              <td>${escapeHtml(row.group)}</td>
              <td>${escapeHtml(row.ownerName)}</td>
              <td>${escapeHtml(row.deadline)}</td>
              <td class="pdf-status">${escapeHtml(STATUS_CONFIG[row.status].label)}</td>
            </tr>
          `
        )
        .join('');

      host.innerHTML = `
        <style>
          .pdf-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; margin-bottom: 8px; }
          .pdf-title, .pdf-date { font-size: 28px; font-weight: 700; color: #0f172a; line-height: 1.2; }
          .pdf-subtitle { font-size: 14px; color: #475569; margin-bottom: 6px; }
          .pdf-section { margin-top: 18px; }
          .pdf-badge { display: inline-block; margin-right: 8px; margin-top: 6px; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; border: 1px solid transparent; }
          .pdf-badge[data-status="PENDING"] { background: #f1f5f9; color: #64748b; border-color: #cbd5e1; }
          .pdf-badge[data-status="IN_PROGRESS"] { background: #e0f2fe; color: #0369a1; border-color: #7dd3fc; }
          .pdf-badge[data-status="WARNING"] { background: #fef3c7; color: #a16207; border-color: #fcd34d; }
          .pdf-badge[data-status="RISK"] { background: #ffedd5; color: #c2410c; border-color: #fdba74; }
          .pdf-badge[data-status="COMPLETED"] { background: #dcfce7; color: #047857; border-color: #86efac; }
          .pdf-badge[data-status="REVIEWING"] { background: #cffafe; color: #0e7490; border-color: #67e8f9; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 12px; }
          th, td { border: 1px solid #e2e8f0; padding: 8px 10px; font-size: 12px; line-height: 1.5; vertical-align: top; word-break: break-word; }
          th { background: #f8fafc; color: #334155; font-weight: 700; }
          tbody tr[data-status="PENDING"] td { color: #64748b; }
          tbody tr[data-status="IN_PROGRESS"] td { color: #0369a1; }
          tbody tr[data-status="WARNING"] td { color: #a16207; }
          tbody tr[data-status="RISK"] td { color: #c2410c; }
          tbody tr[data-status="COMPLETED"] td { color: #047857; }
          tbody tr[data-status="REVIEWING"] td { color: #0e7490; }
          .pdf-status { font-weight: 700; }
          th:nth-child(1), td:nth-child(1) { width: 44px; text-align: center; }
          th:nth-child(2), td:nth-child(2) { width: 120px; }
          th:nth-child(3), td:nth-child(3) { width: 140px; }
          th:nth-child(4), td:nth-child(4) { width: auto; }
          th:nth-child(5), td:nth-child(5) { width: 110px; }
          th:nth-child(6), td:nth-child(6) { width: 90px; }
          th:nth-child(7), td:nth-child(7) { width: 90px; }
          th:nth-child(8), td:nth-child(8) { width: 92px; text-align: center; }
        </style>
        <div class="pdf-header">
          <div class="pdf-title">全国医保影像AI识图大赛 进度管理表</div>
          <div class="pdf-date">${escapeHtml(exportDateTitle)}</div>
        </div>
        <div class="pdf-subtitle">状态筛选：${escapeHtml(selectedLabels)}</div>
        <div class="pdf-subtitle">任务总数：${exportRows.length}</div>
        <div class="pdf-section">
          ${selectedExportStatuses.map((status) => `<span class="pdf-badge" data-status="${status}">${escapeHtml(STATUS_CONFIG[status].label)}（${statusCounts[status]}）</span>`).join('')}
        </div>
        <div class="pdf-section">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>阶段</th>
                <th>分组</th>
                <th>任务描述</th>
                <th>责任组</th>
                <th>责任人</th>
                <th>截止时间</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>${tableRowsHtml}</tbody>
          </table>
        </div>
      `;
      document.body.appendChild(host);
      try {
        if (document.fonts?.ready) {
          await document.fonts.ready;
        }
        const canvas = await html2canvas(host, { scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: 1280 });
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 8;
        const imageWidth = pageWidth - margin * 2;
        const imageHeight = (canvas.height * imageWidth) / canvas.width;
        const usablePageHeight = pageHeight - margin * 2;
        const imageData = canvas.toDataURL('image/png');

        let heightLeft = imageHeight;
        let position = margin;
        pdf.addImage(imageData, 'PNG', margin, position, imageWidth, imageHeight, undefined, 'FAST');
        heightLeft -= usablePageHeight;

        while (heightLeft > 0) {
          pdf.addPage();
          position = margin - (imageHeight - heightLeft);
          pdf.addImage(imageData, 'PNG', margin, position, imageWidth, imageHeight, undefined, 'FAST');
          heightLeft -= usablePageHeight;
        }

        const now = new Date();
        const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        pdf.save(`任务状态导出_${stamp}.pdf`);
      } finally {
        document.body.removeChild(host);
      }

      setActiveModal(null);
      showToast('success', 'PDF 导出成功');
    } catch (e) {
      const message = e instanceof Error ? e.message : '未知错误';
      showToast('error', `导出失败：${message}`);
    } finally {
      setExportingPdf(false);
    }
  };

  const statusCounts = {
    [Status.PENDING]: stats.pending,
    [Status.IN_PROGRESS]: stats.inProgress,
    [Status.WARNING]: stats.warning,
    [Status.REVIEWING]: stats.reviewing,
    [Status.RISK]: stats.risk,
    [Status.COMPLETED]: stats.completed
  };
  const reviewResultsUnreadCount = user?.role === 'user'
    ? reviewResults.reduce((count, item) => {
      const ts = Date.parse(item.reviewedAt);
      return Number.isFinite(ts) && ts > reviewResultsSeenAt ? count + 1 : count;
    }, 0)
    : 0;
  const matchTaskScope = (owner: string) => {
    if (taskScopeFilter === 'ALL') return true;
    return getOwnerInfo(owner).group === user.group;
  };

  if (!user) {
    return (
      <div className="min-h-screen text-slate-900 flex items-center justify-center px-4 sm:px-6 relative overflow-hidden">
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
          className="absolute -top-40 -right-40 w-[360px] h-[360px] sm:w-[520px] sm:h-[520px] rounded-full bg-sky-200/60 blur-3xl"
          style={{ animation: 'drift 12s ease-in-out infinite' }}
        />
        <div
          className="absolute -bottom-56 -left-40 w-[420px] h-[420px] sm:w-[640px] sm:h-[640px] rounded-full bg-blue-200/50 blur-3xl"
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
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
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
          background: conic-gradient(#94a3b8, #38bdf8, #fde68a, #f97316, #10b981, #94a3b8);
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
            <div className="max-w-[340px] w-[calc(100%-1rem)]">
              <Toast type={toast.type} message={toast.message} />
            </div>
          </div>
        )}
        <div className="w-full max-w-[98%] xl:max-w-[2000px] mx-auto px-4 sm:px-6 py-3 md:h-16 md:py-0 flex flex-wrap md:flex-nowrap items-center justify-between gap-y-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-tech-blue rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-900/20">
              <Layers size={18} />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-slate-900 leading-tight sm:hidden">进度管理平台</h1>
              <h1 className="hidden sm:block text-base lg:text-lg font-bold text-slate-900 leading-tight break-words">全国医保影像AI识图大赛 进度管理平台</h1>
            </div>
          </div>

          <div className="w-full md:w-auto flex flex-nowrap sm:flex-wrap items-center gap-2 sm:gap-3 md:gap-4 justify-between sm:justify-end">
             <div className="hidden md:block text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                总进度: <span className="text-tech-blue font-bold">{stats.progress}%</span>
             </div>
            <button
              onClick={openExportModal}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              title="导出 PDF"
            >
              <Download size={18} />
            </button>
            {user.role === 'admin' && (
              <button onClick={resetData} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600" title="重置数据">
                <RotateCcw size={18} />
              </button>
            )}
            <div className="flex flex-nowrap sm:flex-wrap items-center gap-2 min-w-0">
              <Avatar seed={avatarSeed} name={user.name} />
              <button
                onClick={() => setShowPasswordModal(true)}
                className="text-sm font-medium text-slate-700 hover:text-tech-blue max-w-[180px] sm:max-w-[240px] md:max-w-none truncate"
              >
                <span className="sm:hidden">{user.name}</span>
                <span className="hidden sm:inline">{user.name} · {user.group}</span>
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
      <main className="w-full max-w-[98%] xl:max-w-[2000px] mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {showAdmin ? (
          <>
            {(user.role === 'admin' || user.role === 'sub_admin') && (
              <div className="mb-6 grid grid-cols-1 lg:grid-cols-5 gap-6 items-center">
                <div className="lg:col-span-4">
                  <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Admin Workspace</div>
                  <h2 className="text-lg font-bold text-slate-800 mt-1">后台管理视图</h2>
                </div>
                <div className="lg:col-span-1 w-full flex items-center gap-2">
                  <button
                    onClick={() => setShowAdmin(false)}
                    className="flex-1 min-w-0 h-10 px-3 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
                  >
                    返回进度
                  </button>
                  <button
                    onClick={() => setActiveModal('review-center')}
                    className="relative flex-1 min-w-0 h-10 px-3 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
                  >
                    审核中心
                    {pendingReviews.length > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none flex items-center justify-center">
                        {pendingReviews.length > 99 ? '99+' : pendingReviews.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            )}
            <AdminPanel token={token || ''} apiRequest={apiRequest} role={user?.role || 'user'} />
          </>
        ) : (
        <>
          {/* --- Dashboard Stats --- */}
          <div className="mb-6 grid grid-cols-1 lg:grid-cols-5 gap-6 items-center">
            <div className={`${(user.role === 'admin' || user.role === 'sub_admin' || user.role === 'user') ? 'lg:col-span-4' : 'lg:col-span-5'} flex items-center gap-3`}>
              <div className="relative w-10 h-10">
                <div className="five-color-ring" />
                <div className="five-color-core" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.35em] text-slate-400">Five Color Method</div>
                <h2 className="text-lg font-bold text-slate-800">五色项目管理法</h2>
              </div>
            </div>
            {(user.role === 'admin' || user.role === 'sub_admin') && (
              <div className="lg:col-span-1 w-full flex items-center gap-2">
                <button
                  onClick={() => setShowAdmin(!showAdmin)}
                  className="flex-1 min-w-0 h-10 px-3 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
                >
                  {showAdmin ? '返回进度' : (user.role === 'admin' ? '管理员后台' : '操作记录')}
                </button>
                <button
                  onClick={() => setActiveModal('review-center')}
                  className="relative flex-1 min-w-0 h-10 px-3 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
                >
                  审核中心
                  {pendingReviews.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none flex items-center justify-center">
                      {pendingReviews.length > 99 ? '99+' : pendingReviews.length}
                    </span>
                  )}
                </button>
              </div>
            )}
            {user.role === 'user' && (
              <div className="lg:col-span-1 w-full flex items-center gap-2">
                <button
                  onClick={openReviewResultsModal}
                  className="relative flex-1 min-w-0 h-10 px-3 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
                >
                  审核结果
                  {reviewResultsUnreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none flex items-center justify-center">
                      {reviewResultsUnreadCount > 99 ? '99+' : reviewResultsUnreadCount}
                    </span>
                  )}
                </button>
              </div>
            )}
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
              colorClass="text-amber-300"
              icon={AlertTriangle}
              hover={{
                title: '黄色：需关注',
                desc: '任务接近逾期或有风险，需要关注。',
                bgClass: 'bg-amber-300'
              }}
            />
            <StatCard
              title="已逾期"
              value={stats.risk}
              colorClass="text-orange-500"
              icon={AlertCircle}
              hover={{
                title: '橙色：已逾期',
                desc: '任务已逾期，请优先处理。',
                bgClass: 'bg-orange-600'
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
              <div className="z-40 sm:sticky sm:top-[94px]">
                <div className="mb-4 lg:hidden">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 w-full">
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
                <div className="relative bg-white/95 backdrop-blur rounded-2xl border border-slate-200 shadow-[0_10px_24px_rgba(15,23,42,0.08)] px-3 sm:px-4 py-3 sm:py-[17px]">
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-nowrap sm:items-center sm:gap-5">
                    <div className="w-full sm:w-auto flex flex-col gap-2 sm:flex-row sm:flex-nowrap sm:items-center sm:gap-3">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">任务范围</div>
                      <div className="flex w-full sm:w-auto items-center gap-2 overflow-x-auto sm:flex-nowrap sm:overflow-visible whitespace-nowrap pb-1 sm:pb-0">
                        <button
                          onClick={() => setTaskScopeFilter('ALL')}
                          className={`shrink-0 sm:shrink px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                            taskScopeFilter === 'ALL'
                              ? 'bg-tech-blue text-white border-tech-blue shadow-sm'
                              : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                          }`}
                        >
                          全部任务
                        </button>
                        <button
                          onClick={() => setTaskScopeFilter('MY_GROUP')}
                          className={`shrink-0 sm:shrink px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                            taskScopeFilter === 'MY_GROUP'
                              ? 'bg-tech-blue text-white border-tech-blue shadow-sm'
                              : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                          }`}
                        >
                          我所在组别任务
                        </button>
                      </div>
                    </div>
                    <div className="h-5 w-px bg-slate-200 hidden sm:block" />
                    <div className="w-full sm:w-auto flex flex-col gap-2 sm:flex-row sm:flex-nowrap sm:items-center sm:gap-3">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">状态筛选</div>
                    <div className="flex w-full sm:w-auto items-center gap-2 overflow-x-auto sm:flex-nowrap sm:overflow-visible whitespace-nowrap pb-1 sm:pb-0">
                      <button
                        onClick={() => setStatusFilter('ALL')}
                        className={`shrink-0 sm:shrink flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
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
                            className={`shrink-0 sm:shrink flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
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
              </div>

              <div className="space-y-8 sm:space-y-16 mt-5">
                {data.map((phase, pIdx) => (
            <div key={phase.id} id={`phase-${phase.id}`} className="relative scroll-mt-[170px]">

              <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 relative">
                
                {/* Left Column: Phase Title & Add Group Button */}
                <div className="relative z-10 mb-6 lg:mb-0 pl-0 sm:pl-4 lg:pl-6">
                  {pIdx !== data.length - 1 && <PhaseLine />}
                  <div className="lg:sticky lg:top-[170px]">
                    <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-start gap-3 lg:gap-2">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white border-2 border-tech-blue text-tech-blue rounded-2xl flex items-center justify-center font-bold text-xl sm:text-2xl shadow-lg shadow-blue-900/5">
                        {pIdx + 1}
                      </div>
                      <div>
                          <h2 className="text-lg sm:text-xl font-bold text-slate-900">{phase.title}</h2>
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
                    const visibleTasks = phase.mainTasks.filter((task) => {
                      const scopedSubTasks = task.subTasks.filter((subTask) => matchTaskScope(subTask.owner));
                      if (statusFilter === 'ALL') {
                        return scopedSubTasks.length > 0;
                      }
                      return scopedSubTasks.some((subTask) => subTask.status === statusFilter);
                    });

                    return (
                    <>
                    {visibleTasks.map((task) => {
                      const scopedSubTasks = task.subTasks.filter((subTask) => matchTaskScope(subTask.owner));
                      const visibleSubTasks = statusFilter === 'ALL'
                        ? scopedSubTasks
                        : scopedSubTasks.filter((subTask) => subTask.status === statusFilter);

                      return (
                      <div key={task.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-visible hover:shadow-lg transition-all duration-300 group">
                      {/* Group Header */}
                      <div className="p-4 sm:p-6 border-b border-slate-100 bg-slate-50/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
                         <div className="flex flex-wrap items-center gap-3 min-w-0">
                           <div className="w-1.5 h-6 bg-tech-blue rounded-full"></div>
                           <h3 className="text-lg font-bold text-slate-800 min-w-0 break-words">{task.title}</h3>
                           <button 
                            onClick={() => openAddTask(phase.id, task.id)}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-tech-blue text-xs rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors shrink-0"
                           >
                             <Plus size={12} />
                             <span>添加任务</span>
                           </button>
                           <button onClick={() => openEditGroup(phase.id, task.id, task.title, task.dateRange)} className="p-1.5 text-slate-400 hover:text-tech-blue hover:bg-white rounded-md transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 shrink-0" title="修改组名">
                              <Edit2 size={14} />
                           </button>
                           <button onClick={() => handleDeleteGroup(phase.id, task.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-white rounded-md transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 shrink-0" title="删除分组">
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
                            <div className="col-span-1 text-center">状态</div>
                            <div className="col-span-1 text-right">操作</div>
                        </div>

                        {visibleSubTasks.map((subTask) => {
                          const { group, name } = getOwnerInfo(subTask.owner);
                          return (
                            <div key={subTask.id} className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-4 items-center hover:bg-blue-50/30 transition-colors group/row relative">

                                {/* Column 1: Description */}
                                <div className="md:col-span-4 pr-4 min-w-0">
                                    <div className="flex items-start gap-3 min-w-0">
                                        <StatusDot status={subTask.status} animated className="mt-1.5 w-3.5 h-3.5 shrink-0 ring-2 ring-white/80" />
                                        <p className="text-sm sm:text-base font-medium text-slate-700 leading-relaxed">{subTask.description}</p>
                                    </div>
                                </div>
                                
                                {/* Column 2: Group */}
                                <div className="md:col-span-2 flex items-center gap-2 text-sm text-slate-600 min-w-0">
                                    <span className="md:hidden text-xs font-bold text-slate-400 bg-slate-100 px-1.5 rounded">组别:</span>
                                    <Briefcase size={14} className="text-slate-400 hidden md:block" />
                                    <span className="break-words">{group}</span>
                                </div>

                                {/* Column 3: Person */}
                                <div className="md:col-span-2 flex items-center gap-2 text-sm text-slate-600 min-w-0">
                                    <span className="md:hidden text-xs font-bold text-slate-400 bg-slate-100 px-1.5 rounded">责任人:</span>
                                    <Users size={14} className="text-slate-400 hidden md:block" />
                                    <span className="break-words">{name}</span>
                                </div>

                                {/* Column 4: Deadline (Separate Column) */}
                                <div className="md:col-span-2 flex items-center gap-2 text-sm text-slate-600 min-w-0">
                                    <span className="md:hidden text-xs font-bold text-slate-400 bg-slate-100 px-1.5 rounded">截止:</span>
                                    <Calendar size={14} className="text-slate-400 hidden md:block" />
                                    <span className="font-mono">{formatDeadline(subTask.deadline)}</span>
                                </div>

                                {/* Column 5: Status */}
                                <div className="md:col-span-1 flex md:justify-center">
                                    <StatusSelect 
                                        status={subTask.status} 
                                        onChange={(s) => updateStatus(phase.id, task.id, subTask.id, subTask.status, s)}
                                        showWithdraw={user?.role === 'user' && subTask.status === Status.REVIEWING && Boolean(subTask.canWithdrawReview)}
                                        onWithdraw={() => withdrawCompletionReview(subTask.id)}
                                    />
                                </div>

                                {/* Actions */}
                                <div className="md:col-span-1 flex items-center md:justify-end">
                                    <span className="md:hidden text-xs font-bold text-slate-400 bg-slate-100 px-1.5 rounded mr-2">操作:</span>
                                    <div className="relative" data-action-menu>
                                      <button
                                        onClick={() => setOpenActionId(openActionId === subTask.id ? null : subTask.id)}
                                        className="p-2 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                        aria-label="任务操作"
                                      >
                                        <MoreVertical size={16} />
                                      </button>
                                      {openActionId === subTask.id && (
                                        <div className="absolute right-0 mt-2 w-28 rounded-lg border border-slate-200 bg-white shadow-lg z-20 overflow-hidden">
                                          <button
                                            onClick={() => {
                                              openEditTask(phase.id, task.id, subTask);
                                              setOpenActionId(null);
                                            }}
                                            className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                          >
                                            编辑
                                          </button>
                                          <button
                                            onClick={() => {
                                              handleDeleteTask(phase.id, task.id, subTask.id);
                                              setOpenActionId(null);
                                            }}
                                            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                                          >
                                            删除
                                          </button>
                                        </div>
                                      )}
                                    </div>
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
                    {visibleTasks.length === 0 && phase.mainTasks.length > 0 && (
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
        <div className="w-full max-w-[98%] xl:max-w-[2000px] mx-auto px-4 sm:px-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-4 text-tech-blue font-bold text-lg">
                <Layers size={24} />
                <span>全国医保影像AI识别大赛</span>
            </div>
          <p className="text-slate-400 text-sm">© 2026 组委会 · 内部项目管理系统</p>
        </div>
      </footer>

      {/* --- Export PDF Modal --- */}
      <Modal
        isOpen={activeModal === 'export-pdf'}
        onClose={() => setActiveModal(null)}
        title="导出任务状态 PDF"
        maxWidthClass="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="text-sm text-slate-600">
            选择要导出的任务状态（可多选）
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAllExportStatuses(true)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
            >
              全选
            </button>
            <button
              type="button"
              onClick={() => setAllExportStatuses(false)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
            >
              清空
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {STATUS_ORDER.map((status) => (
              <label
                key={status}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={exportStatusSelection[status]}
                  onChange={() => toggleExportStatus(status)}
                  className="accent-tech-blue"
                />
                <StatusDot status={status} className="w-2.5 h-2.5" />
                <span className="text-sm text-slate-700">{STATUS_CONFIG[status].label}</span>
                <span className="text-xs text-slate-400">({statusCounts[status]})</span>
              </label>
            ))}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            已选状态：<span className="font-semibold text-slate-800">{selectedExportStatuses.length}</span> 个
            ，可导出任务：<span className="font-semibold text-tech-blue">{exportRows.length}</span> 条
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setActiveModal(null)}
              disabled={exportingPdf}
              className="px-4 py-2 text-sm font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              取消
            </button>
            <button
              type="button"
              onClick={exportToPdf}
              disabled={exportingPdf}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-tech-blue text-white hover:bg-blue-900 disabled:opacity-60"
            >
              {exportingPdf ? '导出中...' : '导出 PDF'}
            </button>
          </div>
        </div>
      </Modal>

      {/* --- Review Center Modal --- */}
      <Modal
        isOpen={activeModal === 'review-center'}
        onClose={() => setActiveModal(null)}
        title="审核中心"
        maxWidthClass="max-w-[96vw] xl:max-w-[1680px]"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-slate-600">
              待审核任务共 <span className="font-bold text-red-500">{pendingReviews.length}</span> 条
            </div>
            <div className="text-xs text-slate-400">
              {user.role === 'admin' ? '范围：全部组别' : `范围：${user.group}`}
            </div>
          </div>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            {pendingReviews.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm">暂无待审核任务</div>
            ) : (
              <div className="max-h-[62vh] overflow-auto">
                <table className="min-w-[980px] w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-left px-4 py-3">阶段 / 分组</th>
                      <th className="text-left px-4 py-3">任务描述</th>
                      <th className="text-left px-4 py-3">申请人</th>
                      <th className="text-left px-4 py-3">截止时间</th>
                      <th className="text-left px-4 py-3">申请时间</th>
                      <th className="text-left px-4 py-3">来源状态</th>
                      <th className="text-right px-4 py-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingReviews.map((item) => {
                      const approveKey = `${item.subTaskId}:approve`;
                      const rejectKey = `${item.subTaskId}:reject`;
                      const actionBusy = reviewActionLoadingId === approveKey || reviewActionLoadingId === rejectKey;
                      return (
                        <tr key={item.subTaskId} className="border-t border-slate-100 align-top">
                          <td className="px-4 py-3">
                            <div className="text-slate-700 font-medium">{item.phaseTitle || '-'}</div>
                            <div className="text-xs text-slate-400 mt-1">{item.mainTaskTitle || '-'}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-slate-700 leading-relaxed">{item.description}</div>
                            <div className="text-xs text-slate-400 mt-1">责任：{item.owner}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-slate-700">{item.applicantName || '-'}</div>
                            <div className="text-xs text-slate-400 mt-1">{item.applicantGroup || '-'}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{formatDeadline(item.deadline)}</td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatReviewTime(item.requestedAt)}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-semibold">
                              {item.reviewFromLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                disabled={Boolean(reviewActionLoadingId)}
                                onClick={() => handleReviewDecision(item.subTaskId, 'reject')}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                              >
                                {reviewActionLoadingId === rejectKey ? '处理中...' : '驳回'}
                              </button>
                              <button
                                type="button"
                                disabled={Boolean(reviewActionLoadingId)}
                                onClick={() => handleReviewDecision(item.subTaskId, 'approve')}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-tech-blue text-white hover:bg-blue-900 disabled:opacity-60"
                              >
                                {reviewActionLoadingId === approveKey ? '处理中...' : '通过'}
                              </button>
                            </div>
                            {actionBusy && <div className="text-[11px] text-slate-400 mt-1">请稍候...</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* --- Review Result Modal --- */}
      <Modal
        isOpen={activeModal === 'review-results'}
        onClose={() => setActiveModal(null)}
        title="审核结果"
        maxWidthClass="max-w-[96vw] xl:max-w-[1500px]"
      >
        <div className="space-y-4">
          <div className="text-sm text-slate-600">
            你的审核结果共 <span className="font-bold text-tech-blue">{reviewResults.length}</span> 条
          </div>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            {reviewResults.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm">暂无审核结果</div>
            ) : (
              <div className="max-h-[62vh] overflow-auto">
                <table className="min-w-[860px] w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-left px-4 py-3">阶段 / 分组</th>
                      <th className="text-left px-4 py-3">任务描述</th>
                      <th className="text-left px-4 py-3">截止时间</th>
                      <th className="text-left px-4 py-3">审核结果</th>
                      <th className="text-left px-4 py-3">审核人</th>
                      <th className="text-left px-4 py-3">审核时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewResults.map((item) => (
                      <tr key={item.id} className="border-t border-slate-100 align-top">
                        <td className="px-4 py-3">
                          <div className="text-slate-700 font-medium">{item.phaseTitle || '-'}</div>
                          <div className="text-xs text-slate-400 mt-1">{item.mainTaskTitle || '-'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-slate-700 leading-relaxed">{item.description || '-'}</div>
                          <div className="text-xs text-slate-400 mt-1">责任：{item.owner || '-'}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{formatDeadline(item.deadline)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold ${
                              item.decision === 'approve'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-red-50 text-red-700'
                            }`}
                          >
                            {item.decisionLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{item.reviewerName || '-'}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatReviewTime(item.reviewedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Modal>

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      {/* --- Review Modal --- */}
      <Modal
        isOpen={activeModal === 'review-complete'}
        onClose={() => {
          setActiveModal(null);
          setReviewTarget(null);
        }}
        title="提交完成审核"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            你正在申请将任务状态标记为“已完成”。提交后任务将进入“审核中”，通过后由管理员或子管理员改为“已完成”。
          </p>
          {reviewTarget && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              当前状态：{STATUS_CONFIG[reviewTarget.fromStatus].label}
            </div>
          )}
          <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-700">
            提交后你仍可在“审核中”状态下悬停状态栏并点击“撤回”。
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setActiveModal(null);
                setReviewTarget(null);
              }}
              disabled={reviewSubmitting}
              className="px-4 py-2 text-sm font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              取消
            </button>
            <button
              type="button"
              onClick={submitCompletionReview}
              disabled={reviewSubmitting || !reviewTarget}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-tech-blue text-white hover:bg-blue-900 disabled:opacity-60"
            >
              {reviewSubmitting ? '提交中...' : '确定提交审核'}
            </button>
          </div>
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
