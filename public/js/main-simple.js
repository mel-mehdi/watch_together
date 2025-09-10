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

// Get DOM elements
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
const voiceChatToggle = document.getElementById('voice-chat-toggle');
const voiceStatus = document.getElementById('voice-status');
const usersInCall = document.getElementById('users-in-call');

let username = '';
let isAdmin = false;
let currentVideoType = '';
let player = null;
let vimeoPlayer = null;
let ignoreEvents = false;

// Simple Voice Chat Implementation
let localStream = null;
let peerConnections = {};
let isInVoiceChat = false;

async function toggleVoiceChat() {
    if (!isInVoiceChat) {
        await joinVoiceChat();
    } else {
        leaveVoiceChat();
    }
}

async function joinVoiceChat() {
    try {
        console.log('Requesting microphone access...');
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 44100
            },
            video: false
        });

        console.log('Microphone access granted');
        isInVoiceChat = true;
        updateVoiceUI();
        
        socket.emit('join-voice-chat');
        
    } catch (error) {
        console.error('Error accessing microphone:', error);
        alert('Could not access microphone. Please allow microphone access.');
    }
}

function leaveVoiceChat() {
    // Close all peer connections
    Object.values(peerConnections).forEach(pc => {
        pc.close();
    });
    peerConnections = {};
    
    // Stop local stream
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    // Remove remote audio elements
    document.querySelectorAll('[id^="audio-"]').forEach(audio => {
        audio.remove();
    });
    
    isInVoiceChat = false;
    updateVoiceUI();
    
    socket.emit('leave-voice-chat');
}

function updateVoiceUI() {
    if (voiceChatToggle) {
        const icon = voiceChatToggle.querySelector('i');
        if (isInVoiceChat) {
            voiceChatToggle.classList.add('active');
            icon.className = 'fas fa-microphone';
            voiceChatToggle.title = 'Leave voice chat';
        } else {
            voiceChatToggle.classList.remove('active');
            icon.className = 'fas fa-microphone-slash';
            voiceChatToggle.title = 'Join voice chat';
        }
    }
    
    if (voiceStatus) {
        voiceStatus.textContent = isInVoiceChat ? 'Voice chat active' : 'Voice chat inactive';
    }
    
    if (usersInCall) {
        const count = Object.keys(peerConnections).length;
        usersInCall.textContent = isInVoiceChat ? 
            (count > 0 ? `${count + 1} users in call` : 'You are in voice chat') : '';
    }
}

