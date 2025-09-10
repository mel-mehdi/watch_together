// Authentication and user management
let authToken = localStorage.getItem('authToken');
let userData = localStorage.getItem('userData');
let isGuestMode = localStorage.getItem('guestMode') === 'true';

// Parse user data if it exists
if (userData) {
    try {
        userData = JSON.parse(userData);
    } catch (e) {
        userData = null;
        localStorage.removeItem('userData');
    }
}

// Initialize socket with authentication
const socket = io({
    auth: {
        token: authToken
    }
});

// Check authentication status on page load
if (!authToken && !isGuestMode) {
    window.location.href = '/login.html';
}

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const usernameModal = document.getElementById('username-modal');
const usernameInput = document.getElementById('username-input');
const usernameSubmit = document.getElementById('username-submit');
const videoPlayer = document.getElementById('video-player');
const directVideoPlayer = document.getElementById('direct-video-player');
const videoUrlInput = document.getElementById('video-url');
const changeVideoBtn = document.getElementById('change-video');
const adminControls = document.getElementById('admin-controls');
const adminNotice = document.getElementById('admin-notice');
const requestAdminContainer = document.getElementById('request-admin-container');
const requestAdminBtn = document.getElementById('request-admin');
const adminRequestModal = document.getElementById('admin-request-modal');
const adminRequestMessage = document.getElementById('admin-request-message');
const acceptAdminRequestBtn = document.getElementById('accept-admin-request');
const rejectAdminRequestBtn = document.getElementById('reject-admin-request');
const adminPlayBtn = document.getElementById('admin-play');
const adminPauseBtn = document.getElementById('admin-pause');
const adminRestartBtn = document.getElementById('admin-restart');
const adminViewingNotice = document.getElementById('admin-viewing-notice');
const voiceChatToggle = null; // Removed - using new voice chat system
const voiceStatus = document.getElementById('voice-status');
const usersInCall = document.getElementById('users-in-call');
const videoHistoryBtn = document.getElementById('video-history-btn'); 
const videoHistoryContainer = document.getElementById('video-history');

let username = '';
let isAdmin = false;
let currentAdminUser = '';
let requestingUserId = '';
let player = null;
let vimeoPlayer = null;
let ignoreEvents = false;
let localStream = null; // Moved to VoiceChat class
let peerConnections = {}; // Moved to VoiceChat class
let isInVoiceChat = false; // Moved to VoiceChat class
let currentVideoType = ''; // youtube, vimeo, direct, etc.

// Add these variables at the top with your other variables
let syncInterval;
const SYNC_INTERVAL_MS = 5000; // Sync every 5 seconds
let lastKnownAdminTime = 0;
let lastSyncTime = 0;

// Function to detect video type from URL
function detectVideoType(url) {
    if (!url) return null;
    
    url = url.trim();
    
    // YouTube
    if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
        return 'youtube';
    }
    
    // Vimeo
    if (url.includes('vimeo.com/')) {
        return 'vimeo';
    }
    
    // Direct video files
    if (url.match(/\.(mp4|webm|ogg|mov)($|\?)/i)) {
        return 'direct';
    }
    
    // Facebook
    if (url.includes('facebook.com/') && url.includes('/videos/')) {
        return 'facebook';
    }
    
    // Twitch
    if (url.includes('twitch.tv/')) {
        return 'twitch';
    }
    
    // Dailymotion
    if (url.includes('dailymotion.com/') || url.includes('dai.ly/')) {
        return 'dailymotion';
    }
    
    // If we can't determine the type but it ends with a common video extension
    if (url.match(/\.(mp4|webm|ogg|mov)($|\?)/i)) {
        return 'direct';
    }
    
    // For other URLs, try to use iframe embedding as a fallback
    return 'iframe';
}

// Initialize player with video URL
function initializePlayer(videoUrl) {
    // Reset players
    if (player) {
        player = null;
    }
    
    if (vimeoPlayer) {
        vimeoPlayer.destroy();
        vimeoPlayer = null;
    }
    
    // Hide both players initially
    videoPlayer.style.display = 'none';
    directVideoPlayer.style.display = 'none';
    
    // Detect the video type
    currentVideoType = detectVideoType(videoUrl);
    console.log("Detected video type:", currentVideoType);
    
    switch (currentVideoType) {
        case 'youtube':
            setupYouTubePlayer(videoUrl);
            break;
        
        case 'vimeo':
            setupVimeoPlayer(videoUrl);
            break;
        
        case 'direct':
            setupDirectVideoPlayer(videoUrl);
            break;
            
        case 'facebook':
            setupFacebookPlayer(videoUrl);
            break;
            
        case 'twitch':
            setupTwitchPlayer(videoUrl);
            break;
            
        case 'dailymotion':
            setupDailymotionPlayer(videoUrl);
            break;
            
        case 'iframe':
        default:
            setupGenericIframePlayer(videoUrl);
            break;
    }
}

// Setup YouTube player
function setupYouTubePlayer(videoUrl) {
    // Extract video ID from URL
    let videoId = videoUrl;
    if (videoUrl.includes('youtube.com/watch?v=')) {
        videoId = videoUrl.split('v=')[1];
        const ampersandPosition = videoId.indexOf('&');
        if (ampersandPosition !== -1) {
            videoId = videoId.substring(0, ampersandPosition);
        }
    } else if (videoUrl.includes('youtu.be/')) {
        videoId = videoUrl.split('youtu.be/')[1];
    }
    
    // Set iframe src with video ID and enable API and JS origin
    videoPlayer.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${window.location.origin}`;
    videoPlayer.style.display = 'block';
    
    // Setup the player control API after the iframe is loaded
    videoPlayer.onload = setupYouTubeControlAPI;
}

// Setup Vimeo player
function setupVimeoPlayer(videoUrl) {
    // Extract Vimeo ID
    const vimeoId = videoUrl.split('vimeo.com/')[1];
    
    // Create new Vimeo player
    videoPlayer.src = `https://player.vimeo.com/video/${vimeoId}?api=1`;
    videoPlayer.style.display = 'block';
    
    // Initialize Vimeo API
    videoPlayer.onload = () => {
        vimeoPlayer = new Vimeo.Player(videoPlayer);
        
        // Create a simplified player interface that works like the YouTube one
        player = {
            playerState: 2, // Default to paused
            
            getCurrentTime: function() {
                return vimeoPlayer.getCurrentTime();
            },
            
            getPlayerState: function() {
                return new Promise((resolve) => {
                    vimeoPlayer.getPaused().then(paused => {
                        player.playerState = paused ? 2 : 1;
                        resolve(player.playerState);
                    });
                });
            },
            
            seekTo: function(time) {
                vimeoPlayer.setCurrentTime(time);
            },
            
            playVideo: function() {
                vimeoPlayer.play();
                player.playerState = 1;
            },
            
            pauseVideo: function() {
                vimeoPlayer.pause();
                player.playerState = 2;
            }
        };
        
        // Setup event listeners
        vimeoPlayer.on('play', () => {
            player.playerState = 1;
            if (isAdmin && !ignoreEvents) {
                vimeoPlayer.getCurrentTime().then(time => {
                    socket.emit('video play', time);
                });
            }
        });
        
        vimeoPlayer.on('pause', () => {
            player.playerState = 2;
            if (isAdmin && !ignoreEvents) {
                vimeoPlayer.getCurrentTime().then(time => {
                    socket.emit('video pause', time);
                });
            }
        });
        
        vimeoPlayer.on('seeked', () => {
            if (isAdmin && !ignoreEvents) {
                vimeoPlayer.getCurrentTime().then(time => {
                    socket.emit('video seek', time);
                });
            }
        });
    };
}

