// Room and user state
let currentRoom = null;
let username = null;
let connections = {};
let peers = {};
let videoSyncStatus = {
    isPlaying: false,
    currentTime: 0,
    videoUrl: ''
};

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Check if we have a room ID in the URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    
    if (roomId) {
        document.getElementById('join-room-id').value = roomId;
    }
    
    // Set up event handlers
    document.getElementById('create-room').addEventListener('click', createRoom);
    document.getElementById('join-room').addEventListener('click', joinRoom);
    document.getElementById('load-video').addEventListener('click', loadVideo);
    document.getElementById('send-message').addEventListener('click', sendChatMessage);
    document.getElementById('message-input').addEventListener('keypress', e => {
        if (e.key === 'Enter') sendChatMessage();
    });
    document.getElementById('copy-link').addEventListener('click', copyRoomLink);
    document.getElementById('toggle-user-list').addEventListener('click', toggleUserList);
    
    // Set up user list toggle
    document.getElementById('toggle-user-list').addEventListener('click', toggleUserList);
    
    // Allow users to set their username
    const usernameInput = document.getElementById('username-input');
    if (usernameInput) {
        usernameInput.addEventListener('change', () => {
            const newUsername = usernameInput.value.trim();
            if (newUsername) {
                const oldUsername = username;
                username = newUsername;
                if (currentRoom) {
                    addSystemMessage(`You changed your name from ${oldUsername} to ${username}`);
                    // In a real app, broadcast this change to other users
                }
            }
        });
    }
    
    // Get username
    username = 'User_' + Math.floor(Math.random() * 1000);
    document.getElementById('username-input').value = username;
    
    // Set up video player events
    const videoPlayer = document.getElementById('video-player');
    videoPlayer.addEventListener('play', () => {
        if (currentRoom) {
            videoSyncStatus.isPlaying = true;
            videoSyncStatus.currentTime = videoPlayer.currentTime;
            broadcastVideoState();
        }
    });
    
    videoPlayer.addEventListener('pause', () => {
        if (currentRoom) {
            videoSyncStatus.isPlaying = false;
            videoSyncStatus.currentTime = videoPlayer.currentTime;
            broadcastVideoState();
        }
    });
    
    videoPlayer.addEventListener('seeked', () => {
        if (currentRoom) {
            videoSyncStatus.currentTime = videoPlayer.currentTime;
            broadcastVideoState();
        }
    });
});

// Create a new room
function createRoom() {
    const roomName = document.getElementById('create-room-name').value.trim();
    if (!roomName) {
        alert('Please enter a room name');
        return;
    }
    
    // Generate a random room ID
    currentRoom = roomName + '_' + Math.random().toString(36).substr(2, 9);
    document.getElementById('room-id').textContent = currentRoom;
    
    // Update URL with room ID
    const url = new URL(window.location);
    url.searchParams.set('room', currentRoom);
    window.history.pushState({}, '', url);
    
    // Hide modal
    document.getElementById('room-modal').style.display = 'none';
    
    // Add system message
    addSystemMessage(`Room "${roomName}" created. Share the link with friends!`);
    
    // Initialize room connection using PeerJS
    initializePeerConnection(true);
}

// Join an existing room
function joinRoom() {
    const roomId = document.getElementById('join-room-id').value.trim();
    if (!roomId) {
        alert('Please enter a room ID');
        return;
    }
    
    currentRoom = roomId;
    document.getElementById('room-id').textContent = currentRoom;
    
    // Update URL with room ID
    const url = new URL(window.location);
    url.searchParams.set('room', currentRoom);
    window.history.pushState({}, '', url);
    
    // Hide modal
    document.getElementById('room-modal').style.display = 'none';
    
    // Add system message
    addSystemMessage(`Joining room "${currentRoom}"...`);
    
    // Initialize room connection using PeerJS
    initializePeerConnection(false);
}

// Initialize peer connection
function initializePeerConnection(isHost) {
    // Load PeerJS from CDN if not already loaded
    if (!window.Peer) {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/peerjs@1.4.7/dist/peerjs.min.js';
        script.onload = () => setupPeer(isHost);
        document.head.appendChild(script);
        return;
    }
    
    setupPeer(isHost);
}

