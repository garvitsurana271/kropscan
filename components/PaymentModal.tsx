import React, { useState, useEffect } from 'react';

interface PaymentModalProps {
    amount: number;
    itemTitle: string;
    onClose: () => void;
    onSuccess: () => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ amount, itemTitle, onClose, onSuccess }) => {
    const [step, setStep] = useState<'method' | 'processing' | 'success'>('method');
    const [method, setMethod] = useState<'upi' | 'card'>('upi');

    // Mock Payment for Demo
    const handlePay = async () => {
        setStep('processing');
        setTimeout(() => {
            setStep('success');
            setTimeout(() => {
                onSuccess();
            }, 2000);
        }, 1500);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
            <div className="bg-white dark:bg-surface-dark w-full max-w-sm rounded-[2.5rem] overflow-hidden shadow-2xl relative">

                {/* Close Button */}
                {step !== 'success' && step !== 'processing' && (
                    <button onClick={onClose} className="absolute top-4 right-4 z-10 w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors">
                        <span className="material-icons-round text-sm">close</span>
                    </button>
                )}

                <div className="p-8">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center gap-2 mb-2">
                            <span className="material-icons-round text-green-600">lock</span>
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Secure Payment</span>
                        </div>
                        <h3 className="text-3xl font-black text-gray-900 dark:text-white">₹{amount}</h3>
                        <p className="text-sm text-gray-500 font-medium mt-1">for {itemTitle}</p>
                    </div>

                    {step === 'method' && (
                        <div className="space-y-4">
                            <button
                                onClick={() => setMethod('upi')}
                                className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${method === 'upi' ? 'border-primary bg-primary/5' : 'border-gray-100 hover:border-gray-200'}`}
                            >
                                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/UPI-Logo-vector.svg/1200px-UPI-Logo-vector.svg.png" className="h-4 object-contain" alt="UPI" />
                                <span className="font-bold flex-1 text-left">UPI / VPA</span>
                                {method === 'upi' && <span className="material-icons-round text-primary">check_circle</span>}
                            </button>

                            <button
                                onClick={() => setMethod('card')}
                                className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${method === 'card' ? 'border-primary bg-primary/5' : 'border-gray-100 hover:border-gray-200'}`}
                            >
                                <span className="material-icons-round text-gray-600">credit_card</span>
                                <span className="font-bold flex-1 text-left">Credit / Debit Card</span>
                                {method === 'card' && <span className="material-icons-round text-primary">check_circle</span>}
                            </button>

                            <button onClick={handlePay} className="w-full mt-6 bg-black dark:bg-white text-white dark:text-black py-4 rounded-xl font-bold text-lg shadow-xl hover:scale-[1.02] transition-transform flex items-center justify-center gap-2">
                                Pay Now
                            </button>
                        </div>
                    )}

                    {step === 'processing' && (
                        <div className="py-10 text-center space-y-4">
                            <div className="w-16 h-16 border-4 border-gray-200 border-t-primary rounded-full animate-spin mx-auto"></div>
                            <p className="font-bold text-gray-600 animate-pulse">Processing Payment...</p>
                            <p className="text-xs text-gray-400">Do not close this window</p>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="py-6 text-center space-y-4 animate-fade-in-up">
                            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center text-white mx-auto shadow-lg shadow-green-500/30">
                                <span className="material-icons-round text-4xl">check</span>
                            </div>
                            <h3 className="text-2xl font-black text-gray-900 dark:text-white">Payment Successful!</h3>
                            <p className="text-gray-500">Transaction ID: TXN{Math.floor(Math.random() * 1000000)}</p>
                        </div>
                    )}
                </div>

                {/* Footer Trust Badge */}
                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 text-center">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest flex items-center justify-center gap-1">
                        Powered by <span className="text-gray-600 dark:text-gray-300">KropPay</span>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PaymentModal;
