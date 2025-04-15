// Room and user state
let currentRoom = null;
let username = null;
let connections = {};
let videoSyncStatus = {
    isPlaying: false,
    currentTime: 0,
    videoUrl: ''
};
let socket; // Add WebSocket connection

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
    
    // Initialize WebSocket connection
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
    
    // Initialize WebSocket connection
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
    addSystemMessage("Connecting to server...");
    
    // Connect to WebSocket server
    socket = new WebSocket('wss://your-websocket-server.com'); // Replace with your WebSocket server URL
    
    socket.onopen = () => {
        addSystemMessage("Connected to server!");
        
        // Join the room
        socket.send(JSON.stringify({
            type: 'join',
            room: currentRoom,
            username: username
        }));
    };
    
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        switch(data.type) {
            case 'userJoined':
                updateUserStatus(data.username, true);
                break;
                
            case 'userLeft':
                updateUserStatus(data.username, false);
                break;
                
            case 'videoState':
                videoSyncStatus = data.state;
                applyVideoState(data.state);
                break;
                
            case 'chatMessage':
                addUserMessage(data.message, data.username, data.username === username);
                break;
                
            case 'requestVideoState':
                if (data.username !== username) {
                    // Send current video state to new user
                    broadcastVideoState();
                }
                break;
        }
    };
    
    socket.onclose = () => {
        addSystemMessage("Disconnected from server. Trying to reconnect...");
        
        // Try to reconnect after a delay
        setTimeout(initializeRoomConnection, 3000);
    };
    
    socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        addSystemMessage("Connection error. Please try again later.");
    };
}

// Simulate broadcasting video state to all users
function broadcastVideoState() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    
    // Get current video state
    const videoPlayer = document.getElementById('video-player');
    if (videoPlayer) {
        videoSyncStatus.isPlaying = !videoPlayer.paused;
        videoSyncStatus.currentTime = videoPlayer.currentTime;
    }
    
    // Send to server
    socket.send(JSON.stringify({
        type: 'videoState',
        room: currentRoom,
        username: username,
        state: videoSyncStatus
    }));
}

// Simulate broadcasting chat message to all users
function broadcastChatMessage(message) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    
    socket.send(JSON.stringify({
        type: 'chatMessage',
        room: currentRoom,
        username: username,
        message: message
    }));
}

// Request current video state from peers
function requestVideoState() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    
    socket.send(JSON.stringify({
        type: 'requestVideoState',
        room: currentRoom,
        username: username
    }));
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