// Setup direct video player (MP4, WebM, etc.)
function setupDirectVideoPlayer(videoUrl) {
    // Hide iframe, show video element
    videoPlayer.style.display = 'none';
    directVideoPlayer.style.display = 'block';
    
    // Set video source
    directVideoPlayer.querySelector('source').src = videoUrl;
    directVideoPlayer.load();
    
    // Create a simplified player interface
    player = {
        playerState: 2, // Default to paused
        
        getCurrentTime: function() {
            return Promise.resolve(directVideoPlayer.currentTime);
        },
        
        getPlayerState: function() {
            return Promise.resolve(directVideoPlayer.paused ? 2 : 1);
        },
        
        seekTo: function(time) {
            directVideoPlayer.currentTime = time;
        },
        
        playVideo: function() {
            directVideoPlayer.play();
            player.playerState = 1;
        },
        
        pauseVideo: function() {
            directVideoPlayer.pause();
            player.playerState = 2;
        }
    };
    
    // Add event listeners
    directVideoPlayer.addEventListener('play', () => {
        player.playerState = 1;
        if (isAdmin && !ignoreEvents) {
            socket.emit('video play', directVideoPlayer.currentTime);
        }
    });
    
    directVideoPlayer.addEventListener('pause', () => {
        player.playerState = 2;
        if (isAdmin && !ignoreEvents) {
            socket.emit('video pause', directVideoPlayer.currentTime);
        }
    });
    
    directVideoPlayer.addEventListener('seeked', () => {
        if (isAdmin && !ignoreEvents) {
            socket.emit('video seek', directVideoPlayer.currentTime);
        }
    });
}

// Setup Facebook Video player
function setupFacebookPlayer(videoUrl) {
    // Extract Facebook video ID if possible
    let videoId = videoUrl;
    if (videoUrl.includes('/videos/')) {
        const parts = videoUrl.split('/videos/');
        if (parts.length > 1) {
            videoId = parts[1].split('/')[0].split('?')[0];
        }
    }
    
    // Set iframe src
    videoPlayer.src = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(videoUrl)}&show_text=0&width=560&height=315`;
    videoPlayer.style.display = 'block';
    
    // Facebook doesn't have a good API for controlling videos in iframes
    // So we'll create a simplified player with limited functionality
    player = createLimitedControlPlayer();
}

// Setup Twitch player
function setupTwitchPlayer(videoUrl) {
    // Extract channel or video ID
    let channelName = '';
    let videoId = '';
    
    if (videoUrl.includes('twitch.tv/videos/')) {
        // It's a VOD
        videoId = videoUrl.split('twitch.tv/videos/')[1].split('?')[0];
        videoPlayer.src = `https://player.twitch.tv/?video=v${videoId}&parent=${window.location.hostname}`;
    } else {
        // It's a channel
        channelName = videoUrl.split('twitch.tv/')[1].split('?')[0].split('/')[0];
        videoPlayer.src = `https://player.twitch.tv/?channel=${channelName}&parent=${window.location.hostname}`;
    }
    
    videoPlayer.style.display = 'block';
    
    // Twitch doesn't have a simple API for controlling videos in iframes
    player = createLimitedControlPlayer();
}

// Setup Dailymotion player
function setupDailymotionPlayer(videoUrl) {
    // Extract video ID
    let videoId = '';
    
    if (videoUrl.includes('dailymotion.com/video/')) {
        videoId = videoUrl.split('dailymotion.com/video/')[1].split('?')[0];
    } else if (videoUrl.includes('dai.ly/')) {
        videoId = videoUrl.split('dai.ly/')[1].split('?')[0];
    }
    
    videoPlayer.src = `https://www.dailymotion.com/embed/video/${videoId}`;
    videoPlayer.style.display = 'block';
    
    // Dailymotion doesn't have a simple API for controlling videos in iframes
    player = createLimitedControlPlayer();
}

// Setup generic iframe for other video sources
function setupGenericIframePlayer(videoUrl) {
    // Just set the iframe src to the provided URL
    videoPlayer.src = videoUrl;
    videoPlayer.style.display = 'block';
    
    // Create a limited control player
    player = createLimitedControlPlayer();
}

// Create a limited control player for platforms without good API support
function createLimitedControlPlayer() {
    return {
        playerState: 2, // Default to paused
        
        getCurrentTime: function() {
            return Promise.resolve(0); // We can't get the current time
        },
        
        getPlayerState: function() {
            return Promise.resolve(player.playerState);
        },
        
        seekTo: function(time) {
            console.log("Seek functionality not available for this video type");
        },
        
        playVideo: function() {
            console.log("Attempting to play video via iframe reload");
            // For most platforms, we can't control playback directly
            // So we just reload the iframe which usually starts playback
            const currentSrc = videoPlayer.src;
            videoPlayer.src = currentSrc;
            player.playerState = 1;
        },
        
        pauseVideo: function() {
            console.log("Pause functionality not available for this video type");
            player.playerState = 2;
        }
    };
}

// Create a better YouTube player object
function onYouTubeIframeAPIReady() {
    console.log("YouTube API is ready");
    
    // If we already have a video URL and it's YouTube, initialize the player
    if (videoPlayer.src && currentVideoType === 'youtube') {
        setupYouTubeControlAPI();
    }
}