// Set up PeerJS connection
function setupPeer(isHost) {
    // Create a unique peer ID using room and username
    const peerId = `${currentRoom}_${username}_${Math.random().toString(36).substr(2, 9)}`;
    
    addSystemMessage("Connecting to signaling server...");
    
    // Connect to PeerJS public server or specify your own
    const peer = new Peer(peerId, {
        debug: 2
    });
    
    // Handle connection open
    peer.on('open', id => {
        addSystemMessage("Connected to signaling server!");
        
        // Store peer ID
        connections[username] = { peerId: id };
        
        // If joining an existing room, try to connect to the host
        if (!isHost) {
            connectToRoomHost();
        } else {
            updateUserCount();
            updateUserListUI();
        }
    });
    
    // Handle incoming connections
    peer.on('connection', conn => {
        // Incoming connection from peer
        setUpConnection(conn);
    });
    
    // Handle errors
    peer.on('error', error => {
        console.error('PeerJS error:', error);
        addSystemMessage("Connection error: " + error.type);
    });
    
    // Save peer object
    window.myPeer = peer;
    
    // Function to connect to room host
    function connectToRoomHost() {
        // In this simplified version, we'll try connecting to any peer by broadcasting
        broadcastRoomPresence();
    }
    
    // Broadcast presence in the room
    function broadcastRoomPresence() {
        addSystemMessage("Looking for other users in the room...");
        
        // Create a special ID for room presence
        const presenceId = `${currentRoom}_presence`;
        
        // Connect to presence channel
        const conn = peer.connect(presenceId, { reliable: true, metadata: { username, peerId: peer.id } });
        
        conn.on('open', () => {
            // Successfully connected to presence channel
            conn.send({
                type: 'roomJoin',
                username,
                peerId: peer.id,
                videoState: videoSyncStatus
            });
        });
        
        conn.on('error', () => {
            // Failed to connect to presence - likely first one in the room or host offline
            addSystemMessage("You're the first one here or host is offline. Waiting for others to join.");
            
            // Act as host now
            listenForRoomPresence();
        });
    }
    
    // Listen for other peers trying to join the room
    function listenForRoomPresence() {
        // Create a special peer for room presence
        const presenceId = `${currentRoom}_presence`;
        
        // Try to become the presence host
        const presencePeer = new Peer(presenceId, {
            debug: 2
        });
        
        presencePeer.on('open', () => {
            addSystemMessage("Became host for the room.");
            
            // Listen for connections
            presencePeer.on('connection', conn => {
                // New peer joining the room
                conn.on('data', data => {
                    if (data.type === 'roomJoin') {
                        // Connect to the new peer
                        const newConn = peer.connect(data.peerId, { reliable: true });
                        setUpConnection(newConn);
                        
                        // Connect the new peer to existing peers (mesh network)
                        // In a full implementation, inform all existing peers about the new one
                    }
                });
            });
        });
        
        presencePeer.on('error', error => {
            if (error.type === 'unavailable-id') {
                // Someone else is already hosting
                addSystemMessage("Connected to room. Looking for host...");
                
                // Try to connect directly to peers in the room
                tryDirectConnection();
            } else {
                console.error('Presence peer error:', error);
            }
        });
        
        window.presencePeer = presencePeer;
    }
    
    // Try direct connections to peers that might be in the room
    function tryDirectConnection() {
        // In a real implementation, you would need some way to discover peers
        // For now, we'll wait for host to connect to us
        addSystemMessage("Waiting for host to establish connection...");
    }
}

// Set up data connection with a peer
function setUpConnection(conn) {
    conn.on('open', () => {
        // New peer connected
        const peerInfo = conn.metadata || { username: 'Unknown User' };
        
        // Store connection
        peers[peerInfo.username] = conn;
        connections[peerInfo.username] = { peerId: conn.peer };
        
        addSystemMessage(`${peerInfo.username} joined the room`);
        updateUserCount();
        updateUserListUI();
        
        // Send current state to new peer
        conn.send({
            type: 'videoState',
            state: videoSyncStatus
        });
        
        // Also send user list
        conn.send({
            type: 'userList',
            users: Object.keys(connections)
        });
    });
    
    conn.on('data', data => {
        // Handle incoming data
        switch(data.type) {
            case 'videoState':
                videoSyncStatus = data.state;
                applyVideoState(data.state);
                break;
                
            case 'chatMessage':
                addUserMessage(data.message, data.username, false);
                break;
                
            case 'userList':
                // Update our user list
                data.users.forEach(user => {
                    if (!connections[user]) {
                        connections[user] = { peerId: null };
                    }
                });
                updateUserCount();
                updateUserListUI();
                break;
        }
    });
    
    conn.on('close', () => {
        // Peer disconnected
        const disconnectedUser = Object.keys(peers).find(user => peers[user] === conn);
        if (disconnectedUser) {
            delete peers[disconnectedUser];
            delete connections[disconnectedUser];
            
            addSystemMessage(`${disconnectedUser} left the room`);
            updateUserCount();
            updateUserListUI();
        }
    });
}

