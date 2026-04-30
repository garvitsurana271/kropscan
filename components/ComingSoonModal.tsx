import React from 'react';

interface ComingSoonModalProps {
    isOpen: boolean;
    onClose: () => void;
    featureName?: string;
}

const ComingSoonModal: React.FC<ComingSoonModalProps> = ({ isOpen, onClose, featureName = "This Feature" }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop with Fade In */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
                onClick={onClose}
            ></div>

            {/* Modal with Scale Up */}
            <div className="bg-white dark:bg-surface-dark w-full max-w-sm rounded-[2rem] p-8 shadow-2xl relative animate-scale-up border border-white/20 dark:border-gray-700 overflow-hidden">

                {/* Background Decor */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-accent/10 rounded-full blur-2xl -ml-12 -mb-12 pointer-events-none"></div>

                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                    <span className="material-icons-round text-sm">close</span>
                </button>

                <div className="flex flex-col items-center text-center relative z-10">
                    <div className="w-16 h-16 bg-gradient-to-tr from-primary to-secondary rounded-2xl rotate-3 flex items-center justify-center mb-6 shadow-lg shadow-primary/30">
                        <span className="material-icons-round text-3xl text-white">construction</span>
                    </div>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Coming Soon!</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed mb-6">
                        <span className="font-semibold text-primary">{featureName}</span> is currently under development. We are working hard to bring this to you in the next update.
                    </p>

                    <button
                        onClick={onClose}
                        className="w-full py-3 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl"
                    >
                        Got it
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ComingSoonModal;
