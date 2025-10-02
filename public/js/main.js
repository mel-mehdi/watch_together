// ========================================
// OPTIMIZED WATCH TOGETHER APP
// ========================================

// ========================================
// 1. CONSTANTS AND CONFIGURATION
// ========================================
const CONFIG = {
    SYNC_INTERVAL_MS: 5000,
    MESSAGE_TIMEOUT: 5000,
    VIDEO_LOAD_TIMEOUT: 5000,
    YOUTUBE_API_TIMEOUT: 3000,
    ICE_SERVERS: [{ urls: 'stun:stun.l.google.com:19302' }]
};

const VIDEO_TYPES = {
    YOUTUBE: 'youtube',
    VIMEO: 'vimeo',
    DIRECT: 'direct',
    FACEBOOK: 'facebook',
    TWITCH: 'twitch',
    DAILYMOTION: 'dailymotion'
};

const PLAYER_STATES = {
    UNSTARTED: -1,
    ENDED: 0,
    PLAYING: 1,
    PAUSED: 2,
    BUFFERING: 3,
    CUED: 5
};

// ========================================
// 2. STATE MANAGEMENT
// ========================================
class AppState {
    constructor() {
        this.authToken = localStorage.getItem('authToken');
        this.userData = this.parseUserData();
        this.isGuestMode = localStorage.getItem('guestMode') === 'true';
        this.username = '';
        this.isAdmin = false;
        this.currentAdminUser = '';
        this.requestingUserId = '';
        this.currentVideoType = '';
        this.ignoreEvents = false;
        this.syncInterval = null;
        this.lastKnownAdminTime = 0;
        this.lastSyncTime = 0;
        this.youtubeListenerSetup = false;
        
        // System message configuration
        this.systemMessageConfig = {
            showJoinLeaveMessages: false,
            showAdminChangeMessages: false,
            showVideoChangeMessages: false,
            showCriticalMessages: false
        };
    }

    parseUserData() {
        const userData = localStorage.getItem('userData');
        if (userData) {
            try {
                return JSON.parse(userData);
            } catch (e) {
                localStorage.removeItem('userData');
                return null;
            }
        }
        return null;
    }

    updateUserData(data) {
        this.userData = data;
        if (data) {
            localStorage.setItem('userData', JSON.stringify(data));
        } else {
            localStorage.removeItem('userData');
        }
    }

    setGuestMode(enabled) {
        this.isGuestMode = enabled;
        if (enabled) {
            localStorage.setItem('guestMode', 'true');
        } else {
            localStorage.removeItem('guestMode');
        }
    }
}

// ========================================
// 3. DOM ELEMENTS CACHE
// ========================================
class DOMCache {
    constructor() {
        this.elements = new Map();
        this.cacheElements();
    }

    cacheElements() {
        const elementIds = [
            'form', 'input', 'messages', 'username-modal', 'username-input', 'username-submit',
            'video-player', 'direct-video-player', 'video-url', 'change-video',
            'admin-controls', 'admin-notice', 'request-admin',
            'admin-request-modal', 'admin-request-message', 'accept-admin-request', 'reject-admin-request',
            'admin-play', 'admin-pause', 'admin-restart', 'admin-viewing-notice',
            'users-in-call', 'video-history-btn', 'video-history',
            'invite-modal', 'invite-button', 'close-invite-modal', 'invite-link', 'copy-invite-link',
            'room-settings', 'video-history-btn', 'exit-room-btn',
            'room-settings-modal', 'close-room-settings-modal', 'close-room-settings-btn',
            'voice-chat-toggle'
        ];

        elementIds.forEach(id => {
            this.elements.set(id, document.getElementById(id));
        });
    }

    get(id) {
        return this.elements.get(id);
    }

    refresh(id) {
        this.elements.set(id, document.getElementById(id));
        return this.elements.get(id);
    }
}

// ========================================
// 4. UTILITY FUNCTIONS
// ========================================
class Utils {
    static detectVideoType(url) {
        if (!url) return null;
        url = url.trim();

        if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
            return VIDEO_TYPES.YOUTUBE;
        }
        if (url.includes('vimeo.com/')) {
            return VIDEO_TYPES.VIMEO;
        }
        if (url.match(/\.(mp4|webm|ogg|mov)($|\?)/i)) {
            return VIDEO_TYPES.DIRECT;
        }
        if (url.includes('facebook.com/') && url.includes('/videos/')) {
            return VIDEO_TYPES.FACEBOOK;
        }
        if (url.includes('twitch.tv/')) {
            return VIDEO_TYPES.TWITCH;
        }
        if (url.includes('dailymotion.com/') || url.includes('dai.ly/')) {
            return VIDEO_TYPES.DAILYMOTION;
        }
        if (url.match(/\.(mp4|webm|ogg|ogv|mov|avi|mkv|flv|wmv|m4v)($|\?)/i)) {
            return VIDEO_TYPES.DIRECT;
        }
        return VIDEO_TYPES.DIRECT;
    }

    static extractYouTubeId(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    static getVideoMimeType(url) {
        const extension = url.split('.').pop().toLowerCase().split('?')[0];
        const mimeTypes = {
            mp4: 'video/mp4',
            webm: 'video/webm',
            ogg: 'video/ogg',
            ogv: 'video/ogg',
            avi: 'video/x-msvideo',
            mov: 'video/quicktime'
        };
        return mimeTypes[extension] || 'video/mp4';
    }

    static extractRoomIdFromURL() {
        const path = window.location.pathname;
        const roomMatch = path.match(/^\/room\/([A-Z0-9]{8})$/i);
        return roomMatch ? roomMatch[1] : null;
    }

    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    static throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
}

// ========================================
// 5. NOTIFICATION SYSTEM
// ========================================
class NotificationSystem {
    static show(message, type = 'info') {
        console.log(`${type.toUpperCase()}: ${message}`);
    }
    static initializeStyles() {}
}

// ========================================
// 6. SOCKET MANAGER
// ========================================
class SocketManager {
    constructor(appState) {
        this.appState = appState;
        this.socket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.eventHandlers = new Map();
        this.eventQueue = []; // Initialize event queue
    }

    initialize() {
        this.socket = io({
            auth: { token: this.appState.authToken },
            transports: ['websocket', 'polling']
        });

        this.setupEventListeners();
        return this.socket;
    }

    setupEventListeners() {
        // Connection events
        this.socket.on('connect', () => {
            console.log('Socket connected');
            this.reconnectAttempts = 0;
            this.processEventQueue(); // Process any queued events
        });

        this.socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            if (reason === 'io server disconnect') {
                this.socket.connect();
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.handleReconnection();
        });
    }

    handleReconnection() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => {
                console.log(`Reconnection attempt ${this.reconnectAttempts}`);
                this.socket.connect();
            }, this.reconnectDelay * this.reconnectAttempts);
        } else {
            NotificationSystem.show('Connection lost. Please refresh the page.', 'error');
        }
    }

    on(event, handler) {
        this.socket.on(event, handler);
        this.eventHandlers.set(event, handler);
    }

    emit(event, data) {
        if (this.socket && this.socket.connected) {
            this.socket.emit(event, data);
        } else {
            console.warn('Socket not connected, queuing event:', event);
            // Queue the event for when socket connects
            this.queueEvent(event, data);
        }
    }

    queueEvent(event, data) {
        this.eventQueue.push({ event, data });
    }

    processEventQueue() {
        if (this.eventQueue?.length) {
            this.eventQueue.forEach(({ event, data }) => {
                this.socket?.connected && this.socket.emit(event, data);
            });
            this.eventQueue = [];
        }
    }

    waitForConnection() {
        return new Promise(resolve => {
            if (this.socket?.connected) resolve();
            else this.socket?.once('connect', resolve) || resolve();
        });
    }

    updateAuthToken(newToken) {
        this.appState.authToken = newToken;
        if (this.socket) {
            this.socket.auth.token = newToken;
            console.log('Socket auth token updated');
        }
    }

    disconnect() {
        this.socket?.disconnect();
    }
}

// ========================================
// 7. VIDEO PLAYER MANAGER
// ========================================
class VideoPlayerManager {
    constructor(appState, domCache, socketManager) {
        this.appState = appState;
        this.dom = domCache;
        this.socket = socketManager;
        this.player = null;
        this.vimeoPlayer = null;
        this.currentVideoUrl = '';
    }

    initialize(videoUrl) {
        if (this.player) {
            this.cleanup();
        }

        this.updateVideoContainerState(!!videoUrl);

        if (!videoUrl) {
            this.clearVideoErrorMessages();
            return;
        }

        this.currentVideoUrl = videoUrl;
        this.appState.currentVideoType = Utils.detectVideoType(videoUrl);
        
        console.log("Detected video type:", this.appState.currentVideoType, "URL:", videoUrl);

        this.showVideoLoadingMessage('Loading video...');

        switch (this.appState.currentVideoType) {
            case VIDEO_TYPES.YOUTUBE:
                this.setupYouTubePlayer(videoUrl);
                break;
            case VIDEO_TYPES.DIRECT:
                this.setupDirectVideoPlayer(videoUrl);
                break;
            default:
                this.showUnsupportedVideoMessage(
                    `${this.appState.currentVideoType} videos are not supported. Please use direct video links (MP4, WebM, etc.) or YouTube links.`
                );
        }
    }

