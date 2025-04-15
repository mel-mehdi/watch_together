// Room and user state
let currentRoom = null;
let username = null;
let connections = {};
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
    document.getElementById('show-users').addEventListener('click', toggleUserList);
    
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
    
    // In a real app, this would set up WebRTC/WebSocket connections
    initializeRoomConnection();
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
    addSystemMessage(`Joined room "${currentRoom}"`);
    
    // In a real app, this would connect to existing WebRTC/WebSocket room
    initializeRoomConnection();
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
            
            // Replace video element with iframe
            videoPlayer.parentNode.replaceChild(iframe, videoPlayer);
            
            // In a real app, you would use the YouTube API for better control
            addSystemMessage(`YouTube video loaded`);
        }
    } else {
        // For direct video URLs
        videoPlayer.src = videoUrl;
        videoPlayer.load();
        addSystemMessage(`Video loaded: ${videoUrl}`);
    }
    
    videoSyncStatus.videoUrl = videoUrl;
    
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
    
    // In a real app, broadcast to all users
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

// Initialize connections when joining or creating a room
function initializeRoomConnection() {
    // In a real app, you'd set up actual WebRTC or WebSocket connections
    // For this demo, we'll simulate connections with setTimeout
    
    addSystemMessage("Connecting to other participants...");
    
    setTimeout(() => {
        addSystemMessage("Connected! Synchronizing video playback...");
        
        // Request current video state
        if (currentRoom) {
            requestVideoState();
        }
    }, 1500);
}

// Simulate broadcasting video state to all users
function broadcastVideoState() {
    // In a real app, send this data through WebRTC/WebSocket
    console.log("Broadcasting video state:", videoSyncStatus);
    
    // For demo, simulate receiving our own broadcast
    addSystemMessage("Video state updated and synchronized with others");
}

// Simulate broadcasting chat message to all users
function broadcastChatMessage(message) {
    // In a real app, send this through WebRTC/WebSocket
    console.log("Broadcasting message:", message);
    
    // For demo, simulate receiving our own broadcast
    // In a real app, we wouldn't need this as the server would broadcast to others
}

// Request current video state from peers
function requestVideoState() {
    // In a real app, request current state from server or peers
    console.log("Requesting current video state");
    
    // For demo, simulate receiving video state after a short delay
    setTimeout(() => {
        if (videoSyncStatus.videoUrl) {
            // Apply received video state
            applyVideoState(videoSyncStatus);
        }
    }, 1000);
}

// Apply received video state
function applyVideoState(state) {
    const videoContainer = document.querySelector('.video-wrapper');
    const existingVideo = document.getElementById('video-player');
    
    // If video URL changed, load the new video
    if (state.videoUrl && state.videoUrl !== videoSyncStatus.videoUrl) {
        document.getElementById('video-url').value = state.videoUrl;
        loadVideo();
    }
    
    // Sync play/pause state and current time
    const videoElement = document.getElementById('video-player');
    if (videoElement) {
        // Update time if difference is more than 1 second
        if (Math.abs(videoElement.currentTime - state.currentTime) > 1) {
            videoElement.currentTime = state.currentTime;
        }
        
        // Update play/pause state
        if (state.isPlaying && videoElement.paused) {
            videoElement.play();
        } else if (!state.isPlaying && !videoElement.paused) {
            videoElement.pause();
        }
    }
}

// Handle user joining/leaving
function updateUserStatus(user, isJoining) {
    if (isJoining) {
        connections[user] = true;
        addSystemMessage(`${user} joined the room`);
    } else {
        delete connections[user];
        addSystemMessage(`${user} left the room`);
    }
    
    // Update user count display
    updateUserCount();
}

// Update user count display
function updateUserCount() {
    const userCount = Object.keys(connections).length + 1; // +1 for current user
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
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        userItem.textContent = user;
        userList.appendChild(userItem);
    });
}