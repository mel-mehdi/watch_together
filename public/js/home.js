// Home page functionality
class WatchTogetherHome {
    constructor() {
        this.socket = io();
        this.currentUser = null;
        this.initializeElements();
        this.checkAuthentication();
        this.bindEvents();
        this.loadRecentRooms();
    }

    initializeElements() {
        // Buttons
        this.createRoomBtn = document.getElementById('create-room-btn');
        this.joinRoomBtn = document.getElementById('join-room-btn');
        this.joinByCodeBtn = document.getElementById('join-by-code-btn');
        
        // Modals
        this.createRoomModal = document.getElementById('create-room-modal');
        this.joinRoomModal = document.getElementById('join-room-modal');
        this.roomCreatedModal = document.getElementById('room-created-modal');
        this.loadingOverlay = document.getElementById('loading-overlay');
        
        // Close buttons
        this.closeCreateModal = document.getElementById('close-create-modal');
        this.closeJoinModal = document.getElementById('close-join-modal');
        this.closeSuccessModal = document.getElementById('close-success-modal');
        
        // Form buttons
        this.confirmCreateBtn = document.getElementById('confirm-create-btn');
        this.cancelCreateBtn = document.getElementById('cancel-create-btn');
        this.confirmJoinBtn = document.getElementById('confirm-join-btn');
        this.cancelJoinBtn = document.getElementById('cancel-join-btn');
        this.stayHomeBtn = document.getElementById('stay-home-btn');
        this.enterRoomBtn = document.getElementById('enter-room-btn');
        
        // Inputs
        this.roomCodeInput = document.getElementById('room-code-input');
        this.roomNameInput = document.getElementById('room-name');
        this.roomDescInput = document.getElementById('room-description');
        this.usernameCreateInput = document.getElementById('username-create');
        this.joinRoomCodeInput = document.getElementById('join-room-code');
        this.usernameJoinInput = document.getElementById('username-join');
        this.roomPrivateCheckbox = document.getElementById('room-private');
        
        // Success modal elements
        this.createdRoomName = document.getElementById('created-room-name');
        this.createdRoomDescription = document.getElementById('created-room-description');
        this.createdRoomCode = document.getElementById('created-room-code');
        this.createdRoomLink = document.getElementById('created-room-link');
        
        // Share buttons
        this.shareWhatsApp = document.getElementById('share-whatsapp');
        this.shareTelegram = document.getElementById('share-telegram');
        this.shareEmail = document.getElementById('share-email');
        
        // Other elements
        this.roomPreview = document.getElementById('room-preview');
        this.loadingText = document.getElementById('loading-text');
        this.recentRoomsSection = document.getElementById('recent-rooms');
        this.roomsGrid = document.getElementById('rooms-grid');
        this.loginBtn = document.querySelector('.login-btn');
        
        // Current room data
        this.currentRoomData = null;
    }

