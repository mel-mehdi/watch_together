const socket = io();
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
const voiceChatToggle = document.getElementById('voice-chat-toggle');
const voiceStatus = document.getElementById('voice-status');
const usersInCall = document.getElementById('users-in-call');

let username = '';
let isAdmin = false;
let currentAdminUser = '';
let requestingUserId = '';
let player = null;
let vimeoPlayer = null;
let ignoreEvents = false;
let localStream = null;
let peerConnections = {};
let isInVoiceChat = false;
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
                    socket.emit('admin action', 'play');
                });
            }
        });
        
        vimeoPlayer.on('pause', () => {
            player.playerState = 2;
            if (isAdmin && !ignoreEvents) {
                vimeoPlayer.getCurrentTime().then(time => {
                    socket.emit('video pause', time);
                    socket.emit('admin action', 'pause');
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
            socket.emit('admin action', 'play');
        }
    });
    
    directVideoPlayer.addEventListener('pause', () => {
        player.playerState = 2;
        if (isAdmin && !ignoreEvents) {
            socket.emit('video pause', directVideoPlayer.currentTime);
            socket.emit('admin action', 'pause');
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
                            socket.emit('admin action', 'play');
                            console.log("Admin auto-detected play, time:", time, 
                                        isAutoplayOrManualStart ? "(video start)" : "(mid-video)");
                        });
                    } else if (data.info === 2) { // paused
                        player.getCurrentTime().then(time => {
                            socket.emit('video pause', time);
                            socket.emit('admin action', 'pause');
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
    if (input.value) {
        socket.emit('chat message', input.value);
        input.value = '';
    }
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
    
    // Show visual indicator for non-admins
    if (!isAdmin) {
        adminViewingNotice.textContent = "Admin started playback";
        adminViewingNotice.style.display = 'block';
        setTimeout(() => {
            adminViewingNotice.style.display = 'none';
        }, 3000);
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
    
    // Show visual indicator for non-admins
    if (!isAdmin) {
        adminViewingNotice.textContent = "Admin paused playback";
        adminViewingNotice.style.display = 'block';
        setTimeout(() => {
            adminViewingNotice.style.display = 'none';
        }, 3000);
    }
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
socket.on('chat message', (data) => {
    const item = document.createElement('li');
    
    // Create username element
    const usernameElement = document.createElement('div');
    usernameElement.classList.add('username');
    usernameElement.textContent = data.username;
    
    // Add admin badge if message is from admin
    if (data.isAdmin) {
        const adminBadge = document.createElement('span');
        adminBadge.classList.add('admin-badge');
        adminBadge.textContent = 'ADMIN';
        usernameElement.appendChild(adminBadge);
    }
    
    // Create message element
    const messageElement = document.createElement('div');
    messageElement.textContent = data.message;
    
    // Create timestamp element
    const timestampElement = document.createElement('div');
    timestampElement.classList.add('timestamp');
    timestampElement.textContent = data.timestamp;
    
    // Add elements to list item
    item.appendChild(usernameElement);
    item.appendChild(messageElement);
    item.appendChild(timestampElement);
    
    // Style differently based on who sent the message
    if (data.username === username) {
        item.classList.add('message-sent');
    } else {
        item.classList.add('message-received');
    }
    
    messages.appendChild(item);
    
    // Scroll to bottom
    document.querySelector('.chat-container').scrollTop = document.querySelector('.chat-container').scrollHeight;
});

// Handle system messages (join/leave)
socket.on('system message', (msg) => {
    const item = document.createElement('li');
    item.classList.add('system-message');
    item.textContent = msg;
    messages.appendChild(item);
    document.querySelector('.chat-container').scrollTop = document.querySelector('.chat-container').scrollHeight;
});

// Admin play button - Fix to maintain current time
adminPlayBtn.addEventListener('click', async () => {
    if (isAdmin) {
        try {
            const currentTime = await player.getCurrentTime();
            player.playVideo();
            socket.emit('video play', currentTime);
            socket.emit('admin action', 'play');
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
            socket.emit('admin action', 'pause');
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
            socket.emit('admin action', 'restart');
            console.log("Admin restart button clicked");
        } catch (e) {
            console.error("Error in admin restart:", e);
        }
    }
});

// Listen for admin actions for visual cues
socket.on('admin action', (action) => {
    if (!isAdmin) {
        adminViewingNotice.textContent = `Admin ${action}ed the video`;
        adminViewingNotice.style.display = 'block';
        setTimeout(() => {
            adminViewingNotice.style.display = 'none';
        }, 3000);
    }
});

// Voice Chat functionality
// Toggle voice chat
voiceChatToggle.addEventListener('click', async () => {
    if (!isInVoiceChat) {
        try {
            // Request microphone access
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Join voice chat room
            socket.emit('join voice chat', username);
            
            // When joining voice chat
            voiceChatToggle.classList.add('active');
            voiceChatToggle.innerHTML = '<i class="fas fa-microphone-slash"></i>';
            
            voiceStatus.textContent = 'Voice chat active';
            isInVoiceChat = true;
            
            // Set up voice activity detection
            setupVoiceActivityDetection(localStream);
            
        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Unable to access your microphone. Please check permissions.');
        }
    } else {
        // Leave voice chat
        leaveVoiceChat();
    }
});

// Leave voice chat
function leaveVoiceChat() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    // Close all peer connections
    Object.values(peerConnections).forEach(pc => pc.close());
    peerConnections = {};
    
    // Notify server
    socket.emit('leave voice chat');
    
    // When leaving voice chat
    voiceChatToggle.classList.remove('active');
    voiceChatToggle.innerHTML = '<i class="fas fa-microphone"></i>';
    voiceStatus.textContent = 'Voice chat inactive';
    usersInCall.innerHTML = '';
    isInVoiceChat = false;
}

// Set up voice activity detection
function setupVoiceActivityDetection(stream) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(stream);
    const scriptProcessor = audioContext.createScriptProcessor(2048, 1, 1);
    
    analyser.smoothingTimeConstant = 0.8;
    analyser.fftSize = 1024;
    
    microphone.connect(analyser);
    analyser.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);
    
    scriptProcessor.onaudioprocess = function() {
        const array = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(array);
        const arraySum = array.reduce((a, value) => a + value, 0);
        const average = arraySum / array.length;
        
        // If sound level is above threshold, emit speaking event
        if (average > 15) {
            socket.emit('speaking', true);
        } else {
            socket.emit('speaking', false);
        }
    };
}

// Create peer connection for new user
async function createPeerConnection(userId) {
    try {
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });
        
        // Add our audio track to the connection
        if (localStream) {
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
            });
        }
        
        // Listen for remote tracks
        pc.ontrack = (event) => {
            const remoteAudio = document.createElement('audio');
            remoteAudio.id = `audio-${userId}`;
            remoteAudio.srcObject = event.streams[0];
            remoteAudio.autoplay = true;
            document.body.appendChild(remoteAudio);
        };
        
        // Listen for ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice candidate', {
                    candidate: event.candidate,
                    to: userId
                });
            }
        };
        
        peerConnections[userId] = pc;
        return pc;
    } catch (error) {
        console.error('Error creating peer connection:', error);
        return null;
    }
}

