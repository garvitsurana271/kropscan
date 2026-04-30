import React, { useState, useEffect, useRef } from 'react';
import { callService } from '../services/CallService';

export interface Message {
    id: number | string;
    text: string;
    sender: 'me' | 'them' | 'system';
    time: string;
    type: 'text' | 'image' | 'system';
}

interface UserChatProps {
    sellerName: string;
    itemTitle: string;
    itemPrice: number;
    onClose: () => void;
    onMinimize: () => void;
    messages: Message[];
    onSendMessage: (text: string, type: 'text' | 'image' | 'system') => void;
    isInline?: boolean;
    chatId?: string;
    currentUserId?: string;
}

const UserChat: React.FC<UserChatProps> = ({ sellerName, itemTitle, itemPrice, onClose, onMinimize, messages, onSendMessage, isInline = false, chatId, currentUserId }) => {
    const [inputValue, setInputValue] = useState('');
    const [escrowStatus, setEscrowStatus] = useState<'none' | 'locked' | 'shipped' | 'released' | 'disputed'>('none');
    const [autoReleaseTimer, setAutoReleaseTimer] = useState<number | null>(null);

    // Camera State
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);

    // Call State
    const [callStatus, setCallStatus] = useState<'idle' | 'incoming' | 'calling' | 'connected' | 'ended'>('idle');
    const [callDuration, setCallDuration] = useState(0);
    const [isVideoCall, setIsVideoCall] = useState(true);

    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isCameraOpen, callStatus]);

    // Handle Call Timer
    useEffect(() => {
        let interval: any;
        if (callStatus === 'connected') {
            interval = setInterval(() => setCallDuration(p => p + 1), 1000);
        }
        return () => clearInterval(interval);
    }, [callStatus]);

    // Handle Escrow Auto-Release Timer (Accelerated for demo)
    useEffect(() => {
        let timer: any;
        if (escrowStatus === 'shipped' && autoReleaseTimer !== null) {
            timer = setInterval(() => {
                setAutoReleaseTimer(prev => {
                    if (prev === null || prev <= 1) {
                        clearInterval(timer);
                        // Auto-release triggered
                        if (escrowStatus === 'shipped') { // Check again in case state changed
                            setEscrowStatus('released');
                            onSendMessage(`⏳ 72-Hour Auto-Release Triggered. Funds released to ${sellerName}.`, 'system');
                        }
                        return 0;
                    }
                    return prev - 1;
                });
            }, 500); // 1 tick = 0.5s for demo (represents 1 hour)
        }
        return () => clearInterval(timer);
    }, [escrowStatus, autoReleaseTimer]);

    const formatTime = (secs: number) => {
        const mins = Math.floor(secs / 60);
        const sec = secs % 60;
        return `${mins.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    const handleSend = (text: string = inputValue, type: 'text' | 'image' = 'text') => {
        if (!text.trim()) return;
        onSendMessage(text, type);
        setInputValue('');
    };

    // Camera Functions
    const startCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
            setStream(mediaStream);
            setIsCameraOpen(true);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
        } catch (err) {
            console.error("Camera Error:", err);
            alert("Could not access camera. Please check permissions.");
        }
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
        setIsCameraOpen(false);
    };

    useEffect(() => {
        if (isCameraOpen && videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [isCameraOpen, stream]);

    const capturePhoto = () => {
        if (videoRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg');
            stopCamera();
            handleSend(dataUrl, 'image');
        }
    };

    // Detect incoming call from messages
    useEffect(() => {
        if (!chatId || !currentUserId) return;

        // Find the most recent CALL_INITIATED message
        const systemMessages = messages.filter(m => m.type === 'system' || (m.type === 'text' && m.text.startsWith('CALL_INITIATED')));
        const lastSystemMsg = systemMessages[systemMessages.length - 1];

        if (lastSystemMsg && lastSystemMsg.text.startsWith('CALL_INITIATED') && callStatus === 'idle') {
            const parts = lastSystemMsg.text.split('|');
            const callerId = parts[1];
            const isVideo = parts[2] === 'VIDEO';

            if (callerId !== currentUserId.toString()) {
                setIsVideoCall(isVideo);
                setCallStatus('incoming');
            }
        }

        if (lastSystemMsg && lastSystemMsg.text === 'CALL_REJECTED' && callStatus === 'calling') {
            endCallLocally();
        }
    }, [messages, chatId, currentUserId, callStatus]);

    // Call Functions
    const startWebRTCCall = async (video: boolean) => {
        if (!chatId || !currentUserId) {
            alert("Call failed: Missing Chat ID");
            return;
        }
        setIsVideoCall(video);
        setCallStatus('calling');

        try {
            const stream = await callService.startLocalStream(video, true);
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;

            await callService.initiateCall(
                chatId,
                currentUserId.toString(),
                'unknown_receiver', // Simplified
                video,
                (remoteStream) => {
                    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
                },
                (status) => {
                    if (status === 'connected') setCallStatus('connected');
                    if (status === 'ended' || status === 'rejected' || status === 'disconnected' || status === 'failed') endCallLocally();
                }
            );

            // Send system message so receiver gets notified
            await callService.emitReadyState(chatId, currentUserId.toString(), video);
        } catch (e) {
            console.error(e);
            endCallLocally();
        }
    };

    const answerIncomingCall = async () => {
        if (!chatId) return;
        setCallStatus('connected');
        try {
            const stream = await callService.startLocalStream(isVideoCall, true);
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;

            await callService.answerCall(
                chatId,
                (remoteStream) => {
                    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
                },
                (status) => {
                    if (status === 'ended' || status === 'disconnected' || status === 'failed') endCallLocally();
                }
            );
        } catch (e) {
            console.error(e);
            endCallLocally();
        }
    };

    const rejectIncomingCall = async () => {
        if (!chatId) return;
        await callService.rejectCall(chatId);
        setCallStatus('idle');
    };

    const endCallLocally = async () => {
        setCallStatus('ended');
        if (chatId) {
            await callService.endCall(chatId);
        }
        setTimeout(() => {
            setCallStatus('idle');
            setCallDuration(0);
        }, 1500);
    };

    const handleEscrowPay = () => {
        const confirm = window.confirm(`Lock ₹${itemPrice} in KropSafe Escrow? Funds will effectively leave your account but won't reach the seller until you confirm delivery.`);
        if (confirm) {
            setEscrowStatus('locked');
            onSendMessage(`🔒 funds of ₹${itemPrice} locked in KropSafe Escrow.`, 'system');
        }
    };

    const handleShipItem = () => {
        const confirm = window.confirm(`Mark item as shipped? This starts the 72-hour auto-release countdown for the buyer.`);
        if (confirm) {
            setEscrowStatus('shipped');
            setAutoReleaseTimer(72); // 72 hours
            onSendMessage(`📦 Item marked as Shipped. 72-Hour Auto-Release protection active.`, 'system');
        }
    };

    const handleDispute = () => {
        const confirm = window.confirm(`There is an issue with the item? This will freeze the funds and escalate to Admin Medidation.`);
        if (confirm) {
            setEscrowStatus('disputed');
            setAutoReleaseTimer(null);
            onSendMessage(`⚠️ Dispute Raised! Funds frozen in Escrow awaiting Admin Resolution.`, 'system');
        }
    };

    const handleRelease = () => {
        const confirm = window.confirm("Have you received the item? This will release funds to the seller immediately.");
        if (confirm) {
            setEscrowStatus('released');
            setAutoReleaseTimer(null);
            onSendMessage(`✅ Funds manually released to ${sellerName}. Transaction Complete.`, 'system');
        }
    };

    return (
        <div className={isInline
            ? "w-full h-full flex flex-col bg-white dark:bg-black/20"
            : "fixed inset-0 z-[70] bg-white dark:bg-black md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[450px] md:h-[650px] md:rounded-[2rem] md:shadow-2xl flex flex-col overflow-hidden animate-fade-in border border-gray-100 dark:border-gray-800"
        }>

            {/* Camera Overlay */}
            {isCameraOpen && (
                <div className="absolute inset-0 z-[80] bg-black flex flex-col">
                    <div className="flex-1 relative overflow-hidden">
                        <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
                    </div>
                    <div className="p-6 pb-8 bg-black/50 backdrop-blur flex items-center justify-between absolute bottom-0 w-full">
                        <button onClick={stopCamera} className="text-white"><span className="material-icons-round text-3xl">close</span></button>
                        <button onClick={capturePhoto} className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center bg-white/20 hover:bg-white/40 transition-colors">
                            <div className="w-12 h-12 bg-white rounded-full"></div>
                        </button>
                        <button className="text-white"><span className="material-icons-round text-3xl">flip_camera_ios</span></button>
                    </div>
                </div>
            )}

            {/* Call Overlay */}
            {callStatus !== 'idle' && (
                <div className="absolute inset-0 z-[90] bg-gradient-to-b from-gray-900 to-black flex flex-col items-center justify-center text-white animate-fade-in relative">

                    {/* Video Elements for WebRTC */}
                    {callStatus === 'connected' && isVideoCall && (
                        <div className="absolute inset-0 z-0">
                            {/* Remote Video (full screen) */}
                            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                            {/* Local Video (PiP) */}
                            <div className="absolute bottom-32 right-6 w-28 h-40 rounded-xl overflow-hidden shadow-2xl border-2 border-white/20 z-10">
                                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover bg-gray-800" />
                            </div>
                        </div>
                    )}

                    {/* Overlay UI (Centered Avatar when not connected to video, or transparent when connected) */}
                    <div className={`z-20 w-full flex flex-col items-center ${callStatus === 'connected' && isVideoCall ? 'absolute top-10' : ''}`}>
                        {!(callStatus === 'connected' && isVideoCall) && (
                            <div className="w-32 h-32 rounded-full border-4 border-white/10 p-1 mb-6 animate-pulse mt-12 bg-gray-900">
                                <div className="w-full h-full rounded-full flex items-center justify-center text-4xl font-bold bg-green-800">
                                    {sellerName.charAt(0)}
                                </div>
                            </div>
                        )}
                        <h2 className="text-3xl font-bold mb-2 drop-shadow-lg">{sellerName}</h2>
                        <p className="text-green-400 font-medium mb-12 drop-shadow-md bg-black/30 px-3 py-1 rounded-full">
                            {callStatus === 'calling' ? 'Calling...' :
                                callStatus === 'incoming' ? 'Incoming Call...' :
                                    callStatus === 'ended' ? 'Call Ended' : formatTime(callDuration)}
                        </p>
                    </div>

                    <div className={`z-20 flex items-center gap-8 ${callStatus === 'connected' && isVideoCall ? 'absolute bottom-10' : ''}`}>
                        {callStatus === 'incoming' ? (
                            <>
                                <button onClick={answerIncomingCall} className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/50 hover:bg-green-600 hover:scale-105 transition-all animate-bounce"><span className="material-icons-round text-3xl">call</span></button>
                                <button onClick={rejectIncomingCall} className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/50 hover:bg-red-600 hover:scale-105 transition-all"><span className="material-icons-round text-3xl">call_end</span></button>
                            </>
                        ) : (
                            <>
                                <button className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 backdrop-blur outline-none"><span className="material-icons-round">mic_off</span></button>
                                <button onClick={endCallLocally} className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/50 hover:bg-red-600 hover:scale-105 transition-all"><span className="material-icons-round text-3xl">call_end</span></button>
                                <button className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 backdrop-blur outline-none"><span className="material-icons-round">videocam_off</span></button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="p-4 bg-gray-50 dark:bg-surface-dark border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
                {!isInline && (
                    <button onClick={onClose} className="p-2 -ml-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors">
                        <span className="material-icons-round">arrow_back</span>
                    </button>
                )}
                <div className="flex items-center gap-3 flex-1">
                    <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-700 dark:text-green-400 font-bold text-lg">
                        {sellerName.charAt(0)}
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-900 dark:text-white leading-none">{sellerName}</h3>
                        <p className="text-xs text-green-600 font-bold mt-1">Online</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {!isInline && (
                        <button onClick={onMinimize} className="p-2 text-gray-400 hover:text-primary transition-colors"><span className="material-icons-round">horizontal_rule</span></button>
                    )}
                    <button onClick={() => startWebRTCCall(false)} className="p-2 text-gray-400 hover:text-green-500 transition-colors"><span className="material-icons-round">phone</span></button>
                    <button onClick={() => startWebRTCCall(true)} className="p-2 text-gray-400 hover:text-green-500 transition-colors"><span className="material-icons-round">videocam</span></button>
                </div>
            </div>

            {/* Product Quick Info Context */}
            <div className="px-4 py-2 bg-yellow-50 dark:bg-yellow-900/10 border-b border-yellow-100 dark:border-yellow-900/30 flex items-center justify-between text-xs font-medium">
                <span className="text-yellow-800 dark:text-yellow-200">Negotiating for <strong>{itemTitle}</strong></span>
                <span className="font-bold text-yellow-900 dark:text-yellow-100">₹{itemPrice}</span>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 dark:bg-black">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.type === 'system' ? 'justify-center' : (msg.sender === 'me' ? 'justify-end' : 'justify-start')}`}>
                        {msg.type === 'system' ? (
                            <div className="bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide shadow-sm">
                                {msg.text}
                            </div>
                        ) : (
                            <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl shadow-sm text-sm ${msg.sender === 'me'
                                ? 'bg-primary text-white rounded-tr-none'
                                : 'bg-white dark:bg-surface-dark border border-gray-100 dark:border-gray-800 rounded-tl-none text-gray-800 dark:text-gray-200'
                                }`}>
                                {msg.type === 'image' ? (
                                    <img src={msg.text} alt="Shared" className="rounded-lg max-w-full" />
                                ) : (
                                    <p>{msg.text.startsWith('CALL_INITIATED') || msg.text === 'CALL_REJECTED' ? '📞 Call Log' : msg.text}</p>
                                )}
                                <p className={`text-[10px] mt-1 text-right ${msg.sender === 'me' ? 'text-white/70' : 'text-gray-400'}`}>{msg.time}</p>
                            </div>
                        )}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Escrow Actions */}
            <div className="p-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
                {escrowStatus === 'none' && (
                    <button onClick={handleEscrowPay} className="w-full bg-black dark:bg-white text-white dark:text-black py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg hover:scale-[1.01] transition-transform">
                        <span className="material-icons-round text-sm">verified_user</span>
                        Pay Securely (Escrow)
                    </button>
                )}
                {escrowStatus === 'locked' && (
                    <div className="flex gap-2">
                        <div className="flex-1 bg-yellow-100 text-yellow-800 py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-xs">
                            <span className="material-icons-round text-sm animate-pulse">lock</span>
                            Funds Held
                        </div>
                        <button onClick={handleShipItem} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors shadow-lg text-xs md:text-sm">
                            <span className="material-icons-round text-sm">local_shipping</span>
                            Mark Shipped
                        </button>
                    </div>
                )}
                {escrowStatus === 'shipped' && (
                    <div className="flex flex-col gap-2">
                        <div className="w-full bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 py-2 rounded-xl flex items-center justify-center gap-2 text-xs font-bold border border-blue-200 dark:border-blue-800/50">
                            <span className="material-icons-round text-sm animate-spin">schedule</span>
                            Auto-Release in: <span className="text-blue-600 dark:text-blue-400 font-mono text-lg">{autoReleaseTimer}h</span>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleDispute} className="flex-1 bg-red-100 text-red-700 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-200 transition-colors text-xs">
                                <span className="material-icons-round text-sm">report_problem</span>
                                Dispute
                            </button>
                            <button onClick={handleRelease} className="flex-2 bg-green-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-green-700 transition-colors shadow-lg text-xs md:text-sm">
                                <span className="material-icons-round text-sm">check_circle</span>
                                Mark Received
                            </button>
                        </div>
                    </div>
                )}
                {escrowStatus === 'disputed' && (
                    <div className="w-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 py-3 rounded-xl font-bold flex items-center justify-center gap-2 border border-red-200 dark:border-red-800/50">
                        <span className="material-icons-round text-sm">gavel</span>
                        Funds Frozen (Admin Mediation)
                    </div>
                )}
                {escrowStatus === 'released' && (
                    <div className="w-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                        <span className="material-icons-round text-sm">done_all</span>
                        Transaction Completed
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-3 bg-white dark:bg-surface-dark border-t border-gray-100 dark:border-gray-800 flex gap-2 items-center">
                <button onClick={startCamera} className="p-2 text-gray-400 hover:text-primary transition-colors"><span className="material-icons-round">photo_camera</span></button>
                <input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Type a message..."
                    className="flex-1 bg-gray-50 dark:bg-gray-800 border-none rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                />
                <button onClick={() => handleSend()} disabled={!inputValue} className="p-2.5 bg-primary text-white rounded-xl shadow-lg hover:bg-green-700 transition-colors disabled:opacity-50"><span className="material-icons-round text-sm">send</span></button>
            </div>
        </div>
    );
};

export default UserChat;