// Setup the YouTube player control API
function setupYouTubeControlAPI() {
    player = {
        playerState: -1, // -1: unstarted, 0: ended, 1: playing, 2: paused, 3: buffering, 5: video cued
        getCurrentTime: function() {
            return new Promise((resolve) => {
                const messageId = Date.now().toString();
                
                const handleMessage = function(event) {
                    if (event.origin !== "https://www.youtube.com") return;
                    
                    try {
                        const data = JSON.parse(event.data);
                        if (data.id === messageId && data.currentTime !== undefined) {
                            window.removeEventListener('message', handleMessage);
                            resolve(data.currentTime);
                        }
                    } catch (e) {
                        // Not a JSON message or not the response we're looking for
                    }
                };
                
                window.addEventListener('message', handleMessage);
                
                videoPlayer.contentWindow.postMessage(JSON.stringify({
                    event: 'command',
                    func: 'getCurrentTime',
                    id: messageId
                }), '*');
                
                // Fallback in case we don't get a response
                setTimeout(() => {
                    window.removeEventListener('message', handleMessage);
                    resolve(0);
                }, 500);
            });
        },
        getPlayerState: function() {
            return new Promise((resolve) => {
                const messageId = Date.now().toString();
                
                const handleMessage = function(event) {
                    if (event.origin !== "https://www.youtube.com") return;
                    
                    try {
                        const data = JSON.parse(event.data);
                        if (data.id === messageId && data.playerState !== undefined) {
                            window.removeEventListener('message', handleMessage);
                            player.playerState = data.playerState;
                            resolve(data.playerState);
                        }
                    } catch (e) {
                        // Not a JSON message or not the response we're looking for
                    }
                };
                
                window.addEventListener('message', handleMessage);
                
                videoPlayer.contentWindow.postMessage(JSON.stringify({
                    event: 'command',
                    func: 'getPlayerState',
                    id: messageId
                }), '*');
                
                // Fallback in case we don't get a response
                setTimeout(() => {
                    window.removeEventListener('message', handleMessage);
                    resolve(player.playerState);
                }, 500);
            });
        },
        seekTo: function(time) {
            videoPlayer.contentWindow.postMessage(JSON.stringify({
                event: 'command',
                func: 'seekTo',
                args: [time, true]
            }), '*');
        },
        playVideo: function() {
            videoPlayer.contentWindow.postMessage(JSON.stringify({
                event: 'command',
                func: 'playVideo'
            }), '*');
            player.playerState = 1;
        },
        pauseVideo: function() {
            videoPlayer.contentWindow.postMessage(JSON.stringify({
                event: 'command',
                func: 'pauseVideo'
            }), '*');
            player.playerState = 2;
        }
    };
    
    // Setup event listeners for the YouTube iframe
    setupYouTubeEventListeners();
    
    console.log("YouTube player control API is set up");
}

// Improve the YouTube event listener to handle edge cases
function setupYouTubeEventListeners() {
    window.addEventListener('message', (event) => {
        if (event.origin !== "https://www.youtube.com") return;
        
        try {
            const data = JSON.parse(event.data);
            
            // Only react to YouTube API events
            if (data.event && data.event === "onStateChange") {
                // Update our internal state tracker
                player.playerState = data.info;
                
                // If this is the video ending (state 0), don't restart it automatically
                if (data.info === 0) {
                    console.log("Video ended naturally");
                    return;
                }
                
                // Only the admin should control the video for everyone
                if (isAdmin && !ignoreEvents) {
                    if (data.info === 1) { // playing
                        player.getCurrentTime().then(time => {
                            // Check if we're at the very beginning (natural autoplay or manual play)
                            const isAutoplayOrManualStart = time < 1;
                            
                            socket.emit('video play', time);
                            console.log("Admin auto-detected play, time:", time, 
                                        isAutoplayOrManualStart ? "(video start)" : "(mid-video)");
                        });
                    } else if (data.info === 2) { // paused
                        player.getCurrentTime().then(time => {
                            socket.emit('video pause', time);
                            console.log("Admin auto-detected pause, time:", time);
                        });
                    }
                }
            }
        } catch (e) {
            // Not a JSON message or not the event we're looking for
        }
    });
}

// Update admin UI
function updateAdminUI() {
    if (isAdmin) {
        adminControls.style.display = 'block';
        adminNotice.textContent = 'You are the admin controller';
        adminNotice.style.display = 'block';
        requestAdminContainer.style.display = 'none';
        
        // Start continuous time sync from admin to all users
        startContinuousSync();
    } else {
        adminControls.style.display = 'none';
        adminNotice.textContent = `${currentAdminUser} is controlling the video`;
        adminNotice.style.display = 'block';
        requestAdminContainer.style.display = 'block';
        
        // Non-admins don't need to send continuous updates
        stopContinuousSync();
    }
}

// Function to start continuous sync from admin to all users
function startContinuousSync() {
    // Clear any existing intervals
    if (syncInterval) {
        clearInterval(syncInterval);
    }
    
    // Set a new interval for continuous sync
    syncInterval = setInterval(() => {
        if (isAdmin && player) {
            // Get current state and time
            Promise.all([player.getCurrentTime(), player.getPlayerState()])
                .then(([currentTime, playerState]) => {
                    // Always send updates, but with a minimum interval
                    if (Date.now() - lastSyncTime > 5000) { // Send update at least every 5 seconds
                        
                        lastKnownAdminTime = currentTime;
                        lastSyncTime = Date.now();
                        
                        // Send detailed sync info to all clients
                        socket.emit('detailed sync', {
                            time: currentTime,
                            state: playerState,
                            timestamp: Date.now()
                        });
                        
                        console.log("Admin sending detailed sync:", {
                            time: currentTime,
                            state: playerState,
                            playing: playerState === 1 ? "yes" : "no"
                        });
                    }
                })
                .catch(err => {
                    console.error("Error during continuous sync:", err);
                    // Attempt to get state individually if the combined approach fails
                    player.getCurrentTime()
                        .then(time => {
                            player.getPlayerState()
                                .then(state => {
                                    socket.emit('detailed sync', {
                                        time: time,
                                        state: state,
                                        timestamp: Date.now()
                                    });
                                    console.log("Fallback sync sent");
                                })
                                .catch(e => console.error("Couldn't get player state:", e));
                        })
                        .catch(e => console.error("Couldn't get current time:", e));
                });
        }
    }, SYNC_INTERVAL_MS);
}

// Function to stop continuous sync
function stopContinuousSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
}

// Function to load video history
function loadVideoHistory() {
    socket.emit('get video history');
}