    setupYouTubePlayer(videoUrl) {
        const videoId = Utils.extractYouTubeId(videoUrl);
        if (!videoId) {
            this.showUnsupportedVideoMessage('Invalid YouTube URL. Please check the link and try again.');
            return;
        }

        this.clearVideoErrorMessages();
        const videoPlayer = this.dom.get('video-player');
        const directVideoPlayer = this.dom.get('direct-video-player');
        
        videoPlayer.style.display = 'block';
        directVideoPlayer.style.display = 'none';

        const params = new URLSearchParams({
            enablejsapi: '1', origin: window.location.origin, rel: '0',
            autoplay: '0', controls: '1', modestbranding: '1',
            playsinline: '1', fs: '1', iv_load_policy: '3'
        });

        videoPlayer.src = `https://www.youtube.com/embed/${videoId}?${params}`;
        videoPlayer.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";

        this.setupYouTubeEventHandlers(videoPlayer, videoUrl);
    }

    setupYouTubeEventHandlers(videoPlayer, videoUrl) {
        const onLoad = () => {
            console.log("YouTube iframe loaded");
            this.clearVideoErrorMessages();
            this.setupYouTubeSyncPlayer();
            if (this.appState.isAdmin) setTimeout(() => this.startAdminSync(), 2000);
        };

        const onError = () => {
            console.error("YouTube iframe load error");
            this.showUnsupportedVideoMessage(
                'This YouTube video cannot be embedded due to restrictions. Try downloading and using a direct MP4 link.'
            );
        };

        videoPlayer.onload = onLoad;
        videoPlayer.onerror = onError;
        setTimeout(() => {
            if (videoPlayer.src.includes('youtube.com') && !this.player) onLoad();
        }, CONFIG.YOUTUBE_API_TIMEOUT);
    }

    setupYouTubeSyncPlayer() {
        const videoPlayer = this.dom.get('video-player');
        
        this.player = {
            playerState: PLAYER_STATES.UNSTARTED,
            lastKnownTime: 0,
            initialized: true,

            getCurrentTime: () => new Promise(resolve => {
                try {
                    videoPlayer?.contentWindow?.postMessage(JSON.stringify({
                        event: 'command', func: 'getCurrentTime'
                    }), '*');
                    setTimeout(() => resolve(this.player.lastKnownTime || 0), 100);
                } catch (error) {
                    resolve(this.player.lastKnownTime || 0);
                }
            }),

            getPlayerState: () => Promise.resolve(this.player.playerState),

            seekTo: (time) => {
                try {
                    videoPlayer?.contentWindow?.postMessage(JSON.stringify({
                        event: 'command', func: 'seekTo', args: [time, true]
                    }), '*');
                    this.player.lastKnownTime = time;
                } catch (error) {
                    console.error("Error seeking:", error);
                }
            },

            playVideo: () => {
                try {
                    videoPlayer?.contentWindow?.postMessage(JSON.stringify({
                        event: 'command', func: 'playVideo'
                    }), '*');
                    this.player.playerState = PLAYER_STATES.PLAYING;
                } catch (error) {
                    console.error("Error playing:", error);
                }
            },

            pauseVideo: () => {
                try {
                    videoPlayer?.contentWindow?.postMessage(JSON.stringify({
                        event: 'command', func: 'pauseVideo'
                    }), '*');
                    this.player.playerState = PLAYER_STATES.PAUSED;
                } catch (error) {
                    console.error("Error pausing:", error);
                }
            }
        };
    }

    setupDirectVideoPlayer(videoUrl) {
        const videoPlayer = this.dom.get('video-player');
        const directVideoPlayer = this.dom.get('direct-video-player');
        
        videoPlayer.style.display = 'none';
        directVideoPlayer.style.display = 'block';
        this.clearVideoErrorMessages();

        const sourceElement = directVideoPlayer.querySelector('source') || 
                            this.createSourceElement(directVideoPlayer, videoUrl);
        sourceElement.src = videoUrl;
        directVideoPlayer.load();
        this.setupDirectVideoEventHandlers(directVideoPlayer);
    }

    createSourceElement(videoElement, url) {
        const source = document.createElement('source');
        source.src = url;
        source.type = Utils.getVideoMimeType(url);
        videoElement.appendChild(source);
        return source;
    }

    setupDirectVideoEventHandlers(directVideoPlayer) {
        this.player = {
            playerState: PLAYER_STATES.PAUSED,
            lastKnownTime: 0,
            getCurrentTime: () => Promise.resolve(directVideoPlayer.currentTime || 0),
            getPlayerState: () => Promise.resolve(directVideoPlayer.paused ? PLAYER_STATES.PAUSED : PLAYER_STATES.PLAYING),
            seekTo: (time) => {
                if (directVideoPlayer.duration && time <= directVideoPlayer.duration) {
                    directVideoPlayer.currentTime = time;
                    this.player.lastKnownTime = time;
                }
            },
            playVideo: () => {
                directVideoPlayer.play()?.then(() => {
                    this.player.playerState = PLAYER_STATES.PLAYING;
                }).catch(console.error);
            },
            pauseVideo: () => {
                directVideoPlayer.pause();
                this.player.playerState = PLAYER_STATES.PAUSED;
            }
        };

        const emitIfAdmin = (event, data) => {
            if (this.appState.isAdmin && !this.appState.ignoreEvents) {
                this.socket.emit(event, data);
            }
        };

        directVideoPlayer.addEventListener('play', Utils.throttle(() => {
            this.player.playerState = PLAYER_STATES.PLAYING;
            emitIfAdmin('video play', directVideoPlayer.currentTime);
            emitIfAdmin('admin action', 'play');
        }, 100));

        directVideoPlayer.addEventListener('pause', Utils.throttle(() => {
            this.player.playerState = PLAYER_STATES.PAUSED;
            emitIfAdmin('video pause', directVideoPlayer.currentTime);
            emitIfAdmin('admin action', 'pause');
        }, 100));

        directVideoPlayer.addEventListener('seeked', Utils.throttle(() => {
            this.player.lastKnownTime = directVideoPlayer.currentTime;
            emitIfAdmin('video seek', directVideoPlayer.currentTime);
        }, 100));

        directVideoPlayer.addEventListener('loadedmetadata', () => {
            console.log("Video loaded, duration:", directVideoPlayer.duration);
            this.clearVideoErrorMessages();
            if (this.appState.isAdmin) setTimeout(() => this.startAdminSync(), 1000);
        });

        directVideoPlayer.addEventListener('error', (e) => this.handleVideoError(e.target.error));
    }

    handleVideoError(error) {
        let errorMessage = "Failed to load video. Please try a different video format (MP4, WebM, OGG).";
        
        if (error) {
            const errorMessages = {
                [error.MEDIA_ERR_ABORTED]: "Video loading was aborted. Please try again.",
                [error.MEDIA_ERR_NETWORK]: "Network error occurred while loading video. Please check your connection.",
                [error.MEDIA_ERR_DECODE]: "Error decoding video. The video file may be corrupted.",
                [error.MEDIA_ERR_SRC_NOT_SUPPORTED]: "Video format not supported. Please use MP4, WebM, or OGG format."
            };
            errorMessage = errorMessages[error.code] || errorMessage;
        }
        
        this.showUnsupportedVideoMessage(errorMessage);
    }

    updateVideoContainerState(hasVideo) {
        const videoContainer = document.querySelector('.video-container');
        videoContainer?.classList.toggle('has-video', hasVideo);
    }

    showVideoLoadingMessage(message) {
        this.clearVideoErrorMessages();
        this.createMessageContainer('video-loading-container', message, '#4CAF50', 'fa-spinner fa-spin');
    }

    showUnsupportedVideoMessage(message) {
        this.clearVideoErrorMessages();
        this.createMessageContainer('video-error-container', message, '#667eea', 'fa-video');
    }

    createMessageContainer(className, message, color, icon) {
        const videoPlayer = this.dom.get('video-player');
        const directVideoPlayer = this.dom.get('direct-video-player');
        
        videoPlayer.style.display = 'none';
        directVideoPlayer.style.display = 'none';

        const container = document.createElement('div');
        container.className = className;
        container.style.cssText = `
            background: linear-gradient(135deg, ${color} 0%, ${color}cc 100%);
            color: white; padding: 40px 20px; text-align: center; border-radius: 12px;
            margin: 20px 0; min-height: 200px; display: flex; flex-direction: column;
            justify-content: center; align-items: center; box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        `;

        container.innerHTML = `
            <div style="background: rgba(255,255,255,0.1); color: white; padding: 12px 20px; margin-bottom: 20px; border-radius: 8px; display: inline-block;">
                <i class="fas ${icon}" style="margin-right: 8px; font-size: 18px;"></i>Video Player
            </div>
            <p style="margin-bottom: 20px; font-size: 16px; line-height: 1.5; max-width: 400px;">
                ${message}
            </p>
        `;

        const videoContainer = directVideoPlayer.parentNode;
        videoContainer.insertBefore(container, directVideoPlayer);
    }

