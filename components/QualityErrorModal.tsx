import React from 'react';

interface QualityErrorModalProps {
    isOpen: boolean;
    error: string;
    onClose: () => void;
    onRetry: () => void;
    onIgnore?: () => void;
}

const QualityErrorModal: React.FC<QualityErrorModalProps> = ({ isOpen, error, onClose, onRetry, onIgnore }) => {
    if (!isOpen) return null;

    // Determine specific advice based on error message
    let icon = "photo_camera_front";
    let title = "Image Quality Issue";
    let tips = ["Ensure the leaf is in focus", "Hold the camera steady"];

    if (error.toLowerCase().includes("blurry")) {
        icon = "blur_on";
        title = "Image Too Blurry";
        tips = ["Hold your device steady", "Tap to focus before shooting", "Ensure good lighting to reduce shutter lag"];
    } else if (error.toLowerCase().includes("dark")) {
        icon = "flashlight_off";
        title = "Too Dark";
        tips = ["Turn on flash if possible", "Move to a brighter area", "Avoid shadows falling on the leaf"];
    } else if (error.toLowerCase().includes("resolution")) {
        icon = "aspect_ratio";
        title = "Low Resolution";
        tips = ["Move closer to the subject", "Do not use digital zoom"];
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}></div>

            {/* Modal */}
            <div className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 shadow-2xl animate-scale-up border border-white/10 overflow-hidden text-center">

                {/* Glow Effects */}
                <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-red-500/10 to-transparent pointer-events-none"></div>
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                    <span className="material-icons-round">close</span>
                </button>

                <div className="flex flex-col items-center text-center">
                    <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4 text-red-500 animate-pulse-slow">
                        <span className="material-icons-round text-5xl">{icon}</span>
                    </div>

                    <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">{title}</h3>
                    <p className="text-gray-600 dark:text-gray-300 font-medium mb-6">{error}</p>

                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 w-full mb-6 text-left">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Suggestions</h4>
                        <ul className="space-y-2">
                            {tips.map((tip, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
                                    <span className="material-icons-round text-sm text-primary mt-0.5">check_circle</span>
                                    {tip}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="flex gap-3 w-full">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-bold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onRetry}
                            className="flex-1 py-3.5 rounded-xl bg-primary text-white font-bold hover:bg-[#345f30] shadow-lg shadow-primary/25 transition-colors"
                        >
                            Retake Photo
                        </button>
                    </div>
                    {onIgnore && (
                        <button
                            onClick={onIgnore}
                            className="mt-4 text-xs font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline"
                        >
                            Ignore & Analyze Anyway
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default QualityErrorModal;
