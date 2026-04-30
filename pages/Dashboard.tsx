import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, AreaChart, Area, CartesianGrid } from 'recharts';
import { dbService } from '../services/DatabaseService';
import { firebaseService } from '../services/FirebaseService';
import { CropScan } from '../types';

interface DashboardProps {
  t: (key: string) => string;
  onNavigate?: (tab: any) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ t, onNavigate }) => {
  const [stats, setStats] = useState({ totalUsers: 0, totalScans: 0 });
  const [recentActivity, setRecentActivity] = useState<CropScan[]>([]);
  const [activityTrend, setActivityTrend] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Broadcast State
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastType, setBroadcastType] = useState<'info' | 'alert' | 'warning'>('info');

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await firebaseService.getAdminStats();
        setStats({
          totalUsers: data.totalUsers,
          totalScans: data.totalScans
        });
        setRecentActivity(data.recentActivity);
        setActivityTrend(data.activityTrend || []);
      } catch (e) {
        console.error("Failed to load admin stats", e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleBroadcast = async () => {
    if (!broadcastTitle || !broadcastMessage) { toast.error("Please fill all fields"); return; }
    await dbService.broadcastMessage(broadcastTitle, broadcastMessage, broadcastType);
    toast.success("Broadcast sent successfully!");
    setIsBroadcastOpen(false);
    setBroadcastTitle('');
    setBroadcastMessage('');
  };

  const actions = [
    { label: 'Database Editor', icon: 'storage', color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20', action: 'admin_db' },
    { label: 'User Management', icon: 'manage_accounts', color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20', action: 'admin_users' },
    { label: 'Market Control', icon: 'storefront', color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20', action: 'market' }, // AdminMarket handles both
    { label: 'Support Tickets', icon: 'support_agent', color: 'text-pink-500', bg: 'bg-pink-50 dark:bg-pink-900/20', action: 'admin_support' },
    { label: 'Broadcast', icon: 'campaign', color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20', action: 'broadcast' },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto space-y-8 animate-fade-in text-gray-900 dark:text-white">

      {/* Hero Section - System Status */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-[2rem] p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white opacity-5 rounded-full -mr-20 -mt-20 blur-3xl"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <div className="inline-flex items-center gap-2 bg-green-500/20 px-3 py-1 rounded-full text-xs font-bold text-green-400 mb-2 border border-green-500/30">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              SYSTEM ONLINE
            </div>
            <h1 className="text-4xl font-black mb-2">Admin Control Center</h1>
            <p className="text-gray-400 font-medium">Monitoring {stats.totalUsers} farmers and {stats.totalScans} scans across the network.</p>
          </div>
          <div className="flex gap-4">
            <div className="text-center p-4 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1">Total Users</p>
              <p className="text-3xl font-black">{stats.totalUsers}</p>
            </div>
            <div className="text-center p-4 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1">Total Scans</p>
              <p className="text-3xl font-black text-primary">{loading ? '...' : stats.totalScans}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left Column - Activity Chart */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white dark:bg-surface-dark p-8 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-800">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Platform Activity</h3>
              <select className="bg-gray-50 dark:bg-gray-800 border-none rounded-xl text-sm font-medium px-4 py-2 outline-none">
                <option>Last 7 Days</option>
                <option>Last 30 Days</option>
              </select>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityTrend}>
                  <defs>
                    <linearGradient id="colorScans" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.5} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} dy={10} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    cursor={{ stroke: '#22c55e', strokeWidth: 2 }}
                  />
                  <Area type="monotone" dataKey="scans" stroke="#22c55e" strokeWidth={3} fillOpacity={1} fill="url(#colorScans)" />
                  <Area type="monotone" dataKey="users" stroke="#3b82f6" strokeWidth={3} fillOpacity={0} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {actions.map((action, i) => (
              <button
                key={i}
                onClick={() => {
                  if (action.action === 'broadcast') {
                    setIsBroadcastOpen(true);
                  } else {
                    t && onNavigate && onNavigate(action.action as any);
                  }
                }}
                className="p-4 bg-white dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-gray-800 hover:shadow-lg transition-all flex flex-col items-center gap-3 group"
              >
                <div className={`w-12 h-12 rounded-xl ${action.bg} flex items-center justify-center ${action.color} group-hover:scale-110 transition-transform`}>
                  <span className="material-icons-round text-2xl">{action.icon}</span>
                </div>
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300 whitespace-nowrap">{action.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right Column - Live Feed */}
        <div className="bg-white dark:bg-surface-dark p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col h-full">
          <h3 className="text-xl font-bold mb-6">Live Activity</h3>
          <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar max-h-[600px]">
            {loading ? (
              <div className="text-center text-gray-500 py-10">Loading feed...</div>
            ) : recentActivity.length === 0 ? (
              <div className="text-center text-gray-500 py-10">No recent activity</div>
            ) : (
              recentActivity.map((item, i) => (
                <div key={i} className="flex items-start gap-4 p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  {/* Item could be scan OR notification? For now assumg Scan or User joined */}
                  <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                    <span className="material-icons-round text-gray-500 text-sm">
                      {item.diagnosis ? 'center_focus_weak' : (item.title ? 'campaign' : 'person_add')}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                      {item.diagnosis || item.title || 'New User Joined'}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {item.cropName || item.message || `User #${item.id}`} • {new Date(item.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Broadcast Modal */}
      {isBroadcastOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setIsBroadcastOpen(false)}>
          <div className="bg-white dark:bg-surface-dark w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-black mb-1 text-gray-900 dark:text-white">Broadcast</h2>
            <p className="text-sm text-gray-500 mb-6">Send a notification to all users.</p>

            <div className="space-y-4">
              <input
                value={broadcastTitle}
                onChange={e => setBroadcastTitle(e.target.value)}
                placeholder="Title"
                className="w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-800 border-none font-bold outline-none focus:ring-2 focus:ring-primary/20"
              />
              <select
                value={broadcastType}
                onChange={e => setBroadcastType(e.target.value as any)}
                className="w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-800 border-none font-bold outline-none"
              >
                <option value="info">Info (Blue)</option>
                <option value="warning">Warning (Orange)</option>
                <option value="alert">Alert (Red)</option>
              </select>
              <textarea
                value={broadcastMessage}
                onChange={e => setBroadcastMessage(e.target.value)}
                placeholder="Message..."
                className="w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-800 border-none font-medium h-32 resize-none outline-none focus:ring-2 focus:ring-primary/20"
              ></textarea>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button onClick={() => setIsBroadcastOpen(false)} className="px-5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-bold">Cancel</button>
              <button onClick={handleBroadcast} className="px-5 py-2 rounded-xl bg-red-600 text-white font-bold shadow-lg hover:bg-red-700 transition-colors">Send Broadcast</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;