    bindEvents() {
        // Main action buttons
        this.createRoomBtn.addEventListener('click', () => this.showCreateRoomModal());
        this.joinRoomBtn.addEventListener('click', () => this.showJoinRoomModal());
        this.joinByCodeBtn.addEventListener('click', () => this.quickJoinRoom());
        
        // Modal close events
        this.closeCreateModal.addEventListener('click', () => this.hideCreateRoomModal());
        this.closeJoinModal.addEventListener('click', () => this.hideJoinRoomModal());
        this.closeSuccessModal.addEventListener('click', () => this.hideRoomCreatedModal());
        this.cancelCreateBtn.addEventListener('click', () => this.hideCreateRoomModal());
        this.cancelJoinBtn.addEventListener('click', () => this.hideJoinRoomModal());
        this.stayHomeBtn.addEventListener('click', () => this.hideRoomCreatedModal());
        this.enterRoomBtn.addEventListener('click', () => this.enterCreatedRoom());
        
        // Form submit events
        this.confirmCreateBtn.addEventListener('click', () => {
            console.log('🔘 Create room button clicked');
            this.createRoom();
        });
        this.confirmJoinBtn.addEventListener('click', () => this.joinRoom());
        
        // Copy buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('copy-btn') || e.target.closest('.copy-btn')) {
                const btn = e.target.classList.contains('copy-btn') ? e.target : e.target.closest('.copy-btn');
                this.copyToClipboard(btn);
            }
        });
        
        // Share buttons
        this.shareWhatsApp.addEventListener('click', () => this.shareViaWhatsApp());
        this.shareTelegram.addEventListener('click', () => this.shareViaTelegram());
        this.shareEmail.addEventListener('click', () => this.shareViaEmail());
        
        // Input events
        this.roomCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.quickJoinRoom();
        });
        
        this.joinRoomCodeInput.addEventListener('input', (e) => {
            this.validateRoomCode(e.target.value);
        });
        
        // Close modals on background click
        this.createRoomModal.addEventListener('click', (e) => {
            if (e.target === this.createRoomModal) this.hideCreateRoomModal();
        });
        
        this.joinRoomModal.addEventListener('click', (e) => {
            if (e.target === this.joinRoomModal) this.hideJoinRoomModal();
        });
        
        this.roomCreatedModal.addEventListener('click', (e) => {
            if (e.target === this.roomCreatedModal) this.hideRoomCreatedModal();
        });
        
        // Socket events
        this.socket.on('room created', (data) => this.onRoomCreated(data));
        this.socket.on('room joined', (data) => this.onRoomJoined(data));
        this.socket.on('room error', (error) => this.onRoomError(error));
        this.socket.on('room info', (info) => this.onRoomInfo(info));
        this.socket.on('recent rooms', (rooms) => this.displayRecentRooms(rooms));
        this.socket.on('room deleted', (data) => this.onRoomDeleted(data));
    }

    checkAuthentication() {
        // Check if user is authenticated
        const authToken = localStorage.getItem('authToken');
        const userData = localStorage.getItem('userData');
        
        if (authToken && userData) {
            try {
                this.currentUser = JSON.parse(userData);
                console.log('User is authenticated:', this.currentUser.username);
                
                // Pre-fill username fields when modals are shown
                this.setupAuthenticatedUser();
                
            } catch (error) {
                console.error('Error parsing user data:', error);
                this.currentUser = null;
            }
        } else {
            this.currentUser = null;
            console.log('User is not authenticated');
        }

        // Update UI based on authentication status
        this.updateAuthUI();
    }

    setupAuthenticatedUser() {
        // This will be called when forms are shown
        // Store the authenticated username for use in forms
    }

    updateAuthUI() {
        if (this.loginBtn) {
            if (this.currentUser) {
                // User is logged in - change to logout button
                this.loginBtn.textContent = 'Logout';
                this.loginBtn.href = '#';
                this.loginBtn.classList.add('logout-btn');
                this.loginBtn.removeEventListener('click', this.handleLoginClick);
                this.loginBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.logout();
                });
            } else {
                // User is not logged in - show login button
                this.loginBtn.textContent = 'Login';
                this.loginBtn.href = '/login.html';
                this.loginBtn.classList.remove('logout-btn');
                this.loginBtn.removeEventListener('click', this.logout);
            }
        }
    }

    showCreateRoomModal() {
        this.createRoomModal.classList.add('active');
        
        // Auto-fill username if user is authenticated
        if (this.currentUser && this.usernameCreateInput) {
            this.usernameCreateInput.value = this.currentUser.username;
            this.usernameCreateInput.readOnly = true;
            this.usernameCreateInput.style.backgroundColor = 'var(--bg-tertiary)';
            this.usernameCreateInput.style.cursor = 'not-allowed';
            this.usernameCreateInput.style.opacity = '0.7';
        }
        
        this.roomNameInput.focus();
    }

    hideCreateRoomModal() {
        this.createRoomModal.classList.remove('active');
        this.clearCreateForm();
    }

    showJoinRoomModal() {
        this.joinRoomModal.classList.add('active');
        
        // Auto-fill username if user is authenticated
        if (this.currentUser && this.usernameJoinInput) {
            this.usernameJoinInput.value = this.currentUser.username;
            this.usernameJoinInput.readOnly = true;
            this.usernameJoinInput.style.backgroundColor = 'var(--bg-tertiary)';
            this.usernameJoinInput.style.cursor = 'not-allowed';
            this.usernameJoinInput.style.opacity = '0.7';
        }
        
        this.joinRoomCodeInput.focus();
    }

    hideJoinRoomModal() {
        this.joinRoomModal.classList.remove('active');
        this.clearJoinForm();
    }

    showRoomCreatedModal(roomData) {
        this.currentRoomData = roomData;
        
        // Populate room information
        this.createdRoomName.textContent = roomData.name;
        this.createdRoomDescription.textContent = roomData.description || 'No description provided';
        this.createdRoomCode.value = roomData.roomCode;
        this.createdRoomLink.value = `${window.location.origin}/room/${roomData.roomCode}`;
        
        // Show modal
        this.roomCreatedModal.classList.add('active');
    }

    hideRoomCreatedModal() {
        this.roomCreatedModal.classList.remove('active');
        this.currentRoomData = null;
    }

    enterCreatedRoom() {
        if (this.currentRoomData) {
            window.location.href = `/room/${this.currentRoomData.roomCode}`;
        }
    }

    clearCreateForm() {
        this.roomNameInput.value = '';
        this.roomDescInput.value = '';
        
        // Only clear username if not authenticated
        if (!this.currentUser) {
            this.usernameCreateInput.value = '';
            this.usernameCreateInput.readOnly = false;
            this.usernameCreateInput.style.backgroundColor = '';
            this.usernameCreateInput.style.cursor = '';
            this.usernameCreateInput.style.opacity = '';
        }
        
        this.roomPrivateCheckbox.checked = true;
    }

    clearJoinForm() {
        this.joinRoomCodeInput.value = '';
        
        // Only clear username if not authenticated
        if (!this.currentUser) {
            this.usernameJoinInput.value = '';
            this.usernameJoinInput.readOnly = false;
            this.usernameJoinInput.style.backgroundColor = '';
            this.usernameJoinInput.style.cursor = '';
            this.usernameJoinInput.style.opacity = '';
        }
        
        this.roomPreview.style.display = 'none';
    }

    generateRoomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 8; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    async createRoom() {
        console.log('🚀 createRoom() method called');
        
        const roomName = this.roomNameInput.value.trim();
        const username = this.usernameCreateInput.value.trim();
        
        console.log('📝 Form values:', { roomName, username });
        
        if (!roomName) {
            console.log('❌ No room name provided');
            this.showNotification('Please enter a room name', 'error');
            return;
        }
        
        if (!username) {
            console.log('❌ No username provided');
            this.showNotification('Please enter your display name', 'error');
            return;
        }
        
        const roomData = {
            roomName: roomName,
            description: this.roomDescInput.value.trim(),
            isPrivate: this.roomPrivateCheckbox.checked,
            creatorUsername: username,
            maxUsers: 50
        };
        
        console.log('📦 Room data:', roomData);
        
        this.showLoading('Creating your room...');
        
        try {
            console.log('🌐 Making API request to /api/rooms/create');
            const response = await fetch('/api/rooms/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(roomData)
            });
            
            console.log('📡 Response status:', response.status);
            const result = await response.json();
            console.log('📋 Response data:', result);
            
            if (result.success) {
                console.log('✅ Room created successfully');
                this.currentRoomData = result.room;
                this.hideLoading();
                this.hideCreateRoomModal();
                this.showRoomCreatedModal(result.room);
                
                // Save to recent rooms
                this.saveRecentRoom(result.room);
            } else {
                console.log('❌ Room creation failed:', result.message);
                this.hideLoading();
                this.showNotification(result.message || 'Failed to create room', 'error');
            }
        } catch (error) {
            console.log('💥 Network error:', error);
            this.hideLoading();
            this.showNotification('Network error. Please try again.', 'error');
            console.error('Create room error:', error);
        }
    }

    quickJoinRoom() {
        const roomCode = this.roomCodeInput.value.trim().toUpperCase();
        
        if (!roomCode) {
            this.showNotification('Please enter a room code', 'error');
            return;
        }
        
        if (roomCode.length !== 8) {
            this.showNotification('Room code must be 8 characters', 'error');
            return;
        }
        
        // Show join modal with the code pre-filled
        this.joinRoomCodeInput.value = roomCode;
        this.showJoinRoomModal();
        this.validateRoomCode(roomCode);
    }

    async joinRoom() {
        const roomCode = this.joinRoomCodeInput.value.trim().toUpperCase();
        const username = this.usernameJoinInput.value.trim();
        
        if (!roomCode) {
            this.showNotification('Please enter a room code', 'error');
            return;
        }
        
        if (!username) {
            this.showNotification('Please enter your display name', 'error');
            return;
        }
        
        if (roomCode.length !== 8) {
            this.showNotification('Room code must be 8 characters', 'error');
            return;
        }
        
        this.showLoading('Joining room...');
        
        try {
            const response = await fetch('/api/rooms/join', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ roomCode, username })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.hideLoading();
                this.hideJoinRoomModal();
                
                // Save to recent rooms
                this.saveRecentRoom(result.room);
                
                // Redirect to room
                window.location.href = result.room.roomUrl;
            } else {
                this.hideLoading();
                this.showNotification(result.message || 'Failed to join room', 'error');
            }
        } catch (error) {
            this.hideLoading();
            this.showNotification('Network error. Please try again.', 'error');
            console.error('Join room error:', error);
        }
    }

    async validateRoomCode(roomCode) {
        if (roomCode.length === 8) {
            try {
                const response = await fetch(`/api/rooms/info/${roomCode}`);
                const result = await response.json();
                
                if (result.success) {
                    this.showRoomPreview(result.room);
                } else {
                    this.roomPreview.style.display = 'none';
                }
            } catch (error) {
                console.error('Room validation error:', error);
                this.roomPreview.style.display = 'none';
            }
        } else {
            this.roomPreview.style.display = 'none';
        }
    }

    async loadRecentRooms() {
        // Load recent rooms from localStorage
        let recentRooms = JSON.parse(localStorage.getItem('recentRooms') || '[]');
        
        // Validate rooms with server (remove deleted ones)
        if (recentRooms.length > 0) {
            recentRooms = await this.validateRecentRooms(recentRooms);
            // Update localStorage with validated rooms
            localStorage.setItem('recentRooms', JSON.stringify(recentRooms));
        }
        
        if (recentRooms.length > 0) {
            this.displayRecentRooms(recentRooms);
        } else {
            this.recentRoomsSection.style.display = 'none';
        }
        
        // Also request from server if user is logged in
        if (this.currentUser) {
            this.socket.emit('get recent rooms');
        }
    }

    async validateRecentRooms(rooms) {
        const validatedRooms = [];
        
        for (const room of rooms) {
            try {
                const response = await fetch(`/api/rooms/info/${room.roomCode}`);
                const result = await response.json();
                if (result.success) {
                    validatedRooms.push(room);
                }
            } catch (error) {
                console.error('Error validating room:', room.roomCode, error);
                // Keep the room if we can't validate (network error)
                validatedRooms.push(room);
            }
        }
        
        return validatedRooms;
    }

    displayRecentRooms(rooms) {
        if (!rooms || rooms.length === 0) {
            this.recentRoomsSection.style.display = 'none';
            return;
        }
        
        this.recentRoomsSection.style.display = 'block';
        this.roomsGrid.innerHTML = '';
        
        rooms.forEach(room => {
            const roomCard = this.createRoomCard(room);
            this.roomsGrid.appendChild(roomCard);
        });
    }

    createRoomCard(room) {
        const card = document.createElement('div');
        card.className = 'room-card';
        
        card.innerHTML = `
            <div class="room-card-header">
                <h3>${this.escapeHtml(room.name)}</h3>
                <span class="room-code">${room.roomCode}</span>
            </div>
            <p class="room-description">${this.escapeHtml(room.description || 'No description')}</p>
            <div class="room-meta">
                <span class="participants">
                    <i class="fas fa-users"></i>
                    ${room.participantCount || 0} participants
                </span>
                <span class="last-active">
                    Last active: ${this.formatDate(room.lastActive)}
                </span>
            </div>
        `;
        
        card.addEventListener('click', () => {
            this.roomCodeInput.value = room.roomCode;
            this.quickJoinRoom();
        });
        
        return card;
    }

    showLoading(text) {
        this.loadingText.textContent = text;
        this.loadingOverlay.style.display = 'flex';
    }

    hideLoading() {
        this.loadingOverlay.style.display = 'none';
    }

    onRoomCreated(data) {
        this.hideLoading();
        
        if (data.success) {
            // Save to recent rooms
            this.saveToRecentRooms(data.room);
            
            // Hide create modal and show success modal
            this.hideCreateRoomModal();
            this.showRoomCreatedModal(data.room);
        } else {
            this.showNotification(data.message || 'Failed to create room', 'error');
        }
    }

    onRoomJoined(data) {
        this.hideLoading();
        
        if (data.success) {
            // Save to recent rooms
            this.saveToRecentRooms(data.room);
            
            // Redirect to room
            window.location.href = `/room/${data.room.roomCode}`;
        } else {
            this.showNotification(data.message || 'Failed to join room', 'error');
        }
    }

    onRoomError(error) {
        this.hideLoading();
        this.showNotification(error.message || 'An error occurred', 'error');
    }

    onRoomInfo(info) {
        if (info.exists) {
            this.roomPreview.style.display = 'block';
            this.roomPreview.querySelector('.room-name-preview').textContent = info.name;
            this.roomPreview.querySelector('.room-description-preview').textContent = 
                info.description || 'No description';
            this.roomPreview.querySelector('.room-participants').textContent = 
                `${info.participantCount} participant(s) currently in room`;
        } else {
            this.roomPreview.style.display = 'none';
            this.showNotification('Room not found', 'error');
        }
    }

    onRoomDeleted(data) {
        this.showNotification('Room has been deleted', 'error');
        
        // Remove from recent rooms if it was there
        this.removeRecentRoom(data.roomCode);
        
        // Optionally, you can also refresh the recent rooms list from the server
        this.loadRecentRooms();
    }

    saveToRecentRooms(room) {
        let recentRooms = JSON.parse(localStorage.getItem('recentRooms') || '[]');
        
        // Remove existing entry if it exists
        recentRooms = recentRooms.filter(r => r.roomCode !== room.roomCode);
        
        // Add to beginning
        recentRooms.unshift({
            ...room,
            lastActive: new Date().toISOString()
        });
        
        // Keep only last 10 rooms
        recentRooms = recentRooms.slice(0, 10);
        
        localStorage.setItem('recentRooms', JSON.stringify(recentRooms));
    }

    saveRecentRoom(room) {
        let recentRooms = JSON.parse(localStorage.getItem('recentRooms') || '[]');
        
        // Remove if already exists
        recentRooms = recentRooms.filter(r => r.roomCode !== room.roomCode);
        
        // Add to beginning
        recentRooms.unshift({
            roomCode: room.roomCode,
            name: room.name,
            description: room.description,
            joinedAt: new Date().toISOString()
        });
        
        // Keep only last 5
        recentRooms = recentRooms.slice(0, 5);
        
        localStorage.setItem('recentRooms', JSON.stringify(recentRooms));
    }

    removeRecentRoom(roomCode) {
        let recentRooms = JSON.parse(localStorage.getItem('recentRooms') || '[]');
        
        // Remove the room with the given code
        recentRooms = recentRooms.filter(r => r.roomCode !== roomCode);
        
        localStorage.setItem('recentRooms', JSON.stringify(recentRooms));
    }

    showRoomPreview(room) {
        this.roomPreview.style.display = 'block';
        this.roomPreview.querySelector('.room-name-preview').textContent = room.name;
        this.roomPreview.querySelector('.room-description-preview').textContent = 
            room.description || 'No description';
        this.roomPreview.querySelector('.room-participants').textContent = 
            `${room.userCount || 0} / ${room.maxUsers || 50} participants`;
    }

    showNotification(message, type = 'info') {
        // Notifications disabled - no popup notifications will be shown
        console.log(`Notification (${type}): ${message}`);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 30) return `${diffDays}d ago`;
        
        return date.toLocaleDateString();
    }

    async copyToClipboard(button) {
        const copyType = button.getAttribute('data-copy');
        let textToCopy = '';
        
        if (copyType === 'code') {
            textToCopy = this.createdRoomCode.value;
        } else if (copyType === 'link') {
            textToCopy = this.createdRoomLink.value;
        }
        
        try {
            await navigator.clipboard.writeText(textToCopy);
            
            // Update button to show success
            const originalText = button.innerHTML;
            button.classList.add('copied');
            button.innerHTML = '<i class="fas fa-check"></i> Copied!';
            
            setTimeout(() => {
                button.classList.remove('copied');
                button.innerHTML = originalText;
            }, 2000);
            
            this.showNotification(`${copyType === 'code' ? 'Room code' : 'Room link'} copied to clipboard!`, 'success');
        } catch (err) {
            this.showNotification('Failed to copy to clipboard', 'error');
        }
    }

    shareViaWhatsApp() {
        if (!this.currentRoomData) return;
        
        const message = `🎬 Join my Watch Together room!\n\nRoom: ${this.currentRoomData.name}\nCode: ${this.currentRoomData.roomCode}\nLink: ${window.location.origin}/room/${this.currentRoomData.roomCode}\n\nLet's watch something together! 🍿`;
        const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    }

    shareViaTelegram() {
        if (!this.currentRoomData) return;
        
        const message = `🎬 Join my Watch Together room!\n\nRoom: ${this.currentRoomData.name}\nCode: ${this.currentRoomData.roomCode}\nLink: ${window.location.origin}/room/${this.currentRoomData.roomCode}\n\nLet's watch something together! 🍿`;
        const url = `https://t.me/share/url?url=${encodeURIComponent(window.location.origin + '/room/' + this.currentRoomData.roomCode)}&text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    }

    shareViaEmail() {
        if (!this.currentRoomData) return;
        
        const subject = `Join my Watch Together room: ${this.currentRoomData.name}`;
        const body = `Hi!\n\nI've created a Watch Together room and would love for you to join!\n\nRoom Name: ${this.currentRoomData.name}\nRoom Code: ${this.currentRoomData.roomCode}\nDirect Link: ${window.location.origin}/room/${this.currentRoomData.roomCode}\n\nJust click the link or enter the room code on ${window.location.origin} to join. Let's watch something together!\n\nSee you there! 🎬🍿`;
        
        const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailtoUrl;
    }

    logout() {
        // Clear authentication data
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        
        // Reset current user
        this.currentUser = null;
        
        // Update UI
        this.updateAuthUI();
        
        // Show notification
        this.showNotification('Logged out successfully', 'success');
        
        // Optionally refresh the page to reset all states
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new WatchTogetherHome();
});