async function createPeerConnection(userId, isInitiator = false) {
    console.log(`Creating peer connection with ${userId}, initiator: ${isInitiator}`);
    
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ]
    };
    
    const pc = new RTCPeerConnection(configuration);
    peerConnections[userId] = pc;
    
    // Add local stream
    if (localStream) {
        localStream.getTracks().forEach(track => {
            console.log('Adding track to peer connection');
            pc.addTrack(track, localStream);
        });
    }
    
    // Handle remote stream
    pc.ontrack = (event) => {
        console.log('Received remote stream from', userId);
        const remoteStream = event.streams[0];
        playRemoteAudio(userId, remoteStream);
    };
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('Sending ICE candidate to', userId);
            socket.emit('ice-candidate', {
                to: userId,
                candidate: event.candidate
            });
        }
    };
    
    // Handle connection state
    pc.onconnectionstatechange = () => {
        console.log(`Connection state with ${userId}: ${pc.connectionState}`);
        updateVoiceUI();
    };
    
    // Create offer if initiator
    if (isInitiator) {
        try {
            console.log('Creating offer for', userId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('offer', { to: userId, offer: offer });
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }
    
    return pc;
}

function playRemoteAudio(userId, stream) {
    // Remove existing audio element
    const existingAudio = document.getElementById(`audio-${userId}`);
    if (existingAudio) {
        existingAudio.remove();
    }
    
    // Create new audio element
    const audio = document.createElement('audio');
    audio.id = `audio-${userId}`;
    audio.autoplay = true;
    audio.controls = false;
    audio.srcObject = stream;
    audio.volume = 1.0;
    
    document.body.appendChild(audio);
    
    audio.play().then(() => {
        console.log('Playing audio from', userId);
    }).catch(error => {
        console.error('Error playing audio:', error);
    });
}

// Socket events for voice chat
socket.on('user-joined-voice', (userId) => {
    console.log('User joined voice chat:', userId);
    if (isInVoiceChat && userId !== socket.id) {
        createPeerConnection(userId, true);
    }
});

socket.on('user-left-voice', (userId) => {
    console.log('User left voice chat:', userId);
    if (peerConnections[userId]) {
        peerConnections[userId].close();
        delete peerConnections[userId];
    }
    
    const audio = document.getElementById(`audio-${userId}`);
    if (audio) {
        audio.remove();
    }
    
    updateVoiceUI();
});

socket.on('offer', async (data) => {
    console.log('Received offer from', data.from);
    if (!isInVoiceChat) return;
    
    const pc = await createPeerConnection(data.from, false);
    
    try {
        await pc.setRemoteDescription(data.offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { to: data.from, answer: answer });
    } catch (error) {
        console.error('Error handling offer:', error);
    }
});

socket.on('answer', async (data) => {
    console.log('Received answer from', data.from);
    const pc = peerConnections[data.from];
    if (pc) {
        try {
            await pc.setRemoteDescription(data.answer);
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }
});

socket.on('ice-candidate', async (data) => {
    console.log('Received ICE candidate from', data.from);
    const pc = peerConnections[data.from];
    if (pc) {
        try {
            await pc.addIceCandidate(data.candidate);
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    }
});

// Video player functions
function detectVideoType(url) {
    if (!url) return null;
    
    url = url.trim();
    
    if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
        return 'youtube';
    }
    if (url.includes('vimeo.com/')) {
        return 'vimeo';
    }
    if (url.match(/\.(mp4|webm|ogg|mov)($|\?)/i)) {
        return 'direct';
    }
    
    return 'iframe';
}

function initializePlayer(videoUrl) {
    if (player) {
        player = null;
    }
    
    if (vimeoPlayer) {
        vimeoPlayer.destroy();
        vimeoPlayer = null;
    }
    
    videoPlayer.style.display = 'none';
    directVideoPlayer.style.display = 'none';
    
    currentVideoType = detectVideoType(videoUrl);
    
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
        default:
            setupGenericIframePlayer(videoUrl);
            break;
    }
}

function setupYouTubePlayer(videoUrl) {
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
    
    const embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=0&rel=0`;
    videoPlayer.src = embedUrl;
    videoPlayer.style.display = 'block';
}

function setupVimeoPlayer(videoUrl) {
    let videoId = videoUrl.split('vimeo.com/')[1];
    if (videoId.includes('/')) {
        videoId = videoId.split('/')[0];
    }
    
    const embedUrl = `https://player.vimeo.com/video/${videoId}?autoplay=0`;
    videoPlayer.src = embedUrl;
    videoPlayer.style.display = 'block';
}

function setupDirectVideoPlayer(videoUrl) {
    directVideoPlayer.src = videoUrl;
    directVideoPlayer.style.display = 'block';
}

function setupGenericIframePlayer(videoUrl) {
    videoPlayer.src = videoUrl;
    videoPlayer.style.display = 'block';
}

// Authentication and initialization
document.addEventListener('DOMContentLoaded', function() {
    initializeAuth();
    initializeUI();
});

function initializeAuth() {
    if (authToken && userData) {
        username = userData.username;
        usernameModal.style.display = 'none';
        socket.emit('user join', username);
        updateUserInterface();
    } else if (isGuestMode) {
        usernameModal.style.display = 'flex';
    } else {
        window.location.href = '/login.html';
    }
}

function updateUserInterface() {
    const chatSection = document.querySelector('.chat-section');
    
    const existingUserInfo = document.getElementById('user-info');
    if (existingUserInfo) {
        existingUserInfo.remove();
    }
    
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
    
    chatSection.insertBefore(userInfo, chatSection.firstChild);
}

function initializeUI() {
    socket.on('error message', (message) => {
        showNotification(message, 'error');
    });
    
    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        if (error.message.includes('Authentication') || error.message.includes('token')) {
            showNotification('Authentication failed. Please log in again.', 'error');
            logout();
        }
    });
}

function showNotification(message, type = 'info') {
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
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    localStorage.removeItem('guestMode');
    
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
    
    socket.disconnect();
    window.location.href = '/login.html';
}

// Event listeners
if (usernameSubmit) {
    usernameSubmit.addEventListener('click', () => {
        if (usernameInput.value.trim()) {
            username = usernameInput.value.trim();
            usernameModal.style.display = 'none';
            socket.emit('user join', username);
            updateUserInterface();
        }
    });
}

if (form) {
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (input.value.trim()) {
            socket.emit('chat message', input.value.trim());
            input.value = '';
        }
    });
}

if (changeVideoBtn) {
    changeVideoBtn.addEventListener('click', () => {
        if (videoUrlInput.value.trim() && isAdmin) {
            socket.emit('change video', videoUrlInput.value.trim());
        } else if (!isAdmin) {
            alert('Only the admin can change the video for everyone');
        }
    });
}

if (voiceChatToggle) {
    voiceChatToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleVoiceChat();
    });
}

// Socket events
socket.on('video state', (state) => {
    initializePlayer(state.url);
});

socket.on('chat message', (data) => {
    const item = document.createElement('li');
    item.innerHTML = `
        <div class="message ${data.isAdmin ? 'admin' : ''}">
            <span class="username">${data.username}:</span>
            <span class="content">${data.message}</span>
            <span class="timestamp">${data.timestamp}</span>
        </div>
    `;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
});

socket.on('system message', (msg) => {
    const item = document.createElement('li');
    item.classList.add('system-message');
    item.textContent = msg;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
});

socket.on('admin status', (status) => {
    isAdmin = status;
    if (adminControls) {
        adminControls.style.display = status ? 'block' : 'none';
    }
});

socket.on('recent messages', (messages_data) => {
    messages_data.forEach(msg => {
        const item = document.createElement('li');
        if (msg.isSystemMessage) {
            item.classList.add('system-message');
            item.textContent = msg.content;
        } else {
            item.innerHTML = `
                <div class="message">
                    <span class="username">${msg.username}:</span>
                    <span class="content">${msg.content}</span>
                    <span class="timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</span>
                </div>
            `;
        }
        messages.appendChild(item);
    });
    messages.scrollTop = messages.scrollHeight;
});

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
    
    .voice-chat-btn.active {
        background: #25d366 !important;
        color: white !important;
    }
`;
document.head.appendChild(style);
