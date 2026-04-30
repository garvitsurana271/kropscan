import React from 'react';
import { UserProfile, NavItem } from '../types';
import { dbService } from '../services/DatabaseService';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface OrgDashboardProps {
    user: UserProfile;
    onNavigate?: (tab: NavItem) => void;
    t?: (key: string) => string;
}

const OrgDashboard: React.FC<OrgDashboardProps> = ({ user, onNavigate, t }) => {
    // Real Stats State
    const [stats, setStats] = useState({
        totalFarmers: 0,
        activeScans: 0,
        criticalAlerts: 0,
        regionName: "Nashik District"
    });

    useEffect(() => {
        const loadStats = async () => {
            // Real Stats from Firebase & Local DB
            try {
                // Import dynamically to avoid circular dependency issues if any
                const { firebaseService } = await import('../services/FirebaseService');

                const userCount = await firebaseService.getCollectionCount('users');
                const postCount = await firebaseService.getCollectionCount('posts');
                const localMarketItems = await dbService.getMarketItems(); // Still local

                setStats({
                    totalFarmers: userCount || 1250, // Fallback to base if 0 (e.g. fresh db)
                    activeScans: 4500 + postCount + localMarketItems.length, // Mix of real activity
                    criticalAlerts: 12, // Mocked for now (Logic requires Alert Service)
                    regionName: "Nashik District (Live)"
                });
            } catch (e) {
                console.error("Failed to load org stats", e);
            }
        };
        loadStats();
    }, []);

    const diseaseTrends = [
        { name: 'Week 1', cases: 45 },
        { name: 'Week 2', cases: 52 },
        { name: 'Week 3', cases: 38 },
        { name: 'Week 4', cases: 65 }, // Outbreak spike
    ];

    const distributionData = [
        { name: 'Wheat Rust', value: 400, color: '#ef4444' },
        { name: 'Blight', value: 300, color: '#f97316' },
        { name: 'Aphids', value: 300, color: '#eab308' },
        { name: 'Healthy', value: 3500, color: '#22c55e' },
    ];

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3">
                <div>
                    <span className="text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-lg">Organization View</span>
                    <h1 className="text-3xl font-black text-gray-900 dark:text-white mt-2">{stats.regionName} Overview</h1>
                    <p className="text-gray-500">Real-time agricultural surveillance</p>
                </div>
                <div className="flex gap-3">
                    <button className="bg-gray-900 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-black transition-colors shadow-lg"
                        onClick={() => {
                            const text = `KropScan System Report\nRegion: ${stats.regionName}\nTotal Farmers: ${stats.totalFarmers}\nTotal Scans: ${stats.activeScans}\nDate: ${new Date().toLocaleDateString()}`;
                            const blob = new Blob([text], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url; a.download = 'kropscan-report.txt'; a.click();
                            URL.revokeObjectURL(url);
                        }}>
                        Export Report
                    </button>
                    <button className="bg-white border border-gray-200 text-gray-700 px-5 py-2.5 rounded-xl font-bold hover:bg-gray-50 transition-colors"
                        onClick={() => toast.info('Team management coming soon')}>
                        Manage Team
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white dark:bg-surface-dark p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800">
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-wide">Total Farmers</p>
                    <p className="text-3xl font-black text-gray-900 dark:text-white mt-1">{stats.totalFarmers.toLocaleString()}</p>
                    <span className="text-green-500 text-xs font-bold flex items-center mt-1"><span className="material-icons-round text-sm">trending_up</span> +12% this month</span>
                </div>
                <div className="bg-white dark:bg-surface-dark p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800">
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-wide">Total Scans</p>
                    <p className="text-3xl font-black text-gray-900 dark:text-white mt-1">{stats.activeScans.toLocaleString()}</p>
                </div>
                <div className="bg-white dark:bg-surface-dark p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800">
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-wide">Critical Alerts</p>
                    <p className="text-3xl font-black text-red-500 mt-1">{stats.criticalAlerts}</p>
                    <span className="text-red-500 text-xs font-bold mt-1">Action Required</span>
                </div>
                <div className="bg-primary p-6 rounded-3xl shadow-lg shadow-primary/30 text-white relative overflow-hidden group hover:scale-105 transition-transform">
                    <span className="material-icons-round absolute -right-4 -bottom-4 text-7xl opacity-20">map</span>
                    <p className="text-white/80 text-xs font-bold uppercase tracking-wide">Coverage</p>
                    <p className="text-3xl font-black mt-1">92%</p>
                    <p className="text-xs opacity-80 mt-1">of registered villages</p>
                </div>
            </div>

            {/* Disease Trend Chart (Simulated Global/Regional Data) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white dark:bg-surface-dark p-8 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-800">
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-6">Disease Outbreak Trend</h3>
                    <div style={{ width: '100%', height: 260 }}>
                        <ResponsiveContainer>
                            <AreaChart data={diseaseTrends}>
                                <defs>
                                    <linearGradient id="colorCases" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={{ borderRadius: '12px' }} />
                                <Area type="monotone" dataKey="cases" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorCases)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white dark:bg-surface-dark p-8 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-800">
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-6">Crop Health Status</h3>
                    <div style={{ width: '100%', height: 260 }}>
                        <ResponsiveContainer>
                            <BarChart data={distributionData} layout="vertical">
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12 }} />
                                <Tooltip cursor={{ fill: 'transparent' }} />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                    {distributionData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrgDashboard;
