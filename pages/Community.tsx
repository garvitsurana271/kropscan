import React, { useEffect, useState, useRef } from 'react';
import { dbService } from '../services/DatabaseService';
import { firebaseService } from '../services/FirebaseService';
import { UserProfile } from '../types';
import PaymentModal from '../components/PaymentModal';
import UserChat, { Message } from '../components/UserChat';
import { toast } from 'sonner';
import { getTranslation } from '../utils/translations';

interface CommunityProps {
    user?: UserProfile | null;
    initialTab?: 'forum' | 'marketplace';
    language?: string;
}

interface Conversation {
    id: string; // Item ID for now
    sellerName: string;
    sellerAvatar: string;
    itemTitle: string;
    itemPrice: number;
    messages: Message[];
    lastMessageTime: string;
    unread: number;
}

const Community: React.FC<CommunityProps> = ({ user, initialTab = 'forum', language = 'English' }) => {
    const t = (key: string) => getTranslation(language, key);
    const [activeTab, setActiveTab] = useState<'forum' | 'marketplace' | 'chats'>(initialTab as any);
    const [posts, setPosts] = useState<any[]>([]);
    const [newPostContent, setNewPostContent] = useState('');
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Pagination State
    const [lastPostDoc, setLastPostDoc] = useState<any>(null);
    const [hasMorePosts, setHasMorePosts] = useState(true);
    const [postsLoading, setPostsLoading] = useState(false);

    // Marketplace State
    const [marketItems, setMarketItems] = useState<any[]>([]);
    const [lastMarketDoc, setLastMarketDoc] = useState<any>(null);
    const [hasMoreMarket, setHasMoreMarket] = useState(true);
    const [marketLoading, setMarketLoading] = useState(false);

    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('All');

    const [isSellModalOpen, setIsSellModalOpen] = useState(false);

    // Chat & Payment State
    const [purchaseItem, setPurchaseItem] = useState<any | null>(null);
    const [conversations, setConversations] = useState<Record<string, Conversation>>({});
    const [chatItem, setChatItem] = useState<any | null>(null); // Currently open chat item
    const [minimizedChats, setMinimizedChats] = useState<string[]>([]); // Array of IDs

    // Comments State
    const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
    const [postComments, setPostComments] = useState<Record<string, any[]>>({});
    const [newCommentText, setNewCommentText] = useState('');

    useEffect(() => {
        if (!user) {
            if (import.meta.env.DEV) console.log("User not logged in, skipping conversation subscription");
            return;
        }

        if (import.meta.env.DEV) console.log("Setting up conversation subscription for user:", user.uid || user.id);
        // Subscribe to my conversations
        const unsubscribe = firebaseService.subscribeToConversations((chats) => {
            if (import.meta.env.DEV) {
                console.log("Conversations received:", chats.length, "chats");
                chats.forEach(c => {
                    console.log("  - Chat ID:", c.id, "Participants:", c.participants, "Item:", c.itemTitle);
                });
            }

            const chatMap: Record<string, Conversation> = {};
            chats.forEach(c => {
                chatMap[c.id] = {
                    id: c.id,
                    sellerName: c.otherUser?.name || 'User',
                    sellerAvatar: c.otherUser?.avatar || 'https://i.pravatar.cc/150',
                    itemTitle: c.itemTitle,
                    itemPrice: c.itemPrice,
                    messages: [], // We load these when opened
                    lastMessageTime: new Date(c.lastMessageTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    unread: 0
                };
            });
            if (import.meta.env.DEV) console.log("Setting conversations state with", Object.keys(chatMap).length, "conversations");
            setConversations(chatMap);
        });
        return () => unsubscribe();
    }, [user]);

    // Listen to messages for active chat
    useEffect(() => {
        if (!chatItem) return;
        const chatId = chatItem.id; // chatItem in this context is the Conversation object for existing chats

        // If chatItem comes from "Start Chat", it might be an Item object, so we need to be careful.
        // But startChat below handles the conversion/creation.

        const unsubscribe = firebaseService.subscribeToMessages(chatId, (msgs) => {
            if (import.meta.env.DEV) console.log("Messages received for chat", chatId, ":", msgs.length);
            setConversations(prev => {
                // Get current user's Firebase UID for proper sender identification
                const myUid = firebaseService.auth.currentUser?.uid || user?.uid || user?.id;

                const formattedMsgs: Message[] = msgs.map(m => ({
                    id: m.id,
                    text: m.text,
                    sender: m.senderId === myUid ? 'me' : 'them',
                    time: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    type: m.type
                }));

                // If conversation doesn't exist yet in state (brand new chat), create it
                if (!prev[chatId]) {
                    if (import.meta.env.DEV) console.log("Creating new conversation entry for", chatId);
                    return {
                        ...prev,
                        [chatId]: {
                            id: chatId,
                            sellerName: chatItem.sellerName || 'User',
                            sellerAvatar: 'https://i.pravatar.cc/150',
                            itemTitle: chatItem.title || chatItem.name || 'Item',
                            itemPrice: chatItem.price || 0,
                            messages: formattedMsgs,
                            lastMessageTime: formattedMsgs.length ? formattedMsgs[formattedMsgs.length - 1].time : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            unread: 0
                        }
                    };
                }

                // Update existing conversation
                return {
                    ...prev,
                    [chatId]: {
                        ...prev[chatId],
                        messages: formattedMsgs,
                        lastMessageTime: formattedMsgs.length ? formattedMsgs[formattedMsgs.length - 1].time : prev[chatId].lastMessageTime
                    }
                };
            });
        });

        return () => unsubscribe();
    }, [chatItem]);

    // Sidebar Stats
    const [userStats, setUserStats] = useState({ posts: 0, likes: 0, sold: 0 });

    // Sell Form State
    const [sellTitle, setSellTitle] = useState('');
    const [sellPrice, setSellPrice] = useState('');
    const [sellDesc, setSellDesc] = useState('');
    const [sellImage, setSellImage] = useState<string | null>(null);

    // Categories
    const categories = ['All', 'Equipment', 'Fertilizer', 'Seeds', 'Tools', 'Vehicles', 'General'].sort();

    useEffect(() => {
        loadData();
    }, [activeTab]);

    const loadData = async (isLoadMore = false) => {
        if (activeTab === 'forum') {
            if (!isLoadMore) {
                setPosts([]);
                setLastPostDoc(null);
                setHasMorePosts(true);
                setUserStats({ posts: 0, likes: 0, sold: 0 }); // Reset stats
            }

            setPostsLoading(true);
            try {
                const { posts: newPosts, lastDoc } = await firebaseService.getPosts(isLoadMore ? lastPostDoc : undefined);

                setPosts(prev => isLoadMore ? [...prev, ...newPosts] : newPosts);
                setLastPostDoc(lastDoc);
                setHasMorePosts(!!lastDoc);

                // Calculate User Stats (Only for loaded posts - Limitation of client-side)
                // ideally this should be a persisted user profile field
                if (!isLoadMore) {
                    // Approximate stats from first page or leave 0
                    // For now, we simply sum what we see, which is fine for specific user feedback
                }
            } catch (e) {
                console.error("Failed to load posts", e);
            } finally {
                setPostsLoading(false);
            }
        }
        if (activeTab === 'marketplace') {
            loadMarketItems(isLoadMore);
        }
    };

    const loadMarketItems = async (isLoadMore = false) => {
        if (!isLoadMore) {
            setMarketItems([]);
            setLastMarketDoc(null);
            setHasMoreMarket(true);
        }

        setMarketLoading(true);
        try {
            // Fetch from Firebase (Cloud)
            const { items, lastDoc } = await firebaseService.getMarketItems(true, isLoadMore ? lastMarketDoc : undefined);

            // Affiliate items can come from Firebase too 
            // We fetch affiliate once at start? Or simply append them at bottom?
            // For mixed feed, pagination is tricky. We'll just fetch affiliate on first load.
            let affiliate: any[] = [];
            if (!isLoadMore) {
                affiliate = await firebaseService.getAffiliateProducts();
            }

            // 1. Filter: Show item if APPROVED OR if it belongs to current user
            // Fix: Compare sellerId with Firebase UID (user.uid) or legacy user.id
            const currentUserId = user?.uid || user?.id;
            const approvedItems = items.filter((item: any) =>
                item.status === 'approved' ||
                item.status === undefined ||
                (currentUserId && (item.sellerId === currentUserId || item.sellerId == currentUserId)) // Handle string vs number comparison
            );

            const combined = [
                ...approvedItems.map((i: any) => ({ ...i, type: 'User Listing' })),
                ...affiliate.map((i: any) => ({ ...i, id: `aff-${i.id}`, sellerName: 'KropScan Partner', isAffiliate: true, title: i.name, type: 'Affiliate' }))
            ];

            setMarketItems(prev => isLoadMore ? [...prev, ...combined] : combined);
            setLastMarketDoc(lastDoc);
            setHasMoreMarket(!!lastDoc);
        } catch (e) {
            console.error("Market load failed", e);
        } finally {
            setMarketLoading(false);
        }
    };

    const handlePost = async () => {
        if (!newPostContent.trim() && !selectedImage) return;
        const authorName = user?.name || 'Guest Farmer';
        const authorAvatar = user?.avatar || `https://i.pravatar.cc/150?u=${authorName.replace(/\s+/g, '')}`;
        await firebaseService.addPost(newPostContent, authorName, authorAvatar, selectedImage);
        setNewPostContent('');
        setSelectedImage(null);
        loadData();
    };

    const handleLike = async (post: any) => {
        if (!user || !user.uid) {
            toast.error("Please login to like.");
            return;
        }
        const userId = user.uid || user.id;
        const isLiked = (post.likedBy || []).includes(userId);

        // Optimistic UI Update
        setPosts(prev => prev.map(p => {
            if (p.id === post.id) {
                return {
                    ...p,
                    likes: isLiked ? p.likes - 1 : p.likes + 1,
                    likedBy: isLiked
                        ? (p.likedBy || []).filter((id: string) => id !== userId)
                        : [...(p.likedBy || []), userId]
                };
            }
            return p;
        }));

        await firebaseService.toggleLikePost(post.id, userId);
    };

    const toggleComments = async (postId: string) => {
        if (expandedPostId === postId) {
            setExpandedPostId(null);
            return;
        }

        setExpandedPostId(postId);
        if (!postComments[postId]) {
            const comments = await firebaseService.getCommentsForPost(postId);
            setPostComments(prev => ({ ...prev, [postId]: comments }));
        }
    };

    const handleAddComment = async (postId: string) => {
        if (!newCommentText.trim() || !user) return;

        const commentData = {
            text: newCommentText,
            authorName: user.name || 'User',
            authorAvatar: user.avatar || '',
            userId: user.uid || user.id
        };

        // Optimistic Update
        const tempComment = { ...commentData, id: Date.now().toString(), timestamp: Date.now() };
        setPostComments(prev => ({
            ...prev,
            [postId]: [...(prev[postId] || []), tempComment]
        }));

        setPosts(prev => prev.map(p => p.id === postId ? { ...p, comments: p.comments + 1 } : p));
        setNewCommentText('');

        await firebaseService.addCommentToPost(postId, commentData);
    };

    const detectCategory = (text: string): string => {
        const lower = text.toLowerCase();
        if (lower.includes('tractor') || lower.includes('harvester') || lower.includes('plough')) return 'Vehicles';
        if (lower.includes('urea') || lower.includes('npk') || lower.includes('fertilizer')) return 'Fertilizer';
        if (lower.includes('seed') || lower.includes('wheat') || lower.includes('rice')) return 'Seeds';
        if (lower.includes('spray') || lower.includes('pump') || lower.includes('hoe')) return 'Tools';
        return 'General';
    };

    const handleSellItem = async () => {
        if (!sellTitle || !sellPrice || !sellDesc || !sellImage) {
            toast.error("Please fill in all fields and upload an image.");
            return;
        }

        const category = detectCategory(sellTitle + " " + sellDesc);

        await firebaseService.addMarketItem({
            title: sellTitle,
            price: parseFloat(sellPrice),
            description: sellDesc,
            image: sellImage, // Already Base64 from file input
            sellerId: user?.uid || user?.id || 'guest', // Use Firebase UID (user.uid from Auth) or fallback to legacy id
            sellerName: user?.name || 'Guest Seller',
            category: category,
            status: 'pending' // Force pending on new items
        });
        setIsSellModalOpen(false);
        setSellTitle(''); setSellPrice(''); setSellDesc(''); setSellImage(null);
        toast.success("Item listed! It will appear after Admin approval.");
        loadData();
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>, setFunc: (val: string) => void) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => setFunc(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const filteredMarketItems = marketItems.filter(item => {
        const matchesSearch = (item.title || item.name).toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
        return matchesSearch && matchesCategory;
    });

    const startChat = async (item: any) => {
        if (!user) {
            toast.error("Please login to chat.");
            return;
        }

        try {
            const chatId = await firebaseService.startConversation(
                item.sellerId || "admin", // Fallback for seeds
                item.sellerName || "Seller",
                item.sellerAvatar || "",
                item.id.toString(),
                item.title || item.name,
                item.price
            );

            // Optimistic / Force set to open immediately
            setChatItem({
                id: chatId,
                sellerName: item.sellerName,
                title: item.title || item.name,
                price: item.price
            });
            setActiveTab('chats');
        } catch (e) {
            console.error("Chat Error", e);
            toast.error("Failed to start chat.");
        }
    };

    const handleSendMessage = async (text: string, type: 'text' | 'image' | 'system') => {
        if (!chatItem) {
            console.error("No chat item selected");
            toast.error("Chat session not found. Please try reopening the chat.");
            return;
        }

        try {
            if (import.meta.env.DEV) console.log("Sending message to chat:", chatItem.id, "Text:", text);
            // chatItem.id is the Firestore conversation ID
            await firebaseService.sendMessage(chatItem.id, text, type === 'system' ? 'text' : type);
            if (import.meta.env.DEV) console.log("Message sent successfully");
        } catch (error) {
            console.error("Failed to send message:", error);
            toast.error("Failed to send message. Please check your connection.");
        }
    };



    const handleMinimizeChat = () => {
        if (chatItem) {
            const chatId = chatItem.id.toString();
            if (!minimizedChats.includes(chatId)) {
                setMinimizedChats(prev => [...prev, chatId]);
            }
            setChatItem(null);
        }
    };

    const restoreChat = (chatId: string) => {
        const conv = conversations[chatId];
        if (conv) {
            // Reconstruct item object from conversation data for UserChat props
            // In a real app we might fetch the full item, but for now we have enough info
            setChatItem({
                id: conv.id,
                sellerName: conv.sellerName,
                title: conv.itemTitle,
                price: conv.itemPrice
            });
            setMinimizedChats(prev => prev.filter(id => id !== chatId));
        }
    };

    return (
        <div className="p-3 md:p-8 max-w-7xl mx-auto animate-fade-in min-h-screen relative">

            {/* Top Navigation Bar - Adjusted Sticky Offset */}
            <div className="flex flex-col md:flex-row justify-between items-center bg-white dark:bg-surface-dark p-1.5 md:p-2 rounded-xl md:rounded-2xl mb-3 md:mb-4 border border-gray-100 dark:border-gray-800 shadow-sm sticky top-0 z-30">
                <div className="flex p-1 gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-full md:w-auto">
                    <button onClick={() => setActiveTab('forum')} className={`flex-1 md:flex-none px-4 md:px-6 py-2.5 md:py-3 rounded-lg text-xs md:text-sm font-bold transition-all min-h-[44px] ${activeTab === 'forum' ? 'bg-white dark:bg-black shadow text-primary' : 'text-gray-500'}`}>
                        {t('Community')}
                    </button>
                    <button onClick={() => setActiveTab('marketplace')} className={`flex-1 md:flex-none px-4 md:px-6 py-2.5 md:py-3 rounded-lg text-xs md:text-sm font-bold transition-all min-h-[44px] ${activeTab === 'marketplace' ? 'bg-white dark:bg-black shadow text-green-600' : 'text-gray-500'}`}>
                        {t('Shop')}
                    </button>
                    <button onClick={() => setActiveTab('chats')} className={`flex-1 md:flex-none px-4 md:px-6 py-2.5 md:py-3 rounded-lg text-xs md:text-sm font-bold transition-all min-h-[44px] ${activeTab === 'chats' ? 'bg-white dark:bg-black shadow text-blue-600' : 'text-gray-500'} flex items-center justify-center gap-2`}>
                        {t('Chats')}
                        {(Object.values(conversations) as Conversation[]).reduce((acc, c) => acc + c.unread, 0) > 0 &&
                            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{(Object.values(conversations) as Conversation[]).reduce((acc, c) => acc + c.unread, 0)}</span>
                        }
                    </button>
                </div>

                {activeTab === 'marketplace' && (
                    <div className="w-full md:w-96 flex gap-2 mt-2 md:mt-0">
                        <div className="relative flex-1">
                            <span className="material-icons-round absolute left-3 top-2.5 text-gray-400 text-lg md:text-2xl">search</span>
                            <input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t('Search products')}
                                className="w-full pl-9 md:pl-10 pr-3 md:pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-none rounded-xl text-xs md:text-sm font-bold outline-none focus:ring-2 focus:ring-green-500/20"
                            />
                        </div>
                        <button onClick={() => setIsSellModalOpen(true)} className="bg-black dark:bg-white text-white dark:text-black px-3 md:px-4 lg:px-6 rounded-xl font-bold text-xs md:text-sm whitespace-nowrap hover:scale-105 transition-transform shadow-lg flex items-center gap-1.5 md:gap-2 min-h-[44px]">
                            <span className="material-icons-round text-sm">add</span> {t('Sell')}
                        </button>
                    </div>
                )}
            </div>

            {/* TAB CONTENT */}

            {activeTab === 'forum' ? (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-8">
                    {/* Forum Sidebar - NOW REAL DATA */}
                    <div className="hidden lg:block space-y-6 sticky top-24 h-fit">
                        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-[2rem] p-6 text-white text-center shadow-lg shadow-green-500/20 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
                            <img src={user?.avatar || "https://i.pravatar.cc/150?u=guest"} className="w-20 h-20 rounded-2xl mx-auto mb-4 border-4 border-white/20 shadow-xl" alt="Profile" />
                            <h3 className="text-xl font-black">{user?.name || 'Guest Farmer'}</h3>
                            <p className="opacity-80 text-sm mb-4">Member since 2026</p>
                            <div className="grid grid-cols-3 gap-2 text-xs font-bold border-t border-white/20 pt-4">
                                <div>
                                    <span className="block text-lg">{userStats.posts}</span>
                                    {t('Posts')}
                                </div>
                                <div>
                                    <span className="block text-lg">{userStats.likes}</span>
                                    {t('Likes')}
                                </div>
                                <div>
                                    <span className="block text-lg">{userStats.sold}</span>
                                    {t('Sold')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-3 space-y-3 md:space-y-6">
                        {/* Create Post */}
                        <div className="bg-white dark:bg-surface-dark p-3 md:p-6 rounded-2xl md:rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-800">
                            {/* ... same create post UI ... */}
                            <div className="flex gap-3 md:gap-4">
                                <div className="flex-1">
                                    <textarea
                                        placeholder={t('Ask a question or share')}
                                        className="w-full bg-gray-50 dark:bg-gray-800/50 rounded-xl md:rounded-2xl p-3 md:p-4 border-none focus:ring-2 focus:ring-primary/20 transition-all resize-none h-20 md:h-24 font-medium text-sm md:text-base"
                                        value={newPostContent}
                                        onChange={(e) => setNewPostContent(e.target.value)}
                                    ></textarea>
                                    <div className="flex justify-between items-center mt-2 md:mt-3">
                                        <div className="flex gap-2">
                                            <input type="file" ref={fileInputRef} onChange={(e) => handleImageSelect(e, setSelectedImage)} className="hidden" accept="image/*" />
                                            <button onClick={() => fileInputRef.current?.click()} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-gray-500 hover:text-primary transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><span className="material-icons-round">add_photo_alternate</span></button>
                                        </div>
                                        <button onClick={handlePost} disabled={!newPostContent} className="bg-primary text-white px-5 md:px-8 py-2.5 rounded-xl font-bold text-xs md:text-sm shadow-lg shadow-primary/20 hover:bg-[#345f30] transition-all disabled:opacity-50 min-h-[44px]">{t('Post')}</button>
                                    </div>
                                </div>
                                {selectedImage && <img src={selectedImage} className="w-16 h-16 md:w-24 md:h-24 rounded-xl md:rounded-2xl object-cover bg-gray-100 cursor-pointer hover:opacity-50" onClick={() => setSelectedImage(null)} alt="Preview" />}
                            </div>
                        </div>

                        {/* Posts */}
                        {posts.map((post) => (
                            <div key={post.id} className="bg-white dark:bg-surface-dark p-4 md:p-8 rounded-2xl md:rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-800">
                                <div className="flex items-center gap-3 md:gap-4 mb-3 md:mb-4">
                                    <img src={post.avatar} className="w-9 h-9 md:w-12 md:h-12 rounded-xl md:rounded-2xl object-cover" alt="Avatar" />
                                    <div>
                                        <h4 className="font-bold text-gray-900 dark:text-white text-sm md:text-base">{post.author}</h4>
                                        <p className="text-[10px] md:text-xs text-gray-500 font-bold">{post.role} • {new Date(post.timestamp).toDateString()}</p>
                                    </div>
                                </div>
                                <p className="text-gray-700 dark:text-gray-300 mb-3 md:mb-6 text-sm md:text-lg leading-relaxed">{post.content}</p>
                                {post.image && <img src={post.image} className="w-full h-48 md:h-80 object-cover rounded-xl md:rounded-2xl mb-3 md:mb-6" alt="Post" />}

                                <div className="border-t border-gray-100 dark:border-gray-800 pt-3 md:pt-4">
                                    <div className="flex gap-4 md:gap-6 mb-3 md:mb-4">
                                        <button
                                            onClick={() => handleLike(post)}
                                            className={`flex items-center gap-1.5 md:gap-2 font-bold transition-colors text-sm md:text-base min-h-[44px] ${(post.likedBy || []).includes(user?.uid || user?.id)
                                                ? 'text-red-500'
                                                : 'text-gray-400 hover:text-red-500'
                                                }`}
                                        >
                                            <span className="material-icons-round text-xl md:text-2xl">
                                                {(post.likedBy || []).includes(user?.uid || user?.id) ? 'favorite' : 'favorite_border'}
                                            </span>
                                            {post.likes} {t('Likes')}
                                        </button>
                                        <button
                                            onClick={() => toggleComments(post.id)}
                                            className={`flex items-center gap-1.5 md:gap-2 font-bold transition-colors text-sm md:text-base min-h-[44px] ${expandedPostId === post.id ? 'text-blue-500' : 'text-gray-400 hover:text-blue-500'
                                                }`}
                                        >
                                            <span className="material-icons-round text-xl md:text-2xl">comment</span> {post.comments} {t('Comments')}
                                        </button>
                                    </div>

                                    {/* Comments Section */}
                                    {expandedPostId === post.id && (
                                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl md:rounded-2xl p-3 md:p-4 animate-fade-in">
                                            <div className="space-y-3 md:space-y-4 mb-3 md:mb-4 max-h-60 overflow-y-auto custom-scrollbar">
                                                {postComments[post.id]?.length > 0 ? (
                                                    postComments[post.id].map((comment: any) => (
                                                        <div key={comment.id} className="flex gap-2 md:gap-3">
                                                            <img src={comment.authorAvatar || 'https://i.pravatar.cc/150'} className="w-7 h-7 md:w-8 md:h-8 rounded-full flex-shrink-0" />
                                                            <div className="bg-white dark:bg-surface-dark p-2.5 md:p-3 rounded-xl md:rounded-2xl rounded-tl-none shadow-sm text-xs md:text-sm">
                                                                <p className="font-bold text-gray-900 dark:text-white text-xs mb-1">{comment.authorName}</p>
                                                                <p className="text-gray-700 dark:text-gray-300">{comment.text}</p>
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <p className="text-center text-xs text-gray-400 py-2">{t('No comments yet')}</p>
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                                <input
                                                    value={newCommentText}
                                                    onChange={(e) => setNewCommentText(e.target.value)}
                                                    placeholder={t('Write a comment')}
                                                    className="flex-1 bg-white dark:bg-surface-dark rounded-xl px-3 md:px-4 py-2 text-xs md:text-sm border-none focus:ring-1 focus:ring-primary"
                                                    onKeyDown={(e) => e.key === 'Enter' && handleAddComment(post.id)}
                                                />
                                                <button
                                                    onClick={() => handleAddComment(post.id)}
                                                    disabled={!newCommentText.trim()}
                                                    className="p-2 bg-primary text-white rounded-xl disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                                                >
                                                    <span className="material-icons-round text-sm">send</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Load More Button */}
                        {hasMorePosts && (
                            <div className="text-center pt-4">
                                <button
                                    onClick={() => loadData(true)}
                                    disabled={postsLoading}
                                    className="px-8 py-3 bg-gray-100 dark:bg-gray-800 rounded-xl font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 transition-colors"
                                >
                                    {postsLoading ? t('Loading...') : t('Load More Posts')}
                                </button>
                            </div>
                        )}
                        {!hasMorePosts && posts.length > 0 && (
                            <div className="text-center text-gray-400 text-sm font-bold">{t('All caught up')}</div>
                        )}
                    </div>
                </div>
            ) : activeTab === 'marketplace' ? (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Categories Sidebar */}
                    <div className="hidden lg:block relative z-30">
                        <div className="bg-white dark:bg-surface-dark rounded-[2rem] p-6 shadow-sm border border-gray-100 dark:border-gray-800 sticky top-24">
                            <h3 className="font-bold text-lg mb-4 text-gray-900 dark:text-white">{t('Categories')}</h3>
                            <div className="space-y-2">
                                {categories.map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => setActiveCategory(cat)}
                                        className={`w-full text-left px-4 py-3 rounded-xl font-bold text-sm transition-all flex justify-between items-center ${activeCategory === cat ? 'bg-black text-white dark:bg-white dark:text-black shadow-lg' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                                    >
                                        {cat}
                                        {activeCategory === cat && <span className="material-icons-round text-sm">chevron_right</span>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Products Grid */}
                    <div className="lg:col-span-3">
                        {/* Mobile category filter - horizontal scroll */}
                        <div className="flex lg:hidden gap-2 overflow-x-auto pb-3 -mx-3 px-3 no-scrollbar mb-3">
                            {categories.map(cat => (
                                <button
                                    key={`mob-${cat}`}
                                    onClick={() => setActiveCategory(cat)}
                                    className={`px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${activeCategory === cat ? 'bg-black text-white dark:bg-white dark:text-black shadow-lg' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
                            {filteredMarketItems.map((item) => (
                                <div key={item.id} className="bg-white dark:bg-surface-dark p-3 md:p-4 rounded-2xl md:rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-800 group hover:border-green-400/30 transition-all hover:-translate-y-1">
                                    <div className="relative h-36 md:h-48 mb-3 md:mb-4 overflow-hidden rounded-xl md:rounded-[1.8rem]">
                                        <img src={item.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={item.title || item.name} />
                                        <div className="absolute top-3 left-3 flex gap-2">
                                            {item.isAffiliate && <span className="bg-yellow-400 text-black text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-wide">Featured</span>}
                                            {item.type === 'User Listing' && <span className="bg-white/90 backdrop-blur text-gray-900 text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-wide">Used</span>}
                                        </div>
                                        {/* Pending Badge */}
                                        {item.status === 'pending' && (
                                            <div className="absolute bottom-3 right-3 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-md">
                                                Pending Approval
                                            </div>
                                        )}
                                    </div>
                                    <div className="px-1 md:px-2 pb-1 md:pb-2">
                                        <div className="flex justify-between items-start mb-1.5 md:mb-2">
                                            <div className="flex-1">
                                                <p className="text-[10px] uppercase font-bold text-gray-400 mb-0.5 md:mb-1">{item.category || 'General'}</p>
                                                <h3 className="font-bold text-gray-900 dark:text-white leading-tight line-clamp-1 text-sm md:text-base">{item.title || item.name}</h3>
                                            </div>
                                            <span className="font-black text-base md:text-lg text-primary ml-2">₹{item.price}</span>
                                        </div>
                                        <p className="text-[10px] md:text-xs text-gray-500 mb-3 md:mb-4 line-clamp-2 min-h-[2.5em]">{item.description || "Fresh stock available directly from the supplier."}</p>
                                        <button
                                            // Wire to Chat or Purchase
                                            onClick={() => item.isAffiliate ? setPurchaseItem(item) : startChat(item)}
                                            className="w-full py-2.5 md:py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-transparent font-bold text-xs md:text-sm hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors min-h-[44px]"
                                        >
                                            {item.isAffiliate ? t('Buy Now') : t('Contact Seller')}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {hasMoreMarket && (
                            <div className="text-center pt-8">
                                <button
                                    onClick={() => loadMarketItems(true)}
                                    disabled={marketLoading}
                                    className="px-8 py-3 bg-gray-100 dark:bg-gray-800 rounded-xl font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 transition-colors"
                                >
                                    {marketLoading ? t('Loading Products') : t('Load More Products')}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            ) : ( // activeTab === 'chats'
                <div className="bg-white dark:bg-surface-dark rounded-2xl md:rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden min-h-[400px] md:min-h-[600px] flex flex-col md:flex-row">
                    {/* Chat List */}
                    <div className="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-gray-100 dark:border-gray-800 p-3 md:p-4 overflow-y-auto max-h-[50vh] md:max-h-none">
                        <h2 className="text-base md:text-xl font-black mb-3 md:mb-4 px-1 md:px-2">{t('Messages')}</h2>
                        <div className="space-y-2">
                            {Object.values(conversations).length === 0 ? (
                                <div className="text-center py-16 px-4">
                                    <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                        <span className="material-icons-round text-3xl text-blue-500">forum</span>
                                    </div>
                                    <h3 className="font-bold text-gray-900 dark:text-white mb-1">{t('No conversations yet')}</h3>
                                    <p className="text-sm text-gray-500 mb-4">{t('Start chatting by contacting a seller in the marketplace, or share your farming experience in the forum.')}</p>
                                    <div className="flex flex-col gap-2">
                                        <button onClick={() => setActiveTab('marketplace')} className="bg-primary text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-green-700 transition-colors flex items-center justify-center gap-2">
                                            <span className="material-icons-round text-sm">storefront</span>
                                            {t('Browse Market')}
                                        </button>
                                        <button onClick={() => setActiveTab('forum')} className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-gray-200 transition-colors flex items-center justify-center gap-2">
                                            <span className="material-icons-round text-sm">groups</span>
                                            {t('Join the Forum')}
                                        </button>
                                    </div>
                                </div>
                            ) : (Object.values(conversations) as Conversation[]).map(conv => (
                                <div key={conv.id} className="relative group">
                                    <button
                                        onClick={() => restoreChat(conv.id)}
                                        className="w-full text-left p-4 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors flex items-center gap-4 relative"
                                    >
                                        <div className="relative flex-shrink-0">
                                            <img src={conv.sellerAvatar} className="w-10 h-10 md:w-12 md:h-12 rounded-full object-cover" />
                                            {/* Online indicator mock */}
                                            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-baseline mb-1">
                                                <h4 className="font-bold text-gray-900 dark:text-white truncate">{conv.sellerName}</h4>
                                                <span className="text-[10px] text-gray-400 font-bold">{conv.lastMessageTime}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 truncate group-hover:text-gray-700 dark:text-gray-300 font-medium">{conv.messages[conv.messages.length - 1]?.text}</p>
                                            <p className="text-[10px] text-primary mt-1 truncate">Re: {conv.itemTitle}</p>
                                        </div>
                                        {conv.unread > 0 && <span className="bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full absolute right-4 bottom-4">{conv.unread}</span>}
                                    </button>
                                    {/* Delete button - appears on hover */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm(`Delete conversation with ${conv.sellerName}?`)) {
                                                firebaseService.deleteConversation(conv.id);
                                                if (chatItem?.id === conv.id) setChatItem(null);
                                            }
                                        }}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <span className="material-icons-round text-sm">delete</span>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Chat Placeholder for Desktop when no chat selected (if integrated, but we use Modal for now) */}
                    {/* Since we use Modal for chatItem, this space is just a placeholder or could show 'Select a chat' */}
                    {/* Chat Area - Inline */}
                    <div className="hidden md:flex flex-1 bg-gray-50/50 dark:bg-black/20 relative">
                        {chatItem ? (
                            <div className="absolute inset-0">
                                <UserChat
                                    key={chatItem.id}
                                    sellerName={chatItem.sellerName || 'Seller'}
                                    itemTitle={chatItem.title || chatItem.name || 'Item'}
                                    itemPrice={chatItem.price || 0}
                                    messages={conversations[chatItem.id?.toString()]?.messages || []}
                                    onSendMessage={handleSendMessage}
                                    onClose={() => setChatItem(null)}
                                    // Empty handler for minimize as we don't need it inline
                                    onMinimize={() => { }}
                                    isInline={true}
                                    chatId={chatItem.id?.toString()}
                                    currentUserId={user?.id?.toString()}
                                />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-center p-8 w-full h-full opacity-50">
                                <div className="w-24 h-24 bg-gray-200 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <span className="material-icons-round text-4xl text-gray-400">forum</span>
                                </div>
                                <h3 className="text-xl font-bold mb-2">{t('Select a Conversation')}</h3>
                                <p>{t('Choose a chat from the left')}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Sell Modal */}
            {isSellModalOpen && (
                <div onClick={() => setIsSellModalOpen(false)} className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 animate-fade-in">
                    <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-surface-dark w-full max-w-lg rounded-t-2xl md:rounded-[2.5rem] p-5 md:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto">
                        <button onClick={() => setIsSellModalOpen(false)} className="absolute top-4 right-4 md:top-6 md:right-6 w-10 h-10 md:w-8 md:h-8 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors min-w-[44px] min-h-[44px]"><span className="material-icons-round text-sm">close</span></button>
                        <h2 className="text-xl md:text-2xl font-black mb-1">{t('List Item')}</h2>
                        <p className="text-xs md:text-sm text-gray-500 mb-4 md:mb-6">{t('Sell to farmers')}</p>

                        <div className="space-y-4">
                            <input value={sellTitle} onChange={e => setSellTitle(e.target.value)} placeholder="Product Title (e.g. Tractor) *" className="w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-800 border-none font-bold outline-none focus:ring-2 focus:ring-primary/20" />
                            <input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)} placeholder="Price (₹) *" className="w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-800 border-none font-bold outline-none focus:ring-2 focus:ring-primary/20" />
                            <textarea value={sellDesc} onChange={e => setSellDesc(e.target.value)} placeholder="Description... *" className="w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-800 border-none font-medium h-32 resize-none outline-none focus:ring-2 focus:ring-primary/20"></textarea>

                            {/* Image Upload */}
                            <div className="w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors" onClick={() => document.getElementById('sell-image-input')?.click()}>
                                <span className={sellImage ? "text-green-600 font-bold" : "text-gray-400 font-bold"}>
                                    {sellImage ? "Image Selected" : "Upload Image *"}
                                </span>
                                <span className="material-icons-round text-gray-400">add_photo_alternate</span>
                                <input
                                    id="sell-image-input"
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={(e) => handleImageSelect(e, setSellImage)}
                                />
                            </div>
                            {sellImage && <img src={sellImage} className="w-full h-32 object-cover rounded-xl mt-2" alt="Preview" />}
                        </div>
                        <button onClick={handleSellItem} className="w-full mt-8 bg-black dark:bg-white text-white dark:text-black py-4 rounded-xl font-bold text-lg shadow-xl hover:scale-[1.02] transition-transform">{t('List for Sale')}</button>
                    </div>
                </div>
            )}

            {/* Payment Modal */}
            {purchaseItem && (
                <PaymentModal
                    amount={purchaseItem.price}
                    itemTitle={purchaseItem.title || purchaseItem.name}
                    onClose={() => setPurchaseItem(null)}
                    onSuccess={async () => {
                        // Handle removal if it's a user listing
                        if (!purchaseItem.isAffiliate && purchaseItem.id) {
                            await firebaseService.deleteMarketItem(purchaseItem.id);
                        }

                        setPurchaseItem(null);
                        loadData(); // Refresh list to show it's gone
                        toast.success('Order Placed Successfully! Item removed from market.');
                    }}
                />
            )}

            {/* Minimized Chat Heads - REMOVED (Inline Chat) */}
        </div>
    );
};

export default Community;