// Load a video from URL
function loadVideo() {
    const videoUrl = document.getElementById('video-url').value.trim();
    if (!videoUrl) {
        alert('Please enter a video URL');
        return;
    }
    
    const videoPlayer = document.getElementById('video-player');
    
    // Check if it's a YouTube URL
    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
        // Extract video ID (simplified)
        let videoId;
        if (videoUrl.includes('v=')) {
            videoId = videoUrl.split('v=')[1].split('&')[0];
        } else if (videoUrl.includes('youtu.be/')) {
            videoId = videoUrl.split('youtu.be/')[1];
        }
        
        if (videoId) {
            // For demonstration purposes, embed using iframe
            const iframe = document.createElement('iframe');
            iframe.width = '100%';
            iframe.height = '100%';
            iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
            iframe.allowFullscreen = true;
            iframe.id = 'youtube-player';
            
            // Replace video element with iframe
            const videoWrapper = document.querySelector('.video-wrapper');
            if (videoPlayer.parentNode === videoWrapper) {
                videoWrapper.replaceChild(iframe, videoPlayer);
            }
            
            // In a real app, you would use the YouTube API for better control
            addSystemMessage(`YouTube video loaded`);
            
            // Store YouTube video ID for syncing
            videoSyncStatus.videoUrl = `youtube:${videoId}`;
        }
    } else {
        // For direct video URLs
        // Ensure we have a video element
        let videoElement = document.getElementById('video-player');
        if (!videoElement) {
            videoElement = document.createElement('video');
            videoElement.id = 'video-player';
            videoElement.controls = true;
            
            const youtubePlayer = document.getElementById('youtube-player');
            if (youtubePlayer) {
                youtubePlayer.parentNode.replaceChild(videoElement, youtubePlayer);
            }
            
            // Re-add event listeners
            videoElement.addEventListener('play', () => {
                if (currentRoom) {
                    videoSyncStatus.isPlaying = true;
                    videoSyncStatus.currentTime = videoElement.currentTime;
                    broadcastVideoState();
                }
            });
            
            videoElement.addEventListener('pause', () => {
                if (currentRoom) {
                    videoSyncStatus.isPlaying = false;
                    videoSyncStatus.currentTime = videoElement.currentTime;
                    broadcastVideoState();
                }
            });
            
            videoElement.addEventListener('seeked', () => {
                if (currentRoom) {
                    videoSyncStatus.currentTime = videoElement.currentTime;
                    broadcastVideoState();
                }
            });
        }
        
        videoElement.src = videoUrl;
        videoElement.load();
        addSystemMessage(`Video loaded: ${videoUrl}`);
        
        // Store direct video URL for syncing
        videoSyncStatus.videoUrl = videoUrl;
    }
    
    // Broadcast to all users in room
    if (currentRoom) {
        broadcastVideoState();
    }
}

// Send a chat message
function sendChatMessage() {
    const messageInput = document.getElementById('message-input');
    const message = messageInput.value.trim();
    
    if (!message) return;
    
    // Add message to chat
    addUserMessage(message, username, true);
    
    // Broadcast to all users
    if (currentRoom) {
        broadcastChatMessage(message);
    }
    
    // Clear input
    messageInput.value = '';
}

// Add a user message to the chat
function addUserMessage(message, user, isCurrentUser) {
    const chatMessages = document.getElementById('chat-messages');
    const messageElement = document.createElement('div');
    
    messageElement.className = isCurrentUser ? 'message user-message' : 'message friend-message';
    
    if (!isCurrentUser) {
        const userSpan = document.createElement('strong');
        userSpan.textContent = user + ': ';
        messageElement.appendChild(userSpan);
    }
    
    const messageText = document.createTextNode(message);
    messageElement.appendChild(messageText);
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Add a system message to the chat
function addSystemMessage(message) {
    const chatMessages = document.getElementById('chat-messages');
    const messageElement = document.createElement('div');
    
    messageElement.className = 'system-message';
    messageElement.textContent = message;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Copy the room link to clipboard
function copyRoomLink() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
        alert('Room link copied to clipboard!');
    }).catch(err => {
        console.error('Could not copy text: ', err);
    });
}

