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
const voiceChatToggle = document.getElementById('voice-chat-toggle');
const voiceStatus = document.getElementById('voice-status');
const usersInCall = document.getElementById('users-in-call');

let username = '';
let isAdmin = false;
let currentAdminUser = '';
let requestingUserId = '';
let player;
let ignoreEvents = false;
let localStream = null;
let peerConnections = {};
let isInVoiceChat = false;

// Add these variables at the top with your other variables
let syncInterval;
const SYNC_INTERVAL_MS = 5000; // Sync every 5 seconds
let lastKnownAdminTime = 0;
let lastSyncTime = 0;

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

// Add a function to listen for YouTube iframe events
function setupYouTubeEventListeners() {
    window.addEventListener('message', (event) => {
        if (event.origin !== "https://www.youtube.com") return;
        
        try {
            const data = JSON.parse(event.data);
            
            // Only react to YouTube API events
            if (data.event && data.event === "onStateChange") {
                player.playerState = data.info;
                
                // Only the admin should control the video for everyone
                if (isAdmin && !ignoreEvents) {
                    if (data.info === 1) { // playing
                        player.getCurrentTime().then(time => {
                            socket.emit('video play', time);
                            socket.emit('admin action', 'play');
                            console.log("Admin auto-detected play, time:", time);
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
                    // Only send updates when there's a significant change
                    if (Math.abs(currentTime - lastKnownAdminTime) > 0.5 || 
                        Date.now() - lastSyncTime > 10000) { // Force update every 10 seconds
                        
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
                            state: playerState
                        });
                    }
                })
                .catch(err => {
                    console.error("Error during continuous sync:", err);
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
            player.seekTo(state.currentTime);
            
            // Set play state after seeking
            setTimeout(() => {
                if (state.playing) {
                    player.playVideo();
                }
            }, 500);
        }
    }, 1000); // Give some time for player to initialize
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
    
    // Only seek if the time difference is significant
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