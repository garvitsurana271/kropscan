import React, { useEffect, useState } from 'react';
import { dbService } from '../services/DatabaseService';
import { firebaseService } from '../services/FirebaseService';

const AdminMarket: React.FC = () => {
    const [items, setItems] = useState<any[]>([]);
    const [tab, setTab] = useState<'live' | 'pending'>('pending');

    useEffect(() => {
        loadItems();
    }, [tab]);

    const loadItems = async () => {
        // Fetch from Firebase (Cloud) - Admin needs to see ALL items, not just first 10
        const { items: allItems } = await firebaseService.getMarketItems(true, undefined, 100); // Increase limit to 100
        if (tab === 'pending') {
            setItems(allItems.filter(i => i.status === 'pending'));
        } else {
            setItems(allItems.filter(i => i.status === 'approved' || i.status === undefined));
        }
    };

    const handleApprove = async (id: string) => {
        await firebaseService.updateMarketItemStatus(id, 'approved');
        loadItems();
    };

    const handleReject = async (id: string) => {
        if (confirm("Reject and remove this listing?")) {
            await firebaseService.deleteMarketItem(id);
            loadItems();
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm('Delete this market listing?')) {
            await firebaseService.deleteMarketItem(id);
            loadItems();
        }
    };

    return (
        <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8 animate-fade-in">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-2">Market Management</h1>
                    <p className="text-gray-500">Moderate crops listed for sale.</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-4 border-b border-gray-100 dark:border-gray-800">
                <button
                    onClick={() => setTab('pending')}
                    className={`pb-3 text-sm font-bold border-b-2 transition-colors ${tab === 'pending' ? 'border-primary text-primary' : 'border-transparent text-gray-400'}`}
                >
                    Pending Approval ({items.length})
                </button>
                <button
                    onClick={() => setTab('live')}
                    className={`pb-3 text-sm font-bold border-b-2 transition-colors ${tab === 'live' ? 'border-primary text-primary' : 'border-transparent text-gray-400'}`}
                >
                    Live Listings
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {items.length === 0 ? (
                    <div className="col-span-full text-center py-20 text-gray-400">
                        {tab === 'pending' ? 'No pending items.' : 'No active listings.'}
                    </div>
                ) : (
                    items.map((item, i) => (
                        <div key={i} className="bg-white dark:bg-surface-dark p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col group relative">
                            {/* Pending Badge */}
                            {item.status === 'pending' && (
                                <div className="absolute top-4 right-4 bg-yellow-400 text-black text-xs font-bold px-2 py-1 rounded shadow-sm">
                                    Needs Review
                                </div>
                            )}

                            <div className="aspect-video w-full rounded-2xl overflow-hidden mb-4 bg-gray-100">
                                <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-bold text-lg text-gray-900 dark:text-white">{item.title}</h3>
                                    <span className="text-primary font-black">₹{item.price}</span>
                                </div>
                                <p className="text-sm text-gray-500 mb-4 line-clamp-2">{item.description}</p>
                            </div>

                            <div className="pt-4 border-t border-gray-50 dark:border-gray-800">
                                {tab === 'pending' ? (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => item.id && handleApprove(item.id)}
                                            className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 rounded-xl font-bold text-sm transition-colors shadow-lg shadow-green-500/20"
                                        >
                                            Approve
                                        </button>
                                        <button
                                            onClick={() => item.id && handleReject(item.id)}
                                            className="flex-1 bg-red-100 hover:bg-red-200 text-red-600 py-2 rounded-xl font-bold text-sm transition-colors"
                                        >
                                            Reject
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-gray-400">By {item.sellerName}</span>
                                        <button
                                            onClick={() => item.id && handleDelete(item.id)}
                                            className="text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default AdminMarket;