// Socket event to receive video history
socket.on('video history', (history) => {
    videoHistoryContainer.innerHTML = '';
    
    if (history.length === 0) {
        videoHistoryContainer.innerHTML = '<p>No video history available</p>';
        return;
    }
    
    const historyList = document.createElement('ul');
    
    history.forEach(video => {
        const historyItem = document.createElement('li');
        historyItem.className = 'history-item';
        
        const videoType = document.createElement('span');
        videoType.className = 'video-type';
        videoType.textContent = video.type.toUpperCase();
        
        const videoLink = document.createElement('a');
        videoLink.href = '#';
        videoLink.className = 'video-link';
        videoLink.textContent = video.url.substring(0, 50) + (video.url.length > 50 ? '...' : '');
        videoLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (isAdmin) {
                videoUrlInput.value = video.url;
                socket.emit('change video', video.url);
            } else {
                alert('Only the admin can change videos');
            }
        });
        
        const addedBy = document.createElement('span');
        addedBy.className = 'added-by';
        addedBy.textContent = `Added by ${video.addedByUsername}`;
        
        const timestamp = document.createElement('span');
        timestamp.className = 'timestamp';
        timestamp.textContent = new Date(video.watchedAt).toLocaleString();
        
        historyItem.appendChild(videoType);
        historyItem.appendChild(videoLink);
        historyItem.appendChild(addedBy);
        historyItem.appendChild(timestamp);
        
        historyList.appendChild(historyItem);
    });
    
    videoHistoryContainer.appendChild(historyList);
    videoHistoryContainer.style.display = 'block';
});

// Event listener for video history button
if (videoHistoryBtn) {
    videoHistoryBtn.addEventListener('click', () => {
        if (videoHistoryContainer.style.display === 'none' || videoHistoryContainer.style.display === '') {
            loadVideoHistory();
            videoHistoryContainer.style.display = 'block';
        } else {
            videoHistoryContainer.style.display = 'none';
        }
    });
}

// Socket event for loading chat history
socket.on('recent messages', (messages) => {
    // Clear existing messages if needed
    // messages.innerHTML = '';
    
    messages.forEach(msg => {
        const item = document.createElement('li');
        
        if (msg.isSystemMessage) {
            item.classList.add('system-message');
            item.textContent = msg.content;
        } else {
            // Create username element
            const usernameElement = document.createElement('div');
            usernameElement.classList.add('username');
            usernameElement.textContent = msg.username;
            
            // Add admin badge if needed
            if (msg.username === currentAdminUser) {
                const adminBadge = document.createElement('span');
                adminBadge.classList.add('admin-badge');
                adminBadge.textContent = 'ADMIN';
                usernameElement.appendChild(adminBadge);
            }
            
            // Create message element
            const messageElement = document.createElement('div');
            messageElement.textContent = msg.content;
            
            // Create timestamp element
            const timestampElement = document.createElement('div');
            timestampElement.classList.add('timestamp');
            timestampElement.textContent = new Date(msg.timestamp).toLocaleTimeString();
            
            // Add elements to list item
            item.appendChild(usernameElement);
            item.appendChild(messageElement);
            item.appendChild(timestampElement);
            
            // Style differently based on who sent the message
            if (msg.username === username) {
                item.classList.add('message-sent');
            } else {
                item.classList.add('message-received');
            }
        }
        
        messages.appendChild(item);
    });
    
    // Scroll to bottom
    document.querySelector('.chat-container').scrollTop = document.querySelector('.chat-container').scrollHeight;
});

// Handle username submission
usernameSubmit.addEventListener('click', () => {
    if (usernameInput.value.trim()) {
        username = usernameInput.value.trim();
        usernameModal.style.display = 'none';
        socket.emit('user join', username);
    }
});

// Handle message submission
form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    if (!input.value.trim()) {
        return; // Don't send empty messages
    }
    
    if (!username) {
        showNotification('Please set your username first', 'error');
        return;
    }
    
    console.log('Sending message:', input.value.trim());
    socket.emit('chat message', input.value.trim());
    input.value = '';
});

// Handle change video button
changeVideoBtn.addEventListener('click', () => {
    if (videoUrlInput.value.trim() && isAdmin) {
        socket.emit('change video', videoUrlInput.value.trim());
    } else if (!isAdmin) {
        alert('Only the admin can change the video for everyone');
    }
});

// Handle request admin button
requestAdminBtn.addEventListener('click', () => {
    socket.emit('request admin');
    alert(`Request sent to ${currentAdminUser} to become admin`);
});

// Handle admin request response
acceptAdminRequestBtn.addEventListener('click', () => {
    socket.emit('transfer admin', requestingUserId);
    adminRequestModal.style.display = 'none';
});

rejectAdminRequestBtn.addEventListener('click', () => {
    adminRequestModal.style.display = 'none';
});

// Socket events for admin status
socket.on('admin status', (status) => {
    isAdmin = status;
    updateAdminUI();
});

socket.on('admin user', (adminUsername) => {
    currentAdminUser = adminUsername;
    updateAdminUI();
});

socket.on('admin request', (requestingUser, userId) => {
    adminRequestMessage.textContent = `${requestingUser} wants to become the admin controller.`;
    requestingUserId = userId;
    adminRequestModal.style.display = 'flex';
});

// Socket events for video synchronization
socket.on('video state', (state) => {
    initializePlayer(state.url);
    videoUrlInput.value = state.url;
    
    // Wait for player to initialize then set the correct time and play state
    setTimeout(() => {
        if (player) {
            console.log("Setting initial video state:", state);
            
            // Make sure we have a valid time (prevent setting to 0 if video is in progress)
            const timeToSet = state.currentTime > 0 ? state.currentTime : 0;
            
            // Only attempt to seek if the player type supports it
            if (currentVideoType === 'youtube' || currentVideoType === 'vimeo' || currentVideoType === 'direct') {
                player.seekTo(timeToSet);
                
                // Set play state after seeking
                setTimeout(() => {
                    if (state.playing) {
                        player.playVideo();
                    }
                }, 500);
            }
        }
    }, 1500); // Give more time for player to initialize
});

socket.on('change video', (url) => {
    initializePlayer(url);
    videoUrlInput.value = url;
});

// Update the video play event handler
socket.on('video play', (data) => {
    if (!player) {
        console.log("Player not initialized yet");
        return;
    }
    
    ignoreEvents = true;
    
    // If we received a timestamp object
    let time = typeof data === 'object' ? data.time : data;
    
    console.log("Video play event received, time:", time);
    
    // Only seek if supported and the time difference is significant
    if (currentVideoType === 'youtube' || currentVideoType === 'vimeo' || currentVideoType === 'direct') {
        player.getCurrentTime().then(currentPlayerTime => {
            if (Math.abs(time - currentPlayerTime) > 1) {
                player.seekTo(time);
                setTimeout(() => {
                    player.playVideo();
                    ignoreEvents = false;
                }, 500);
            } else {
                // If time is close enough, just play without seeking
                player.playVideo();
                ignoreEvents = false;
            }
        }).catch(err => {
            console.error("Error getting current time:", err);
            // Fallback if we can't get current time
            player.seekTo(time);
            setTimeout(() => {
                player.playVideo();
                ignoreEvents = false;
            }, 500);
        });
    } else {
        // For platforms without good control, just try to play
        player.playVideo();
        ignoreEvents = false;
    }
});

