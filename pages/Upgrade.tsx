import React, { useState } from 'react';
import { toast } from 'sonner';
import { UserProfile } from '../types';
import { subscriptionService, PLANS } from '../services/SubscriptionService';

interface UpgradeProps {
    user: UserProfile | null;
    onUpgradeSuccess: (updatedUser: UserProfile) => void;
    onBack: () => void;
    t: (key: string) => string;
}

const Upgrade: React.FC<UpgradeProps> = ({ user, onUpgradeSuccess, onBack, t }) => {
    const [upgradeStatus, setUpgradeStatus] = useState<'idle' | 'processing' | 'success'>('idle');

    const handleUpgrade = async () => {
        if (!user || !user.uid) {
            toast.error("Session invalid. Please logout and login again.");
            return;
        }

        setUpgradeStatus('processing');
        const startTime = Date.now();

        try {
            const result = await subscriptionService.upgradeUser(user, 'PREMIUM');

            const elapsedTime = Date.now() - startTime;
            const remainingTime = Math.max(0, 2000 - elapsedTime);
            await new Promise(r => setTimeout(r, remainingTime));

            if (result.success && result.user) {
                setUpgradeStatus('success');
                setTimeout(() => {
                    onUpgradeSuccess(result.user!);
                }, 1500);
            } else {
                toast.error("Upgrade failed. Please try again.");
                setUpgradeStatus('idle');
            }
        } catch (error) {
            console.error("Upgrade failed", error);
            toast.error("Upgrade failed. Please try again.");
            setUpgradeStatus('idle');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col animate-fade-in p-6">
            <div className="max-w-4xl mx-auto w-full">
                <button onClick={onBack} className="mb-6 flex items-center gap-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
                    <span className="material-icons-round">arrow_back</span>
                    Back
                </button>

                <div className="text-center mb-12">
                    <h1 className="text-4xl font-black text-gray-900 dark:text-white mb-4">Upgrade to Pro Kisan</h1>
                    <p className="text-xl text-gray-600 dark:text-gray-400">Unlock the full potential of your farm with advanced AI insights.</p>
                </div>

                <div className="grid md:grid-cols-2 gap-8 items-start">
                    {/* Free Plan */}
                    <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-700 opacity-60">
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{PLANS.FREE.name}</h3>
                        <div className="text-4xl font-black text-gray-900 dark:text-white mb-6">₹0<span className="text-lg font-medium text-gray-500">/mo</span></div>
                        <ul className="space-y-4 mb-8">
                            {PLANS.FREE.features.map((feature, i) => (
                                <li key={i} className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                                    <span className="material-icons-round text-green-500">check_circle</span>
                                    {feature}
                                </li>
                            ))}
                        </ul>
                        <button disabled className="w-full py-4 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 font-bold cursor-not-allowed">
                            Current Plan
                        </button>
                    </div>

                    {/* Premium Plan */}
                    <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-xl border-2 border-primary relative overflow-hidden transform hover:-translate-y-1 transition-transform duration-300">
                        <div className="absolute top-0 right-0 bg-orange-500 text-white text-xs font-bold px-4 py-1.5 rounded-bl-xl uppercase tracking-widest">Launch Offer</div>
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{PLANS.PREMIUM.name}</h3>
                        <div className="flex items-baseline gap-3 mb-6">
                            <span className="text-xl font-bold text-gray-400 line-through">₹99</span>
                            <span className="text-4xl font-black text-gray-900 dark:text-white">₹{PLANS.PREMIUM.price}</span>
                            <span className="text-lg font-medium text-gray-500">/mo</span>
                            <span className="text-xs font-bold bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full">SAVE 50%</span>
                        </div>
                        <ul className="space-y-4 mb-8">
                            {PLANS.PREMIUM.features.map((feature, i) => (
                                <li key={i} className="flex items-center gap-3 text-gray-700 dark:text-white font-medium">
                                    <span className="material-icons-round text-primary">verified</span>
                                    {feature}
                                </li>
                            ))}
                        </ul>
                        <button
                            onClick={handleUpgrade}
                            disabled={upgradeStatus !== 'idle' || user?.plan === 'PREMIUM'}
                            className="w-full py-4 rounded-xl bg-primary text-white font-bold text-lg shadow-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                        >
                            {upgradeStatus === 'idle' ? (
                                user?.plan === 'PREMIUM' ? 'Plan Active' : 'Upgrade Now'
                            ) : (
                                'Processing...'
                            )}
                        </button>
                        <p className="text-center text-xs text-gray-400 mt-4">Secure payment via UPI/Cards (Mock)</p>
                    </div>
                </div>
            </div>

            {/* iOS Style Overlay for Processing/Success */}
            {upgradeStatus !== 'idle' && (
                <div className="fixed inset-0 z-[100] bg-white/90 dark:bg-gray-900/95 backdrop-blur-xl flex flex-col items-center justify-center animate-fade-in">

                    {upgradeStatus === 'processing' && (
                        <div className="flex flex-col items-center">
                            {/* FaceID-style Spinner */}
                            <div className="relative w-24 h-24 mb-8">
                                <svg className="animate-spin w-full h-full text-primary" viewBox="0 0 50 50">
                                    <circle className="opacity-25" cx="25" cy="25" r="20" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                    <circle className="opacity-75" cx="25" cy="25" r="20" stroke="currentColor" strokeWidth="4" fill="none" strokeDasharray="80" strokeDashoffset="60" strokeLinecap="round"></circle>
                                </svg>
                                {/* Center Icon */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="material-icons-round text-3xl text-primary animate-pulse">fingerprint</span>
                                </div>
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Processing Payment</h3>
                            <p className="text-sm text-gray-500 font-medium animate-pulse">Confirming with Bank...</p>
                        </div>
                    )}

                    {upgradeStatus === 'success' && (
                        <div className="flex flex-col items-center scale-100 animate-[bounce_0.5s_ease-out]">
                            <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center text-white mb-8 shadow-2xl shadow-green-500/40">
                                <span className="material-icons-round text-5xl">check</span>
                            </div>
                            <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">Payment Successful</h3>
                            <p className="text-gray-500 font-medium">Welcome to Pro Kisan!</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Upgrade;