// Socket events for voice chat
socket.on('user joined voice', async (data) => {
    // Add user to voice chat list
    const userElement = document.createElement('div');
    userElement.id = `voice-user-${data.userId}`;
    userElement.className = 'user-in-call';
    userElement.innerHTML = `<i class="fas fa-microphone"></i> ${data.username}`;
    usersInCall.appendChild(userElement);
    
    // Don't create connection to self
    if (data.userId === socket.id) return;
    
    // Create peer connection and send offer
    const pc = await createPeerConnection(data.userId);
    if (pc) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        socket.emit('voice offer', {
            offer: pc.localDescription,
            to: data.userId
        });
    }
});

socket.on('user left voice', (userId) => {
    // Remove user from voice chat list
    const userElement = document.getElementById(`voice-user-${userId}`);
    if (userElement) {
        userElement.remove();
    }
    
    // Remove audio element
    const audioElement = document.getElementById(`audio-${userId}`);
    if (audioElement) {
        audioElement.remove();
    }
    
    // Close peer connection
    if (peerConnections[userId]) {
        peerConnections[userId].close();
        delete peerConnections[userId];
    }
});

socket.on('voice offer', async (data) => {
    if (!isInVoiceChat) return;
    
    // Create peer connection if it doesn't exist
    if (!peerConnections[data.from]) {
        await createPeerConnection(data.from);
    }
    
    const pc = peerConnections[data.from];
    
    // Set remote description from offer
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    
    // Create answer
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    // Send answer back
    socket.emit('voice answer', {
        answer: pc.localDescription,
        to: data.from
    });
});

socket.on('voice answer', async (data) => {
    const pc = peerConnections[data.from];
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
});

socket.on('ice candidate', async (data) => {
    const pc = peerConnections[data.from];
    if (pc) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    }
});

socket.on('user speaking', (data) => {
    const userElement = document.getElementById(`voice-user-${data.userId}`);
    if (userElement) {
        if (data.speaking) {
            userElement.classList.add('speaking');
        } else {
            userElement.classList.remove('speaking');
        }
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (isInVoiceChat) {
        leaveVoiceChat();
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