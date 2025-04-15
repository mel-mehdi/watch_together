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
let peer; // Store peer instance globally

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
    
    // Allow users to set their username
    const usernameInput = document.getElementById('username-input');
    if (usernameInput) {
        usernameInput.addEventListener('change', () => {
            const newUsername = usernameInput.value.trim();
            if (newUsername && newUsername !== username) {
                const oldUsername = username;
                username = newUsername;
                if (currentRoom) {
                    addSystemMessage(`You changed your name from ${oldUsername} to ${username}`);
                    // Tell others about username change
                    broadcastUsernameChange(oldUsername, username);
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

    // Load PeerJS script early
    loadPeerJS();
});

// Load PeerJS library
function loadPeerJS() {
    if (!window.Peer) {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/peerjs@1.4.7/dist/peerjs.min.js';
        document.head.appendChild(script);
    }
}

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
    
    // Initialize as host
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
    
    // Initialize as guest
    initializePeerConnection(false);
}

// Initialize peer connection
function initializePeerConnection(isHost) {
    // Wait for the PeerJS library to load
    const waitForPeer = () => {
        if (!window.Peer) {
            setTimeout(waitForPeer, 100);
            return;
        }
        setupPeer(isHost);
    };
    
    waitForPeer();
}

// Set up PeerJS connection
function setupPeer(isHost) {
    // Create a unique peer ID using room and username
    const peerId = `${currentRoom}_${username}_${Math.random().toString(36).substr(2, 9)}`;
    
    addSystemMessage("Connecting to signaling server...");
    
    // Connect to PeerJS public server
    peer = new Peer(peerId, {
        debug: 2,
        config: {
            'iceServers': [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
            ]
        }
    });
    
    // Handle connection open
    peer.on('open', id => {
        addSystemMessage("Connected to signaling server!");
        
        // Store peer ID
        connections[username] = { 
            peerId: id,
            isHost: isHost
        };
        
        updateUserCount();
        updateUserListUI();
        
        if (isHost) {
            // I'm host, just wait for connections
            addSystemMessage("Waiting for others to join...");
        } else {
            // Try to connect to host or other peers
            findPeersInRoom();
        }
    });
    
    // Handle incoming connections
    peer.on('connection', conn => {
        console.log("Incoming connection from:", conn.peer);
        setUpConnection(conn);
    });
    
    // Handle errors
    peer.on('error', error => {
        console.error('PeerJS error:', error);
        addSystemMessage("Connection error: " + error.type);
        
        if (error.type === 'peer-unavailable') {
            // The specific peer wasn't found, but we can still try to find others
            if (!isHost) {
                setTimeout(findPeersInRoom, 1000);
            }
        }
    });
}

// Find peers in the current room
function findPeersInRoom() {
    addSystemMessage("Looking for peers in the room...");
    
    // Try to connect to the room host first (common prefix)
    const roomPrefix = currentRoom + "_";
    
    // Use a signaling channel for peer discovery
    // This is a simplified approach - in production, you'd use a proper signaling server
    const discoveryChannel = new BroadcastChannel(`discovery_${currentRoom}`);
    
    // Announce ourselves
    discoveryChannel.postMessage({
        type: 'announce',
        peerId: peer.id,
        username: username
    });
    
    // Listen for other peers
    discoveryChannel.onmessage = (event) => {
        const data = event.data;
        
        if (data.type === 'announce' && data.peerId !== peer.id) {
            console.log("Found peer:", data.peerId);
            
            // Connect to this peer
            const conn = peer.connect(data.peerId, {
                reliable: true,
                metadata: {
                    username: username,
                    peerId: peer.id
                }
            });
            
            setUpConnection(conn);
        }
    };
    
    // Keep discovery channel open
    window.discoveryChannel = discoveryChannel;
    
    // Also try to directly connect to a peer by "guessing" IDs with the room prefix
    // This is a fallback if the BroadcastChannel API is not supported
    tryConnectToRoomPeer(roomPrefix);
}

// Try to connect to a peer in the room (fallback method)
function tryConnectToRoomPeer(roomPrefix) {
    // Try to connect to the room coordinator (a special role for the first peer)
    const coordinatorId = `${roomPrefix}coordinator`;
    
    console.log("Trying to connect to room coordinator:", coordinatorId);
    const conn = peer.connect(coordinatorId, {
        reliable: true,
        metadata: {
            username: username,
            peerId: peer.id
        }
    });
    
    conn.on('open', () => {
        console.log("Connected to room coordinator!");
        setUpConnection(conn);
    });
    
    conn.on('error', err => {
        console.log("Couldn't connect to coordinator, becoming coordinator");
        
        // Try to become the coordinator
        const coordPeer = new Peer(coordinatorId, {
            debug: 2
        });
        
        coordPeer.on('open', () => {
            console.log("Became room coordinator!");
            
            // Listen for connections
            coordPeer.on('connection', newConn => {
                console.log("Coordinator: New peer connecting");
                
                // Accept the connection
                setUpConnection(newConn);
                
                // Share known peers
                newConn.on('open', () => {
                    newConn.send({
                        type: 'peerList',
                        peers: Object.values(connections)
                            .filter(c => c.peerId !== newConn.peer)
                            .map(c => ({
                                username: c.username,
                                peerId: c.peerId
                            }))
                    });
                });
            });
        });
        
        coordPeer.on('error', error => {
            // Someone else is already coordinator
            console.log("Someone else is coordinator, waiting for connections");
        });
        
        window.coordPeer = coordPeer;
    });
}

// Set up data connection with a peer
function setUpConnection(conn) {
    // Handle connection opening
    conn.on('open', () => {
        console.log("Connection opened with", conn.peer);
        
        // Get peer info
        const peerInfo = conn.metadata || { username: 'Unknown User' };
        const peerUsername = peerInfo.username || 'Unknown User';
        
        // Check if already connected
        if (peers[peerUsername] && peers[peerUsername].open) {
            console.log("Already connected to", peerUsername);
            return;
        }
        
        // Store connection
        peers[peerUsername] = conn;
        connections[peerUsername] = { 
            peerId: conn.peer,
            username: peerUsername
        };
        
        addSystemMessage(`${peerUsername} joined the room`);
        updateUserCount();
        updateUserListUI();
        
        // Send our current state
        conn.send({
            type: 'videoState',
            state: videoSyncStatus
        });
        
        // Send current user list
        conn.send({
            type: 'userList',
            users: Object.keys(connections).map(username => ({
                username,
                peerId: connections[username].peerId
            }))
        });
    });
    
    // Handle incoming data
    conn.on('data', data => {
        console.log("Received data:", data);
        
        switch(data.type) {
            case 'videoState':
                videoSyncStatus = data.state;
                applyVideoState(data.state);
                break;
                
            case 'chatMessage':
                addUserMessage(data.message, data.username, false);
                break;
                
            case 'userList':
                // Update our user list with received users
                if (data.users && Array.isArray(data.users)) {
                    data.users.forEach(user => {
                        if (user.username !== username && !connections[user.username]) {
                            connections[user.username] = {
                                peerId: user.peerId,
                                username: user.username
                            };
                            
                            // Try to connect to this peer too
                            if (user.peerId && !peers[user.username]) {
                                const newConn = peer.connect(user.peerId, {
                                    reliable: true,
                                    metadata: {
                                        username: username,
                                        peerId: peer.id
                                    }
                                });
                                
                                setUpConnection(newConn);
                            }
                        }
                    });
                    
                    updateUserCount();
                    updateUserListUI();
                }
                break;
                
            case 'peerList':
                // Connect to all peers in the list
                if (data.peers && Array.isArray(data.peers)) {
                    data.peers.forEach(peerData => {
                        if (peerData.peerId !== peer.id && !peers[peerData.username]) {
                            const newConn = peer.connect(peerData.peerId, {
                                reliable: true,
                                metadata: {
                                    username: username,
                                    peerId: peer.id
                                }
                            });
                            
                            setUpConnection(newConn);
                        }
                    });
                }
                break;
                
            case 'usernameChange':
                // Someone changed their username
                if (data.oldUsername && data.newUsername && connections[data.oldUsername]) {
                    // Update our records
                    connections[data.newUsername] = connections[data.oldUsername];
                    delete connections[data.oldUsername];
                    
                    if (peers[data.oldUsername]) {
                        peers[data.newUsername] = peers[data.oldUsername];
                        delete peers[data.oldUsername];
                    }
                    
                    addSystemMessage(`${data.oldUsername} changed their name to ${data.newUsername}`);
                    updateUserCount();
                    updateUserListUI();
                }
                break;
        }
    });
    
    // Handle connection closing
    conn.on('close', () => {
        // Find which user this connection belongs to
        const disconnectedUser = Object.keys(peers).find(user => peers[user] === conn);
        if (disconnectedUser) {
            delete peers[disconnectedUser];
            delete connections[disconnectedUser];
            
            addSystemMessage(`${disconnectedUser} left the room`);
            updateUserCount();
            updateUserListUI();
        }
    });
    
    // Handle connection errors
    conn.on('error', err => {
        console.error("Connection error:", err);
    });
}

// Load a video from URL
function loadVideo() {
    const videoUrl = document.getElementById('video-url').value.trim();
    if (!videoUrl) {
        alert('Please enter a video URL');
        return;
    }
    
    // Check if it's a YouTube URL
    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
        loadYouTubeVideo(videoUrl);
    } else {
        loadDirectVideo(videoUrl);
    }
    
    // Broadcast to all users in room
    if (currentRoom) {
        broadcastVideoState();
    }
}

// Load a YouTube video
function loadYouTubeVideo(videoUrl) {
    // Extract video ID (simplified)
    let videoId;
    if (videoUrl.includes('v=')) {
        videoId = videoUrl.split('v=')[1].split('&')[0];
    } else if (videoUrl.includes('youtu.be/')) {
        videoId = videoUrl.split('youtu.be/')[1];
    }
    
    if (!videoId) {
        alert('Invalid YouTube URL');
        return;
    }
    
    // Create YouTube iframe with API enabled
    const iframe = document.createElement('iframe');
    iframe.width = '100%';
    iframe.height = '100%';
    iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${window.location.origin}`;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.id = 'youtube-player';
    
    // Replace video element with iframe
    const videoPlayer = document.getElementById('video-player');
    const videoWrapper = document.querySelector('.video-wrapper');
    if (videoPlayer && videoPlayer.parentNode === videoWrapper) {
        videoWrapper.replaceChild(iframe, videoPlayer);
    }
    
    // Store video info for syncing
    videoSyncStatus.videoUrl = `youtube:${videoId}`;
    videoSyncStatus.isPlaying = false;
    videoSyncStatus.currentTime = 0;
    
    // Set up YouTube API
    setupYouTubeAPI(iframe);
    
    addSystemMessage(`YouTube video loaded`);
}

// Set up YouTube iframe API
function setupYouTubeAPI(iframe) {
    // Load YouTube iframe API if not already loaded
    if (!window.YT) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        
        // onYouTubeIframeAPIReady will execute when the API is loaded
        window.onYouTubeIframeAPIReady = function() {
            createYouTubePlayer(iframe);
        };
        
        document.body.appendChild(tag);
    } else {
        createYouTubePlayer(iframe);
    }
}

// Create YouTube player object with API control
function createYouTubePlayer(iframe) {
    window.ytPlayer = new YT.Player(iframe.id, {
        events: {
            'onStateChange': onYouTubePlayerStateChange,
            'onReady': onYouTubePlayerReady
        }
    });
}

// Handle YouTube player ready event
function onYouTubePlayerReady(event) {
    console.log("YouTube player ready");
    
    // Apply initial state if needed
    if (videoSyncStatus.isPlaying) {
        event.target.seekTo(videoSyncStatus.currentTime);
        event.target.playVideo();
    } else {
        event.target.seekTo(videoSyncStatus.currentTime);
        event.target.pauseVideo();
    }
}

// Handle YouTube player state changes
function onYouTubePlayerStateChange(event) {
    if (!currentRoom) return;
    
    console.log("YouTube state change:", event.data);
    
    // YT.PlayerState: PLAYING = 1, PAUSED = 2
    if (event.data === YT.PlayerState.PLAYING) {
        videoSyncStatus.isPlaying = true;
        videoSyncStatus.currentTime = event.target.getCurrentTime();
        broadcastVideoState();
    } else if (event.data === YT.PlayerState.PAUSED) {
        videoSyncStatus.isPlaying = false;
        videoSyncStatus.currentTime = event.target.getCurrentTime();
        broadcastVideoState();
    }
}

// Load a direct video URL
function loadDirectVideo(videoUrl) {
    // Ensure we have a video element
    let videoElement = document.getElementById('video-player');
    const youtubePlayer = document.getElementById('youtube-player');
    
    if (youtubePlayer) {
        const videoWrapper = document.querySelector('.video-wrapper');
        // Create new video element
        videoElement = document.createElement('video');
        videoElement.id = 'video-player';
        videoElement.controls = true;
        
        // Replace YouTube iframe with video element
        videoWrapper.replaceChild(videoElement, youtubePlayer);
        
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
    
    // Set video source
    videoElement.src = videoUrl;
    videoElement.load();
    
    // Store video info for syncing
    videoSyncStatus.videoUrl = videoUrl;
    videoSyncStatus.isPlaying = false;
    videoSyncStatus.currentTime = 0;
    
    addSystemMessage(`Video loaded: ${videoUrl}`);
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
        // Fallback
        const textArea = document.createElement('textarea');
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('Room link copied to clipboard!');
    });
}

// Broadcast video state to all peers
function broadcastVideoState() {
    // Get current video state if it's a direct video
    const videoPlayer = document.getElementById('video-player');
    if (videoPlayer) {
        videoSyncStatus.isPlaying = !videoPlayer.paused;
        videoSyncStatus.currentTime = videoPlayer.currentTime;
    } 
    // For YouTube, we update the state in onYouTubePlayerStateChange
    
    // Log what we're broadcasting
    console.log("Broadcasting video state:", videoSyncStatus);
    
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

// Broadcast username change to all peers
function broadcastUsernameChange(oldUsername, newUsername) {
    Object.values(peers).forEach(conn => {
        if (conn.open) {
            conn.send({
                type: 'usernameChange',
                oldUsername: oldUsername,
                newUsername: newUsername
            });
        }
    });
}

// Broadcast chat message to all peers
function broadcastChatMessage(message) {
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
    console.log("Applying video state:", state);
    
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
        if (window.ytPlayer && window.ytPlayer.seekTo) {
            try {
                // Use the YouTube API object
                if (Math.abs(window.ytPlayer.getCurrentTime() - state.currentTime) > 1) {
                    window.ytPlayer.seekTo(state.currentTime, true);
                }
                
                if (state.isPlaying && window.ytPlayer.getPlayerState() !== 1) {
                    window.ytPlayer.playVideo();
                } else if (!state.isPlaying && window.ytPlayer.getPlayerState() === 1) {
                    window.ytPlayer.pauseVideo();
                }
            } catch (e) {
                console.error("YouTube API error:", e);
            }
        } else {
            console.log("YouTube player not ready yet");
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

// Simple BroadcastChannel polyfill for browsers that don't support it
if (!window.BroadcastChannel) {
    window.BroadcastChannel = class BroadcastChannel {
        constructor(channelName) {
            this.channelName = channelName;
            this.listeners = {};
            
            window.addEventListener('storage', (event) => {
                if (event.key === this.channelName) {
                    try {
                        const data = JSON.parse(event.newValue);
                        if (this.onmessage) {
                            this.onmessage({ data });
                        }
                    } catch (e) {
                        console.error("BroadcastChannel error:", e);
                    }
                }
            });
        }
        
        postMessage(message) {
            localStorage.setItem(this.channelName, JSON.stringify(message));
            localStorage.removeItem(this.channelName);
        }
        
        close() {
            // Nothing to do for this simple polyfill
        }
    };
}