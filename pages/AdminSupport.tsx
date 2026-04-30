import React, { useEffect, useState } from 'react';
import { dbService } from '../services/DatabaseService';
import { firebaseService } from '../services/FirebaseService';

const AdminSupport: React.FC = () => {
    const [tickets, setTickets] = useState<any[]>([]);

    useEffect(() => {
        loadTickets();
    }, []);

    const loadTickets = async () => {
        // Fetch from Firebase (Cloud)
        const data = await firebaseService.getTickets(true); // Get all including resolved
        setTickets(data);
    };

    const handleResolve = async (id: string) => { // Firebase uses string ids
        await firebaseService.resolveTicket(id);
        loadTickets();
    };

    return (
        <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8 animate-fade-in">
            <div>
                <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-2">Support Tickets</h1>
                <p className="text-gray-500">Assist users with technical issues.</p>
            </div>

            <div className="bg-white dark:bg-surface-dark rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-800 p-6">
                <div className="space-y-4">
                    {tickets.length === 0 ? (
                        <div className="text-center py-10 text-gray-400">No support tickets found.</div>
                    ) : (
                        tickets.map(ticket => (
                            <div key={ticket.id} className="flex flex-col md:flex-row md:items-center justify-between p-6 border border-gray-100 dark:border-gray-800 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors gap-4">
                                <div className="flex gap-4 items-start">
                                    <div className={`mt-2 w-3 h-3 flex-shrink-0 rounded-full ${ticket.status === 'Open' ? 'bg-red-500 shadow-lg shadow-red-500/50' : 'bg-green-500'}`}></div>
                                    <div>
                                        <h4 className="font-black text-lg text-gray-900 dark:text-white mb-1">{ticket.title}</h4>
                                        <p className="text-gray-600 dark:text-gray-300 mb-2">{ticket.description}</p>
                                        <p className="text-xs text-gray-500 font-bold bg-gray-100 dark:bg-gray-800 inline-block px-2 py-1 rounded">
                                            {ticket.userName} • {new Date(ticket.timestamp).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                                {ticket.status === 'Open' ? (
                                    <button
                                        onClick={() => handleResolve(ticket.id)}
                                        className="bg-primary text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-green-700 transition-colors shadow-lg shadow-green-500/20 whitespace-nowrap"
                                    >
                                        Mark Resolved
                                    </button>
                                ) : (
                                    <span className="text-gray-400 text-sm font-bold px-4 flex items-center gap-1">
                                        <span className="material-icons-round text-sm">check_circle</span> Resolved
                                    </span>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminSupport;