// Update the video pause event handler
socket.on('video pause', (data) => {
    if (!player) {
        console.log("Player not initialized yet");
        return;
    }
    
    ignoreEvents = true;
    
    // If we received a timestamp object
    let time = typeof data === 'object' ? data.time : data;
    
    console.log("Video pause event received, time:", time);
    
    // First pause at current position
    player.pauseVideo();
    
    // Then only seek if needed
    player.getCurrentTime().then(currentPlayerTime => {
        if (Math.abs(time - currentPlayerTime) > 1) {
            player.seekTo(time);
        }
        setTimeout(() => {
            ignoreEvents = false;
        }, 500);
    }).catch(err => {
        console.error("Error getting current time:", err);
        setTimeout(() => {
            ignoreEvents = false;
        }, 500);
    });
});

socket.on('video seek', (time) => {
    ignoreEvents = true;
    if (player) {
        player.seekTo(time);
    } else {
        videoPlayer.contentWindow.postMessage(`{"event":"command","func":"seekTo","args":[${time}, true]}`, '*');
    }
    setTimeout(() => {
        ignoreEvents = false;
    }, 500);
});

// Periodically sync time with admin (every 30 seconds)
setInterval(() => {
    if (isAdmin) {
        // Get current time from YouTube player
        if (player) {
            player.getCurrentTime().then(currentTime => {
                socket.emit('sync time', currentTime);
            }).catch(err => {
                console.error("Error getting current time:", err);
            });
        }
    }
}, 30000);

// Listen for time sync events
socket.on('sync time', (time) => {
    if (!isAdmin) {
        ignoreEvents = true;
        if (player) {
            player.seekTo(time);
        } else {
            videoPlayer.contentWindow.postMessage(`{"event":"command","func":"seekTo","args":[${time}, true]}`, '*');
        }
        setTimeout(() => {
            ignoreEvents = false;
        }, 500);
    }
});

// Handle incoming chat messages
socket.on('chat message', (msg) => {
    console.log('Received chat message:', msg);
    
    const item = document.createElement('li');
    item.classList.add('message-item');
    
    const timestamp = new Date().toLocaleTimeString();
    
    item.innerHTML = `
        <div class="message-header">
            <span class="username ${msg.isAdmin ? 'admin' : ''}">${msg.username}</span>
            <span class="timestamp">${msg.timestamp || timestamp}</span>
        </div>
        <div class="message-content">${msg.message}</div>
    `;
    
    messages.appendChild(item);
    
    // Scroll to bottom
    const chatContainer = document.querySelector('.chat-container');
    chatContainer.scrollTop = chatContainer.scrollHeight;
});

// Handle system messages (join/leave)
socket.on('system message', (msg) => {
    console.log('System message:', msg);
    const item = document.createElement('li');
    item.classList.add('system-message');
    item.textContent = msg;
    messages.appendChild(item);
    
    const chatContainer = document.querySelector('.chat-container');
    chatContainer.scrollTop = chatContainer.scrollHeight;
});

// Handle error messages
socket.on('error message', (msg) => {
    console.log('Error message:', msg);
    showNotification(msg, 'error');
});

// Admin play button - Fix to maintain current time
adminPlayBtn.addEventListener('click', async () => {
    if (isAdmin) {
        try {
            const currentTime = await player.getCurrentTime();
            player.playVideo();
            socket.emit('video play', currentTime);
            console.log("Admin play button clicked, current time:", currentTime);
        } catch (e) {
            console.error("Error in admin play:", e);
        }
    }
});

// Admin pause button - Fix to maintain current time
adminPauseBtn.addEventListener('click', async () => {
    if (isAdmin) {
        try {
            const currentTime = await player.getCurrentTime();
            player.pauseVideo();
            socket.emit('video pause', currentTime);
            console.log("Admin pause button clicked, current time:", currentTime);
        } catch (e) {
            console.error("Error in admin pause:", e);
        }
    }
});

// Admin restart button
adminRestartBtn.addEventListener('click', () => {
    if (isAdmin) {
        try {
            player.seekTo(0);
            setTimeout(() => {
                player.playVideo();
            }, 500);
            socket.emit('video seek', 0);
            socket.emit('video play', 0);
            console.log("Admin restart button clicked");
        } catch (e) {
            console.error("Error in admin restart:", e);
        }
    }
});

// Enhanced Voice Chat System
class VoiceChat {
    constructor() {
        this.isInVoiceRoom = false;
        this.isMicEnabled = false;
        this.isPushToTalk = false;
        this.localStream = null;
        this.microphoneStream = null; // Separate stream for microphone
        this.peerConnections = {};
        this.audioElements = {};
        this.voiceActivityDetector = null;
        this.pushToTalkKey = 'Space'; // Space bar for push-to-talk
        
        // UI Elements
        this.joinBtn = document.getElementById('join-voice-btn');
        this.micBtn = document.getElementById('mic-toggle-btn');
        this.pttBtn = document.getElementById('push-to-talk-btn');
        this.leaveBtn = document.getElementById('leave-voice-btn');
        this.voiceStatus = document.getElementById('voice-status');
        this.usersInCall = document.getElementById('users-in-call');
        
        this.initializeEventListeners();
        this.initializeKeyboardControls();
    }
    
    initializeEventListeners() {
        // Join voice chat (as listener)
        this.joinBtn.addEventListener('click', () => {
            if (!this.isInVoiceRoom) {
                this.joinVoiceRoom();
            }
        });
        
        // Toggle microphone
        this.micBtn.addEventListener('click', () => {
            this.toggleMicrophone();
        });
        
        // Toggle push-to-talk mode
        this.pttBtn.addEventListener('click', () => {
            this.togglePushToTalk();
        });
        
        // Leave voice chat
        this.leaveBtn.addEventListener('click', () => {
            this.leaveVoiceRoom();
        });
    }
    
