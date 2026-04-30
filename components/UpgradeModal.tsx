import React, { useState } from 'react';
import { PLANS, subscriptionService } from '../services/SubscriptionService';
import { UserProfile } from '../types';

interface UpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUpgrade: (updatedUser: UserProfile) => void;
    user?: UserProfile;
}

import ReactDOM from 'react-dom';

const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose, onUpgrade, user }) => {
    const [upgradeStatus, setUpgradeStatus] = useState<'idle' | 'processing' | 'success'>('idle');

    if (!isOpen) return null;

    const handleUpgradeClick = async () => {
        if (!user) {
            onClose();
            return;
        }

        setUpgradeStatus('processing');

        // Minimum animation time for the "feel"
        const startTime = Date.now();

        try {
            const result = await subscriptionService.upgradeUser(user, 'PREMIUM');

            const elapsedTime = Date.now() - startTime;
            const remainingTime = Math.max(0, 2000 - elapsedTime); // Ensure at least 2s animation

            await new Promise(r => setTimeout(r, remainingTime));

            if (result.success && result.user) {
                setUpgradeStatus('success');
                setTimeout(() => {
                    onUpgrade(result.user!);
                }, 1500); // Show success for 1.5s
            } else {
                alert("Upgrade failed. Please try again.");
                setUpgradeStatus('idle');
            }
        } catch (e) {
            console.error(e);
            alert("An error occurred.");
            setUpgradeStatus('idle');
        }
    };

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-surface-dark w-full max-w-4xl rounded-[2.5rem] overflow-hidden shadow-2xl relative flex flex-col md:flex-row max-h-[90vh]" onClick={e => e.stopPropagation()}>

                <button onClick={onClose} className="absolute top-4 right-4 z-20 w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors">
                    <span className="material-icons-round text-gray-500">close</span>
                </button>

                {/* Left Side: Visual/Marketing */}
                <div className="hidden md:flex flex-col justify-center bg-gradient-to-br from-primary to-green-800 p-12 text-white w-2/5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2"></div>

                    <span className="material-icons-round text-6xl mb-6">diamond</span>
                    <h2 className="text-4xl font-black mb-4">Go Pro.</h2>
                    <p className="opacity-90 font-medium text-lg mb-8">Unlock the full power of KropScan AI and take your farming to the next level.</p>

                    <div className="space-y-4 text-sm font-bold opacity-80">
                        <div className="flex items-center gap-3"><span className="material-icons-round">speed</span> 10x Faster Scanning</div>
                        <div className="flex items-center gap-3"><span className="material-icons-round">science</span> Lab-Grade Accuracy</div>
                        <div className="flex items-center gap-3"><span className="material-icons-round">support_agent</span> Priority Support</div>
                    </div>
                </div>

                {/* Right Side: Comparison */}
                <div className="flex-1 p-8 md:p-10 overflow-y-auto">
                    <div className="text-center md:text-left mb-8">
                        <h3 className="text-2xl font-black text-gray-900 dark:text-white">Choose Your Plan</h3>
                        <p className="text-gray-500">Simple pricing. Cancel anytime.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {/* Free Plan Item */}
                        <div className="p-4 rounded-2xl border border-gray-100 dark:border-gray-800 flex items-center justify-between opacity-50">
                            <div>
                                <h4 className="font-bold text-lg dark:text-white">Free Plan</h4>
                                <ul className="text-xs text-gray-500 mt-1 space-y-1">
                                    <li>• Basic Disease Detection (3/day)</li>
                                    <li>• Community Access</li>
                                    <li>• Daily Market Prices</li>
                                    <li>• Basic Weather Updates</li>
                                </ul>
                            </div>
                            <div className="text-right">
                                <span className="block text-2xl font-black dark:text-white">₹0</span>
                                <span className="text-xs text-gray-400">Current</span>
                            </div>
                        </div>

                        {/* Pro Plan Item */}
                        <div className="p-1 rounded-2xl bg-gradient-to-r from-primary to-green-400">
                            <div className="p-5 rounded-xl bg-white dark:bg-gray-800 h-full relative">
                                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">Launch Offer</span>
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h4 className="font-bold text-xl text-primary flex items-center gap-2">
                                            Pro Kisan
                                            <span className="material-icons-round text-base">verified</span>
                                        </h4>
                                        <p className="text-xs text-gray-500">Everything in Free, plus:</p>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-sm text-gray-400 line-through">₹99</span>
                                        <span className="block text-3xl font-black text-gray-900 dark:text-white">₹{PLANS.PREMIUM.price}</span>
                                        <span className="text-xs text-orange-500 font-bold">50% OFF</span>
                                    </div>
                                </div>

                                <ul className="space-y-3 mb-6">
                                    {PLANS.PREMIUM.features.map((feature, i) => (
                                        <li key={i} className="flex items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-200">
                                            <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 flex items-center justify-center">
                                                <span className="material-icons-round text-xs">check</span>
                                            </div>
                                            {feature}
                                        </li>
                                    ))}
                                </ul>

                                <button
                                    onClick={handleUpgradeClick}
                                    disabled={upgradeStatus !== 'idle'}
                                    className="w-full py-4 rounded-xl bg-primary text-white font-bold text-lg shadow-lg shadow-primary/30 hover:bg-green-700 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                                >
                                    {upgradeStatus === 'idle' ? 'Upgrade Now' : 'Processing...'}
                                    {upgradeStatus === 'idle' && <span className="material-icons-round">arrow_forward</span>}
                                </button>
                                <p className="text-center text-[10px] text-gray-400 mt-3">Secure payment via UPI, Credit/Debit Cards</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {/* iOS Style Overlay for Processing/Success */}
            {upgradeStatus !== 'idle' && (
                <div className="absolute inset-0 z-50 bg-white/90 dark:bg-surface-dark/95 backdrop-blur-xl flex flex-col items-center justify-center animate-fade-in">

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
        </div>,
        document.body
    );
};

export default UpgradeModal;
