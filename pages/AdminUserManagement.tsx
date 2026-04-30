import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { dbService, User } from '../services/DatabaseService'; // Legacy User type
import { firebaseService } from '../services/FirebaseService';
import { UserRole } from '../types';

const AdminUserManagement: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastDoc, setLastDoc] = useState<any>(null);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    // Filters
    const [search, setSearch] = useState('');
    const [filterPlan, setFilterPlan] = useState('All');

    useEffect(() => {
        loadUsers(true);
    }, [filterPlan]); // Reload on filter change (if we supported server filter, or just reset)

    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            if (search.length > 2) {
                handleSearch();
            } else if (search.length === 0) {
                loadUsers(true);
            }
        }, 800);

        return () => clearTimeout(delayDebounceFn);
    }, [search]);

    const loadUsers = async (reset = false) => {
        if (reset) {
            setUsers([]);
            setLastDoc(null);
            setHasMore(true);
            setLoading(true);
        } else {
            setIsLoadingMore(true);
        }

        try {
            // If searching, we don't paginate (MVP) or we handle it separately
            if (search.length > 2) {
                handleSearch(); // Should probably return here or merge logic
                return;
            }

            const { users: newUsers, lastDoc: newLast } = await firebaseService.getUsers(reset ? undefined : lastDoc);

            // Client-side filter for Plan (since we didn't add server index for it yet)
            // Ideally this should be server-side
            let processed = newUsers;
            if (filterPlan !== 'All') {
                if (filterPlan === 'Pro') {
                    processed = processed.filter(u => u.plan?.includes('Pro') || u.plan === 'Enterprise');
                } else {
                    processed = processed.filter(u => !u.plan?.includes('Pro') && u.plan !== 'Enterprise');
                }
            }

            setUsers(prev => reset ? newUsers : [...prev, ...newUsers]);
            setLastDoc(newLast);
            setHasMore(!!newLast);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
            setIsLoadingMore(false);
        }
    };

    const handleSearch = async () => {
        setLoading(true);
        try {
            const results = await firebaseService.searchUsers(search);
            setUsers(results);
            setHasMore(false); // Disable pagination on search results for now
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => { // Firebase uses string IDs
        if (confirm('Are you sure you want to permanently delete this user?')) {
            await firebaseService.deleteUser(id);
        }
    };

    const handlePromote = async (user: User) => {
        if (!user.id) return;
        if (confirm(`Promote ${user.name} to Pro Farmer (Free for 30 days)?`)) {
            await firebaseService.updateUser(user.id!.toString(), {
                plan: 'Pro Farmer',
                planExpiry: Date.now() + (30 * 24 * 60 * 60 * 1000)
            });
            toast.success(`${user.name} is now a Pro Farmer.`);
        }
    };

    const handleDemote = async (user: User) => {
        if (!user.id) return;
        if (confirm(`Downgrade ${user.name} to Free plan?`)) {
            await firebaseService.updateUser(user.id!.toString(), { plan: 'Free', planExpiry: null });
        }
    };

    return (
        <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-2">User Management</h1>
                    <p className="text-gray-500">Manage registered farmers and accounts.</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <span className="material-icons-round absolute left-3 top-2.5 text-gray-400">search</span>
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search Name/Mobile..."
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-xl text-sm font-bold outline-none"
                        />
                    </div>
                    <select
                        value={filterPlan}
                        onChange={(e) => setFilterPlan(e.target.value)}
                        className="px-4 py-2 bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-xl text-sm font-bold outline-none cursor-pointer"
                    >
                        <option value="All">All Plans</option>
                        <option value="Pro">Pro / Enterprise</option>
                        <option value="Free">Free</option>
                    </select>
                    <button
                        className="p-2 bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-xl text-green-500 cursor-default"
                        title="Live Sync Active"
                    >
                        <span className="material-icons-round animate-pulse">sync</span>
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-surface-dark rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-gray-100 dark:border-gray-800 text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-50/50 dark:bg-gray-800/20">
                                <th className="p-6">User</th>
                                <th className="p-6">Role / Plan</th>
                                <th className="p-6">Joined</th>
                                <th className="p-6 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {loading ? (
                                <tr>
                                    <td colSpan={4} className="p-10 text-center text-gray-400">Loading Users...</td>
                                </tr>
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="p-10 text-center text-gray-400">No users found.</td>
                                </tr>
                            ) : (
                                users.map(user => (
                                    <tr key={user.id} className="group hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                        <td className="p-6">
                                            <div className="flex items-center gap-4">
                                                <img src={user.avatar} className="w-10 h-10 rounded-full bg-gray-200" alt={user.name} />
                                                <div>
                                                    <p className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                                        {user.name}
                                                        {user.role === 'ADMIN' && <span className="bg-black text-white text-[10px] px-2 rounded-full">ADMIN</span>}
                                                    </p>
                                                    <p className="text-xs text-gray-500">{user.mobile || user.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <div className="flex flex-col items-start gap-1">
                                                <span className={`text-xs font-bold px-3 py-1 rounded-full ${user?.plan && (user.plan.includes('Pro') || user.plan === 'Enterprise') ? 'bg-purple-100 text-purple-600' : 'bg-green-100 text-green-600'}`}>
                                                    {user.plan || 'Free'}
                                                </span>
                                                {user.planExpiry && (
                                                    <span className="text-[10px] text-gray-400 font-mono mt-1">
                                                        Expires: {new Date(user.planExpiry).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <span className="text-sm text-gray-500 font-medium">
                                                {new Date(user.joinedDate).toLocaleDateString()}
                                            </span>
                                        </td>
                                        <td className="p-6 text-right">
                                            {user.role !== 'ADMIN' && (
                                                <div className="flex justify-end gap-2">
                                                    {(user.plan === 'Free' || !user.plan) ? (
                                                        <button
                                                            onClick={() => handlePromote(user)}
                                                            title="Promote to Pro"
                                                            className="p-2 text-purple-500 hover:bg-purple-50 rounded-lg transition-colors"
                                                        >
                                                            <span className="material-icons-round">upgrade</span>
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleDemote(user)}
                                                            title="Downgrade to Free"
                                                            className="p-2 text-orange-500 hover:bg-orange-50 rounded-lg transition-colors"
                                                        >
                                                            <span className="material-icons-round">south</span>
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => user.id && handleDelete(user.id)}
                                                        title="Delete User"
                                                        className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors"
                                                    >
                                                        <span className="material-icons-round">delete_outline</span>
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                {hasMore && !search && (
                    <div className="p-4 bg-gray-50 dark:bg-gray-800/20 border-t border-gray-100 dark:border-gray-800 flex justify-center">
                        <button
                            onClick={() => loadUsers(false)}
                            disabled={isLoadingMore}
                            className="px-6 py-2 bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                            {isLoadingMore ? 'Loading...' : 'Load More Users'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminUserManagement;
