const socket = io();
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const usernameModal = document.getElementById('username-modal');
const usernameInput = document.getElementById('username-input');
const usernameSubmit = document.getElementById('username-submit');
const videoPlayer = document.getElementById('video-player');
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

let username = '';
let isAdmin = false;
let currentAdminUser = '';
let requestingUserId = '';
let player;
let ignoreEvents = false;

// Create a better YouTube player object
function onYouTubeIframeAPIReady() {
    console.log("YouTube API is ready");
    
    // If we already have a video URL, initialize the player
    if (videoPlayer.src) {
        setupYouTubeControlAPI();
    }
}

// Initialize player with video URL
function initializePlayer(videoUrl) {
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
    
    // Setup the player control API after the iframe is loaded
    videoPlayer.onload = setupYouTubeControlAPI;
}

// Setup the YouTube player control API
function setupYouTubeControlAPI() {
    player = {
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
        },
        pauseVideo: function() {
            videoPlayer.contentWindow.postMessage(JSON.stringify({
                event: 'command',
                func: 'pauseVideo'
            }), '*');
        }
    };
    
    console.log("YouTube player control API is set up");
}

// Update admin UI
function updateAdminUI() {
    if (isAdmin) {
        adminControls.style.display = 'block';
        adminNotice.textContent = 'You are the admin controller';
        adminNotice.style.display = 'block';
        requestAdminContainer.style.display = 'none';
        // Enable video controls (they're always enabled for admin)
    } else {
        adminControls.style.display = 'none';
        adminNotice.textContent = `${currentAdminUser} is controlling the video`;
        adminNotice.style.display = 'block';
        requestAdminContainer.style.display = 'block';
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
    
    // Calculate any time adjustment based on server time if available
    if (typeof data === 'object' && data.serverTime) {
        const latency = (Date.now() - data.serverTime) / 1000; // Convert to seconds
        time = time + latency; // Adjust for network latency
    }
    
    console.log("Video play event received, time:", time);
    
    // First seek to the exact time, then play
    player.seekTo(time);
    setTimeout(() => {
        player.playVideo();
        ignoreEvents = false;
    }, 500);
    
    // Show visual indicator for non-admins
    if (!isAdmin) {
        adminViewingNotice.textContent = "Admin started playback";
        adminViewingNotice.style.display = 'block';
        setTimeout(() => {
            adminViewingNotice.style.display = 'none';
        }, 3000);
    }
});

// Update the video pause event handler similarly
socket.on('video pause', (data) => {
    if (!player) {
        console.log("Player not initialized yet");
        return;
    }
    
    ignoreEvents = true;
    
    // If we received a timestamp object
    let time = typeof data === 'object' ? data.time : data;
    
    console.log("Video pause event received, time:", time);
    
    player.seekTo(time);
    setTimeout(() => {
        player.pauseVideo();
        ignoreEvents = false;
    }, 500);
    
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

// Admin play button
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

// Admin pause button
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

// Load YouTube API
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);