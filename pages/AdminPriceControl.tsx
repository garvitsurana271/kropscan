import React, { useEffect, useState } from 'react';
import { dbService } from '../services/DatabaseService';

const AdminPriceControl: React.FC = () => {
    const [prices, setPrices] = useState<any[]>([]);
    const [form, setForm] = useState({ crop: '', price: '', trend: '' });

    useEffect(() => {
        loadPrices();
    }, []);

    const loadPrices = async () => {
        const data = await dbService.getDailyPrices();
        setPrices(data);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.crop || !form.price) return;

        await dbService.setDailyPrice({
            crop: form.crop,
            price: parseFloat(form.price),
            trend: parseFloat(form.trend || '0')
        });
        setForm({ crop: '', price: '', trend: '' });
        loadPrices();
        alert('Price updated. It will now reflect in the Market Prices page.');
    };

    return (
        <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8 animate-fade-in">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-2">Market Price Control</h1>
                    <p className="text-gray-500">Set official Mandi rates. These override API data.</p>
                </div>
            </div>

            {/* Add Form */}
            <div className="bg-white dark:bg-surface-dark p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-800">
                <h3 className="font-bold text-lg mb-4">Set Daily Price</h3>
                <form onSubmit={handleSave} className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 w-full space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase">Crop Name</label>
                        <input
                            required
                            placeholder="e.g. Wheat"
                            className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border-none outline-none font-bold"
                            value={form.crop}
                            onChange={e => setForm({ ...form, crop: e.target.value })}
                        />
                    </div>
                    <div className="flex-1 w-full space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase">Price (₹/Qt)</label>
                        <input
                            required
                            type="number"
                            placeholder="2200"
                            className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border-none outline-none font-bold"
                            value={form.price}
                            onChange={e => setForm({ ...form, price: e.target.value })}
                        />
                    </div>
                    <div className="flex-1 w-full space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase">Trend %</label>
                        <input
                            type="number"
                            step="0.1"
                            placeholder="+2.5"
                            className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border-none outline-none font-bold"
                            value={form.trend}
                            onChange={e => setForm({ ...form, trend: e.target.value })}
                        />
                    </div>
                    <button type="submit" className="px-8 py-3 bg-primary text-white font-bold rounded-xl hover:bg-green-700 transition-colors">
                        Update
                    </button>
                </form>
            </div>

            {/* List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {prices.map((p, i) => (
                    <div key={i} className="bg-white dark:bg-surface-dark p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-800 flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white">{p.crop}</h3>
                            <p className="text-xs text-gray-500">Official Rate</p>
                        </div>
                        <div className="text-right">
                            <p className="font-black text-xl text-primary">₹{p.price}</p>
                            <p className={`text-xs font-bold ${p.trend >= 0 ? 'text-green-500' : 'text-red-500'}`}>{p.trend > 0 ? '+' : ''}{p.trend}%</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AdminPriceControl;