    clearVideoErrorMessages() {
        const containers = document.querySelectorAll('.video-error-container, .video-loading-container, .youtube-error-container');
        containers.forEach(container => container.remove());
    }

    startAdminSync() {
        if (this.appState.syncInterval) {
            clearInterval(this.appState.syncInterval);
        }

        this.appState.syncInterval = setInterval(() => {
            if (this.player && this.appState.isAdmin) {
                this.player.getCurrentTime().then(currentTime => {
                    this.player.getPlayerState().then(playerState => {
                        this.socket.emit('detailed sync', {
                            time: currentTime,
                            state: playerState,
                            timestamp: Date.now()
                        });
                    });
                });
            }
        }, CONFIG.SYNC_INTERVAL_MS);
    }

    stopAdminSync() {
        if (this.appState.syncInterval) {
            clearInterval(this.appState.syncInterval);
            this.appState.syncInterval = null;
        }
    }

    cleanup() {
        this.stopAdminSync();
        this.player = null;
        this.vimeoPlayer = null;
        this.clearVideoErrorMessages();
        this.updateVideoContainerState(false);
    }
}

// ========================================
// 8. VOICE CHAT MANAGER
// ========================================
class VoiceChatManager {
    constructor(appState, domCache, socketManager) {
        this.appState = appState;
        this.dom = domCache;
        this.socket = socketManager;
        this.isInVoiceRoom = false;
        this.isMicEnabled = false;
        this.localStream = null;
        this.peerConnections = {};
        this.audioElements = {};
        this.toggleBtn = null;
    }

    initialize() {
        this.toggleBtn = this.dom.get('voice-chat-toggle');
        this.setupEventListeners();
    }

    setupEventListeners() {
        if (!this.toggleBtn) return;
        
        this.toggleBtn.addEventListener('click', () => {
            this.isInVoiceRoom ? this.leaveVoiceRoom() : this.joinVoiceRoom();
        });

        this.toggleBtn.addEventListener('dblclick', (e) => {
            e.preventDefault();
            if (this.isInVoiceRoom) this.toggleMicrophone();
        });
    }

    async joinVoiceRoom() {
        try {
            this.isInVoiceRoom = true;
            this.socket.emit('join voice room', { username: this.appState.username, listenOnly: true });
            this.updateButtonState();
            // NotificationSystem.show('Joined voice chat - Double-click to enable microphone', 'success');
        } catch (error) {
            console.error('Error joining voice room:', error);
            NotificationSystem.show('Failed to join voice chat', 'error');
            this.isInVoiceRoom = false;
            this.updateButtonState();
        }
    }

    async toggleMicrophone() {
        if (!this.isInVoiceRoom) return;
        this.isMicEnabled ? this.disableMicrophone() : await this.enableMicrophone();
    }

    async enableMicrophone() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.isMicEnabled = true;
            
            // Update existing peer connections
            Object.values(this.peerConnections).forEach(pc => {
                this.localStream.getTracks().forEach(track => {
                    pc.addTrack(track, this.localStream);
                });
            });

            this.socket.emit('microphone enabled', { username: this.appState.username });
            this.updateButtonState();
            // NotificationSystem.show('Microphone enabled - You can now speak', 'success');
        } catch (error) {
            console.error('Error enabling microphone:', error);
            NotificationSystem.show('Failed to access microphone', 'error');
        }
    }

    disableMicrophone() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        this.isMicEnabled = false;
        this.socket.emit('microphone disabled', { username: this.appState.username });
        this.updateButtonState();
        // NotificationSystem.show('Microphone disabled - You can still hear others', 'info');
    }

    leaveVoiceRoom() {
        this.isInVoiceRoom = false;
        this.disableMicrophone();

        // Close all peer connections
        Object.values(this.peerConnections).forEach(pc => pc.close());
        this.peerConnections = {};

        // Remove all audio elements
        Object.values(this.audioElements).forEach(audio => audio.remove());
        this.audioElements = {};

        this.socket.emit('leave voice room');
        this.updateButtonState();
        // NotificationSystem.show('Left voice chat', 'info');
    }

    updateButtonState() {
        if (!this.toggleBtn) return;

        this.toggleBtn.classList.add('state-changing');
        
        setTimeout(() => {
            if (this.isInVoiceRoom) {
                this.toggleBtn.classList.add('active');
                if (this.isMicEnabled) {
                    this.toggleBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                    this.toggleBtn.title = 'Speaking (Click: leave, Double-click: mute)';
                    this.toggleBtn.style.background = 'var(--success-color)';
                } else {
                    this.toggleBtn.innerHTML = '<i class="fas fa-headphones"></i>';
                    this.toggleBtn.title = 'Listening (Click: leave, Double-click: speak)';
                    this.toggleBtn.style.background = 'var(--accent-color)';
                }
            } else {
                this.toggleBtn.classList.remove('active');
                this.toggleBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                this.toggleBtn.title = 'Join voice chat';
                this.toggleBtn.style.background = '';
            }
            setTimeout(() => this.toggleBtn.classList.remove('state-changing'), 150);
        }, 150);
    }

    async createPeerConnection(userId) {
        try {
            const pc = new RTCPeerConnection({ iceServers: CONFIG.ICE_SERVERS });

            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    pc.addTrack(track, this.localStream);
                });
            }

            pc.ontrack = (event) => {
                this.handleIncomingAudio(userId, event.streams[0]);
            };

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.emit('ice candidate', {
                        candidate: event.candidate,
                        to: userId
                    });
                }
            };

            this.peerConnections[userId] = pc;
            return pc;
        } catch (error) {
            console.error('Error creating peer connection:', error);
            return null;
        }
    }

    handleIncomingAudio(userId, stream) {
        if (this.audioElements[userId]) {
            this.audioElements[userId].remove();
        }

        const audio = document.createElement('audio');
        audio.id = `audio-${userId}`;
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.volume = 0.8;
        audio.style.display = 'none';

        document.body.appendChild(audio);
        this.audioElements[userId] = audio;
    }

    cleanup() {
        if (this.isInVoiceRoom) {
            this.leaveVoiceRoom();
        }
    }
}

// ========================================
// 9. MAIN APPLICATION CLASS
// ========================================
class WatchTogetherApp {
    constructor() {
        this.appState = new AppState();
        this.domCache = new DOMCache();
        this.socketManager = new SocketManager(this.appState);
        this.videoPlayer = null;
        this.voiceChat = null;
        this.socket = null;
    }

    async initialize() {
        console.log('🚀 Initializing Watch Together App');
        
        NotificationSystem.initializeStyles();
        this.socket = this.socketManager.initialize();
        this.videoPlayer = new VideoPlayerManager(this.appState, this.domCache, this.socketManager);
        this.voiceChat = new VoiceChatManager(this.appState, this.domCache, this.socketManager);
        
        this.setupEventHandlers();
        this.setupSocketEvents();
        await this.initializeAuth();
        this.initializeUI();
        this.initializeChatFeatures();
        this.voiceChat.initialize();
        
        console.log('✅ App initialization complete');
    }