    initializeKeyboardControls() {
        // Push-to-talk controls
        document.addEventListener('keydown', (e) => {
            if (e.code === this.pushToTalkKey && this.isPushToTalk && this.isInVoiceRoom) {
                e.preventDefault();
                this.startPushToTalk();
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (e.code === this.pushToTalkKey && this.isPushToTalk && this.isInVoiceRoom) {
                e.preventDefault();
                this.stopPushToTalk();
            }
        });
    }
    
    async joinVoiceRoom() {
        try {
            this.isInVoiceRoom = true;
            this.updateUI();
            
            // Join as listener first (no microphone required)
            socket.emit('join voice room', { username, listenOnly: true });
            
            this.voiceStatus.textContent = 'In voice chat (listening)';
            showNotification('Joined voice chat as listener', 'success');
            
        } catch (error) {
            console.error('Error joining voice room:', error);
            showNotification('Failed to join voice chat', 'error');
            this.isInVoiceRoom = false;
            this.updateUI();
        }
    }
    
    async toggleMicrophone() {
        if (!this.isInVoiceRoom) {
            showNotification('Join voice chat first', 'error');
            return;
        }
        
        if (!this.isMicEnabled) {
            await this.enableMicrophone();
        } else {
            this.disableMicrophone();
        }
    }
    
    async enableMicrophone() {
        try {
            // Request microphone access
            const micStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 44100
                } 
            });
            
            // Store microphone stream separately
            this.microphoneStream = micStream;
            this.isMicEnabled = true;
            this.setupVoiceActivityDetection();
            this.updateUI();
            
            // Add our audio track to all existing peer connections
            Object.values(this.peerConnections).forEach(pc => {
                micStream.getAudioTracks().forEach(track => {
                    pc.addTrack(track, micStream);
                });
            });
            
            // Notify server that we're now speaking
            socket.emit('microphone enabled', username);
            
            this.voiceStatus.textContent = 'In voice chat (speaking enabled)';
            showNotification('Microphone enabled', 'success');
            
        } catch (error) {
            console.error('Error accessing microphone:', error);
            showNotification('Unable to access microphone. Check permissions.', 'error');
        }
    }
    
    disableMicrophone() {
        // Only disable microphone tracks, but keep listening capability
        if (this.microphoneStream) {
            // Stop microphone stream
            this.microphoneStream.getTracks().forEach(track => track.stop());
            
            // Remove microphone tracks from all peer connections
            Object.values(this.peerConnections).forEach(pc => {
                const audioSenders = pc.getSenders().filter(sender => 
                    sender.track && sender.track.kind === 'audio'
                );
                audioSenders.forEach(sender => pc.removeTrack(sender));
            });
            
            this.microphoneStream = null;
        }
        
        if (this.voiceActivityDetector) {
            this.voiceActivityDetector.disconnect();
            this.voiceActivityDetector = null;
        }
        
        this.isMicEnabled = false;
        this.isPushToTalk = false;
        this.updateUI();
        
        // Notify server that we're no longer speaking (but still listening)
        socket.emit('microphone disabled', username);
        
        // Update status to show we're still in voice chat but just listening
        this.voiceStatus.textContent = 'In voice chat (listening only)';
        showNotification('Microphone disabled - You can still hear others', 'info');
    }
    
    togglePushToTalk() {
        if (!this.isMicEnabled) {
            showNotification('Enable microphone first', 'error');
            return;
        }
        
        this.isPushToTalk = !this.isPushToTalk;
        this.updateUI();
        
        if (this.isPushToTalk) {
            showNotification('Push-to-talk enabled (Hold SPACE to speak)', 'info');
            // Mute microphone when push-to-talk is enabled
            this.setMicrophoneEnabled(false);
        } else {
            showNotification('Push-to-talk disabled', 'info');
            // Unmute microphone when push-to-talk is disabled
            this.setMicrophoneEnabled(true);
        }
    }
    
    startPushToTalk() {
        if (!this.isPushToTalk || !this.isMicEnabled) return;
        
        this.setMicrophoneEnabled(true);
        this.showPushToTalkIndicator(true);
        socket.emit('speaking', { username, speaking: true });
    }
    
    stopPushToTalk() {
        if (!this.isPushToTalk || !this.isMicEnabled) return;
        
        this.setMicrophoneEnabled(false);
        this.showPushToTalkIndicator(false);
        socket.emit('speaking', { username, speaking: false });
    }
    
    setMicrophoneEnabled(enabled) {
        if (this.microphoneStream) {
            this.microphoneStream.getAudioTracks().forEach(track => {
                track.enabled = enabled;
            });
        }
    }
    
    showPushToTalkIndicator(show) {
        let indicator = document.getElementById('ptt-indicator');
        
        if (show) {
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.id = 'ptt-indicator';
                indicator.className = 'ptt-indicator';
                indicator.innerHTML = '<i class="fas fa-microphone"></i> Push to Talk Active';
                document.body.appendChild(indicator);
            }
            indicator.style.display = 'block';
        } else {
            if (indicator) {
                indicator.style.display = 'none';
            }
        }
    }
    
    setupVoiceActivityDetection() {
        if (!this.microphoneStream || this.isPushToTalk) return;
        
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            const microphone = audioContext.createMediaStreamSource(this.microphoneStream);
            
            analyser.smoothingTimeConstant = 0.8;
            analyser.fftSize = 1024;
            
            microphone.connect(analyser);
            
            const checkAudioLevel = () => {
                const array = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteFrequencyData(array);
                const arraySum = array.reduce((a, value) => a + value, 0);
                const average = arraySum / array.length;
                
                // Emit speaking status based on audio level
                const isSpeaking = average > 20;
                socket.emit('speaking', { username, speaking: isSpeaking });
                
                if (this.isMicEnabled && !this.isPushToTalk) {
                    requestAnimationFrame(checkAudioLevel);
                }
            };
            
            checkAudioLevel();
            this.voiceActivityDetector = analyser;
            
        } catch (error) {
            console.error('Error setting up voice activity detection:', error);
        }
    }
    
    async createPeerConnection(userId) {
        try {
            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' }
                ]
            });
            
            // Add our audio track if microphone is enabled
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    pc.addTrack(track, this.localStream);
                });
            }
            
            // Handle incoming audio streams
            pc.ontrack = (event) => {
                this.handleIncomingAudio(userId, event.streams[0]);
            };
            
            // Handle ICE candidates
            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('ice candidate', {
                        candidate: event.candidate,
                        to: userId
                    });
                }
            };
            
            // Handle connection state changes
            pc.onconnectionstatechange = () => {
                console.log(`Connection state with ${userId}:`, pc.connectionState);
                if (pc.connectionState === 'failed') {
                    this.reconnectPeer(userId);
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
        // Remove existing audio element if any
        if (this.audioElements[userId]) {
            this.audioElements[userId].remove();
        }
        
        // Create new audio element
        const audio = document.createElement('audio');
        audio.id = `audio-${userId}`;
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.volume = 0.8; // Default volume
        audio.style.display = 'none';
        
        document.body.appendChild(audio);
        this.audioElements[userId] = audio;
        
        console.log(`Audio stream received from user ${userId}`);
    }
    
    setUserVolume(userId, volume) {
        if (this.audioElements[userId]) {
            this.audioElements[userId].volume = volume;
        }
    }
    
    async reconnectPeer(userId) {
        console.log(`Attempting to reconnect to ${userId}`);
        
        // Close existing connection
        if (this.peerConnections[userId]) {
            this.peerConnections[userId].close();
            delete this.peerConnections[userId];
        }
        
        // Create new connection
        const pc = await this.createPeerConnection(userId);
        if (pc) {
            // Send new offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            socket.emit('voice offer', {
                offer: pc.localDescription,
                to: userId
            });
        }
    }
    
    leaveVoiceRoom() {
        this.isInVoiceRoom = false;
        this.disableMicrophone();
        
        // Stop local stream if exists
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        // Stop microphone stream if exists
        if (this.microphoneStream) {
            this.microphoneStream.getTracks().forEach(track => track.stop());
            this.microphoneStream = null;
        }
        
        // Close all peer connections
        Object.values(this.peerConnections).forEach(pc => pc.close());
        this.peerConnections = {};
        
        // Remove all audio elements
        Object.values(this.audioElements).forEach(audio => audio.remove());
        this.audioElements = {};
        
        // Clear users in call
        this.usersInCall.innerHTML = '';
        
        // Notify server
        socket.emit('leave voice room');
        
        this.voiceStatus.textContent = 'Not in voice chat';
        this.updateUI();
        
        showNotification('Left voice chat', 'info');
    }
    
    updateUI() {
        // Update join button
        this.joinBtn.classList.toggle('active', this.isInVoiceRoom);
        this.joinBtn.disabled = this.isInVoiceRoom;
        
        // Update microphone button
        this.micBtn.disabled = !this.isInVoiceRoom;
        this.micBtn.classList.toggle('active', this.isMicEnabled);
        this.micBtn.innerHTML = this.isMicEnabled ? 
            '<i class="fas fa-microphone"></i>' : 
            '<i class="fas fa-microphone-slash"></i>';
        
        // Update push-to-talk button
        this.pttBtn.disabled = !this.isMicEnabled;
        this.pttBtn.classList.toggle('active', this.isPushToTalk);
        
        // Update leave button
        this.leaveBtn.style.display = this.isInVoiceRoom ? 'flex' : 'none';
    }
    
    addUserToCall(userData) {
        const existingUser = document.getElementById(`voice-user-${userData.userId}`);
        if (existingUser) return; // User already in call
        
        const userElement = document.createElement('div');
        userElement.id = `voice-user-${userData.userId}`;
        userElement.className = 'user-in-call';
        
        const micIcon = userData.hasMicrophone ? 'fa-microphone' : 'fa-headphones';
        const micStatus = userData.hasMicrophone ? 'Speaking' : 'Listening';
        
        userElement.innerHTML = `
            <i class="fas ${micIcon}" id="user-mic-${userData.userId}"></i>
            <span>${userData.username}</span>
            <small style="opacity: 0.8;">(${micStatus})</small>
        `;
        
        // Add volume control for users with microphones
        if (userData.hasMicrophone && userData.userId !== socket.id) {
            const volumeControl = document.createElement('input');
            volumeControl.type = 'range';
            volumeControl.min = '0';
            volumeControl.max = '1';
            volumeControl.step = '0.1';
            volumeControl.value = '0.8';
            volumeControl.style.width = '60px';
            volumeControl.style.marginLeft = '8px';
            
            volumeControl.addEventListener('input', (e) => {
                this.setUserVolume(userData.userId, parseFloat(e.target.value));
            });
            
            userElement.appendChild(volumeControl);
        }
        
        this.usersInCall.appendChild(userElement);
    }
    
    removeUserFromCall(userId) {
        const userElement = document.getElementById(`voice-user-${userId}`);
        if (userElement) {
            userElement.remove();
        }
        
        // Remove audio element
        if (this.audioElements[userId]) {
            this.audioElements[userId].remove();
            delete this.audioElements[userId];
        }
        
        // Close peer connection
        if (this.peerConnections[userId]) {
            this.peerConnections[userId].close();
            delete this.peerConnections[userId];
        }
    }
    
    updateUserSpeakingStatus(userId, speaking) {
        const userElement = document.getElementById(`voice-user-${userId}`);
        if (userElement) {
            userElement.classList.toggle('speaking', speaking);
        }
    }
    
    updateUserMicrophoneStatus(userId, hasMicrophone) {
        const micIcon = document.getElementById(`user-mic-${userId}`);
        const userElement = document.getElementById(`voice-user-${userId}`);
        
        if (micIcon && userElement) {
            if (hasMicrophone) {
                micIcon.className = 'fas fa-microphone';
                userElement.classList.remove('muted');
            } else {
                micIcon.className = 'fas fa-headphones';
                userElement.classList.add('muted');
            }
        }
    }
}

