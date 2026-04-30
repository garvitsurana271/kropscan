import React from 'react';

interface LanguageModalProps {
    isOpen: boolean;
    onSelect: (lang: string) => void;
}

// Codes match the keys used by Settings dropdown + translations.ts so static
// dict lookups work consistently regardless of how the user picks the language.
const LANGUAGES = [
    { code: 'English', name: 'English', native: 'English' },
    { code: 'Hindi (हिंदी)', name: 'Hindi', native: 'हिंदी' },
    { code: 'Marathi (मराठी)', name: 'Marathi', native: 'मराठी' },
    { code: 'Gujarati (ગુજરાતી)', name: 'Gujarati', native: 'ગુજરાતી' },
    { code: 'Punjabi', name: 'Punjabi', native: 'ਪੰਜਾਬী' },
    { code: 'Tamil (தமிழ்)', name: 'Tamil', native: 'தமிழ்' },
    { code: 'Telugu (తెలుగు)', name: 'Telugu', native: 'తెలుగు' },
    { code: 'Kannada', name: 'Kannada', native: 'কন্নড' }, // Typo fix: ಕನ್ನಡ
    { code: 'Malayalam (മലയാളം)', name: 'Malayalam', native: 'മലയാളം' },
    { code: 'Bengali (বাংলা)', name: 'Bengali', native: 'বাংলা' },
    { code: 'Assamese (অসমীয়া)', name: 'Assamese', native: 'অসমীয়া' },
    // NER tribal languages — auto-translated at runtime via Gemma (see App.tsx prefetchLanguageDict).
    { code: 'Bodo (बड़ो)', name: 'Bodo', native: 'बड़ो' },
    { code: 'Mizo (Mizo ṭawng)', name: 'Mizo', native: 'Mizo ṭawng' },
    { code: 'Khasi (Ka Ktien Khasi)', name: 'Khasi', native: 'Ka Ktien Khasi' },
    { code: 'Manipuri (Meitei)', name: 'Manipuri (Meitei)', native: 'ꯃꯩꯇꯩꯂꯣꯟ' }
];

const LanguageModal: React.FC<LanguageModalProps> = ({ isOpen, onSelect }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-zinc-200 dark:border-zinc-800 animate-in fade-in zoom-in duration-300">
                <div className="p-6 text-center">
                    <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-3xl">🗣️</span>
                    </div>
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
                        Select Language
                    </h2>
                    <p className="text-zinc-600 dark:text-zinc-400 mb-6">
                        Choose your preferred language to continue.
                        <br />
                        <span className="text-sm opacity-75">कृपया अपनी भाषा चुनें</span>
                    </p>

                    <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                        {LANGUAGES.map((lang) => (
                            <button
                                key={lang.code}
                                onClick={() => onSelect(lang.code)}
                                className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-transparent bg-zinc-50 dark:bg-zinc-800 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all duration-200 group"
                            >
                                <span className="text-lg font-medium text-zinc-900 dark:text-white group-hover:text-green-600 dark:group-hover:text-green-400">
                                    {lang.native}
                                </span>
                                <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                    {lang.name}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LanguageModal;