    setupEventHandlers() {
        // Username submission
        const usernameSubmit = this.domCache.get('username-submit');
        const usernameInput = this.domCache.get('username-input');
        
        if (usernameSubmit) {
            usernameSubmit.addEventListener('click', () => this.handleUsernameSubmit());
        }
        
        if (usernameInput) {
            usernameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handleUsernameSubmit();
            });
        }

        // Message form
        const form = this.domCache.get('form');
        const input = this.domCache.get('input');
        
        if (form) {
            form.addEventListener('submit', (e) => this.handleMessageSubmit(e));
        }

        // Video controls
        const changeVideoBtn = this.domCache.get('change-video');
        if (changeVideoBtn) {
            changeVideoBtn.addEventListener('click', () => this.handleChangeVideo());
        }

        // Admin controls
        this.setupAdminControls();
        
        // Header buttons
        this.setupHeaderButtons();

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => this.cleanup());
    }

    setupAdminControls() {
        const requestAdminBtn = this.domCache.get('request-admin');
        const acceptAdminBtn = this.domCache.get('accept-admin-request');
        const rejectAdminBtn = this.domCache.get('reject-admin-request');

        if (requestAdminBtn) {
            requestAdminBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (!this.appState.isAdmin) {
                    this.socketManager.emit('request admin');
                    NotificationSystem.show(`Request sent to ${this.appState.currentAdminUser || 'admin'}`, 'info');
                }
            });
        }

        if (acceptAdminBtn) {
            acceptAdminBtn.addEventListener('click', () => {
                this.socketManager.emit('transfer admin', this.appState.requestingUserId);
                this.domCache.get('admin-request-modal').style.display = 'none';
            });
        }

        if (rejectAdminBtn) {
            rejectAdminBtn.addEventListener('click', () => {
                this.domCache.get('admin-request-modal').style.display = 'none';
            });
        }
    }

    setupHeaderButtons() {
        const inviteBtn = this.domCache.get('invite-button');
        const roomSettingsBtn = this.domCache.get('room-settings');
        const videoHistoryBtn = this.domCache.get('video-history-btn');
        const exitRoomBtn = this.domCache.get('exit-room-btn');
        const copyInviteLinkBtn = this.domCache.get('copy-invite-link');

        if (inviteBtn) {
            inviteBtn.addEventListener('click', () => this.openInviteModal());
        }

        if (roomSettingsBtn) {
            roomSettingsBtn.addEventListener('click', () => this.openRoomSettingsModal());
        }

        if (videoHistoryBtn) {
            videoHistoryBtn.addEventListener('click', () => this.toggleVideoHistory());
        }

        if (exitRoomBtn) {
            exitRoomBtn.addEventListener('click', () => this.exitRoom());
        }

        if (copyInviteLinkBtn) {
            copyInviteLinkBtn.addEventListener('click', () => this.copyInviteLink());
        }
    }

    setupSocketEvents() {
        // Admin events
        this.socketManager.on('admin status', (status) => {
            this.appState.isAdmin = status;
            this.updateAdminUI();
            status ? this.videoPlayer.startAdminSync() : this.videoPlayer.stopAdminSync();
        });

        this.socketManager.on('admin user', (adminUsername) => {
            this.appState.currentAdminUser = adminUsername;
            this.updateAdminUI();
        });

        this.socketManager.on('admin request', (requestingUsername, requestingUserId) => {
            this.showAdminRequestModal(requestingUsername, requestingUserId);
        });

        // Video sync events
        this.socketManager.on('sync-video', (videoState) => {
            if (videoState.url) {
                this.videoPlayer.initialize(videoState.url);
                const videoUrlInput = this.domCache.get('video-url');
                if (videoUrlInput) videoUrlInput.value = videoState.url;
            }
        });

        this.socketManager.on('change video', (url) => {
            this.videoPlayer.initialize(url);
            const videoUrlInput = this.domCache.get('video-url');
            if (videoUrlInput) videoUrlInput.value = url;
        });

        // Video control events
        this.socketManager.on('video play', (data) => {
            if (!this.videoPlayer.player) return;
            const time = typeof data === 'object' ? data.time : data;
            this.appState.ignoreEvents = true;
            this.videoPlayer.player.seekTo(time);
            this.videoPlayer.player.playVideo();
            setTimeout(() => { this.appState.ignoreEvents = false; }, 500);
        });

        this.socketManager.on('video pause', (data) => {
            if (!this.videoPlayer.player) return;
            const time = typeof data === 'object' ? data.time : data;
            this.appState.ignoreEvents = true;
            this.videoPlayer.player.seekTo(time);
            this.videoPlayer.player.pauseVideo();
            setTimeout(() => { this.appState.ignoreEvents = false; }, 500);
        });

        this.socketManager.on('video seek', (data) => {
            if (!this.appState.isAdmin && this.videoPlayer.player) {
                const time = typeof data === 'object' ? data.time : data;
                this.appState.ignoreEvents = true;
                this.videoPlayer.player.seekTo(time);
                setTimeout(() => { this.appState.ignoreEvents = false; }, 300);
            }
        });

        // Chat & system events
        this.socketManager.on('chat message', (msg) => this.handleChatMessage(msg));
        this.socketManager.on('recent messages', (messageHistory) => this.handleRecentMessages(messageHistory));
        this.socketManager.on('system message', (msg) => this.handleSystemMessage(msg));
        this.socketManager.on('error message', (msg) => NotificationSystem.show(msg, 'error'));
        this.socketManager.on('user count', (count) => this.updateOnlineUsersCount(count));
        this.socketManager.on('user list', (users) => this.updateOnlineUsersCount(users.length));
        this.socketManager.on('video history', (history) => this.displayVideoHistory(history));
        this.socketManager.on('system message config', (config) => this.updateSystemMessageConfig(config));

        // Voice chat events
        this.setupVoiceChatEvents();
    }

    setupVoiceChatEvents() {
        this.socketManager.on('user joined voice', async (userData) => {
            console.log('User joined voice:', userData);
            if (userData.userId !== this.socket.id && this.voiceChat.isMicEnabled) {
                const pc = await this.voiceChat.createPeerConnection(userData.userId);
                if (pc) {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    this.socketManager.emit('voice offer', {
                        offer: pc.localDescription,
                        to: userData.userId
                    });
                }
            }
        });

        this.socketManager.on('user left voice', (userId) => {
            if (this.voiceChat.audioElements[userId]) {
                this.voiceChat.audioElements[userId].remove();
                delete this.voiceChat.audioElements[userId];
            }
            if (this.voiceChat.peerConnections[userId]) {
                this.voiceChat.peerConnections[userId].close();
                delete this.voiceChat.peerConnections[userId];
            }
        });

        this.socketManager.on('voice offer', async (data) => {
            try {
                const pc = this.voiceChat.peerConnections[data.from] || 
                          await this.voiceChat.createPeerConnection(data.from);
                if (!pc) return;

                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                this.socketManager.emit('voice answer', {
                    answer: pc.localDescription,
                    to: data.from
                });
            } catch (error) {
                console.error('Error handling voice offer:', error);
            }
        });

        this.socketManager.on('voice answer', async (data) => {
            try {
                const pc = this.voiceChat.peerConnections[data.from];
                if (pc) {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                }
            } catch (error) {
                console.error('Error handling voice answer:', error);
            }
        });

        this.socketManager.on('ice candidate', async (data) => {
            try {
                const pc = this.voiceChat.peerConnections[data.from];
                if (pc) {
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                }
            } catch (error) {
                console.error('Error adding ICE candidate:', error);
            }
        });
    }

    async initializeAuth() {
        console.log('🔍 Initializing authentication...');
        
        // Check for OAuth token in URL parameters (from Google OAuth redirect)
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');
        
        if (urlToken) {
            console.log('🔑 Found OAuth token in URL, storing it...');
            localStorage.setItem('authToken', urlToken);
            this.appState.authToken = urlToken;
            
            // Update socket authentication with new token
            this.socketManager.updateAuthToken(urlToken);
            
            // Fetch user data with the new token
            this.fetchUserDataFromToken(urlToken).then(async () => {
                // Remove token from URL for security/cleanliness
                const newUrl = window.location.pathname;
                window.history.replaceState({}, document.title, newUrl);
                
                // Continue with normal auth flow
                await this.continueAuthFlow();
            }).catch(async error => {
                console.error('Failed to fetch user data from OAuth token:', error);
                // Clear invalid token and continue
                localStorage.removeItem('authToken');
                this.appState.authToken = null;
                await this.continueAuthFlow();
            });
        } else {
            await this.continueAuthFlow();
        }
    }

    async fetchUserDataFromToken(token) {
        try {
            const response = await fetch('/api/auth/me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.appState.updateUserData(data.user);
                console.log('✅ User data fetched from token:', data.user.username);
            } else {
                throw new Error('Failed to fetch user data');
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
            throw error;
        }
    }

    async continueAuthFlow() {
        const roomId = Utils.extractRoomIdFromURL();
        const isOnRoomPage = !!roomId;

        if (this.appState.authToken && this.appState.userData?.username) {
            console.log('✅ User is authenticated:', this.appState.userData.username);
            this.appState.username = this.appState.userData.username;

            if (isOnRoomPage) {
                // For authenticated users on room page, automatically join them
                this.hideUsernameModal();
                
                // Wait for socket connection before emitting events
                await this.socketManager.waitForConnection();
                
                this.socketManager.emit('user join', this.appState.username);
                
                if (roomId) {
                    await this.autoJoinRoom(roomId);
                }

                this.updateUserInterface();
                console.log('✅ Authenticated user automatically joined room:', roomId);
            } else {
                this.hideUsernameModal();
                // Wait for socket connection before emitting
                await this.socketManager.waitForConnection();
                this.socketManager.emit('user join', this.appState.username);
                this.updateUserInterface();
            }
        } else if (roomId) {
            console.log('🎬 Direct room access, enabling guest mode');
            this.appState.setGuestMode(true);
            this.showUsernameModal();
        } else {
            console.log('🔒 Not authenticated, redirecting to login');
            window.location.href = '/login.html';
        }
    }

    initializeUI() {
        this.updateUserInterface();
        this.setupModalHandlers();
        this.ensureModalsAreHidden();
    }

    ensureModalsAreHidden() {
        // Explicitly ensure all modals are hidden during initialization
        const modals = ['room-settings-modal', 'invite-modal', 'admin-request-modal', 'username-modal'];
        modals.forEach(modalId => {
            const modal = this.domCache.get(modalId);
            if (modal) {
                modal.classList.remove('active');
                // For username modal, also set style.display = 'none' as it uses different styling
                if (modalId === 'username-modal') {
                    modal.style.display = 'none';
                }
            }
        });
    }

    setupModalHandlers() {
        // Invite modal
        const closeInviteModal = this.domCache.get('close-invite-modal');
        const inviteModal = this.domCache.get('invite-modal');
        
        if (closeInviteModal) {
            closeInviteModal.addEventListener('click', () => {
                inviteModal.classList.remove('active');
            });
        }

        if (inviteModal) {
            inviteModal.addEventListener('click', (e) => {
                if (e.target === inviteModal) {
                    inviteModal.classList.remove('active');
                }
            });
        }

        // Room Settings modal
        const closeRoomSettingsModal = this.domCache.get('close-room-settings-modal');
        const closeRoomSettingsBtn = this.domCache.get('close-room-settings-btn');
        const roomSettingsModal = this.domCache.get('room-settings-modal');
        
        if (closeRoomSettingsModal) {
            closeRoomSettingsModal.addEventListener('click', () => {
                roomSettingsModal.classList.remove('active');
            });
        }

        if (closeRoomSettingsBtn) {
            closeRoomSettingsBtn.addEventListener('click', () => {
                roomSettingsModal.classList.remove('active');
            });
        }

        if (roomSettingsModal) {
            roomSettingsModal.addEventListener('click', (e) => {
                if (e.target === roomSettingsModal) {
                    roomSettingsModal.classList.remove('active');
                }
            });
        }

        // System message toggle handlers
        this.setupSystemMessageToggles();
    }

    // Event Handlers
    async handleUsernameSubmit() {
        const usernameInput = this.domCache.get('username-input');
        const usernameModal = this.domCache.get('username-modal');
        
        if (usernameInput?.value.trim()) {
            this.appState.username = usernameInput.value.trim();
            usernameModal.style.display = 'none';

            if (this.appState.isGuestMode) {
                this.appState.updateUserData({ username: this.appState.username });
            }

            // Wait for socket connection before emitting events
            await this.socketManager.waitForConnection();
            
            this.socketManager.emit('user join', this.appState.username);
            
            const roomId = Utils.extractRoomIdFromURL();
            if (roomId) {
                await this.autoJoinRoom(roomId);
            }

            this.updateUserInterface();
            console.log('Username set:', this.appState.username);
        }
    }

    handleMessageSubmit(e) {
        e.preventDefault();
        
        const input = this.domCache.get('input');
        if (!input?.value.trim()) return;

        if (!this.appState.username) {
            NotificationSystem.show('Please set your username first', 'error');
            return;
        }

        this.socketManager.emit('chat message', input.value.trim());
        input.value = '';
    }

    handleChangeVideo() {
        const videoUrlInput = this.domCache.get('video-url');
        
        if (videoUrlInput?.value.trim() && this.appState.isAdmin) {
            this.socketManager.emit('change video', videoUrlInput.value.trim());
        } else if (!this.appState.isAdmin) {
            NotificationSystem.show('Only the admin can change the video for everyone', 'error');
        }
    }

    handleChatMessage(msg) {
        const messages = this.domCache.get('messages');
        if (!messages) return;

        let timeString;
        try {
            const timestamp = msg.timestamp || Date.now();
            const date = new Date(timestamp);
            timeString = isNaN(date.getTime()) ? new Date().toLocaleTimeString() : date.toLocaleTimeString();
        } catch {
            timeString = new Date().toLocaleTimeString();
        }

        const isSentByCurrentUser = msg.username === this.appState.username;
        const lastMessage = messages.lastElementChild;
        const shouldGroup = this.shouldGroupMessages(lastMessage, msg.username, isSentByCurrentUser);
        
        shouldGroup ? 
            this.addToMessageGroup(lastMessage, msg.message, timeString) :
            this.createNewMessageGroup(messages, msg, isSentByCurrentUser, timeString);

        messages.scrollTop = messages.scrollHeight;
    }

    shouldGroupMessages(lastMessage, username, isSentByCurrentUser) {
        if (!lastMessage || lastMessage.classList.contains('system-message')) return false;
        const lastUsername = lastMessage.dataset.username;
        const timeDiff = Date.now() - parseInt(lastMessage.dataset.timestamp);
        return lastUsername === username && timeDiff < 120000;
    }

    addToMessageGroup(messageGroup, messageText, timeString) {
        const messagesContainer = messageGroup.querySelector('.message-group-content');
        const newBubble = document.createElement('div');
        newBubble.className = 'message-bubble';
        newBubble.innerHTML = `
            <span class="message-text">${messageText}</span>
            <span class="message-time">${timeString}</span>
            <div class="message-quick-reactions">
                <span class="quick-reaction" data-emoji="👍">👍</span>
                <span class="quick-reaction" data-emoji="❤️">❤️</span>
                <span class="quick-reaction" data-emoji="😂">😂</span>
                <span class="quick-reaction" data-emoji="😮">😮</span>
                <span class="quick-reaction" data-emoji="😢">😢</span>
            </div>
        `;
        messagesContainer.appendChild(newBubble);
        messageGroup.dataset.timestamp = Date.now().toString();
    }

    createNewMessageGroup(messages, msg, isSentByCurrentUser, timeString) {
        const messageClass = isSentByCurrentUser ? 'message-sent' : 'message-received';
        const avatar = this.generateAvatar(msg.username, msg.avatar);
        
        const messageElement = document.createElement('li');
        messageElement.className = `message-group ${messageClass}`;
        messageElement.dataset.username = msg.username;
        messageElement.dataset.timestamp = Date.now().toString();
        
        messageElement.innerHTML = `
            <div class="message-avatar">${avatar}</div>
            <div class="message-group-content">
                <div class="message-header">
                    <span class="message-username">${msg.username}</span>
                    <span class="message-timestamp">${timeString}</span>
                </div>
                <div class="message-bubble">
                    <span class="message-text">${msg.message}</span>
                    <span class="message-time">${timeString}</span>
                    <div class="message-quick-reactions">
                        <span class="quick-reaction" data-emoji="👍">👍</span>
                        <span class="quick-reaction" data-emoji="❤️">❤️</span>
                        <span class="quick-reaction" data-emoji="😂">😂</span>
                        <span class="quick-reaction" data-emoji="😮">😮</span>
                        <span class="quick-reaction" data-emoji="😢">😢</span>
                    </div>
                </div>
            </div>
        `;

        messages.appendChild(messageElement);
    }

    generateAvatar(username, avatarUrl = null) {
        if (avatarUrl?.trim()) {
            return `<div class="avatar avatar-with-image" style="background-image: url('${avatarUrl}');" title="${username}"></div>`;
        }
        
        const colors = [
            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
            'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
            'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
            'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
            'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)'
        ];
        
        let hash = 0;
        for (let i = 0; i < username.length; i++) {
            hash = username.charCodeAt(i) + ((hash << 5) - hash);
        }
        const colorIndex = Math.abs(hash) % colors.length;
        const initials = username.substring(0, 2).toUpperCase();
        
        return `<div class="avatar" style="background: ${colors[colorIndex]}">${initials}</div>`;
    }

    handleRecentMessages(messageHistory) {
        const messages = this.domCache.get('messages');
        if (!messages || !messageHistory || !Array.isArray(messageHistory)) return;

        // Clear existing messages
        messages.innerHTML = '';

        // Group messages by user and time proximity
        const messageGroups = this.groupMessageHistory(messageHistory);

        // Display each message group
        messageGroups.forEach(group => {
            if (group.isSystemMessage) {
                // Check if this system message should be shown
                if (!this.shouldShowSystemMessage(group.content)) {
                    return; // Skip this system message
                }
                
                // Handle system messages
                const messageElement = document.createElement('li');
                messageElement.className = 'system-message';
                messageElement.innerHTML = `
                    <div class="message-content system">
                        <span class="message-text">${group.content}</span>
                        <span class="message-time">${group.timeString}</span>
                    </div>
                `;
                messages.appendChild(messageElement);
            } else {
                // Handle regular message groups
                const isSentByCurrentUser = group.username === this.appState.username;
                const messageClass = isSentByCurrentUser ? 'message-sent' : 'message-received';
                const avatar = this.generateAvatar(group.username, group.avatar);
                
                const messageElement = document.createElement('li');
                messageElement.className = `message-group ${messageClass}`;
                messageElement.dataset.username = group.username;
                messageElement.dataset.timestamp = group.timestamp.toString();
                
                const bubbles = group.messages.map(msg => `
                    <div class="message-bubble">
                        <span class="message-text">${msg.content}</span>
                        <span class="message-time">${msg.timeString}</span>
                        <div class="message-quick-reactions">
                            <span class="quick-reaction" data-emoji="👍">👍</span>
                            <span class="quick-reaction" data-emoji="❤️">❤️</span>
                            <span class="quick-reaction" data-emoji="😂">😂</span>
                            <span class="quick-reaction" data-emoji="😮">😮</span>
                            <span class="quick-reaction" data-emoji="😢">😢</span>
                        </div>
                    </div>
                `).join('');
                
                messageElement.innerHTML = `
                    <div class="message-avatar">${avatar}</div>
                    <div class="message-group-content">
                        <div class="message-header">
                            <span class="message-username">${group.username}</span>
                            <span class="message-timestamp">${group.timeString}</span>
                        </div>
                        ${bubbles}
                    </div>
                `;

                messages.appendChild(messageElement);
            }
        });

        // Scroll to bottom
        messages.scrollTop = messages.scrollHeight;
    }

    groupMessageHistory(messageHistory) {
        const groups = [];
        let currentGroup = null;

        messageHistory.forEach(msg => {
            // Handle timestamp properly for database messages
            let timeString;
            let timestamp;
            try {
                timestamp = msg.timestamp || msg.createdAt || Date.now();
                const date = new Date(timestamp);
                if (isNaN(date.getTime())) {
                    timeString = new Date().toLocaleTimeString();
                    timestamp = Date.now();
                } else {
                    timeString = date.toLocaleTimeString();
                }
            } catch (error) {
                timeString = new Date().toLocaleTimeString();
                timestamp = Date.now();
            }

            if (msg.isSystemMessage) {
                // Add system message as separate group
                groups.push({
                    isSystemMessage: true,
                    content: msg.content,
                    timeString,
                    timestamp
                });
                currentGroup = null;
            } else {
                // Check if we should group with current group
                const shouldGroup = currentGroup && 
                    currentGroup.username === msg.username && 
                    (timestamp - currentGroup.timestamp) < 120000; // 2 minutes

                if (shouldGroup) {
                    // Add to current group
                    currentGroup.messages.push({
                        content: msg.content,
                        timeString
                    });
                    currentGroup.timestamp = timestamp; // Update group timestamp
                } else {
                    // Create new group
                    currentGroup = {
                        username: msg.username,
                        avatar: msg.avatar,
                        timestamp,
                        timeString,
                        messages: [{
                            content: msg.content,
                            timeString
                        }]
                    };
                    groups.push(currentGroup);
                }
            }
        });

        return groups;
    }

    handleSystemMessage(msg) {
        if (!this.shouldShowSystemMessage(msg)) return;

        const messages = this.domCache.get('messages');
        if (!messages) return;

        const messageElement = document.createElement('li');
        messageElement.className = 'system-message';
        messageElement.innerHTML = `
            <div class="message-content system">
                <span class="message-text">${msg}</span>
                <span class="message-time">${new Date().toLocaleTimeString()}</span>
            </div>
        `;

        messages.appendChild(messageElement);
        messages.scrollTop = messages.scrollHeight;
    }

    shouldShowSystemMessage(msg) {
        const config = this.appState.systemMessageConfig;
        
        // Normalize message text for consistent matching
        const normalizedMsg = msg.toLowerCase().trim();
        
        // Join/Leave messages
        if (normalizedMsg.includes('has joined the chat') || 
            normalizedMsg.includes('has left the chat') ||
            normalizedMsg.includes('joined the room') ||
            normalizedMsg.includes('left the room')) {
            return config.showJoinLeaveMessages;
        }
        
        // Admin change messages
        if (normalizedMsg.includes('is now the admin controller') ||
            normalizedMsg.includes('admin privileges') ||
            normalizedMsg.includes('became admin') ||
            normalizedMsg.includes('admin transferred')) {
            return config.showAdminChangeMessages;
        }
        
        // Video change messages
        if (normalizedMsg.includes('changed the video') ||
            normalizedMsg.includes('video changed') ||
            normalizedMsg.includes('started playing') ||
            normalizedMsg.includes('paused the video') ||
            normalizedMsg.includes('seeked to') ||
            normalizedMsg.includes('synced video')) {
            return config.showVideoChangeMessages;
        }
        
        // Default to showing critical messages (room creation, errors, etc.)
        return config.showCriticalMessages;
    }

    // UI Methods
    updateAdminUI() {
        const adminControls = this.domCache.get('admin-controls');
        const adminNotice = this.domCache.get('admin-notice');
        const requestAdminBtn = this.domCache.get('request-admin');

        if (this.appState.isAdmin) {
            adminControls?.style && (adminControls.style.display = 'block');
            adminNotice?.style && (adminNotice.style.display = 'block');
            requestAdminBtn?.style && (requestAdminBtn.style.display = 'none');
        } else {
            adminControls?.style && (adminControls.style.display = 'none');
            adminNotice?.style && (adminNotice.style.display = 'none');
            requestAdminBtn?.style && (requestAdminBtn.style.display = 'flex');
        }
    }

    updateUserInterface() {
        const userInfoCompact = document.getElementById('user-info-compact');
        if (!userInfoCompact) return;

        const userAvatar = this.appState.userData?.avatar;
        const avatarHtml = userAvatar ? 
            `<div class="user-avatar-small" style="background-image: url('${userAvatar}'); background-size: cover; background-position: center;"></div>` :
            `<div class="user-avatar-small">${this.appState.username?.substring(0, 2).toUpperCase() || 'GU'}</div>`;

        userInfoCompact.innerHTML = `
            ${avatarHtml}
            <span class="user-name-small">${this.appState.username || 'Guest'}</span>
            ${this.appState.userData?.isAdmin ? '<span class="admin-badge-small">Admin</span>' : ''}
            <div style="display: flex; gap: 4px; align-items: center; margin-left: 6px;">
                ${!this.appState.authToken ? '<button onclick="app.goToLogin()" class="compact-btn" title="Login"><i class="fas fa-user-circle"></i></button>' : ''}
                <button onclick="app.logout()" class="compact-btn" title="Logout">
                    <i class="fas fa-power-off"></i>
                </button>
            </div>
        `;
    }

    updateOnlineUsersCount(count) {
        const onlineUsersElement = document.getElementById('online-users');
        if (onlineUsersElement) {
            const userText = count === 1 ? 'user' : 'users';
            onlineUsersElement.innerHTML = `<span class="online-indicator"></span>${count} ${userText} online`;
        }
    }

    showUsernameModal(prefillValue = '') {
        const usernameModal = this.domCache.get('username-modal');
        const usernameInput = this.domCache.get('username-input');
        
        if (usernameModal) {
            usernameModal.style.display = 'flex';
        }
        
        if (usernameInput && prefillValue) {
            usernameInput.value = prefillValue;
            setTimeout(() => {
                usernameInput.focus();
                usernameInput.select();
            }, 100);
        }
    }

    hideUsernameModal() {
        const usernameModal = this.domCache.get('username-modal');
        if (usernameModal) {
            usernameModal.style.display = 'none';
        }
    }

    // Modal Methods
    openInviteModal() {
        if (!this.appState.isAdmin) {
            NotificationSystem.show('Only room admin can invite users', 'error');
            return;
        }

        const inviteModal = this.domCache.get('invite-modal');
        const inviteLinkInput = this.domCache.get('invite-link');
        const copyBtn = this.domCache.get('copy-invite-link');
        
        if (inviteModal) {
            inviteModal.classList.add('active');
        }
        
        if (inviteLinkInput) {
            inviteLinkInput.value = window.location.href;
            
            // Enable copy button when link is populated
            if (copyBtn) {
                copyBtn.disabled = false;
            }
        }
    }

    copyInviteLink() {
        const inviteLinkInput = this.domCache.get('invite-link');
        const copyBtn = this.domCache.get('copy-invite-link');
        
        if (inviteLinkInput && inviteLinkInput.value) {
            navigator.clipboard.writeText(inviteLinkInput.value).then(() => {
                // Update button to show success
                const originalContent = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fas fa-check"></i>';
                copyBtn.style.background = 'var(--success-color)';
                
                NotificationSystem.show('Invite link copied to clipboard!', 'success');
                
                // Reset button after 2 seconds
                setTimeout(() => {
                    copyBtn.innerHTML = originalContent;
                    copyBtn.style.background = 'var(--primary-color)';
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy text: ', err);
                NotificationSystem.show('Failed to copy link', 'error');
            });
        }
    }

    openRoomSettingsModal() {
        const modal = this.domCache.get('room-settings-modal');
        if (modal) {
            modal.classList.add('active');
            this.updateRoomSettings();
            this.updateToggleStates(); // Initialize toggle states
        }
    }

    showAdminRequestModal(requestingUsername, requestingUserId) {
        this.appState.requestingUserId = requestingUserId;
        
        const modal = this.domCache.get('admin-request-modal');
        const requestText = document.getElementById('admin-request-message');
        
        if (requestText) {
            requestText.textContent = `${requestingUsername} wants to become the admin`;
        }
        
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    updateRoomSettings() {
        const roomCodeDisplay = document.getElementById('room-code-display');
        if (roomCodeDisplay) {
            const roomId = Utils.extractRoomIdFromURL() || 'default';
            roomCodeDisplay.textContent = roomId.toUpperCase();
        }

        const adminDisplay = document.getElementById('current-admin-display');
        if (adminDisplay) {
            adminDisplay.textContent = this.appState.currentAdminUser || 'None';
        }

        this.socketManager.emit('get user count');
    }

    setupSystemMessageToggles() {
        const joinLeaveToggle = document.getElementById('modal-toggle-join-leave');
        const adminChangeToggle = document.getElementById('modal-toggle-admin-change');
        const videoChangeToggle = document.getElementById('modal-toggle-video-change');

        if (joinLeaveToggle) {
            joinLeaveToggle.addEventListener('change', () => this.updateSystemMessageSetting('showJoinLeaveMessages', joinLeaveToggle.checked));
        }

        if (adminChangeToggle) {
            adminChangeToggle.addEventListener('change', () => this.updateSystemMessageSetting('showAdminChangeMessages', adminChangeToggle.checked));
        }

        if (videoChangeToggle) {
            videoChangeToggle.addEventListener('change', () => this.updateSystemMessageSetting('showVideoChangeMessages', videoChangeToggle.checked));
        }
    }

    updateSystemMessageSetting(setting, value) {
        // Update local state
        this.appState.systemMessageConfig[setting] = value;
        
        // Send to server if user is admin
        if (this.appState.isAdmin) {
            this.socketManager.emit('update system message config', this.appState.systemMessageConfig);
            NotificationSystem.show(`${setting.replace(/([A-Z])/g, ' $1').toLowerCase()} ${value ? 'enabled' : 'disabled'}`, 'info');
            
            // Filter existing messages based on new settings
            this.filterExistingMessages();
        } else {
            NotificationSystem.show('Only admins can change message settings', 'error');
            // Revert the toggle if not admin
            this.updateToggleStates();
        }
    }

    updateSystemMessageConfig(config) {
        console.log('Received system message config:', config);
        
        // Update local state
        this.appState.systemMessageConfig = config;
        
        // Update toggle states in the UI
        this.updateToggleStates();
        
        // Filter existing messages based on new settings
        this.filterExistingMessages();
    }
    
    filterExistingMessages() {
        const messagesContainer = this.domCache.get('messages');
        if (!messagesContainer) return;
        
        // Get all system messages currently displayed
        const systemMessages = messagesContainer.querySelectorAll('.system-message');
        let hiddenCount = 0;
        let shownCount = 0;
        
        systemMessages.forEach(messageElement => {
            const messageTextElement = messageElement.querySelector('.message-text');
            if (!messageTextElement) return;
            
            const messageText = messageTextElement.textContent;
            
            // Check if this system message should be shown based on current config
            const shouldShow = this.shouldShowSystemMessage(messageText);
            
            if (shouldShow) {
                // Show the message (in case it was hidden)
                if (messageElement.classList.contains('message-hidden')) {
                    messageElement.style.display = '';
                    messageElement.style.opacity = '';
                    messageElement.style.transform = '';
                    messageElement.classList.remove('message-hidden');
                    shownCount++;
                }
            } else {
                if (!messageElement.classList.contains('message-hidden')) {
                    // Hide the message with animation
                    messageElement.style.opacity = '0';
                    messageElement.style.transform = 'translateY(-10px) scale(0.95)';
                    messageElement.classList.add('message-hidden');
                    hiddenCount++;
                    
                    // Remove from DOM after animation
                    setTimeout(() => {
                        if (messageElement.classList.contains('message-hidden')) {
                            messageElement.remove();
                        }
                    }, 300);
                }
            }
        });
        
        // Show feedback about filtering
        if (hiddenCount > 0 || shownCount > 0) {
            let feedbackText = '';
            if (hiddenCount > 0) {
                feedbackText += `Hidden ${hiddenCount} system message${hiddenCount > 1 ? 's' : ''}`;
            }
            if (shownCount > 0) {
                if (feedbackText) feedbackText += ', ';
                feedbackText += `Shown ${shownCount} system message${shownCount > 1 ? 's' : ''}`;
            }
            
            this.showFilterFeedback(feedbackText);
            console.log(`Message filter applied: ${feedbackText}`);
        }
    }
    
    showFilterFeedback(text) {
        // Remove any existing feedback
        const existingFeedback = document.querySelector('.settings-feedback');
        if (existingFeedback) {
            existingFeedback.remove();
        }
        
        // Create new feedback element
        const feedback = document.createElement('div');
        feedback.className = 'settings-feedback';
        feedback.textContent = text;
        document.body.appendChild(feedback);
        
        // Auto-remove after animation
        setTimeout(() => {
            if (feedback.parentNode) {
                feedback.remove();
            }
        }, 2000);
    }

    updateToggleStates() {
        const joinLeaveToggle = document.getElementById('modal-toggle-join-leave');
        const adminChangeToggle = document.getElementById('modal-toggle-admin-change');
        const videoChangeToggle = document.getElementById('modal-toggle-video-change');

        if (joinLeaveToggle) {
            joinLeaveToggle.checked = this.appState.systemMessageConfig.showJoinLeaveMessages;
            joinLeaveToggle.disabled = !this.appState.isAdmin;
        }

        if (adminChangeToggle) {
            adminChangeToggle.checked = this.appState.systemMessageConfig.showAdminChangeMessages;
            adminChangeToggle.disabled = !this.appState.isAdmin;
        }

        if (videoChangeToggle) {
            videoChangeToggle.checked = this.appState.systemMessageConfig.showVideoChangeMessages;
            videoChangeToggle.disabled = !this.appState.isAdmin;
        }

        // Update visual styling for disabled toggles
        this.updateToggleVisuals();
    }

    updateToggleVisuals() {
        const toggleLabels = document.querySelectorAll('.toggle-label');
        toggleLabels.forEach(label => {
            const checkbox = label.querySelector('input[type="checkbox"]');
            if (checkbox && checkbox.disabled) {
                label.style.opacity = '0.6';
                label.style.cursor = 'not-allowed';
            } else {
                label.style.opacity = '1';
                label.style.cursor = 'pointer';
            }
        });
    }

    toggleVideoHistory() {
        this.openVideoHistoryModal();
    }

    openVideoHistoryModal() {
        // Create modal if it doesn't exist
        let modal = document.getElementById('video-history-modal');
        if (!modal) {
            modal = this.createVideoHistoryModal();
        }
        
        modal.classList.add('active');
        this.loadVideoHistory();
    }

    createVideoHistoryModal() {
        const modal = document.createElement('div');
        modal.id = 'video-history-modal';
        modal.className = 'modal';

        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';

        modalContent.innerHTML = `
            <div id="video-history-content">
                <!-- Content will be populated by loadVideoHistory -->
            </div>
        `;

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeVideoHistoryModal();
            }
        });

        // Close modal with ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                this.closeVideoHistoryModal();
            }
        });

        return modal;
    }

    closeVideoHistoryModal() {
        const modal = document.getElementById('video-history-modal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    loadVideoHistory() {
        const container = document.getElementById('video-history-content');
        if (!container) return;

        container.innerHTML = `
            <div class="modal-header">
                <h2><i class="fas fa-history"></i> Video History</h2>
                <button class="modal-close" onclick="app.closeVideoHistoryModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="video-history-loading">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Loading history...</p>
                </div>
            </div>
        `;

        this.socketManager.emit('get video history');
    }

    displayVideoHistory(history) {
        const container = document.getElementById('video-history-content');
        if (!container) return;

        let historyHTML = `
            <div class="modal-header">
                <h2><i class="fas fa-history"></i> Video History</h2>
                <button class="modal-close" onclick="app.closeVideoHistoryModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
        `;

        if (!history || history.length === 0) {
            historyHTML += `
                <div class="video-history-empty">
                    <i class="fas fa-film"></i>
                    <p class="empty-title">No videos have been played in this room yet.</p>
                    <p class="empty-subtitle">Start by sharing a video URL!</p>
                </div>
            `;
        } else {
            historyHTML += '<div class="video-history-list">';
            
            history.forEach((video, index) => {
                const timeAgo = this.getTimeAgo(new Date(video.timestamp));
                const videoTitle = this.getVideoTitle(video.url);
                const isYoutube = video.url.includes('youtube.com') || video.url.includes('youtu.be');
                const isVimeo = video.url.includes('vimeo.com');
                
                historyHTML += `
                    <div class="video-history-item" onclick="app.loadHistoryVideo('${video.url.replace(/'/g, "\\'")}'); app.closeVideoHistoryModal();">
                        <div class="video-history-thumbnail">
                            <i class="fas ${isYoutube ? 'fa-play' : isVimeo ? 'fa-vimeo' : 'fa-film'}"></i>
                        </div>
                        <div class="video-history-info">
                            <div class="video-history-title">${videoTitle}</div>
                            <div class="video-history-meta">
                                <span class="video-history-user">
                                    <i class="fas fa-user"></i> ${video.changedBy || 'Unknown'}
                                </span>
                                <span class="video-history-time">
                                    <i class="fas fa-clock"></i> ${timeAgo}
                                </span>
                            </div>
                        </div>
                        <div class="video-history-action">
                            <i class="fas fa-play-circle"></i>
                        </div>
                    </div>
                `;
            });
            
            historyHTML += '</div>';
        }

        historyHTML += '</div>';
        container.innerHTML = historyHTML;
    }

    getTimeAgo(date) {
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    }

    getVideoTitle(url) {
        try {
            // Extract title from YouTube URLs
            if (url.includes('youtube.com') || url.includes('youtu.be')) {
                const videoId = Utils.extractYouTubeId(url);
                return videoId ? `YouTube Video (${videoId})` : 'YouTube Video';
            }
            
            // Extract filename from direct video URLs
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            const filename = pathname.split('/').pop();
            
            if (filename && filename.includes('.')) {
                const nameWithoutExt = filename.split('.').slice(0, -1).join('.');
                return nameWithoutExt.length > 30 ? 
                    nameWithoutExt.substring(0, 30) + '...' : nameWithoutExt;
            }
            
            return 'Direct Video';
        } catch (error) {
            return 'Video';
        }
    }

    loadHistoryVideo(url) {
        if (!this.appState.isAdmin) {
            NotificationSystem.show('Only the admin can change the video for everyone', 'error');
            return;
        }
        
        const videoUrlInput = this.domCache.get('video-url');
        if (videoUrlInput) {
            videoUrlInput.value = url;
        }
        
        this.socketManager.emit('change video', url);
        NotificationSystem.show('Loading video from history...', 'info');
    }

    async autoJoinRoom(roomId) {
        try {
            // Wait for socket connection before proceeding
            await this.socketManager.waitForConnection();
            
            const response = await fetch(`/api/rooms/${roomId}`, {
                headers: {
                    'Authorization': this.appState.authToken ? `Bearer ${this.appState.authToken}` : ''
                }
            });

            if (!response.ok) throw new Error('Room not found');

            const roomInfo = await response.json();
            
            const joinResponse = await fetch('/api/rooms/join', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': this.appState.authToken ? `Bearer ${this.appState.authToken}` : ''
                },
                body: JSON.stringify({
                    roomCode: roomId,
                    username: this.appState.username
                })
            });

            if (!joinResponse.ok) throw new Error('Failed to join room');

            this.socketManager.emit('join room', {
                roomId: roomId,
                username: this.appState.username
            });
            NotificationSystem.show(`Joined ${roomInfo.room.name}!`, 'success');
        } catch (error) {
            console.error('Error auto-joining room:', error);
            NotificationSystem.show('Room not found. Redirecting to home...', 'error');
            setTimeout(() => {
                window.location.href = '/home.html';
            }, 2000);
        }
    }

    exitRoom() {
        if (confirm('Are you sure you want to leave this room?')) {
            this.cleanup();
            window.location.href = '/home.html';
        }
    }

    goToLogin() {
        window.location.href = '/login.html';
    }

    logout() {
        // Clear local storage
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        localStorage.removeItem('guestMode');

        // Call logout API if authenticated
        if (this.appState.authToken) {
            fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.appState.authToken}` }
            }).catch(console.error);
        }

        this.cleanup();
        window.location.href = '/login.html';
    }

    cleanup() {
        console.log('🧹 Cleaning up app resources');
        
        if (this.videoPlayer) {
            this.videoPlayer.cleanup();
        }
        
        if (this.voiceChat) {
            this.voiceChat.cleanup();
        }
        
        if (this.socketManager) {
            this.socketManager.disconnect();
        }
    }

    initializeChatFeatures() {
        // Initialize typing indicator
        this.typingUsers = new Set();
        this.typingTimeout = null;
        
        // Listen for typing events
        this.socketManager.on('user typing', (data) => this.handleUserTyping(data));
        this.socketManager.on('user stop typing', (data) => this.handleUserStopTyping(data));
        
        // Add typing detection to chat input
        const chatInput = this.domCache.get('messageInput');
        if (chatInput) {
            chatInput.addEventListener('input', () => this.handleTyping());
            chatInput.addEventListener('blur', () => this.handleStopTyping());
        }
        
        // Add quick reaction handlers
        const messages = this.domCache.get('messages');
        if (messages) {
            messages.addEventListener('click', (e) => {
                if (e.target.classList.contains('quick-reaction')) {
                    const emoji = e.target.dataset.emoji;
                    const messageGroup = e.target.closest('.message-group');
                    if (messageGroup && emoji) {
                        this.addReactionToMessage(messageGroup, emoji, this.appState.username);
                        // Optionally emit to socket for real-time reactions
                        this.socketManager.emit('message reaction', {
                            messageId: messageGroup.dataset.messageId,
                            emoji: emoji,
                            username: this.appState.username
                        });
                    }
                }
            });
        }
    }
    
    handleTyping() {
        // Emit typing event
        this.socketManager.emit('typing', { username: this.appState.username });
        
        // Clear existing timeout
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }
        
        // Set timeout to stop typing
        this.typingTimeout = setTimeout(() => {
            this.handleStopTyping();
        }, 2000);
    }
    
    handleStopTyping() {
        this.socketManager.emit('stop typing', { username: this.appState.username });
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
            this.typingTimeout = null;
        }
    }
    
    handleUserTyping(data) {
        if (data.username !== this.appState.username) {
            this.typingUsers.add(data.username);
            this.updateTypingIndicator();
        }
    }
    
    handleUserStopTyping(data) {
        this.typingUsers.delete(data.username);
        this.updateTypingIndicator();
    }
    
    updateTypingIndicator() {
        const messages = this.domCache.get('messages');
        if (!messages) return;
        
        // Remove existing typing indicator
        const existingIndicator = messages.querySelector('.typing-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        
        // Add new typing indicator if users are typing
        if (this.typingUsers.size > 0) {
            const typingArray = Array.from(this.typingUsers);
            const typingText = typingArray.length === 1 
                ? `${typingArray[0]} is typing...`
                : `${typingArray.slice(0, -1).join(', ')} and ${typingArray[typingArray.length - 1]} are typing...`;
            
            const typingIndicator = document.createElement('li');
            typingIndicator.className = 'typing-indicator';
            typingIndicator.innerHTML = `
                <div class="message-avatar">
                    <div class="avatar typing-avatar">
                        <div class="typing-dots">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                </div>
                <div class="typing-text">${typingText}</div>
            `;
            
            messages.appendChild(typingIndicator);
            messages.scrollTop = messages.scrollHeight;
        }
    }
    
    addReactionToMessage(messageElement, emoji, username) {
        let reactionsContainer = messageElement.querySelector('.message-reactions');
        if (!reactionsContainer) {
            reactionsContainer = document.createElement('div');
            reactionsContainer.className = 'message-reactions';
            const messageBubble = messageElement.querySelector('.message-bubble:last-child');
            if (messageBubble) {
                messageBubble.appendChild(reactionsContainer);
            }
        }
        
        // Find existing reaction or create new one
        let reaction = reactionsContainer.querySelector(`[data-emoji="${emoji}"]`);
        if (!reaction) {
            reaction = document.createElement('div');
            reaction.className = 'reaction';
            reaction.dataset.emoji = emoji;
            reaction.dataset.users = JSON.stringify([username]);
            reaction.innerHTML = `
                <span class="reaction-emoji">${emoji}</span>
                <span class="reaction-count">1</span>
            `;
            reactionsContainer.appendChild(reaction);
        } else {
            const countSpan = reaction.querySelector('.reaction-count');
            let users = JSON.parse(reaction.dataset.users || '[]');
            const userIndex = users.indexOf(username);
            if (userIndex > -1) {
                // User already reacted, remove their reaction
                users.splice(userIndex, 1);
                const currentCount = parseInt(countSpan.textContent) || 0;
                countSpan.textContent = currentCount - 1;
                if (users.length === 0) {
                    // No more reactions, remove the element
                    reaction.remove();
                } else {
                    reaction.dataset.users = JSON.stringify(users);
                }
            } else {
                // User hasn't reacted, add their reaction
                users.push(username);
                const currentCount = parseInt(countSpan.textContent) || 0;
                countSpan.textContent = currentCount + 1;
                reaction.dataset.users = JSON.stringify(users);
            }
        }
    }
}

// ========================================
// 10. APPLICATION INITIALIZATION
// ========================================
let app;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        app = new WatchTogetherApp();
        await app.initialize();
        
        // Auto-join room if on room page
        const roomId = Utils.extractRoomIdFromURL();
        if (roomId && app.appState.username) {
            await app.autoJoinRoom(roomId);
        }
    } catch (error) {
        console.error('Failed to initialize app:', error);
        NotificationSystem.show('Failed to initialize application. Please refresh the page.', 'error');
    }
});

// ========================================
// 11. GLOBAL ERROR HANDLING
// ========================================
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    NotificationSystem.show('An unexpected error occurred', 'error');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    NotificationSystem.show('An unexpected error occurred', 'error');
});

// Export for global access
window.app = app;

// ========================================
// GLOBAL SHARE FUNCTIONS
// ========================================

window.shareViaWhatsApp = function() {
    const linkElement = document.getElementById("created-room-link") || document.getElementById("invite-link");
    if (!linkElement) return;
    const link = linkElement.value;
    const message = `Join my Watch Together room: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
};

window.shareViaDiscord = function() {
    const linkElement = document.getElementById("created-room-link") || document.getElementById("invite-link");
    if (!linkElement) return;
    const link = linkElement.value;
    const message = `Join my Watch Together room: ${link}`;
    
    // Try to open Discord web app
    window.open("https://discord.com/app", "_blank");
    
    // Copy to clipboard as fallback
    navigator.clipboard.writeText(message).then(() => {
        console.log("Link copied to clipboard! Paste it in Discord.");
    }).catch(() => {
        console.log("Failed to copy link. Please copy manually.");
    });
};

window.shareViaEmail = function() {
    const linkElement = document.getElementById("created-room-link") || document.getElementById("invite-link");
    if (!linkElement) return;
    const link = linkElement.value;
    const subject = "Join my Watch Together room";
    const body = `Hey! Join my Watch Together room here: ${link}`;
    
    // Open Gmail compose
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, "_blank");
};

window.shareViaTwitter = function() {
    const linkElement = document.getElementById("created-room-link") || document.getElementById("invite-link");
    if (!linkElement) return;
    const link = linkElement.value;
    const message = `Join my Watch Together room: ${link}`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}`, "_blank");
};