// Broadcast video state to all peers
function broadcastVideoState() {
    // Get current video state
    const videoPlayer = document.getElementById('video-player');
    if (videoPlayer) {
        videoSyncStatus.isPlaying = !videoPlayer.paused;
        videoSyncStatus.currentTime = videoPlayer.currentTime;
    }
    
    // Send to all connected peers
    Object.values(peers).forEach(conn => {
        if (conn.open) {
            conn.send({
                type: 'videoState',
                state: videoSyncStatus
            });
        }
    });
}

// Broadcast chat message to all peers
function broadcastChatMessage(message) {
    // Send to all connected peers
    Object.values(peers).forEach(conn => {
        if (conn.open) {
            conn.send({
                type: 'chatMessage',
                username: username,
                message: message
            });
        }
    });
}

// Apply received video state
function applyVideoState(state) {
    // If there's no video URL yet, nothing to sync
    if (!state.videoUrl) return;
    
    // If video URL changed or hasn't been loaded yet, load the new video
    if (state.videoUrl !== videoSyncStatus.videoUrl) {
        document.getElementById('video-url').value = 
            state.videoUrl.startsWith('youtube:') ? 
            `https://youtu.be/${state.videoUrl.split(':')[1]}` : 
            state.videoUrl;
            
        loadVideo();
        return; // Loading the video will trigger another sync
    }
    
    // Handle YouTube videos
    if (state.videoUrl.startsWith('youtube:')) {
        const youtubePlayer = document.getElementById('youtube-player');
        if (youtubePlayer && youtubePlayer.contentWindow) {
            try {
                // Using YouTube iframe API postMessage
                if (Math.abs(state.currentTime - youtubePlayer.getCurrentTime) > 1) {
                    youtubePlayer.contentWindow.postMessage(JSON.stringify({
                        event: 'command',
                        func: 'seekTo',
                        args: [state.currentTime, true]
                    }), '*');
                }
                
                if (state.isPlaying) {
                    youtubePlayer.contentWindow.postMessage(JSON.stringify({
                        event: 'command',
                        func: 'playVideo',
                        args: []
                    }), '*');
                } else {
                    youtubePlayer.contentWindow.postMessage(JSON.stringify({
                        event: 'command',
                        func: 'pauseVideo',
                        args: []
                    }), '*');
                }
            } catch (e) {
                console.error("YouTube API error:", e);
            }
        }
        return;
    }
    
    // Handle regular video element
    const videoElement = document.getElementById('video-player');
    if (videoElement) {
        // Update time if difference is more than 1 second
        if (Math.abs(videoElement.currentTime - state.currentTime) > 1) {
            videoElement.currentTime = state.currentTime;
        }
        
        // Update play/pause state
        if (state.isPlaying && videoElement.paused) {
            videoElement.play().catch(e => console.error("Error playing video:", e));
        } else if (!state.isPlaying && !videoElement.paused) {
            videoElement.pause();
        }
    }
}

// Update user count display
function updateUserCount() {
    const userCount = Object.keys(connections).length;
    document.getElementById('user-count').textContent = userCount;
}

// Toggle user list panel
function toggleUserList() {
    const userListPanel = document.getElementById('user-list-panel');
    userListPanel.classList.toggle('show');
    
    if (userListPanel.classList.contains('show')) {
        updateUserListUI();
    }
}

// Update the user list UI
function updateUserListUI() {
    const userList = document.getElementById('user-list');
    userList.innerHTML = '';
    
    // Add current user
    const currentUserItem = document.createElement('div');
    currentUserItem.className = 'user-item current-user';
    currentUserItem.textContent = `${username} (You)`;
    userList.appendChild(currentUserItem);
    
    // Add other connected users
    Object.keys(connections).forEach(user => {
        if (user !== username) {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            userItem.textContent = user;
            userList.appendChild(userItem);
        }
    });
}