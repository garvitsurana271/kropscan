import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { dbService } from '../services/DatabaseService';

const AdminDBEditor: React.FC = () => {
    const [stores, setStores] = useState<string[]>([]);
    const [activeStore, setActiveStore] = useState<string>('');
    const [items, setItems] = useState<any[]>([]);
    const [editingItem, setEditingItem] = useState<any | null>(null);
    const [editJson, setEditJson] = useState('');

    useEffect(() => {
        loadStores();
    }, []);

    useEffect(() => {
        if (activeStore) {
            loadItems(activeStore);
        }
    }, [activeStore]);

    const loadStores = async () => {
        const names = await dbService.getStoreNames();
        setStores(names);
        if (names.length > 0 && !activeStore) setActiveStore(names[0]);
    };

    const loadItems = async (store: string) => {
        const data = await dbService.getAllFromStore(store);
        setItems(data);
    };

    const handleEdit = (item: any) => {
        setEditingItem(item);
        setEditJson(JSON.stringify(item, null, 2));
    };

    const handleSave = async () => {
        try {
            const updated = JSON.parse(editJson);
            await dbService.updateItemInStore(activeStore, updated);
            setEditingItem(null);
            loadItems(activeStore);
        } catch (e) {
            toast.error('Invalid JSON');
        }
    };

    const handleDelete = async (item: any) => {
        if (confirm('Delete this item?')) {
            // Assume 'id' or 'key' or 'token' is key. Most of our stores use 'id'.
            // Tokens use 'token'.
            const key = item.id !== undefined ? item.id : (item.token !== undefined ? item.token : item.key);

            if (key === undefined) {
                toast.error('Could not determine key for this item (no id/token).');
                return;
            }

            await dbService.deleteItemFromStore(activeStore, key);
            loadItems(activeStore);
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto animate-fade-in">
            <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-2">Database Editor</h1>
            <p className="text-gray-500 mb-8">Directly manipulate IndexedDB records. <span className="text-red-500 font-bold">Handle with care.</span></p>

            <div className="flex gap-6 items-start">

                {/* Store List */}
                <div className="w-64 bg-white dark:bg-surface-dark rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 font-bold border-b border-gray-100 dark:border-gray-700">
                        Object Stores
                    </div>
                    <div>
                        {stores.map(store => (
                            <button
                                key={store}
                                onClick={() => setActiveStore(store)}
                                className={`w-full text-left px-4 py-3 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${activeStore === store ? 'bg-primary/10 text-primary border-l-4 border-primary' : 'text-gray-600 dark:text-gray-400'}`}
                            >
                                {store}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Data Area */}
                <div className="flex-1 bg-white dark:bg-surface-dark rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold uppercase tracking-wide text-gray-500">{activeStore}</h2>
                        <button onClick={() => loadItems(activeStore)} className="text-primary text-sm font-bold hover:underline">Refresh</button>
                    </div>

                    <div className="space-y-4">
                        {items.length === 0 ? (
                            <div className="text-center py-12 text-gray-400 italic">No items in this store.</div>
                        ) : (
                            items.map((item, idx) => (
                                <div key={idx} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-transparent hover:border-gray-200 dark:hover:border-gray-700 transition-colors group">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="font-mono text-xs text-gray-400">
                                            {item.id ? `ID: ${item.id}` : (item.token ? `TOKEN: ${item.token?.substring(0, 8)}...` : `Index: ${idx}`)}
                                        </div>
                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleEdit(item)} className="p-1 text-blue-500 hover:bg-blue-50 rounded"><span className="material-icons-round text-lg">edit</span></button>
                                            <button onClick={() => handleDelete(item)} className="p-1 text-red-500 hover:bg-red-50 rounded"><span className="material-icons-round text-lg">delete</span></button>
                                        </div>
                                    </div>
                                    <pre className="text-xs font-mono text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap max-h-32 scrollbar-thin">
                                        {JSON.stringify(item, null, 2)}
                                    </pre>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Edit Modal */}
            {editingItem && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-surface-dark w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                            <h3 className="font-bold">Edit Item</h3>
                            <button onClick={() => setEditingItem(null)}><span className="material-icons-round">close</span></button>
                        </div>
                        <div className="flex-1 p-0 relative overflow-auto">
                            <textarea
                                value={editJson}
                                onChange={e => setEditJson(e.target.value)}
                                className="w-full min-h-[400px] p-4 font-mono text-sm bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 resize-none outline-none border-none focus:ring-2 focus:ring-primary/20"
                                spellCheck={false}
                            ></textarea>
                        </div>
                        <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3 bg-gray-50 dark:bg-surface-dark">
                            <button onClick={() => setEditingItem(null)} className="px-4 py-2 rounded-lg text-gray-500 font-bold hover:bg-gray-200 transition-colors">Cancel</button>
                            <button onClick={handleSave} className="px-6 py-2 rounded-lg bg-primary text-white font-bold hover:bg-green-700 transition-colors">Save Changes</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDBEditor;
