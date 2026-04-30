import { firebaseService } from './FirebaseService';
import { collection, doc, setDoc, onSnapshot, getDoc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';

export class CallService {
    private peerConnection: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private remoteStream: MediaStream | null = null;
    private callDocRef: any = null;
    private unsubscribeCallDoc: (() => void) | null = null;
    private unsubscribeCandidates: (() => void) | null = null;

    private readonly ICE_SERVERS = {
        iceServers: [
            {
                urls: [
                    'stun:stun1.l.google.com:19302',
                    'stun:stun2.l.google.com:19302',
                ],
            },
        ],
    };

    constructor() { }

    async startLocalStream(video: boolean = true, audio: boolean = true): Promise<MediaStream> {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ video, audio });
            return this.localStream;
        } catch (error) {
            console.error('Error accessing media devices.', error);
            throw error;
        }
    }

    getLocalStream() {
        return this.localStream;
    }

    getRemoteStream() {
        return this.remoteStream;
    }

    private setupPeerConnection(
        onRemoteStream: (stream: MediaStream) => void,
        onStatusChange: (status: 'disconnected' | 'connected' | 'failed') => void
    ) {
        this.peerConnection = new RTCPeerConnection(this.ICE_SERVERS);
        this.remoteStream = new MediaStream();

        if (this.localStream) {
            this.localStream.getTracks().forEach((track) => {
                this.peerConnection?.addTrack(track, this.localStream!);
            });
        }

        this.peerConnection.ontrack = (event) => {
            event.streams[0].getTracks().forEach((track) => {
                this.remoteStream?.addTrack(track);
            });
            if (this.remoteStream?.getTracks().length! > 0) {
                onRemoteStream(this.remoteStream);
            }
        };

        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE Connection State:', this.peerConnection?.iceConnectionState);
            if (this.peerConnection?.iceConnectionState === 'disconnected') {
                onStatusChange('disconnected');
            } else if (this.peerConnection?.iceConnectionState === 'connected') {
                onStatusChange('connected');
            } else if (this.peerConnection?.iceConnectionState === 'failed') {
                onStatusChange('failed');
            }
        };

        return this.peerConnection;
    }

    async initiateCall(
        chatId: string,
        callerId: string,
        receiverId: string,
        isVideo: boolean,
        onRemoteStream: (stream: MediaStream) => void,
        onStatusChange: (status: 'disconnected' | 'connected' | 'failed' | 'rejected' | 'ended') => void
    ) {
        const db = firebaseService['db']; // Accessing internal db from FirebaseService
        if (!db) throw new Error("Firebase DB not initialized");

        this.setupPeerConnection(onRemoteStream, onStatusChange);

        const pc = this.peerConnection!;
        this.callDocRef = doc(collection(db, 'calls'), chatId);

        const offerCandidatesRef = collection(this.callDocRef, 'offerCandidates');
        const answerCandidatesRef = collection(this.callDocRef, 'answerCandidates');

        pc.onicecandidate = async (event) => {
            if (event.candidate) {
                await addDoc(offerCandidatesRef, event.candidate.toJSON());
            }
        };

        const offerDescription = await pc.createOffer();
        await pc.setLocalDescription(offerDescription);

        const callData = {
            offer: {
                type: offerDescription.type,
                sdp: offerDescription.sdp,
            },
            callerId,
            receiverId,
            isVideo,
            status: 'calling', // 'calling', 'answered', 'rejected', 'ended'
            timestamp: Date.now()
        };

        await setDoc(this.callDocRef, callData);

        // Listen for remote answer
        this.unsubscribeCallDoc = onSnapshot(this.callDocRef, (snapshot) => {
            const data = snapshot.data();
            if (!pc.currentRemoteDescription && data?.answer) {
                const answerDescription = new RTCSessionDescription(data.answer);
                pc.setRemoteDescription(answerDescription);
            }
            if (data?.status === 'rejected') {
                onStatusChange('rejected');
                this.endCall();
            } else if (data?.status === 'ended') {
                onStatusChange('ended');
                this.endCall();
            } else if (data?.status === 'answered') {
                // UI can show connected state, or rely on ICE state
            }
        });

        // Listen for remote ICE candidates
        this.unsubscribeCandidates = onSnapshot(answerCandidatesRef, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    pc.addIceCandidate(candidate);
                }
            });
        });
    }

    async answerCall(
        chatId: string,
        onRemoteStream: (stream: MediaStream) => void,
        onStatusChange: (status: 'disconnected' | 'connected' | 'failed' | 'ended') => void
    ) {
        const db = firebaseService['db'];
        if (!db) throw new Error("Firebase DB not initialized");

        this.callDocRef = doc(collection(db, 'calls'), chatId);
        const callDoc = await getDoc(this.callDocRef);
        const callData: any = callDoc.data();

        if (!callData?.offer) {
            throw new Error("No call offer found to answer.");
        }

        this.setupPeerConnection(onRemoteStream, onStatusChange);
        const pc = this.peerConnection!;

        const offerCandidatesRef = collection(this.callDocRef, 'offerCandidates');
        const answerCandidatesRef = collection(this.callDocRef, 'answerCandidates');

        pc.onicecandidate = async (event) => {
            if (event.candidate) {
                await addDoc(answerCandidatesRef, event.candidate.toJSON());
            }
        };

        const offerDescription = new RTCSessionDescription(callData.offer);
        await pc.setRemoteDescription(offerDescription);

        const answerDescription = await pc.createAnswer();
        await pc.setLocalDescription(answerDescription);

        const answer = {
            type: answerDescription.type,
            sdp: answerDescription.sdp,
        };

        await updateDoc(this.callDocRef, { answer, status: 'answered' });

        this.unsubscribeCandidates = onSnapshot(offerCandidatesRef, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    pc.addIceCandidate(new RTCIceCandidate(data));
                }
            });
        });

        this.unsubscribeCallDoc = onSnapshot(this.callDocRef, (snapshot) => {
            const data = snapshot.data();
            if (data?.status === 'ended') {
                onStatusChange('ended');
                this.endCall();
            }
        });
    }

    async emitReadyState(chatId: string, callerId: string, isVideo: boolean) {
        const db = firebaseService['db'];
        if (!db) return;
        // Send a system message via FirebaseService instead of creating a raw doc 
        // so it triggers the chat UI for the receiver
        await firebaseService.sendMessage(chatId, `CALL_INITIATED|${callerId}|${isVideo ? 'VIDEO' : 'AUDIO'}`, 'text');
    }

    async rejectCall(chatId: string) {
        const db = firebaseService['db'];
        if (!db) return;
        const callDocRef = doc(collection(db, 'calls'), chatId);
        await updateDoc(callDocRef, { status: 'rejected' });
        await firebaseService.sendMessage(chatId, `CALL_REJECTED`, 'text');
        this.endCall();
    }

    async endCall(chatId?: string) {
        if (this.unsubscribeCallDoc) this.unsubscribeCallDoc();
        if (this.unsubscribeCandidates) this.unsubscribeCandidates();

        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        this.remoteStream = null;

        if (chatId) {
            const db = firebaseService['db'];
            if (db) {
                const callDocRef = doc(collection(db, 'calls'), chatId);
                try {
                    await updateDoc(callDocRef, { status: 'ended' });
                } catch (e) {
                    // Might be deleted already
                }
            }
        }
    }
}

export const callService = new CallService();
