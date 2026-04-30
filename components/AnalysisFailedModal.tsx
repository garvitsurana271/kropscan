import React from 'react';

interface AnalysisFailedModalProps {
    isOpen: boolean;
    error: string;
    onClose: () => void;
    onRetry: () => void;
}

const AnalysisFailedModal: React.FC<AnalysisFailedModalProps> = ({ isOpen, error, onClose, onRetry }) => {
    if (!isOpen) return null;

    const isNotPlant = error.includes("Not a Plant") || error.includes("detect a plant");

    // Dynamic Content based on error type
    const title = isNotPlant ? "No Plant Detected" : "Analysis Failed";
    const icon = isNotPlant ? "nature_people" : "cloud_off";
    const message = isNotPlant
        ? "We couldn't identify a crop leaf in this image. Please ensure the photo contains a clear view of a plant."
        : "Our AI brain is having trouble processing this image right now. Please try again or use a different photo.";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}></div>

            {/* Modal */}
            <div className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 shadow-2xl animate-scale-up border border-white/10 overflow-hidden text-center z-10">

                {/* Glow Effects */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>

                <div className="flex flex-col items-center">
                    <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6 relative">
                        <span className="material-icons-round text-4xl text-gray-400 absolute animate-ping opacity-20">error</span>
                        <span className="material-icons-round text-4xl text-gray-500 dark:text-gray-300 relative z-10">{icon}</span>
                    </div>

                    <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-3">{title}</h3>
                    <p className="text-gray-500 dark:text-gray-400 font-medium mb-8 leading-relaxed">
                        {message}
                    </p>

                    <div className="flex gap-3 w-full">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-bold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onRetry}
                            className="flex-1 py-3.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold hover:scale-[1.02] active:scale-[0.96] transition-all shadow-lg"
                        >
                            Try Again
                        </button>
                    </div>

                    {!isNotPlant && (
                        <p className="mt-6 text-xs text-gray-400 font-mono">{error}</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AnalysisFailedModal;
