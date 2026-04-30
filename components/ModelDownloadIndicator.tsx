import React from 'react';

interface ModelDownloadIndicatorProps {
    progress: number; // 0 to 100, or -1 to hide
}

const ModelDownloadIndicator: React.FC<ModelDownloadIndicatorProps> = ({ progress }) => {
    if (progress < 0) return null;

    const isComplete = progress === 100;

    return (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
            <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-700 p-4 flex items-center gap-4 min-w-[300px]">

                {/* Icon Container */}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors duration-500 ${isComplete ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : 'bg-primary/10 text-primary'
                    }`}>
                    {isComplete ? (
                        <span className="material-icons-round text-2xl animate-bounce-short">check_circle</span>
                    ) : (
                        <span className="material-icons-round text-2xl animate-spin-slow">download</span>
                    )}
                </div>

                <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                        <h4 className="font-bold text-sm text-zinc-900 dark:text-white">
                            {isComplete ? 'AI Brain Ready' : 'Downloading AI Model...'}
                        </h4>
                        <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                            {progress}%
                        </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-zinc-100 dark:bg-zinc-700 h-2 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-300 ease-out ${isComplete ? 'bg-green-500' : 'bg-primary'
                                }`}
                            style={{ width: `${progress}%` }}
                        >
                            {/* Shimmer Effect */}
                            {!isComplete && (
                                <div className="absolute inset-0 bg-white/30 animate-shimmer" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)' }}></div>
                            )}
                        </div>
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-1">
                        {isComplete ? 'Offline analysis enabled' : 'Preparing for offline use (245MB)'}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ModelDownloadIndicator;
