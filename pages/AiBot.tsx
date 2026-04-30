import React, { useState, useEffect, useRef } from 'react';
import { UserProfile } from '../types';
import { classifyCrop } from '../services/ClassifierService';
import { subscriptionService } from '../services/SubscriptionService';
import UpgradeModal from '../components/UpgradeModal';
import { getChatCompletion, SYSTEM_PROMPT, ChatMessage } from '../services/GeminiService';
import { firebaseService } from '../services/FirebaseService';
import { WeatherData } from '../services/WeatherService';
import { toast } from 'sonner';
import { getTranslation } from '../utils/translations';

interface AiBotProps {
    user: UserProfile | undefined;
    latestDiagnosis?: any;
    weather?: WeatherData | null;
    language?: string;
}

interface Message {
    id: string;
    text: string;
    isUser: boolean;
    image?: string;
    timestamp?: number;
}

interface Conversation {
    id: string;
    title: string;
    timestamp: number;
    lastMessage: string;
}

const AiBot: React.FC<AiBotProps> = ({ user, latestDiagnosis, weather, language = 'English' }) => {
    const t = (key: string) => getTranslation(language, key);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [isTyping, setIsTyping] = useState(false);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [isListening, setIsListening] = useState(false);

    // History State
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [showSidebar, setShowSidebar] = useState(false); // Mobile toggle

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initial Load: Fetch History
    useEffect(() => {
        if (user) {
            loadConversations();
        }
    }, [user]);

    // Diagnosis context is shown in the right sidebar panel — no auto-chat creation needed.

    // Load messages when active conversation changes
    useEffect(() => {
        if (activeConversationId && user) {
            loadMessages(activeConversationId);
        } else {
            setMessages([]); // Clear chat if no conversation selected (or new chat state)
        }
    }, [activeConversationId, user]);

    const loadConversations = async () => {
        if (!user) return;
        const convos = await firebaseService.getAiConversations(user.uid);
        setConversations(convos as any);
        // Don't auto-select — always show the welcome screen with prompts first.
        // User can pick a previous chat from the sidebar if they want.
    };

    const loadMessages = async (convoId: string) => {
        if (!user) return;
        const msgs = await firebaseService.getAiMessages(user.uid, convoId);
        const formatted = msgs.map((m: any) => ({
            id: m.id,
            text: m.content,
            isUser: m.role === 'user',
            timestamp: m.timestamp
        }));
        setMessages(formatted);
    };

    const startNewChat = () => {
        setActiveConversationId(null);
        setMessages([]);
        if (window.innerWidth < 768) setShowSidebar(false);
    };

    const handleDeleteConversation = async (e: React.MouseEvent, convoId: string) => {
        e.stopPropagation();
        if (!user || !window.confirm("Delete this chat?")) return;

        await firebaseService.deleteAiConversation(user.uid, convoId);
        setConversations(prev => prev.filter(c => c.id !== convoId));
        if (activeConversationId === convoId) {
            startNewChat();
            loadConversations(); // Reload to pick next
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    const toggleListen = () => {
        if (isListening) return;

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            toast.error("Speech recognition is not supported in your browser.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.interimResults = false;
        // Match speech recognition language to app language
        const langMap: Record<string, string> = {
            'English': 'en-IN', 'Hindi (हिंदी)': 'hi-IN', 'Tamil (தமிழ்)': 'ta-IN',
            'Telugu (తెలుగు)': 'te-IN', 'Marathi (मराठी)': 'mr-IN', 'Bengali (বাংলা)': 'bn-IN',
            'Gujarati (ગુજરાતી)': 'gu-IN', 'Kannada (ಕನ್ನಡ)': 'ka-IN', 'Malayalam (മലയാളം)': 'ml-IN',
            'Punjabi (ਪੰਜਾਬੀ)': 'pa-IN', 'Assamese (অসমীয়া)': 'as-IN',
        };
        recognition.lang = langMap[language] || 'en-IN';

        recognition.onstart = () => setIsListening(true);
        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setInputText(prev => prev + (prev ? " " : "") + transcript);
        };
        recognition.onerror = (event: any) => {
            console.error("Speech Recognition Error", event.error);
            setIsListening(false);
        };
        recognition.onend = () => setIsListening(false);

        try {
            recognition.start();
        } catch(e) {
            console.error(e);
            setIsListening(false);
        }
    };

    const speakText = (text: string) => {
        if (!('speechSynthesis' in window)) {
            toast.error("Text-to-Speech not supported in this browser.");
            return;
        }
        window.speechSynthesis.cancel();
        // Remove markdown artifacts for better speech
        const cleanText = text.replace(/[*_#`[\]()]/g, '');
        const utterance = new SpeechSynthesisUtterance(cleanText);
        window.speechSynthesis.speak(utterance);
    };

    const handleSend = async () => {
        if ((!inputText.trim() && !selectedImage) || !user) return;

        // Check Limits
        const limitStatus = subscriptionService.checkChatLimit(user);
        if (!limitStatus.allowed) {
            setShowUpgradeModal(true);
            return;
        }

        const currentInput = inputText;
        const currentImage = selectedImage;

        // Optimistic Update
        const newMessage: Message = {
            id: Date.now().toString(),
            text: currentInput,
            isUser: true,
            image: currentImage ? URL.createObjectURL(currentImage) : undefined
        };

        setMessages(prev => [...prev, newMessage]);
        setInputText('');
        setSelectedImage(null);
        setIsTyping(true);

        try {
            // 1. Ensure Conversation ID exists (best-effort — don't block chat if Firebase fails)
            let convoId = activeConversationId;
            if (!convoId) {
                try {
                    convoId = await firebaseService.createAiConversation(user.uid);
                    setActiveConversationId(convoId);
                    loadConversations();
                } catch (fbErr) {
                    console.warn("Firebase conversation create failed (chat still works):", fbErr);
                }
            }

            // 2. Save User Message to Firebase (best-effort)
            if (convoId) {
                firebaseService.saveAiMessage(user.uid, convoId, {
                    role: 'user',
                    content: currentInput
                }).catch(e => console.warn("Firebase save failed:", e));
            }

            // 3. Get AI Response
            let aiResponseText = "";

            if (currentImage) {
                // If image upload, use specialized Vision analysis
                // Note: Vision API might be separate, but here we can try integration
                // For now, simpler to just use the classifier logic then feed it to chat
                const result = await classifyCrop(currentImage);
                // We construct a specific prompt for the AI based on vision result
                const visionContext = `User uploaded an image. Analysis Result: ${result.disease.name}. Confidence: ${(result.confidence * 100).toFixed(1)}%.`;

                // We don't send the image buffer to text chat API, we send the context
                // Or if we have analyzeDiseaseWithVision, we could use that, but let's keep chat flow consistent

                // Add vision context to history for the AI to "see"
                const history = messages.map(m => ({
                    role: m.isUser ? 'user' : 'model',
                    parts: [{ text: m.text }]
                }));

                // Add the new message with vision context
                history.push({ role: 'user', parts: [{ text: `[Attached Image] ${currentInput} \n\nSystem Note: Visual Analysis detected ${result.disease.name}` }] });

                // Call Gemini
                aiResponseText = await getChatCompletion(history as ChatMessage[]);

            } else {
                // Standard Text Chat
                // Construct History for Gemini
                const history = messages.map(m => ({
                    role: m.isUser ? 'user' : 'model',
                    parts: [{ text: m.text }]
                }));

                // Append current message
                history.push({ role: 'user', parts: [{ text: currentInput }] });

                // Call Gemini
                aiResponseText = await getChatCompletion(history as ChatMessage[]);
            }

            // 4. Update UI with AI Response
            const aiMessage: Message = {
                id: (Date.now() + 1).toString(),
                text: aiResponseText,
                isUser: false
            };
            setMessages(prev => [...prev, aiMessage]);

            // 5. Save AI Message to Firebase (best-effort)
            if (convoId) {
                firebaseService.saveAiMessage(user.uid, convoId, {
                    role: 'assistant',
                    content: aiResponseText
                }).catch(e => console.warn("Firebase save failed:", e));
            }

            // 6. Auto-name the conversation from first user message
            if (convoId && messages.length <= 1) {
                // Extract a short title (max 40 chars) from the user's first message
                const raw = currentInput.trim();
                const title = raw.length > 40 ? raw.substring(0, 37) + '...' : raw;
                firebaseService.updateAiConversationTitle(user.uid, convoId, title)
                    .then(() => loadConversations())
                    .catch(() => {});
            }

            // 7. Update limits
            await subscriptionService.incrementChatCount(user);

        } catch (error) {
            console.error("Chat error:", error);
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                text: "Sorry, I'm having trouble connecting to the server. Please try again.",
                isUser: false
            }]);
        } finally {
            setIsTyping(false);
        }
    };

    return (
        <div className="flex h-full overflow-hidden bg-background-light dark:bg-background-dark">
            {/* Sidebar (History) */}
            <div className={`fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-black/90 border-r border-gray-100 dark:border-gray-800 transform transition-transform duration-300 md:relative md:translate-x-0 ${showSidebar ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex flex-col h-full">
                    <div className="p-4">
                        <button
                            onClick={startNewChat}
                            className="w-full flex items-center gap-2 bg-primary text-white p-3 rounded-xl font-bold hover:bg-green-700 transition-colors shadow-lg shadow-primary/20"
                        >
                            <span className="material-icons-round">add</span>
                            {t('New Chat')}
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-3 space-y-1">
                        {conversations.filter(conv => conv.lastMessage || (conv.title && conv.title !== 'New Chat')).map(conv => (
                            <button
                                key={conv.id}
                                onClick={() => {
                                    setActiveConversationId(conv.id);
                                    if (window.innerWidth < 768) setShowSidebar(false);
                                }}
                                className={`w-full text-left p-3 rounded-xl text-sm font-medium transition-colors flex justify-between group ${activeConversationId === conv.id
                                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                                    }`}
                            >
                                <div className="truncate pr-2">
                                    <p className="truncate font-semibold">{conv.title}</p>
                                    <p className="text-xs opacity-70 truncate">{conv.lastMessage || "No messages"}</p>
                                </div>
                                <button
                                    onClick={(e) => handleDeleteConversation(e, conv.id)}
                                    className="p-1 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                    title="Delete chat"
                                >
                                    <span className="material-icons-round text-base">delete</span>
                                </button>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Sidebar Overlay (Mobile) */}
            {showSidebar && (
                <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setShowSidebar(false)}></div>
            )}

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col h-full relative">
                {/* Mobile Header */}
                <div className="md:hidden flex items-center px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-black">
                    <button onClick={() => setShowSidebar(true)} className="mr-3 text-gray-500 p-1.5 -ml-1 rounded-xl active:bg-gray-100 dark:active:bg-gray-800">
                        <span className="material-icons-round text-xl">menu</span>
                    </button>
                    <span className="font-bold text-sm">KropBot AI</span>
                </div>

                <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4 md:space-y-6 scrollbar-hide">
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center px-3 md:px-4">
                            {/* KropBot Identity */}
                            <div className="relative mb-4 md:mb-6">
                                <div className="w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl md:rounded-3xl flex items-center justify-center shadow-xl shadow-green-500/20 rotate-3">
                                    <span className="material-icons-round text-3xl md:text-4xl text-white">eco</span>
                                </div>
                                <div className="absolute -bottom-1 -right-1 w-5 h-5 md:w-6 md:h-6 bg-blue-500 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-900">
                                    <span className="material-icons-round text-xs text-white">auto_awesome</span>
                                </div>
                            </div>
                            <h2 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white mb-1">KropBot</h2>
                            <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 mb-5 md:mb-8 max-w-sm">{t('Your AI farming assistant. Ask about diseases, treatments, market prices, or upload a photo for diagnosis.')}</p>

                            {/* Suggested Prompts */}
                            <div className="flex md:grid md:grid-cols-2 gap-2.5 md:gap-3 max-w-lg w-full overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 scrollbar-hide snap-x snap-mandatory">
                                {[
                                    { icon: 'bug_report', text: t('My wheat leaves have brown spots'), color: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' },
                                    { icon: 'medical_services', text: t('Best organic treatment for rice blast?'), color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' },
                                    { icon: 'trending_up', text: t('Should I sell my wheat now or wait?'), color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' },
                                    { icon: 'water_drop', text: t('How much water does rice need in summer?'), color: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400' },
                                ].map((prompt, i) => (
                                    <button
                                        key={i}
                                        onClick={() => { setInputText(prompt.text); }}
                                        className="flex items-start gap-2 md:gap-3 p-3 md:p-4 rounded-xl md:rounded-2xl bg-white dark:bg-surface-dark border border-gray-100 dark:border-gray-800 hover:border-green-300 dark:hover:border-green-700 hover:shadow-md transition-all text-left group min-w-[200px] md:min-w-0 snap-start flex-shrink-0 md:flex-shrink"
                                    >
                                        <span className={`material-icons-round text-base md:text-lg p-1 md:p-1.5 rounded-lg md:rounded-xl ${prompt.color} flex-shrink-0`}>{prompt.icon}</span>
                                        <span className="text-xs md:text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white leading-snug">{prompt.text}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        messages.map((msg) => (
                            <div key={msg.id} className={`flex gap-2 md:gap-3 ${msg.isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                                {/* AI Avatar */}
                                {!msg.isUser && (
                                    <div className="flex-shrink-0 w-7 h-7 md:w-8 md:h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg md:rounded-xl flex items-center justify-center mt-1">
                                        <span className="material-icons-round text-white text-xs md:text-sm">eco</span>
                                    </div>
                                )}
                                <div className={`max-w-[88%] md:max-w-[70%] p-3 md:p-4 rounded-2xl ${msg.isUser
                                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-br-sm shadow-lg'
                                    : 'bg-white dark:bg-surface-dark border border-gray-100 dark:border-gray-800 rounded-bl-sm shadow-sm'
                                    }`}>
                                    {msg.image && (
                                        <img src={msg.image} alt="Upload" className="max-w-full h-48 object-cover rounded-xl mb-3 border-2 border-white/20" />
                                    )}
                                    <div className={`text-sm md:text-base leading-relaxed ${msg.isUser ? 'text-white dark:text-gray-900' : 'text-gray-800 dark:text-gray-200'}`}
                                        dangerouslySetInnerHTML={{
                                            __html: msg.text
                                                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                                                .replace(/`(.*?)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')
                                                .replace(/\n/g, '<br/>')
                                        }}
                                    />
                                    <div className="flex justify-between items-center mt-2.5 pt-2 border-t border-gray-100/50 dark:border-gray-700/30">
                                        {!msg.isUser && (
                                            <div className="flex gap-1">
                                                <button onClick={() => speakText(msg.text)} className="p-1 rounded-lg text-gray-400 hover:text-primary hover:bg-green-50 dark:hover:bg-green-900/20 transition-all" title="Read Aloud">
                                                    <span className="material-icons-round text-sm">volume_up</span>
                                                </button>
                                                <button onClick={() => { navigator.clipboard.writeText(msg.text); toast.success('Copied!'); }} className="p-1 rounded-lg text-gray-400 hover:text-primary hover:bg-green-50 dark:hover:bg-green-900/20 transition-all" title="Copy">
                                                    <span className="material-icons-round text-sm">content_copy</span>
                                                </button>
                                            </div>
                                        )}
                                        <p className={`text-[10px] text-right flex-1 opacity-50 font-medium ${!msg.isUser ? 'ml-2' : ''}`}>
                                            {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>
                                {/* User Avatar */}
                                {msg.isUser && (
                                    <div className="flex-shrink-0 w-7 h-7 md:w-8 md:h-8 bg-gray-200 dark:bg-gray-700 rounded-lg md:rounded-xl flex items-center justify-center mt-1 overflow-hidden">
                                        {user?.avatar ? <img src={user.avatar} className="w-full h-full object-cover" /> : <span className="material-icons-round text-gray-500 dark:text-gray-400 text-sm">person</span>}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                    {isTyping && (
                        <div className="flex gap-3 justify-start animate-fade-in">
                            <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
                                <span className="material-icons-round text-white text-sm animate-pulse">eco</span>
                            </div>
                            <div className="bg-white dark:bg-surface-dark px-5 py-3.5 rounded-2xl rounded-bl-sm border border-gray-100 dark:border-gray-800 flex gap-1.5 items-center">
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                                <span className="text-xs text-gray-400 ml-2 font-medium">{t('KropBot is thinking...')}</span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area — "Organic Luxury" */}
                <div className="p-3 md:p-5 bg-gradient-to-t from-white via-white to-white/80 dark:from-black dark:via-black dark:to-black/80 backdrop-blur-xl">
                    <div className="max-w-3xl mx-auto">
                        {/* Image preview chip */}
                        {selectedImage && (
                            <div className="flex items-center gap-2 mb-2 ml-14">
                                <div className="relative group inline-flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-3 py-1.5">
                                    <img src={URL.createObjectURL(selectedImage)} className="w-8 h-8 rounded-lg object-cover" />
                                    <span className="text-xs font-semibold text-green-700 dark:text-green-400">Image attached</span>
                                    <button onClick={() => setSelectedImage(null)} className="p-0.5 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors">
                                        <span className="material-icons-round text-sm">close</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="relative flex items-end gap-2">
                            {/* Photo upload */}
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="flex-shrink-0 w-12 h-12 md:w-11 md:h-11 rounded-2xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 flex items-center justify-center text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 hover:scale-105 active:scale-95 transition-all"
                            >
                                <span className="material-icons-round text-xl">photo_camera</span>
                            </button>

                            {/* Main input pill */}
                            <div className="flex-1 relative group">
                                <div className="absolute -inset-0.5 bg-gradient-to-r from-green-400 via-emerald-400 to-green-400 rounded-[1.25rem] opacity-0 group-focus-within:opacity-20 blur-sm transition-opacity duration-500"></div>
                                <div className="relative bg-gray-50 dark:bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-200/80 dark:border-gray-700/50 group-focus-within:border-green-300 dark:group-focus-within:border-green-700 transition-all duration-300 shadow-sm group-focus-within:shadow-lg group-focus-within:shadow-green-500/5 flex items-center px-3 md:px-4 py-3 md:py-2.5">
                                    <input
                                        type="text"
                                        className="flex-1 bg-transparent border-none outline-none text-[15px] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 font-medium"
                                        placeholder={selectedImage ? t('Add a caption') : isListening ? t('Listening...') : t('Ask KropBot anything')}
                                        value={inputText}
                                        onChange={(e) => setInputText(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                                    />

                                    {/* Voice input */}
                                    <button
                                        onClick={toggleListen}
                                        className={`flex-shrink-0 ml-1 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
                                            isListening
                                                ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 scale-110 animate-pulse'
                                                : 'text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                                        }`}
                                        title="Speech to text"
                                    >
                                        <span className="material-icons-round text-lg">{isListening ? 'mic' : 'mic_none'}</span>
                                    </button>
                                </div>
                            </div>

                            {/* Send button */}
                            <button
                                onClick={handleSend}
                                disabled={!inputText.trim() && !selectedImage}
                                className="flex-shrink-0 w-12 h-12 md:w-11 md:h-11 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 text-white flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:shadow-xl hover:shadow-green-500/25 hover:scale-105 active:scale-95 transition-all duration-200"
                            >
                                <span className="material-icons-round text-xl">arrow_upward</span>
                            </button>
                        </div>

                        <p className="text-center text-[10px] text-gray-400 dark:text-gray-600 mt-2 font-medium">
                            Powered by Gemma 3 27B  ·  Supports 11 Indian languages
                        </p>
                    </div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                                setSelectedImage(e.target.files[0]);
                            }
                        }}
                    />
                </div>
            </div>

            {/* Info Sidebar (Desktop) - Context Aware */}
            {latestDiagnosis && (
                <aside className="w-80 bg-white dark:bg-surface-dark border-l border-slate-200 dark:border-slate-800 hidden lg:flex flex-col overflow-y-auto animate-slide-in-right">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                        <h3 className="font-bold text-slate-800 dark:text-white mb-1">{t('Diagnosis Context')}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{t('Asking about this scan')}</p>
                    </div>
                    <div className="p-6 space-y-6">
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-700/50">
                            <img src={latestDiagnosis.disease?.image || 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%22%20height%3D%22100%22%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20fill%3D%22%23f0f5f0%22%2F%3E%3C%2Fsvg%3E'} className="h-32 w-full object-cover rounded-lg mb-3" />
                            <h4 className="font-bold text-slate-800 dark:text-white text-sm">{latestDiagnosis.disease?.name}</h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('Confidence')}: {(latestDiagnosis.confidence * 100).toFixed(0)}%</p>
                        </div>
                    </div>
                </aside>
            )}

            <UpgradeModal
                isOpen={showUpgradeModal}
                onClose={() => setShowUpgradeModal(false)}
                user={user}
                onUpgrade={(updatedUser) => {
                    setShowUpgradeModal(false);
                    toast.success("Upgrade Successful! You can now continue chatting.");
                }}
            />
        </div>
    );
};

export default AiBot;