// Initialize voice chat system
const voiceChat = new VoiceChat();

// Enhanced Voice Chat Socket Events
socket.on('user joined voice', async (userData) => {
    console.log('User joined voice:', userData);
    voiceChat.addUserToCall(userData);
    
    // Don't create connection to self
    if (userData.userId === socket.id) return;
    
    // Create peer connection and send offer if we have microphone enabled
    if (voiceChat.isMicEnabled || userData.hasMicrophone) {
        const pc = await voiceChat.createPeerConnection(userData.userId);
        if (pc) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            socket.emit('voice offer', {
                offer: pc.localDescription,
                to: userData.userId
            });
        }
    }
});

socket.on('user left voice', (userId) => {
    console.log('User left voice:', userId);
    voiceChat.removeUserFromCall(userId);
});

socket.on('user speaking', (data) => {
    voiceChat.updateUserSpeakingStatus(data.userId, data.speaking);
});

socket.on('user microphone changed', (data) => {
    voiceChat.updateUserMicrophoneStatus(data.userId, data.hasMicrophone);
    
    // If user enabled microphone, create peer connection if we don't have one
    if (data.hasMicrophone && !voiceChat.peerConnections[data.userId] && data.userId !== socket.id) {
        voiceChat.createPeerConnection(data.userId).then(async (pc) => {
            if (pc) {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                
                socket.emit('voice offer', {
                    offer: pc.localDescription,
                    to: data.userId
                });
            }
        });
    }
});

socket.on('voice offer', async (data) => {
    try {
        const pc = voiceChat.peerConnections[data.from] || await voiceChat.createPeerConnection(data.from);
        if (!pc) return;
        
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        socket.emit('voice answer', {
            answer: pc.localDescription,
            to: data.from
        });
    } catch (error) {
        console.error('Error handling voice offer:', error);
    }
});

