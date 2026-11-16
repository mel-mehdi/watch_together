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
    DAILYMOTION: 'dailymotion',
    NETFLIX: 'netflix',
    IFRAME: 'iframe'
};

// Must match ALLOWED_REACTIONS on the server
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢'];

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
    // Text from other users must never be inserted as HTML
    static escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    static detectVideoType(url) {
        if (!url) return null;
        try {
            const parsedUrl = new URL(url.trim());
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) return null;
            const host = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');
            const isHost = (domain) => host === domain || host.endsWith(`.${domain}`);

            if (isHost('youtube.com') || isHost('youtu.be')) return VIDEO_TYPES.YOUTUBE;
            if (isHost('vimeo.com')) return VIDEO_TYPES.VIMEO;
            if (isHost('dailymotion.com') || isHost('dai.ly')) return VIDEO_TYPES.DAILYMOTION;
            if (isHost('netflix.com')) return VIDEO_TYPES.NETFLIX;
            if (isHost('twitch.tv')) return VIDEO_TYPES.TWITCH;
            if (isHost('facebook.com') && /\/(videos|watch|reel)\b/i.test(parsedUrl.pathname)) return VIDEO_TYPES.FACEBOOK;
            if (/\.(mp4|webm|ogg|ogv|mov|avi|mkv|flv|wmv|m4v)$/i.test(parsedUrl.pathname)) return VIDEO_TYPES.DIRECT;
            return VIDEO_TYPES.IFRAME;
        } catch (error) {
            return null;
        }
    }

    static extractYouTubeId(url) {
        try {
            const parsedUrl = new URL(url);
            const host = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');
            const videoId = host === 'youtu.be'
                ? parsedUrl.pathname.split('/').filter(Boolean)[0]
                : parsedUrl.searchParams.get('v') || parsedUrl.pathname.match(/\/(?:embed|shorts|live|v)\/([^/?]+)/i)?.[1];
            return videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : null;
        } catch (error) {
            return null;
        }
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
        // The room this page is in. A reconnect gives the connection a new
        // id the server does not know, so the page joins the room again and
        // holds everything else until the server says 'room joined'.
        this.roomJoin = null;
        this.inRoom = false;
        this.hasConnected = false;
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
            if (this.roomJoin) {
                // Reconnected: back into the room first, then the queue
                this.inRoom = false;
                this.socket.emit('join room', this.roomJoin);
            } else {
                this.processEventQueue();
            }
            this.hasConnected = true;
        });

        this.socket.on('room joined', () => {
            this.inRoom = true;
            this.processEventQueue();
        });

        this.socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            this.inRoom = false;
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
        if (event === 'join room') {
            this.roomJoin = data;
            this.inRoom = false;
            if (this.socket?.connected) this.socket.emit(event, data);
            return;
        }
        const ready = this.socket?.connected && (this.inRoom || !this.roomJoin);
        if (ready) {
            this.socket.emit(event, data);
        } else {
            console.warn('Not in the room yet, queuing event:', event);
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
        // Only web links may reach the player frame (never javascript: or data:)
        if (videoUrl && !/^https?:\/\//i.test(String(videoUrl).trim())) {
            console.warn('Refused to load a non-http(s) video URL');
            return;
        }

        this.cleanup();

        this.updateVideoContainerState(!!videoUrl);

        if (!videoUrl) {
            this.clearVideoErrorMessages();
            return;
        }

        this.currentVideoUrl = videoUrl;
        this.appState.currentVideoType = Utils.detectVideoType(videoUrl);

        // Play the "video enter" animation (css/motion.css)
        const container = this.dom.get('video-player')?.closest('.video-container');
        if (container) {
            container.classList.remove('wt-video-enter');
            void container.offsetWidth; // restart the animation for back-to-back changes
            container.classList.add('wt-video-enter');
            container.addEventListener('animationend', () => container.classList.remove('wt-video-enter'), { once: true });
        }
        
        console.log("Detected video type:", this.appState.currentVideoType, "URL:", videoUrl);

        this.showVideoLoadingMessage('Loading video...');

        switch (this.appState.currentVideoType) {
            case VIDEO_TYPES.YOUTUBE:
                this.setupYouTubePlayer(videoUrl);
                break;
            case VIDEO_TYPES.DIRECT:
                this.setupDirectVideoPlayer(videoUrl);
                break;
            case VIDEO_TYPES.VIMEO:
            case VIDEO_TYPES.DAILYMOTION:
            case VIDEO_TYPES.FACEBOOK:
            case VIDEO_TYPES.TWITCH:
                this.setupProviderEmbed(videoUrl, this.appState.currentVideoType);
                break;
            case VIDEO_TYPES.NETFLIX:
                this.showExternalVideoMessage(
                    'Netflix blocks playback inside other websites. Open Netflix directly; everyone will need their own Netflix access, and playback controls cannot sync through this room.',
                    videoUrl,
                    'Open Netflix'
                );
                break;
            case VIDEO_TYPES.IFRAME:
                this.setupExternalIframe(videoUrl);
                break;
            default:
                this.showUnsupportedVideoMessage(
                    'This link is not a valid web address. Use an HTTP or HTTPS video link.'
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

    setupProviderEmbed(videoUrl, type) {
        let parsedUrl;
        try {
            parsedUrl = new URL(videoUrl);
        } catch (error) {
            this.showUnsupportedVideoMessage('This video link is not valid.');
            return;
        }

        let embedUrl;
        if (type === VIDEO_TYPES.VIMEO) {
            const videoId = parsedUrl.pathname.match(/\/(\d+)(?:\/|$)/)?.[1];
            if (!videoId) {
                this.showUnsupportedVideoMessage('Could not find a Vimeo video ID in that link.');
                return;
            }
            const params = new URLSearchParams({ title: '0', byline: '0', portrait: '0' });
            const privacyHash = parsedUrl.searchParams.get('h');
            if (privacyHash) params.set('h', privacyHash);
            embedUrl = `https://player.vimeo.com/video/${videoId}?${params}`;
        } else if (type === VIDEO_TYPES.DAILYMOTION) {
            const videoId = parsedUrl.hostname.toLowerCase().endsWith('dai.ly')
                ? parsedUrl.pathname.split('/').filter(Boolean)[0]
                : parsedUrl.pathname.match(/\/(?:embed\/)?video\/([a-z0-9]+)/i)?.[1];
            if (!videoId) {
                this.showUnsupportedVideoMessage('Could not find a Dailymotion video ID in that link.');
                return;
            }
            embedUrl = `https://www.dailymotion.com/embed/video/${encodeURIComponent(videoId)}`;
        } else if (type === VIDEO_TYPES.TWITCH) {
            const path = parsedUrl.pathname.split('/').filter(Boolean);
            if (!path.length) {
                this.showUnsupportedVideoMessage('Paste a Twitch channel or video link.');
                return;
            }
            const params = new URLSearchParams({ parent: window.location.hostname, autoplay: 'false' });
            if (path[0].toLowerCase() === 'videos' && path[1]) {
                params.set('video', path[1]);
            } else {
                params.set('channel', path[0]);
            }
            embedUrl = `https://player.twitch.tv/?${params}`;
        } else {
            const params = new URLSearchParams({
                href: videoUrl,
                show_text: 'false'
            });
            embedUrl = `https://www.facebook.com/plugins/video.php?${params}`;
        }

        this.loadIframe(embedUrl);
    }

    setupExternalIframe(videoUrl) {
        if (new URL(videoUrl).origin === window.location.origin) {
            this.showExternalVideoMessage(
                'This page is hosted on Watch Together and cannot be embedded here.',
                videoUrl,
                'Open link'
            );
            return;
        }
        this.loadIframe(videoUrl);
    }

    loadIframe(src) {
        const videoPlayer = this.dom.get('video-player');
        const directVideoPlayer = this.dom.get('direct-video-player');
        this.clearVideoErrorMessages();
        videoPlayer.style.display = 'block';
        directVideoPlayer.style.display = 'none';
        videoPlayer.title = 'Embedded video player';
        videoPlayer.referrerPolicy = 'strict-origin-when-cross-origin';
        videoPlayer.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        videoPlayer.src = src;
        videoPlayer.onload = () => this.clearVideoErrorMessages();
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

    // Listen to what the YouTube iframe reports (state, position). Without this
    // the admin's page never learns that the video was played, paused or seeked
    // inside the YouTube player, so nothing is sent to the other viewers.
    listenToYouTubePlayer(videoPlayer) {
        this.stopListeningToYouTube();

        // Anyone's play/pause/seek is shared with the room; ignoreEvents is set
        // while applying a remote command, so it is not echoed back
        const emitPlayback = (event, data) => {
            if (!this.appState.ignoreEvents) this.socket.emit(event, data);
        };
        let lastTimeAt = Date.now();

        this.ytMessageHandler = (event) => {
            if (!this.player || event.source !== videoPlayer.contentWindow) return;
            let data;
            try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
            if (!data || !data.event) return;

            if (data.event === 'onReady') {
                clearInterval(this.ytHandshake);
                return;
            }

            const info = data.info;
            let newState = null;
            if (data.event === 'onStateChange' && typeof info === 'number') newState = info;
            if (data.event === 'infoDelivery' && info && typeof info.playerState === 'number') newState = info.playerState;

            if (data.event === 'infoDelivery' && info && typeof info.currentTime === 'number') {
                clearInterval(this.ytHandshake);
                const now = Date.now();
                const playing = this.player.playerState === PLAYER_STATES.PLAYING;
                const expected = this.player.lastKnownTime + (playing ? (now - lastTimeAt) / 1000 : 0);
                // A jump of more than 2s from where playback should be = a seek
                if (Math.abs(info.currentTime - expected) > 2 && newState === null) {
                    emitPlayback('video seek', info.currentTime);
                }
                this.player.lastKnownTime = info.currentTime;
                lastTimeAt = now;
            }

            if (newState !== null && newState !== this.player.playerState) {
                this.player.playerState = newState;
                // Only a change between playing and paused is a viewer's action;
                // buffering → playing is not, so it must not be re-sent
                if ((newState === PLAYER_STATES.PLAYING || newState === PLAYER_STATES.PAUSED) && newState !== this.player.intent) {
                    this.player.intent = newState;
                    const kind = newState === PLAYER_STATES.PLAYING ? 'play' : 'pause';
                    emitPlayback(`video ${kind}`, this.player.lastKnownTime);
                    if (this.appState.isAdmin) emitPlayback('admin action', kind);
                }
            }
        };
        window.addEventListener('message', this.ytMessageHandler);

        // Handshake: ask the iframe to start sending events; repeat until it answers
        const sayListening = () => {
            try {
                videoPlayer?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'watch-together', channel: 'widget' }), '*');
                videoPlayer?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onStateChange'], id: 'watch-together', channel: 'widget' }), '*');
            } catch (error) { /* iframe not ready yet */ }
        };
        sayListening();
        this.ytHandshake = setInterval(sayListening, 1000);
        setTimeout(() => clearInterval(this.ytHandshake), 15000);
    }

    stopListeningToYouTube() {
        if (this.ytMessageHandler) window.removeEventListener('message', this.ytMessageHandler);
        clearInterval(this.ytHandshake);
        this.ytMessageHandler = null;
    }

    setupYouTubeSyncPlayer() {
        const videoPlayer = this.dom.get('video-player');
        this.listenToYouTubePlayer(videoPlayer);

        this.player = {
            playerState: PLAYER_STATES.UNSTARTED,
            lastKnownTime: 0,
            initialized: true,

            getCurrentTime: () => new Promise(resolve => {
                try {
                    videoPlayer?.contentWindow?.postMessage(JSON.stringify({
                        event: 'command', func: 'getCurrentTime'
                    }), '*');
                    setTimeout(() => resolve(this.player?.lastKnownTime || 0), 100);
                } catch (error) {
                    resolve(this.player?.lastKnownTime || 0);
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
                    this.player.intent = PLAYER_STATES.PLAYING;
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
                    this.player.intent = PLAYER_STATES.PAUSED;
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

        // Anyone's play/pause/seek is shared with the room (not while applying a remote one)
        const emitPlayback = (event, data) => {
            if (!this.appState.ignoreEvents) this.socket.emit(event, data);
        };

        directVideoPlayer.onplay = Utils.throttle(() => {
            this.player.playerState = PLAYER_STATES.PLAYING;
            emitPlayback('video play', directVideoPlayer.currentTime);
            if (this.appState.isAdmin) emitPlayback('admin action', 'play');
        }, 100);

        directVideoPlayer.onpause = Utils.throttle(() => {
            this.player.playerState = PLAYER_STATES.PAUSED;
            emitPlayback('video pause', directVideoPlayer.currentTime);
            if (this.appState.isAdmin) emitPlayback('admin action', 'pause');
        }, 100);

        directVideoPlayer.onseeked = Utils.throttle(() => {
            this.player.lastKnownTime = directVideoPlayer.currentTime;
            emitPlayback('video seek', directVideoPlayer.currentTime);
        }, 100);

        directVideoPlayer.onloadedmetadata = () => {
            console.log("Video loaded, duration:", directVideoPlayer.duration);
            this.clearVideoErrorMessages();
            if (this.appState.isAdmin) setTimeout(() => this.startAdminSync(), 1000);
        };

        directVideoPlayer.onerror = (e) => this.handleVideoError(e.target.error);
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

    showExternalVideoMessage(message, url, linkText) {
        this.clearVideoErrorMessages();
        const container = this.createMessageContainer('video-error-container', message, '#667eea', 'fa-video');
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = linkText;
        link.style.cssText = 'color: white; text-decoration: underline; font-weight: 700;';
        container.appendChild(link);
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
        return container;
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
                    if (!this.player) return; // video was removed while waiting
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
        this.stopListeningToYouTube();
        const directVideo = this.dom.get('direct-video-player');
        if (directVideo) {
            directVideo.onplay = null;
            directVideo.onpause = null;
            directVideo.onseeked = null;
            directVideo.onloadedmetadata = null;
            directVideo.onerror = null;
        }
        directVideo?.pause();
        this.player = null;
        this.vimeoPlayer = null;
        this.clearVideoErrorMessages();
        this.updateVideoContainerState(false);
        const iframe = this.dom.get('video-player');
        if (iframe) {
            iframe.onload = null;
            iframe.src = 'about:blank';
        }
    }
}

// ========================================
// 8. VOICE CHAT MANAGER
// ========================================
class VoiceChatManager {
    // Group voice call inside a room. Every pair of people in the call has its
    // own direct audio connection (WebRTC); the server only passes the set-up
    // messages. The newcomer calls everyone already there, so each pair has
    // exactly one caller. Muting switches the microphone track off, which
    // needs no new set-up.
    constructor(appState, domCache, socketManager) {
        this.appState = appState;
        this.dom = domCache;
        this.socket = socketManager;
        this.isInVoiceRoom = false;
        this.isJoining = false;
        this.isMicEnabled = false;
        this.localStream = null;
        this.iceServers = CONFIG.ICE_SERVERS;
        this.peers = {};           // socketId -> { pc, username, pendingIce: [] }
        this.audioElements = {};
        this.toggleBtn = null;
        this.muteBtn = null;
        this.countBadge = null;
    }

    // Kept for code elsewhere that reads them
    get peerConnections() {
        return Object.fromEntries(Object.entries(this.peers).map(([id, p]) => [id, p.pc]));
    }

    initialize() {
        this.toggleBtn = this.dom.get('voice-chat-toggle');
        if (!this.toggleBtn) return;

        this.muteBtn = document.createElement('button');
        this.muteBtn.type = 'button';
        this.muteBtn.className = 'voice-mute-btn';
        this.muteBtn.hidden = true;
        this.toggleBtn.insertAdjacentElement('afterend', this.muteBtn);

        this.countBadge = document.createElement('span');
        this.countBadge.className = 'voice-count';
        this.countBadge.hidden = true;
        this.toggleBtn.style.position = 'relative';
        this.toggleBtn.appendChild(this.countBadge);

        this.toggleBtn.addEventListener('click', () => {
            if (this.isJoining) return;
            this.isInVoiceRoom ? this.leaveVoiceRoom() : this.joinVoiceRoom();
        });
        this.muteBtn.addEventListener('click', () => this.toggleMicrophone());

        this.updateButtonState();
    }

    bindSocketEvents() {
        const raw = () => this.socket.socket;

        this.socket.on('voice-peers', async ({ peers = [], iceServers } = {}) => {
            if (!this.isInVoiceRoom) return;
            if (Array.isArray(iceServers) && iceServers.length) this.iceServers = iceServers;
            for (const peer of peers) {
                await this.callPeer(peer.id, peer.username);
            }
            this.updateButtonState();
        });

        this.socket.on('user-joined-voice', ({ id, username } = {}) => {
            if (!this.isInVoiceRoom || !id || id === raw()?.id) return;
            // They will call us; just remember the name
            this.peers[id] = this.peers[id] || { pc: null, username, pendingIce: [] };
            this.peers[id].username = username;
            NotificationSystem.show(`${username || 'Someone'} joined the voice call`, 'info');
            this.updateButtonState();
        });

        this.socket.on('user-left-voice', (id) => {
            const name = this.peers[id]?.username;
            if (!this.peers[id]) return;
            this.closePeer(id);
            if (this.isInVoiceRoom && name) {
                NotificationSystem.show(`${name} left the voice call`, 'info');
            }
            this.updateButtonState();
        });

        this.socket.on('voice-offer', async ({ from, description } = {}) => {
            if (!this.isInVoiceRoom || !from || !description) return;
            try {
                const pc = this.ensurePeer(from).pc;
                await pc.setRemoteDescription(description);
                // The caller's offer created the audio slot: send our mic on it
                const transceiver = pc.getTransceivers().find(t => t.receiver.track?.kind === 'audio');
                if (transceiver) {
                    transceiver.direction = 'sendrecv';
                    await transceiver.sender.replaceTrack(this.currentTrack());
                }
                await this.flushIce(from);
                await pc.setLocalDescription(await pc.createAnswer());
                this.socket.emit('voice-answer', { to: from, description: pc.localDescription });
            } catch (error) {
                console.error('Voice call: could not answer', error);
            }
        });

        this.socket.on('voice-answer', async ({ from, description } = {}) => {
            const pc = this.peers[from]?.pc;
            if (!pc || !description) return;
            try {
                await pc.setRemoteDescription(description);
                await this.flushIce(from);
            } catch (error) {
                console.error('Voice call: bad answer', error);
            }
        });

        this.socket.on('voice-ice', async ({ from, candidate } = {}) => {
            const peer = this.peers[from];
            if (!peer || !candidate) return;
            if (!peer.pc || !peer.pc.remoteDescription) {
                peer.pendingIce.push(candidate);   // arrived before the offer/answer
                return;
            }
            try {
                await peer.pc.addIceCandidate(candidate);
            } catch (error) {
                console.warn('Voice call: skipped a network candidate', error);
            }
        });

        // A dropped connection (phone screen locked, app switched, network
        // change) gets a new id on the server. Keep the microphone, drop the
        // old audio links, and rejoin the call once the room is back.
        raw()?.on('disconnect', () => {
            if (!this.isInVoiceRoom) return;
            Object.keys(this.peers).forEach(id => this.closePeer(id));
            this.needsRejoin = true;
            this.updateButtonState();
        });

        this.socket.on('room joined', () => {
            if (this.isInVoiceRoom && this.needsRejoin) {
                this.needsRejoin = false;
                raw()?.emit('join-voice-chat', { muted: !this.isMicEnabled });
            }
        });

        // The server did not know this connection yet: retry after the rejoin
        this.socket.on('voice-error', (reason) => {
            if (reason === 'not-in-room' && this.isInVoiceRoom) this.needsRejoin = true;
        });
    }

    async joinVoiceRoom() {
        if (!window.RTCPeerConnection) {
            NotificationSystem.show('This browser does not support voice calls', 'error');
            return;
        }
        this.isJoining = true;
        this.updateButtonState();

        // Ask for the microphone; if refused, join to listen only
        try {
            if (!navigator.mediaDevices?.getUserMedia) throw new Error('no microphone access (needs https)');
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            });
            this.isMicEnabled = true;
        } catch (error) {
            console.warn('Voice call: microphone unavailable', error);
            this.localStream = null;
            this.isMicEnabled = false;
            NotificationSystem.show('Microphone blocked: you can listen, but others will not hear you', 'error');
        }

        this.isJoining = false;
        this.isInVoiceRoom = true;
        this.socket.emit('join-voice-chat', { muted: !this.isMicEnabled });
        this.updateButtonState();
    }

    leaveVoiceRoom({ silent = false } = {}) {
        Object.keys(this.peers).forEach(id => this.closePeer(id));
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        this.isMicEnabled = false;
        this.isInVoiceRoom = false;
        this.needsRejoin = false;
        if (!silent && this.socket.socket?.connected) this.socket.emit('leave-voice-chat');
        this.updateButtonState();
    }

    async toggleMicrophone() {
        if (!this.isInVoiceRoom) return;

        // Listening only so far: ask for the microphone now
        if (!this.localStream) {
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
                });
            } catch (error) {
                NotificationSystem.show('Microphone blocked: allow it in the browser address bar', 'error');
                return;
            }
            const track = this.currentTrack();
            await Promise.all(Object.values(this.peers).map(p => {
                const sender = p.pc?.getTransceivers().find(t => t.receiver.track?.kind === 'audio')?.sender;
                return sender ? sender.replaceTrack(track) : null;
            }));
            this.isMicEnabled = true;
        } else {
            this.isMicEnabled = !this.isMicEnabled;
            this.localStream.getAudioTracks().forEach(t => { t.enabled = this.isMicEnabled; });
        }

        this.socket.emit('voice-mute', { muted: !this.isMicEnabled });
        this.updateButtonState();
    }

    currentTrack() {
        return this.localStream?.getAudioTracks()[0] || null;
    }

    ensurePeer(id, username) {
        const existing = this.peers[id];
        if (existing?.pc) return existing;

        const peer = existing || { pc: null, username, pendingIce: [] };
        if (username) peer.username = username;
        const pc = new RTCPeerConnection({ iceServers: this.iceServers });
        peer.pc = pc;

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('voice-ice', { to: id, candidate: event.candidate });
            }
        };
        pc.ontrack = (event) => {
            this.playRemoteAudio(id, event.streams[0] || new MediaStream([event.track]));
        };
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed') {
                console.warn(`Voice call: could not connect to ${peer.username || id}`);
                NotificationSystem.show(`Could not connect the voice call with ${peer.username || 'a user'} (network blocked)`, 'error');
            }
        };

        this.peers[id] = peer;
        return peer;
    }

    async callPeer(id, username) {
        try {
            const { pc } = this.ensurePeer(id, username);
            // Always open a two-way audio slot, even without a microphone,
            // so the other side can still be heard
            const transceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
            await transceiver.sender.replaceTrack(this.currentTrack());
            await pc.setLocalDescription(await pc.createOffer());
            this.socket.emit('voice-offer', { to: id, description: pc.localDescription });
        } catch (error) {
            console.error('Voice call: could not call', error);
        }
    }

    async flushIce(id) {
        const peer = this.peers[id];
        if (!peer?.pc) return;
        const queued = peer.pendingIce.splice(0);
        for (const candidate of queued) {
            try { await peer.pc.addIceCandidate(candidate); } catch (e) { /* stale candidate */ }
        }
    }

    playRemoteAudio(id, stream) {
        let audio = this.audioElements[id];
        if (!audio) {
            audio = document.createElement('audio');
            audio.autoplay = true;
            audio.playsInline = true;
            audio.style.display = 'none';
            document.body.appendChild(audio);
            this.audioElements[id] = audio;
        }
        audio.srcObject = stream;
        audio.play().catch(() => {
            // The browser wants a click first (autoplay rule)
            NotificationSystem.show('Click anywhere to hear the voice call', 'info');
            document.addEventListener('click', () => audio.play().catch(() => {}), { once: true });
        });
    }

    closePeer(id) {
        const peer = this.peers[id];
        if (peer?.pc) {
            peer.pc.ontrack = peer.pc.onicecandidate = peer.pc.onconnectionstatechange = null;
            peer.pc.close();
        }
        delete this.peers[id];
        if (this.audioElements[id]) {
            this.audioElements[id].srcObject = null;
            this.audioElements[id].remove();
            delete this.audioElements[id];
        }
    }

    updateButtonState() {
        if (!this.toggleBtn) return;
        const others = Object.keys(this.peers).length;
        const icon = (name) => `<i class="fas ${name}" aria-hidden="true"></i>`;

        this.toggleBtn.classList.toggle('active', this.isInVoiceRoom);
        this.toggleBtn.classList.toggle('joining', this.isJoining);
        this.toggleBtn.style.background = '';

        let label;
        if (this.isJoining) {
            this.toggleBtn.innerHTML = icon('fa-spinner fa-spin');
            label = 'Joining the voice call…';
        } else if (this.isInVoiceRoom) {
            this.toggleBtn.innerHTML = icon('fa-phone-slash');
            label = others
                ? `In the voice call with ${others} other${others > 1 ? 's' : ''}. Click to leave`
                : 'In the voice call, waiting for others. Click to leave';
        } else {
            this.toggleBtn.innerHTML = icon('fa-phone');
            label = 'Join the voice call';
        }
        this.toggleBtn.title = label;
        this.toggleBtn.setAttribute('aria-label', label);
        this.toggleBtn.setAttribute('aria-pressed', String(this.isInVoiceRoom));

        this.countBadge.textContent = String(others + 1);
        this.countBadge.hidden = !this.isInVoiceRoom;
        this.toggleBtn.appendChild(this.countBadge);

        if (this.muteBtn) {
            this.muteBtn.hidden = !this.isInVoiceRoom;
            this.muteBtn.classList.toggle('muted', !this.isMicEnabled);
            this.muteBtn.innerHTML = icon(this.isMicEnabled ? 'fa-microphone' : 'fa-microphone-slash');
            const muteLabel = this.isMicEnabled ? 'Mute your microphone' : 'Turn your microphone on';
            this.muteBtn.title = muteLabel;
            this.muteBtn.setAttribute('aria-label', muteLabel);
        }
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
        const videoUrlBox = this.domCache.get('video-url');
        if (videoUrlBox) {
            videoUrlBox.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.handleChangeVideo();
            });
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
                const modal = this.domCache.get('admin-request-modal');
                this.socketManager.emit('transfer admin', this.appState.requestingUserId);
                if (modal) modal.style.display = 'none';
                NotificationSystem.show('Admin privileges transferred', 'success');
            });
        }

        if (rejectAdminBtn) {
            rejectAdminBtn.addEventListener('click', () => {
                const modal = this.domCache.get('admin-request-modal');
                if (modal) modal.style.display = 'none';
                NotificationSystem.show('Admin request declined', 'info');
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
            console.log('🎯 [admin status] Event received:', status);
            console.log('🎯 [admin status] Before update - isAdmin:', this.appState.isAdmin);
            
            const wasAdmin = this.appState.isAdmin;
            this.appState.isAdmin = status;
            
            console.log('🎯 [admin status] After update - isAdmin:', this.appState.isAdmin);
            console.log('🎯 [admin status] wasAdmin:', wasAdmin, '-> newStatus:', status);
            
            this.updateAdminUI();
            
            // Show notification when gaining/losing admin
            if (status && !wasAdmin) {
                NotificationSystem.show('You are now the admin!', 'success');
            } else if (!status && wasAdmin) {
                NotificationSystem.show('Admin privileges transferred', 'info');
            }
            
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

        // Sent by the server on join: restore the room's current video, so people
        // who join late or reload see what everyone else is watching
        this.socketManager.on('video state', (state) => {
            if (!state?.url || state.url === this.videoPlayer.currentVideoUrl) return;
            this.videoPlayer.initialize(state.url);
            const videoUrlInput = this.domCache.get('video-url');
            if (videoUrlInput) videoUrlInput.value = state.url;

            // Once the player exists, jump to the room's position (and play if it is playing)
            let tries = 0;
            const applyPosition = setInterval(() => {
                const player = this.videoPlayer.player;
                if (!player && ++tries < 30) return;
                clearInterval(applyPosition);
                if (!player) return;
                this.appState.ignoreEvents = true;
                if (state.currentTime) player.seekTo(state.currentTime);
                if (state.playing) player.playVideo();
                setTimeout(() => { this.appState.ignoreEvents = false; }, 500);
            }, 500);
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
            if (this.videoPlayer.player) {
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
        this.voiceChat.bindSocketEvents();
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
        // Initialize admin UI state
        this.updateAdminUI();
    }

    ensureModalsAreHidden() {
        // Explicitly ensure all modals are hidden during initialization
        const modals = ['room-settings-modal', 'invite-modal', 'admin-request-modal', 'username-modal'];
        modals.forEach(modalId => {
            const modal = this.domCache.get(modalId);
            if (modal) {
                modal.classList.remove('active');
                // For modals that use style.display instead of active class
                if (modalId === 'username-modal' || modalId === 'admin-request-modal') {
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
        
        // Anyone in the room can load a video for everyone
        const url = videoUrlInput?.value.trim();
        if (!url) return;
        if (!/^https?:\/\//i.test(url)) {
            NotificationSystem.show('Paste a link starting with http:// or https://', 'error');
            return;
        }
        this.socketManager.emit('change video', url);
    }

    handleChatMessage(msg) {
        const messages = this.domCache.get('messages');
        if (!messages) return;

        let timeString;
        try {
            const timestamp = msg.timestamp || Date.now();
            const date = new Date(timestamp);
            timeString = isNaN(date.getTime()) ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch {
            timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        const isSentByCurrentUser = msg.username === this.appState.username;
        const lastMessage = messages.lastElementChild;
        const shouldGroup = this.shouldGroupMessages(lastMessage, msg.username, isSentByCurrentUser);
        
        shouldGroup ?
            this.addToMessageGroup(lastMessage, msg, timeString) :
            this.createNewMessageGroup(messages, msg, isSentByCurrentUser, timeString);

        messages.scrollTop = messages.scrollHeight;
    }

    shouldGroupMessages(lastMessage, username, isSentByCurrentUser) {
        if (!lastMessage || lastMessage.classList.contains('system-message')) return false;
        const lastUsername = lastMessage.dataset.username;
        const timeDiff = Date.now() - parseInt(lastMessage.dataset.timestamp);
        return lastUsername === username && timeDiff < 120000;
    }

    // One message: the bubble, its 😊 "add reaction" button, and the reaction
    // badges shown under it (the picker itself is shared, see openReactionPicker).
    // All user text is escaped.
    renderMessageBubble({ id, text, timeString, reactions }) {
        const esc = Utils.escapeHtml;
        const reactable = Boolean(id);
        return `
            <div class="message-bubble" ${reactable ? `data-message-id="${esc(id)}"` : ''}>
                <span class="message-text">${this.linkify(esc(text))}</span>
                <span class="message-time">${esc(timeString)}</span>
                ${reactable ? `
                <button type="button" class="react-btn" title="Add reaction" aria-label="Add reaction" aria-haspopup="menu" aria-expanded="false">
                    <i class="far fa-face-smile"></i>
                </button>` : ''}
            </div>
            ${reactable ? `<div class="message-reactions" data-for="${esc(id)}">${this.renderReactionChips(reactions)}</div>` : ''}
        `;
    }

    // Turns http(s) addresses in already-escaped text into links that open in
    // a new tab. Works on escaped text, so nothing typed can become HTML.
    linkify(escapedText) {
        return escapedText.replace(/\bhttps?:\/\/[^\s<]+/gi, (match) => {
            // Leave sentence punctuation after the address out of the link
            const url = match.replace(/(?:[.,!?;:)\]]|&#0?39;|&quot;)+$/, '');
            const rest = match.slice(url.length);
            return `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>${rest}`;
        });
    }

    // Badges like "👍 2": one per emoji, highlighted when you are one of them
    renderReactionChips(reactions = []) {
        const esc = Utils.escapeHtml;
        const byEmoji = new Map();
        reactions.forEach(r => {
            if (!byEmoji.has(r.emoji)) byEmoji.set(r.emoji, []);
            byEmoji.get(r.emoji).push(r.username);
        });
        return [...byEmoji].map(([emoji, names]) => {
            const mine = names.includes(this.appState.username);
            const label = `${emoji} ${names.length}: ${names.join(', ')}`;
            return `<button type="button" class="reaction${mine ? ' mine' : ''}" data-emoji="${esc(emoji)}"
                        title="${esc(names.join(', '))}" aria-label="${esc(label)}" aria-pressed="${mine}">
                    <span class="reaction-emoji">${esc(emoji)}</span>
                    <span class="reaction-count">${names.length}</span>
                </button>`;
        }).join('');
    }

    addToMessageGroup(messageGroup, msg, timeString) {
        const messagesContainer = messageGroup.querySelector('.message-group-content');
        messagesContainer.insertAdjacentHTML('beforeend', this.renderMessageBubble({
            id: msg.id, text: msg.message, timeString, reactions: msg.reactions
        }));
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
                    <span class="message-username">${Utils.escapeHtml(msg.username)}</span>
                    <span class="message-timestamp">${Utils.escapeHtml(timeString)}</span>
                </div>
                ${this.renderMessageBubble({ id: msg.id, text: msg.message, timeString, reactions: msg.reactions })}
            </div>
        `;

        messages.appendChild(messageElement);
    }

    generateAvatar(username, avatarUrl = null) {
        if (avatarUrl?.trim() && /^https:\/\//i.test(avatarUrl.trim())) {
            const safeUrl = encodeURI(avatarUrl.trim()).replace(/'/g, '%27');
            return `<div class="avatar avatar-with-image" style="background-image: url('${safeUrl}');" title="${Utils.escapeHtml(username)}"></div>`;
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
        const initials = Utils.escapeHtml(username.substring(0, 2).toUpperCase());

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
                        <span class="message-text">${Utils.escapeHtml(group.content)}</span>
                        <span class="message-time">${Utils.escapeHtml(group.timeString)}</span>
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
                
                const bubbles = group.messages.map(msg => this.renderMessageBubble({
                    id: msg.id, text: msg.content, timeString: msg.timeString, reactions: msg.reactions
                })).join('');
                
                messageElement.innerHTML = `
                    <div class="message-avatar">${avatar}</div>
                    <div class="message-group-content">
                        <div class="message-header">
                            <span class="message-username">${Utils.escapeHtml(group.username)}</span>
                            <span class="message-timestamp">${Utils.escapeHtml(group.timeString)}</span>
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
                    timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    timestamp = Date.now();
                } else {
                    timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }
            } catch (error) {
                timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
                        timeString,
                        id: msg._id,
                        reactions: msg.reactions
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
                            timeString,
                            id: msg._id,
                            reactions: msg.reactions
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
                <span class="message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
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

        console.log('🔧 updateAdminUI called:', {
            isAdmin: this.appState.isAdmin,
            buttonFound: !!requestAdminBtn,
            buttonId: requestAdminBtn?.id,
            currentDisplay: requestAdminBtn?.style.display,
            computedDisplay: requestAdminBtn ? window.getComputedStyle(requestAdminBtn).display : 'N/A'
        });

        if (this.appState.isAdmin) {
            // User is admin - hide request button, show admin controls
            console.log('👑 User IS admin - hiding request button');
            if (adminControls?.style) adminControls.style.display = 'block';
            if (adminNotice?.style) adminNotice.style.display = 'block';
            if (requestAdminBtn) {
                requestAdminBtn.style.setProperty('display', 'none', 'important');
                console.log('✅ Request button display set to:', requestAdminBtn.style.display);
            } else {
                console.warn('⚠️ Request admin button not found in DOM!');
            }
        } else {
            // User is not admin - show request button, hide admin controls
            console.log('👤 User is NOT admin - showing request button');
            if (adminControls?.style) adminControls.style.display = 'none';
            if (adminNotice?.style) adminNotice.style.display = 'none';
            if (requestAdminBtn) {
                requestAdminBtn.style.setProperty('display', 'flex', 'important');
                console.log('✅ Request button display set to:', requestAdminBtn.style.display);
            } else {
                console.warn('⚠️ Request admin button not found in DOM!');
            }
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
            
            const esc = Utils.escapeHtml;
            history.forEach((video) => {
                const url = String(video.url || '');
                const timeAgo = this.getTimeAgo(new Date(video.timestamp));
                // Real title from the server when known, otherwise a guess from the link
                const videoTitle = video.title || this.getVideoTitle(url);
                const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
                const isVimeo = url.includes('vimeo.com');
                const thumbnail = typeof video.thumbnail === 'string' && video.thumbnail.startsWith('https://')
                    ? video.thumbnail : '';

                // The URL goes in a data attribute (escaped), never into inline code
                historyHTML += `
                    <div class="video-history-item" role="button" tabindex="0" data-url="${esc(url)}" aria-label="Play ${esc(videoTitle)}">
                        <div class="video-history-thumbnail${thumbnail ? ' has-image' : ''}">
                            ${thumbnail
                                ? `<img src="${esc(thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
                                : `<i class="fas ${isYoutube ? 'fa-play' : isVimeo ? 'fa-vimeo' : 'fa-film'}"></i>`}
                        </div>
                        <div class="video-history-info">
                            <div class="video-history-title" title="${esc(videoTitle)}">${esc(videoTitle)}</div>
                            ${video.author ? `<div class="video-history-channel">${esc(video.author)}</div>` : ''}
                            <div class="video-history-meta">
                                <span class="video-history-user">
                                    <i class="fas fa-user"></i> ${esc(video.changedBy || 'Unknown')}
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

        container.querySelectorAll('.video-history-item').forEach(item => {
            const play = () => {
                this.loadHistoryVideo(item.dataset.url);
                this.closeVideoHistoryModal();
            };
            item.addEventListener('click', play);
            item.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); } });
        });
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
            // Used only when the server has no real title for this link
            const urlObj = new URL(url);
            const host = urlObj.hostname.replace(/^www\./, '');

            if (/youtube\.com|youtu\.be/.test(host) && Utils.extractYouTubeId(url)) {
                return 'YouTube video';
            }

            // Direct files: the file name without its extension
            const filename = decodeURIComponent(urlObj.pathname.split('/').pop() || '');
            if (filename.includes('.')) {
                const nameWithoutExt = filename.split('.').slice(0, -1).join('.');
                return nameWithoutExt.length > 40 ? nameWithoutExt.substring(0, 40) + '…' : nameWithoutExt;
            }

            // Anything else (a site's home page, say): show where it points
            const path = urlObj.pathname.replace(/\/$/, '');
            const label = host + path;
            return label.length > 50 ? label.substring(0, 50) + '…' : label;
        } catch (error) {
            return 'Video';
        }
    }

    loadHistoryVideo(url) {
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
        
        // Reactions: 😊 button opens the picker; a picked emoji or a tapped badge
        // toggles your reaction; the server sends the result to everyone
        const messages = this.domCache.get('messages');
        if (messages) {
            messages.addEventListener('click', (e) => {
                const reactBtn = e.target.closest('.react-btn');
                if (reactBtn) {
                    const bubble = reactBtn.closest('.message-bubble');
                    const wasOpenHere = this.pickerBubble === bubble;
                    this.closeReactionPicker();
                    if (!wasOpenHere) this.openReactionPicker(bubble);
                    return;
                }

                // Tapping a badge toggles your reaction with that emoji
                const badge = e.target.closest('.reaction');
                const messageId = badge?.closest('.message-reactions')?.dataset.for;
                if (badge && messageId) {
                    this.socketManager.emit('message reaction', { messageId, emoji: badge.dataset.emoji });
                }
            });

            document.addEventListener('click', (e) => {
                if (!e.target.closest('.reaction-picker, .react-btn')) this.closeReactionPicker();
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') this.closeReactionPicker();
            });
            // The picker floats over the page, so close it when things move under it
            messages.closest('.chat-container')?.addEventListener('scroll', () => this.closeReactionPicker(), { passive: true });
            window.addEventListener('resize', () => this.closeReactionPicker());
        }

        this.socketManager.on('message reaction', ({ messageId, reactions } = {}) => {
            const container = [...document.querySelectorAll('.message-reactions')]
                .find(el => el.dataset.for === messageId);
            if (!container) return;

            // Remember counts before re-rendering, so only what changed animates
            const before = new Map([...container.querySelectorAll('.reaction')]
                .map(el => [el.dataset.emoji, el.querySelector('.reaction-count')?.textContent]));
            container.innerHTML = this.renderReactionChips(reactions);
            container.querySelectorAll('.reaction').forEach(el => {
                const count = el.querySelector('.reaction-count')?.textContent;
                if (!before.has(el.dataset.emoji)) el.classList.add('wt-new');
                else if (before.get(el.dataset.emoji) !== count) el.classList.add('wt-bump');
                el.addEventListener('animationend', () => el.classList.remove('wt-new', 'wt-bump'), { once: true });
            });
        });
    }

    // One picker for the whole page, created on first use
    getReactionPicker() {
        if (this.reactionPicker) return this.reactionPicker;
        const picker = document.createElement('div');
        picker.className = 'reaction-picker';
        picker.setAttribute('role', 'menu');
        picker.innerHTML = REACTION_EMOJIS.map(emoji =>
            `<button type="button" class="quick-reaction" role="menuitem" data-emoji="${emoji}" aria-label="React ${emoji}">${emoji}</button>`
        ).join('');
        picker.addEventListener('click', (e) => {
            const choice = e.target.closest('.quick-reaction');
            const messageId = this.pickerBubble?.dataset.messageId;
            if (choice && messageId) {
                this.socketManager.emit('message reaction', { messageId, emoji: choice.dataset.emoji });
            }
            this.closeReactionPicker();
        });
        document.body.appendChild(picker);
        this.reactionPicker = picker;
        return picker;
    }

    // Place the picker on the top edge of the message it reacts to, on the
    // side of its 😊 button, kept inside the chat panel. It covers only that
    // message, never the message above or its reactions.
    openReactionPicker(bubble) {
        const picker = this.getReactionPicker();
        const panel = this.domCache.get('messages')?.closest('.chat-container');
        if (!panel) return;

        this.pickerBubble = bubble;
        picker.classList.add('open');
        const b = bubble.getBoundingClientRect();
        const area = panel.getBoundingClientRect();
        const { width, height } = picker.getBoundingClientRect();
        const gap = 8;
        const isSent = Boolean(bubble.closest('.message-sent'));

        let left = isSent ? b.left : b.right - width;
        left = Math.min(Math.max(left, area.left + gap), area.right - width - gap);

        // Straddle the bubble's top edge; near the top of the panel, its bottom edge
        let top = b.top - height / 2;
        if (top < area.top + gap) top = b.bottom - height / 2;
        top = Math.min(top, area.bottom - height - gap);

        picker.style.left = `${Math.round(left)}px`;
        picker.style.top = `${Math.round(top)}px`;
        bubble.classList.add('picking');
        bubble.querySelector('.react-btn')?.setAttribute('aria-expanded', 'true');
        picker.querySelector('.quick-reaction')?.focus({ preventScroll: true });
    }

    closeReactionPicker() {
        this.reactionPicker?.classList.remove('open');
        if (this.pickerBubble) {
            this.pickerBubble.classList.remove('picking');
            this.pickerBubble.querySelector('.react-btn')?.setAttribute('aria-expanded', 'false');
        }
        this.pickerBubble = null;
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
}

// ========================================
// 10. APPLICATION INITIALIZATION
// ========================================
let app;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        app = new WatchTogetherApp();
        window.app = app;
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

