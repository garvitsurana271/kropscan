import React, { useEffect, useState } from 'react';
import { dbService } from '../services/DatabaseService';
import { firebaseService } from '../services/FirebaseService';

const AdminCommunity: React.FC = () => {
    const [posts, setPosts] = useState<any[]>([]);

    useEffect(() => {
        loadPosts();
    }, []);

    const loadPosts = async () => {
        // Fetch from Firebase (Cloud) - now returns { posts, lastDoc }
        const { posts } = await firebaseService.getPosts();
        setPosts(posts);
    };

    const handleDelete = async (id: string) => {
        if (confirm('Permanently delete this post?')) {
            await firebaseService.deletePost(id);
            loadPosts();
        }
    };

    return (
        <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8 animate-fade-in">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-2">Community Moderation</h1>
                    <p className="text-gray-500">Review and remove inappropriate content.</p>
                </div>
                <button onClick={loadPosts} className="p-2 bg-white dark:bg-surface-dark rounded-xl border hover:text-primary"><span className="material-icons-round">refresh</span></button>
            </div>

            <div className="space-y-4">
                {posts.length === 0 ? (
                    <div className="text-center py-20 text-gray-400">No posts found.</div>
                ) : (
                    posts.map((post) => (
                        <div key={post.id} className="bg-white dark:bg-surface-dark p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col md:flex-row gap-6 items-start">
                            <img src={post.image || post.avatar} className="w-24 h-24 rounded-2xl object-cover bg-gray-100" />
                            <div className="flex-1">
                                <div className="flex justify-between">
                                    <h3 className="font-bold text-lg text-gray-900 dark:text-white">{post.author}</h3>
                                    <span className="text-xs text-gray-400 font-bold">{new Date(post.timestamp).toLocaleDateString()}</span>
                                </div>
                                <p className="text-gray-600 dark:text-gray-300 mt-2">{post.content}</p>
                            </div>
                            <button
                                onClick={() => post.id && handleDelete(post.id)}
                                className="px-4 py-2 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl font-bold text-sm transition-colors whitespace-nowrap"
                            >
                                Delete Post
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default AdminCommunity;