socket.on('voice answer', async (data) => {
    try {
        const pc = voiceChat.peerConnections[data.from];
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
    } catch (error) {
        console.error('Error handling voice answer:', error);
    }
});

socket.on('ice candidate', async (data) => {
    try {
        const pc = voiceChat.peerConnections[data.from];
        if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
});

socket.on('voice room users', (users) => {
    // Clear existing users and add all current users
    voiceChat.usersInCall.innerHTML = '';
    users.forEach(user => {
        voiceChat.addUserToCall(user);
    });
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (voiceChat.isInVoiceRoom) {
        voiceChat.leaveVoiceRoom();
    }
});

// Load YouTube API
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

// Add this event handler after your other socket.on events

// Handle detailed sync data from admin
socket.on('detailed sync', (data) => {
    if (!isAdmin && player) {
        console.log("Received detailed sync:", data);
        
        // Make sure data has timestamp
        if (!data.timestamp) {
            data.timestamp = Date.now();
            console.log("Missing timestamp in sync data, using current time");
        }
        
        // Calculate any network delay compensation if needed
        const networkDelay = Date.now() - data.timestamp;
        console.log("Network delay:", networkDelay, "ms");
        
        // Set ignore flag to prevent event feedback loops
        ignoreEvents = true;
        
        // First update the time if it's significantly different
        player.getCurrentTime().then(currentTime => {
            // Check if we're at the beginning but admin is not (prevents unexpected restarts)
            const userIsAtStart = currentTime < 1;
            const adminIsWellAhead = data.time > 5;
            
            // If user is at start but admin is not, this is likely an unwanted restart
            if (userIsAtStart && adminIsWellAhead) {
                console.log("Preventing unwanted restart. Syncing to admin time:", data.time);
                player.seekTo(data.time);
            } 
            // Regular sync case - only seek if we're more than 3 seconds out of sync
            else if (Math.abs(currentTime - data.time) > 3) {
                console.log("Syncing time from", currentTime, "to", data.time);
                player.seekTo(data.time);
            }
            
            // Then set the correct playing state, but only if different
            setTimeout(() => {
                // Only change state if necessary
                if (data.state === 1 && player.playerState !== 1) {
                    // Admin is playing but we're not
                    console.log("Syncing state to PLAYING");
                    player.playVideo();
                } else if (data.state !== 1 && player.playerState === 1) {
                    // Admin is not playing but we are
                    console.log("Syncing state to PAUSED");
                    player.pauseVideo();
                } else {
                    console.log("No state change needed, current state:", player.playerState);
                }
                
                // Reset ignore flag after operations complete
                setTimeout(() => {
                    ignoreEvents = false;
                }, 500);
            }, 500);
        }).catch(err => {
            console.error("Error during sync:", err);
            ignoreEvents = false;
        });
    }
});

// Authentication and initialization
document.addEventListener('DOMContentLoaded', function() {
    // Initialize authentication state
    initializeAuth();
    
    // Initialize user interface
    initializeUI();
});

function initializeAuth() {
    // If user is authenticated, use their data
    if (authToken && userData) {
        username = userData.username;
        usernameModal.style.display = 'none';
        socket.emit('user join', username);
        updateUserInterface();
    } 
    // If user is in guest mode, show username modal
    else if (isGuestMode) {
        usernameModal.style.display = 'flex';
    } 
    // If not authenticated and not guest, redirect to login
    else {
        window.location.href = '/login.html';
    }
}

function updateUserInterface() {
    // Add user profile section to the chat
    const chatSection = document.querySelector('.chat-section');
    
    // Remove existing user info if any
    const existingUserInfo = document.getElementById('user-info');
    if (existingUserInfo) {
        existingUserInfo.remove();
    }
    
    // Create user info section
    const userInfo = document.createElement('div');
    userInfo.id = 'user-info';
    userInfo.innerHTML = `
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    color: white; 
                    padding: 15px; 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 40px; 
                           height: 40px; 
                           background: rgba(255,255,255,0.2); 
                           border-radius: 50%; 
                           display: flex; 
                           align-items: center; 
                           justify-content: center; 
                           font-weight: bold;">
                    ${userData ? userData.avatar : username.substring(0, 2).toUpperCase()}
                </div>
                <div>
                    <div style="font-weight: 600;">${username}</div>
                    <div style="font-size: 12px; opacity: 0.8;">
                        ${authToken ? 'Registered User' : 'Guest User'}
                    </div>
                </div>
            </div>
            <div style="display: flex; gap: 10px;">
                ${!authToken ? `
                    <button onclick="goToLogin()" 
                            style="background: rgba(255,255,255,0.2); 
                                   border: none; 
                                   color: white; 
                                   padding: 5px 10px; 
                                   border-radius: 5px; 
                                   cursor: pointer;
                                   font-size: 12px;">
                        Login
                    </button>
                ` : ''}
                <button onclick="logout()" 
                        style="background: rgba(255,255,255,0.2); 
                               border: none; 
                               color: white; 
                               padding: 5px 10px; 
                               border-radius: 5px; 
                               cursor: pointer;
                               font-size: 12px;">
                    <i class="fas fa-sign-out-alt"></i>
                </button>
            </div>
        </div>
    `;
    
    // Insert at the top of chat section
    chatSection.insertBefore(userInfo, chatSection.firstChild);
}

function initializeUI() {
    // Add error message handling for chat
    socket.on('error message', (message) => {
        showNotification(message, 'error');
    });
    
    // Handle connection errors
    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        if (error.message.includes('Authentication') || error.message.includes('token')) {
            showNotification('Authentication failed. Please log in again.', 'error');
            logout();
        }
    });
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 10px;
        color: white;
        font-weight: 600;
        z-index: 10000;
        animation: slideInRight 0.3s ease;
        max-width: 300px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
    `;
    
    // Set color based on type
    switch (type) {
        case 'error':
            notification.style.background = 'linear-gradient(135deg, #ff6b6b, #ee5a52)';
            break;
        case 'success':
            notification.style.background = 'linear-gradient(135deg, #51cf66, #40c057)';
            break;
        default:
            notification.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
    }
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Remove after 5 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

function goToLogin() {
    window.location.href = '/login.html';
}

function logout() {
    // Clear local storage
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    localStorage.removeItem('guestMode');
    
    // Call logout API if authenticated
    if (authToken) {
        fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        }).catch(error => {
            console.error('Logout error:', error);
        });
    }
    
    // Disconnect socket
    socket.disconnect();
    
    // Redirect to login
    window.location.href = '/login.html';
}

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);