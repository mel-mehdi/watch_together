// Authentication and user management
let authToken = null;
let userData = null;
let isGuestMode = false;
let socket = null;    // Initialize authentication state and socket on script load
function initializeAuthState() {
    authToken = localStorage.getItem('authToken');
    userData = localStorage.getItem('userData');
    isGuestMode = localStorage.getItem('guestMode') === 'true';

    // Parse user data if it exists
    if (userData) {
        try {
            userData = JSON.parse(userData);
        } catch (e) {
            userData = null;
            localStorage.removeItem('userData');
        }
    }
    
    // Initialize socket immediately so event listeners can be attached
    socket = io({
        auth: {
            token: authToken
        }
    });
}

// Call this immediately
initializeAuthState();

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
const voiceStatus = null; // Removed voice status display
const usersInCall = document.getElementById('users-in-call');
const videoHistoryBtn = document.getElementById('video-history-btn'); 
const videoHistoryContainer = document.getElementById('video-history');

// System message configuration elements (using modal versions)
const toggleJoinLeave = null; // Using modal-toggle-join-leave instead
const toggleAdminChange = null; // Using modal-toggle-admin-change instead  
const toggleVideoChange = null; // Using modal-toggle-video-change instead

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

// System message configuration
let systemMessageConfig = {
    showJoinLeaveMessages: false,
    showAdminChangeMessages: false,
    showVideoChangeMessages: false,
    showCriticalMessages: true
};

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
    
    // Direct video files (more comprehensive list)
    if (url.match(/\.(mp4|webm|ogg|ogv|mov|avi|mkv|flv|wmv|m4v)($|\?)/i)) {
        return 'direct';
    }
    
    // If we can't determine the type but it ends with a common video extension
    if (url.match(/\.(mp4|webm|ogg|mov)($|\?)/i)) {
        return 'direct';
    }
    
    // For other URLs, assume they might be direct video links
    return 'direct';
}

// Initialize player with video URL - Using only HTML5 video player
function initializePlayer(videoUrl) {
    // Reset player
    if (player) {
        player = null;
    }
    
    // Hide iframe player and show only HTML5 video player
    videoPlayer.style.display = 'none';
    directVideoPlayer.style.display = 'none';
    
    // Update video container state
    updateVideoContainerState(!!videoUrl);
    
    if (!videoUrl) {
        clearVideoErrorMessages();
        return;
    }
    
    // Show loading indicator
    showVideoLoadingMessage('Loading video...');
    
    // Detect the video type
    currentVideoType = detectVideoType(videoUrl);
    console.log("Detected video type:", currentVideoType, "URL:", videoUrl);
    
    // Handle different video types with ToS compliance
    if (currentVideoType === 'youtube') {
        setupYouTubeEmbedWithSync(videoUrl);
        return;
    } else if (currentVideoType === 'vimeo') {
        showUnsupportedVideoMessage('Vimeo videos are not supported. Please use direct video links (MP4, WebM, etc.) or YouTube links.');
        return;
    } else if (currentVideoType === 'facebook' || currentVideoType === 'twitch' || currentVideoType === 'dailymotion') {
        showUnsupportedVideoMessage('This video platform is not supported. Please use direct video links (MP4, WebM, etc.) or YouTube links.');
        return;
    } else {
        // For direct video files or other URLs, try to use HTML5 video player
        setupCustomVideoPlayer(videoUrl);
    }
}

// Setup YouTube player with simple iframe approach
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
        videoId = videoUrl.split('youtu.be/')[1].split('?')[0];
    }
    
    // Clean the video ID from any additional parameters
    videoId = videoId.split('&')[0].split('#')[0];
    
    console.log("Setting up YouTube player with video ID:", videoId);
    
    // Hide any existing YouTube player divs
    const existingPlayerDiv = document.getElementById('youtube-player-div');
    if (existingPlayerDiv) {
        existingPlayerDiv.style.display = 'none';
    }
    
    // Use simple iframe approach with optimal parameters
    const params = new URLSearchParams({
        enablejsapi: '1',
        origin: window.location.origin,
        rel: '0',
        autoplay: '0',
        controls: '1',
        modestbranding: '1',
        playsinline: '1',
        fs: '1',
        iv_load_policy: '3',
        cc_load_policy: '0',
        disablekb: '0'
    });
    
    videoPlayer.src = `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
    videoPlayer.style.display = 'block';
    videoPlayer.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    
    // More robust loading detection
    let playerReady = false;
    let loadTimeout;
    
    const setupPlayer = () => {
        if (playerReady) return;
        playerReady = true;
        
        if (loadTimeout) clearTimeout(loadTimeout);
        
        console.log("YouTube iframe loaded successfully");
        setTimeout(() => {
            setupYouTubeControlAPI();
            
            if (isAdmin) {
                setTimeout(() => {
                    startAdminSync();
                }, 2000);
            }
        }, 1000);
    };
    
    // Try multiple loading detection methods
    videoPlayer.onload = setupPlayer;
    
    // Fallback timeout in case onload doesn't fire
    loadTimeout = setTimeout(setupPlayer, 3000);
    
    // Listen for YouTube iframe ready message
    const messageHandler = (event) => {
        if (event.origin === "https://www.youtube.com" && event.data && 
            typeof event.data === 'string' && event.data.includes('onReady')) {
            window.removeEventListener('message', messageHandler);
            setupPlayer();
        }
    };
    window.addEventListener('message', messageHandler);
    
    // Handle iframe errors
    videoPlayer.onerror = () => {
        if (loadTimeout) clearTimeout(loadTimeout);
        window.removeEventListener('message', messageHandler);
        console.error("YouTube iframe failed to load");
        handleYouTubeEmbedError(videoUrl, 150);
    };
}

function handleYouTubeEmbedError(videoUrl, errorCode) {
    let errorMessage = "YouTube video failed to load";
    
    switch (errorCode) {
        case 2:
            errorMessage = "Invalid video ID";
            break;
        case 5:
            errorMessage = "HTML5 player error";
            break;
        case 100:
            errorMessage = "Video not found or private";
            break;
        case 101:
        case 150:
            errorMessage = "Video owner has restricted embedding";
            break;
        default:
            errorMessage = "Unknown error loading video";
    }
    
    showNotification(errorMessage, "error");
    
    // Create fallback UI
    const container = document.createElement('div');
    container.style.cssText = `
        background: #000; 
        color: white; 
        padding: 40px 20px; 
        text-align: center; 
        border-radius: 8px;
        margin: 20px 0;
        min-height: 200px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
    `;
    
    container.innerHTML = `
        <div style="background: #ff0000; color: white; padding: 12px 20px; margin-bottom: 20px; border-radius: 6px; display: inline-block;">
            <i class="fab fa-youtube" style="margin-right: 8px; font-size: 18px;"></i>YouTube Video Restricted
        </div>
        <p style="margin-bottom: 20px; font-size: 16px; line-height: 1.5;">
            ${errorMessage}. This video cannot be embedded in external websites.
        </p>
        <a href="${videoUrl}" target="_blank" style="
            background: #ff0000; 
            color: white; 
            padding: 12px 24px; 
            text-decoration: none; 
            border-radius: 6px; 
            font-weight: 500;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        ">
            <i class="fab fa-youtube"></i>
            Watch on YouTube
        </a>
    `;
    
    // Hide player and show fallback
    const playerDiv = document.getElementById('youtube-player-div');
    if (playerDiv) {
        playerDiv.style.display = 'none';
    }
    videoPlayer.style.display = 'none';
    
    // Remove any existing error containers
    const existingError = videoPlayer.parentNode.querySelector('.youtube-error-container');
    if (existingError) {
        existingError.remove();
    }
    
    container.className = 'youtube-error-container';
    videoPlayer.parentNode.insertBefore(container, videoPlayer);
}

function fallbackToIframe(videoId, videoUrl) {
    console.log("Falling back to iframe method");
    
    // Enhanced iframe parameters for better compatibility
    const params = new URLSearchParams({
        enablejsapi: '1',
        origin: window.location.origin,
        rel: '0',
        autoplay: '0',
        controls: '1',
        disablekb: '0',
        fs: '1',
        iv_load_policy: '3',
        modestbranding: '1',
        playsinline: '1'
    });
    
    // Set iframe src with enhanced parameters
    videoPlayer.src = `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
    videoPlayer.style.display = 'block';
    videoPlayer.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    
    // Hide the Player API div
    const playerDiv = document.getElementById('youtube-player-div');
    if (playerDiv) {
        playerDiv.style.display = 'none';
    }
    
    // Setup iframe-based control after load
    videoPlayer.onload = () => {
        console.log("YouTube iframe loaded, setting up control API");
        setTimeout(() => {
            setupYouTubeControlAPI();
            
            if (isAdmin) {
                setTimeout(() => {
                    startAdminSync();
                }, 2000);
            }
        }, 1000);
    };
    
    // Handle iframe errors
    videoPlayer.onerror = () => {
        handleYouTubeEmbedError(videoUrl, 150); // Treat as embedding restriction
    };
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

// Setup YouTube video in custom HTML5 player
function setupYouTubeInCustomPlayer(videoUrl) {
    console.log("Setting up YouTube video in custom player:", videoUrl);
    
    // Extract video ID from URL
    let videoId = extractYouTubeVideoId(videoUrl);
    
    if (!videoId) {
        showUnsupportedVideoMessage('Invalid YouTube URL. Please check the link and try again.');
        return;
    }
    
    // Show loading message
    showYouTubeLoadingMessage();
    
    // Try to get video stream URL using different methods
    attemptYouTubeStreamExtraction(videoId);
}

// Extract YouTube video ID from various URL formats
function extractYouTubeVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /youtube\.com\/v\/([^&\n?#]+)/
    ];
    
    for (let pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    
    return null;
}

// Attempt to extract YouTube stream using various methods
function attemptYouTubeStreamExtraction(videoId) {
    // Try to use a public API or service
    tryYouTubeStreamExtraction(videoId).then(streamUrl => {
        if (streamUrl) {
            console.log("Successfully extracted YouTube stream:", streamUrl);
            // Clear loading message
            const loadingContainer = document.querySelector('.video-loading-container');
            if (loadingContainer) {
                loadingContainer.remove();
            }
            // Setup the custom player with the stream URL
            setupCustomVideoPlayer(streamUrl);
        } else {
            // Show alternative message
            showYouTubeAlternativeMessage(videoId);
        }
    }).catch(error => {
        console.error("Error extracting YouTube stream:", error);
        showYouTubeAlternativeMessage(videoId);
    });
}

// Try to extract YouTube stream URL
async function tryYouTubeStreamExtraction(videoId) {
    try {
        // Method 1: Try using a CORS proxy with YouTube's API
        const corsProxy = 'https://cors-anywhere.herokuapp.com/';
        const youtubeUrl = `${corsProxy}https://www.youtube.com/get_video_info?video_id=${videoId}&el=embedded&ps=default&eurl=&gl=US&hl=en`;
        
        const response = await fetch(youtubeUrl, {
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        if (response.ok) {
            const data = await response.text();
            const params = new URLSearchParams(data);
            const playerResponse = JSON.parse(params.get('player_response') || '{}');
            
            if (playerResponse.streamingData && playerResponse.streamingData.formats) {
                // Look for the best available format
                const formats = playerResponse.streamingData.formats;
                const mp4Format = formats.find(format => 
                    format.mimeType && format.mimeType.includes('video/mp4') && format.url
                );
                
                if (mp4Format && mp4Format.url) {
                    return mp4Format.url;
                }
            }
        }
        
        return null;
    } catch (error) {
        console.log("Stream extraction failed:", error);
        return null;
    }
}

// Show alternative message for YouTube videos
function showYouTubeAlternativeMessage(videoId) {
    // Clear loading message
    const loadingContainer = document.querySelector('.video-loading-container');
    if (loadingContainer) {
        loadingContainer.remove();
    }
    
    // Hide players
    directVideoPlayer.style.display = 'none';
    videoPlayer.style.display = 'none';
    
    // Create alternative message container
    const container = document.createElement('div');
    container.className = 'video-error-container';
    container.style.cssText = `
        background: linear-gradient(135deg, #ff0000 0%, #cc0000 100%);
        color: white;
        padding: 40px 20px;
        text-align: center;
        border-radius: 12px;
        margin: 20px 0;
        min-height: 250px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    `;
    
    container.innerHTML = `
        <div style="background: rgba(255,255,255,0.1); color: white; padding: 12px 20px; margin-bottom: 20px; border-radius: 8px; display: inline-block;">
            <i class="fab fa-youtube" style="margin-right: 8px; font-size: 18px;"></i>YouTube Integration
        </div>
        <p style="margin-bottom: 20px; font-size: 16px; line-height: 1.5; max-width: 450px;">
            YouTube direct streaming is restricted due to their terms of service. 
        </p>
        <div style="margin-bottom: 20px;">
            <a href="https://youtube.com/watch?v=${videoId}" target="_blank" style="
                background: rgba(255,255,255,0.1);
                color: white;
                padding: 12px 20px;
                text-decoration: none;
                border-radius: 6px;
                display: inline-block;
                margin: 0 10px 10px 0;
                border: 1px solid rgba(255,255,255,0.2);
            ">
                <i class="fab fa-youtube"></i> Watch on YouTube
            </a>
            <button onclick="showYouTubeDownloadOptions('${videoId}')" style="
                background: rgba(255,255,255,0.1);
                color: white;
                padding: 12px 20px;
                border: 1px solid rgba(255,255,255,0.2);
                border-radius: 6px;
                cursor: pointer;
                margin: 0 10px 10px 0;
            ">
                <i class="fas fa-download"></i> Get Direct Link
            </button>
        </div>
        <div style="font-size: 14px; opacity: 0.8; margin-top: 15px; line-height: 1.4;">
            <strong>For synchronized watching:</strong><br>
            Get a direct video link (MP4, WebM) or use the download option above
        </div>
    `;
    
    // Insert message
    const videoContainer = directVideoPlayer.parentNode;
    videoContainer.insertBefore(container, directVideoPlayer);
}

// Show YouTube download options
function showYouTubeDownloadOptions(videoId) {
    alert(`To use YouTube videos in sync mode:\n\n1. Use a YouTube downloader service like:\n   - yt1s.com\n   - ytmp3.cc\n   - savefrom.net\n\n2. Download the video as MP4\n\n3. Get the direct link to the MP4 file\n\n4. Paste that direct link here for synchronized playback!`);
}

// Show loading message for YouTube videos
function showYouTubeLoadingMessage() {
    // Hide players
    directVideoPlayer.style.display = 'none';
    videoPlayer.style.display = 'none';
    
    // Clear any existing error messages
    clearVideoErrorMessages();
    
    // Create loading message container
    const container = document.createElement('div');
    container.className = 'video-loading-container';
    container.style.cssText = `
        background: linear-gradient(135deg, #ff0000 0%, #cc0000 100%);
        color: white;
        padding: 40px 20px;
        text-align: center;
        border-radius: 12px;
        margin: 20px 0;
        min-height: 200px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    `;
    
    container.innerHTML = `
        <div style="background: rgba(255,255,255,0.1); color: white; padding: 12px 20px; margin-bottom: 20px; border-radius: 8px; display: inline-block;">
            <i class="fab fa-youtube" style="margin-right: 8px; font-size: 18px;"></i>Processing YouTube URL
        </div>
        <div style="margin-bottom: 20px;">
            <div class="loading-spinner" style="
                border: 3px solid rgba(255,255,255,0.3);
                border-top: 3px solid white;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                animation: spin 1s linear infinite;
                margin: 0 auto 15px;
            "></div>
        </div>
        <p style="margin-bottom: 20px; font-size: 16px; line-height: 1.5;">
            Analyzing YouTube video...
        </p>
    `;
    
    // Add CSS animation if not already added
    if (!document.querySelector('#spinner-style')) {
        const style = document.createElement('style');
        style.id = 'spinner-style';
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Insert loading message
    const videoContainer = directVideoPlayer.parentNode;
    videoContainer.insertBefore(container, directVideoPlayer);
}

// Setup YouTube embed with synchronized controls (ToS compliant)
function setupYouTubeEmbedWithSync(videoUrl) {
    console.log("Setting up ToS-compliant YouTube embed with sync:", videoUrl);
    
    // Extract video ID from URL
    let videoId = extractYouTubeId(videoUrl);
    if (!videoId) {
        showUnsupportedVideoMessage('Invalid YouTube URL. Please check the link and try again.');
        return;
    }
    
    // Clear any existing error messages
    clearVideoErrorMessages();
    
    // Show iframe player for YouTube
    videoPlayer.style.display = 'block';
    directVideoPlayer.style.display = 'none';
    
    // Setup YouTube iframe with API parameters
    const params = new URLSearchParams({
        enablejsapi: '1',
        origin: window.location.origin,
        rel: '0',
        autoplay: '0',
        controls: '1',
        modestbranding: '1',
        playsinline: '1',
        fs: '1',
        iv_load_policy: '3'
    });
    
    const embedUrl = `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
    console.log("Setting iframe src to:", embedUrl);
    
    videoPlayer.src = embedUrl;
    videoPlayer.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    
    // Setup player controls after load with better error handling
    videoPlayer.onload = () => {
        console.log("YouTube iframe loaded successfully, setting up sync controls");
        // Clear loading message when iframe loads
        clearVideoErrorMessages();
        try {
            setupYouTubeSyncPlayer();
            setupYouTubeEventListeners();
            
            if (isAdmin) {
                console.log("Starting admin sync for YouTube video");
                setTimeout(() => startAdminSync(), 2000);
            }
        } catch (error) {
            console.error("Error setting up YouTube player:", error);
            showUnsupportedVideoMessage('Error setting up YouTube player. Please try again.');
        }
    };
    
    videoPlayer.onerror = (error) => {
        console.error("YouTube iframe load error:", error);
        showUnsupportedVideoMessage('This YouTube video cannot be embedded due to copyright or privacy restrictions. You can try downloading the video and using a direct MP4 link instead.');
    };
    
    // Add timeout fallback in case onload never fires
    setTimeout(() => {
        if (videoPlayer.src === embedUrl && !player) {
            console.log("YouTube iframe might have loaded but onload didn't fire, setting up player anyway");
            try {
                setupYouTubeSyncPlayer();
                setupYouTubeEventListeners();
            } catch (error) {
                console.error("Fallback setup failed:", error);
            }
        }
    }, 5000);
    
    console.log("YouTube embed setup complete with video ID:", videoId);
}

// Extract YouTube video ID from URL
function extractYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// Setup YouTube player with sync capabilities
function setupYouTubeSyncPlayer() {
    console.log("Setting up YouTube sync player");
    
    player = {
        playerState: -1,
        lastKnownTime: 0,
        initialized: false,
        
        getCurrentTime: function() {
            return new Promise((resolve) => {
                try {
                    if (videoPlayer && videoPlayer.contentWindow) {
                        videoPlayer.contentWindow.postMessage(JSON.stringify({
                            event: 'command',
                            func: 'getCurrentTime'
                        }), '*');
                        
                        // For now, use fallback since we can't get the response directly
                        setTimeout(() => resolve(player.lastKnownTime || 0), 100);
                    } else {
                        resolve(player.lastKnownTime || 0);
                    }
                } catch (error) {
                    console.error("Error getting current time:", error);
                    resolve(player.lastKnownTime || 0);
                }
            });
        },
        
        getPlayerState: function() {
            return Promise.resolve(player.playerState);
        },
        
        seekTo: function(time) {
            try {
                if (videoPlayer && videoPlayer.contentWindow) {
                    videoPlayer.contentWindow.postMessage(JSON.stringify({
                        event: 'command',
                        func: 'seekTo',
                        args: [time, true]
                    }), '*');
                    player.lastKnownTime = time;
                    console.log("Seeking YouTube video to:", time);
                } else {
                    console.warn("Cannot seek: YouTube iframe not ready");
                }
            } catch (error) {
                console.error("Error seeking YouTube video:", error);
            }
        },
        
        playVideo: function() {
            try {
                if (videoPlayer && videoPlayer.contentWindow) {
                    videoPlayer.contentWindow.postMessage(JSON.stringify({
                        event: 'command',
                        func: 'playVideo'
                    }), '*');
                    player.playerState = 1;
                    console.log("Playing YouTube video");
                } else {
                    console.warn("Cannot play: YouTube iframe not ready");
                }
            } catch (error) {
                console.error("Error playing YouTube video:", error);
            }
        },
        
        pauseVideo: function() {
            try {
                if (videoPlayer && videoPlayer.contentWindow) {
                    videoPlayer.contentWindow.postMessage(JSON.stringify({
                        event: 'command',
                        func: 'pauseVideo'
                    }), '*');
                    player.playerState = 2;
                    console.log("Pausing YouTube video");
                } else {
                    console.warn("Cannot pause: YouTube iframe not ready");
                }
            } catch (error) {
                console.error("Error pausing YouTube video:", error);
            }
        }
    };
    
    player.initialized = true;
    console.log("YouTube sync player setup complete");
}

// Setup custom HTML5 video player for all supported video types
function setupCustomVideoPlayer(videoUrl) {
    console.log("Setting up custom HTML5 video player with URL:", videoUrl);
    
    // Show HTML5 video player
    directVideoPlayer.style.display = 'block';
    videoPlayer.style.display = 'none';
    
    // Clear any existing error messages
    clearVideoErrorMessages();
    
    // Set video source
    const sourceElement = directVideoPlayer.querySelector('source');
    if (sourceElement) {
        sourceElement.src = videoUrl;
    } else {
        // Create source element if it doesn't exist
        const newSource = document.createElement('source');
        newSource.src = videoUrl;
        newSource.type = getVideoMimeType(videoUrl);
        directVideoPlayer.appendChild(newSource);
    }
    
    // Load the video
    directVideoPlayer.load();
    
    // Create player control interface
    player = {
        playerState: 2, // Default to paused
        lastKnownTime: 0,
        
        getCurrentTime: function() {
            return Promise.resolve(directVideoPlayer.currentTime || 0);
        },
        
        getPlayerState: function() {
            return Promise.resolve(directVideoPlayer.paused ? 2 : 1);
        },
        
        seekTo: function(time) {
            if (directVideoPlayer.duration && time <= directVideoPlayer.duration) {
                directVideoPlayer.currentTime = time;
                player.lastKnownTime = time;
            }
        },
        
        playVideo: function() {
            const playPromise = directVideoPlayer.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    player.playerState = 1;
                }).catch(error => {
                    console.error("Error playing video:", error);
                });
            }
        },
        
        pauseVideo: function() {
            directVideoPlayer.pause();
            player.playerState = 2;
        }
    };
    
    // Add event listeners for synchronization
    directVideoPlayer.addEventListener('play', () => {
        player.playerState = 1;
        if (isAdmin && !ignoreEvents) {
            console.log("Admin play detected at time:", directVideoPlayer.currentTime);
            socket.emit('video play', directVideoPlayer.currentTime);
            socket.emit('admin action', 'play');
        }
    });
    
    directVideoPlayer.addEventListener('pause', () => {
        player.playerState = 2;
        if (isAdmin && !ignoreEvents) {
            console.log("Admin pause detected at time:", directVideoPlayer.currentTime);
            socket.emit('video pause', directVideoPlayer.currentTime);
            socket.emit('admin action', 'pause');
        }
    });
    
    directVideoPlayer.addEventListener('seeked', () => {
        player.lastKnownTime = directVideoPlayer.currentTime;
        if (isAdmin && !ignoreEvents) {
            console.log("Admin seek detected to time:", directVideoPlayer.currentTime);
            socket.emit('video seek', directVideoPlayer.currentTime);
        }
    });
    
    directVideoPlayer.addEventListener('loadedmetadata', () => {
        console.log("Video metadata loaded, duration:", directVideoPlayer.duration);
        // Clear loading message when video is ready
        clearVideoErrorMessages();
        if (isAdmin) {
            setTimeout(() => {
                startAdminSync();
            }, 1000);
        }
    });
    
    directVideoPlayer.addEventListener('error', (e) => {
        console.error("Video loading error:", e);
        const error = e.target.error;
        let errorMessage = "Failed to load video. Please try a different video format (MP4, WebM, OGG).";
        
        if (error) {
            switch (error.code) {
                case error.MEDIA_ERR_ABORTED:
                    errorMessage = "Video loading was aborted. Please try again.";
                    break;
                case error.MEDIA_ERR_NETWORK:
                    errorMessage = "Network error occurred while loading video. Please check your connection.";
                    break;
                case error.MEDIA_ERR_DECODE:
                    errorMessage = "Error decoding video. The video file may be corrupted.";
                    break;
                case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    errorMessage = "Video format not supported. Please use MP4, WebM, or OGG format.";
                    break;
                default:
                    errorMessage = "Unknown video playback error occurred.";
            }
        }
        
        showUnsupportedVideoMessage(errorMessage);
    });
    
    // Add additional error handling for load failures
    directVideoPlayer.addEventListener('canplay', () => {
        console.log("Video can start playing");
    });
    
    directVideoPlayer.addEventListener('canplaythrough', () => {
        console.log("Video can play through without stopping");
    });
    
    directVideoPlayer.addEventListener('waiting', () => {
        console.log("Video is waiting for more data");
    });
    
    directVideoPlayer.addEventListener('stalled', () => {
        console.log("Video download has stalled");
    });
    
    console.log("Custom video player setup complete");
}

// Show message for unsupported video types
function showUnsupportedVideoMessage(message) {
    // Hide players
    directVideoPlayer.style.display = 'none';
    videoPlayer.style.display = 'none';
    
    // Clear any existing error messages
    clearVideoErrorMessages();
    
    // Create error message container
    const container = document.createElement('div');
    container.className = 'video-error-container';
    container.style.cssText = `
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 40px 20px;
        text-align: center;
        border-radius: 12px;
        margin: 20px 0;
        min-height: 200px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    `;
    
    container.innerHTML = `
        <div style="background: rgba(255,255,255,0.1); color: white; padding: 12px 20px; margin-bottom: 20px; border-radius: 8px; display: inline-block;">
            <i class="fas fa-video" style="margin-right: 8px; font-size: 18px;"></i>Custom Video Player
        </div>
        <p style="margin-bottom: 20px; font-size: 16px; line-height: 1.5; max-width: 400px;">
            ${message}
        </p>
        <div style="font-size: 14px; opacity: 0.8; margin-top: 10px;">
            <strong>Supported formats:</strong> MP4, WebM, OGV
        </div>
    `;
    
    // Insert error message
    const videoContainer = directVideoPlayer.parentNode;
    videoContainer.insertBefore(container, directVideoPlayer);
}

// Clear any existing video error messages
function clearVideoErrorMessages() {
    const existingErrors = document.querySelectorAll('.video-error-container, .youtube-error-container, .video-loading-container');
    existingErrors.forEach(error => error.remove());
}

// Show loading message for video
function showVideoLoadingMessage(message = 'Loading video...') {
    // Hide players
    directVideoPlayer.style.display = 'none';
    videoPlayer.style.display = 'none';
    
    // Clear any existing error messages
    clearVideoErrorMessages();
    
    // Create loading message container
    const container = document.createElement('div');
    container.className = 'video-loading-container';
    container.style.cssText = `
        background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
        color: white;
        padding: 40px 20px;
        text-align: center;
        border-radius: 12px;
        margin: 20px 0;
        min-height: 200px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    `;
    
    container.innerHTML = `
        <div style="background: rgba(255,255,255,0.1); color: white; padding: 12px 20px; margin-bottom: 20px; border-radius: 8px; display: inline-block;">
            <i class="fas fa-spinner fa-spin" style="margin-right: 8px; font-size: 18px;"></i>Loading
        </div>
        <p style="margin-bottom: 20px; font-size: 16px; line-height: 1.5; max-width: 400px;">
            ${message}
        </p>
        <div style="font-size: 14px; opacity: 0.8; margin-top: 10px;">
            Please wait while we prepare your video...
        </div>
    `;
    
    // Insert loading message
    const videoContainer = directVideoPlayer.parentNode;
    videoContainer.insertBefore(container, directVideoPlayer);
}

// Get appropriate MIME type for video file
function getVideoMimeType(url) {
    const extension = url.split('.').pop().toLowerCase().split('?')[0];
    
    switch (extension) {
        case 'mp4':
            return 'video/mp4';
        case 'webm':
            return 'video/webm';
        case 'ogg':
        case 'ogv':
            return 'video/ogg';
        case 'avi':
            return 'video/x-msvideo';
        case 'mov':
            return 'video/quicktime';
        default:
            return 'video/mp4'; // Default fallback
    }
}

// Create a better YouTube player object
function onYouTubeIframeAPIReady() {
    console.log("YouTube API is ready");
    
    // If we already have a video URL and it's YouTube, initialize the player
    if (videoPlayer.src && currentVideoType === 'youtube') {
        setupYouTubeControlAPI();
    }
}

// Setup the YouTube player control API with better error handling
function setupYouTubePlayerAPI() {
    console.log("Setting up YouTube Player API control...");
    
    if (!window.ytPlayer) {
        console.error("YouTube Player API not available");
        return;
    }
    
    player = {
        playerState: -1,
        lastKnownTime: 0,
        
        getCurrentTime: function() {
            return new Promise((resolve) => {
                try {
                    if (window.ytPlayer && window.ytPlayer.getCurrentTime) {
                        const currentTime = window.ytPlayer.getCurrentTime();
                        player.lastKnownTime = currentTime;
                        resolve(currentTime);
                    } else {
                        resolve(player.lastKnownTime);
                    }
                } catch (error) {
                    resolve(player.lastKnownTime);
                }
            });
        },
        
        getPlayerState: function() {
            return new Promise((resolve) => {
                try {
                    if (window.ytPlayer && window.ytPlayer.getPlayerState) {
                        const state = window.ytPlayer.getPlayerState();
                        player.playerState = state;
                        resolve(state);
                    } else {
                        resolve(player.playerState);
                    }
                } catch (error) {
                    resolve(player.playerState);
                }
            });
        },
        
        seekTo: function(time, allowSeekAhead = true) {
            try {
                if (window.ytPlayer && window.ytPlayer.seekTo) {
                    window.ytPlayer.seekTo(time, allowSeekAhead);
                    player.lastKnownTime = time;
                }
            } catch (error) {
                console.error("Error seeking:", error);
            }
        },
        
        playVideo: function() {
            try {
                if (window.ytPlayer && window.ytPlayer.playVideo) {
                    window.ytPlayer.playVideo();
                    player.playerState = 1;
                }
            } catch (error) {
                console.error("Error playing:", error);
            }
        },
        
        pauseVideo: function() {
            try {
                if (window.ytPlayer && window.ytPlayer.pauseVideo) {
                    window.ytPlayer.pauseVideo();
                    player.playerState = 2;
                }
            } catch (error) {
                console.error("Error pausing:", error);
            }
        }
    };
}

function setupYouTubeControlAPI() {
    console.log("Setting up YouTube control API...");
    
    // Test if iframe is responsive
    setTimeout(() => {
        try {
            videoPlayer.contentWindow.postMessage(JSON.stringify({
                event: 'command',
                func: 'getVideoData'
            }), '*');
        } catch (error) {
            console.error("Cannot communicate with YouTube iframe:", error);
            showNotification("YouTube player communication failed. Video controls may not work properly.", "warning");
        }
    }, 500);
    
    player = {
        playerState: -1, // -1: unstarted, 0: ended, 1: playing, 2: paused, 3: buffering, 5: video cued
        lastKnownTime: 0,
        
        getCurrentTime: function() {
            return new Promise((resolve) => {
                const messageId = Date.now().toString();
                
                const handleMessage = function(event) {
                    if (event.origin !== "https://www.youtube.com") return;
                    
                    try {
                        const data = JSON.parse(event.data);
                        if (data.id === messageId && data.currentTime !== undefined) {
                            window.removeEventListener('message', handleMessage);
                            player.lastKnownTime = data.currentTime;
                            resolve(data.currentTime);
                        }
                    } catch (e) {
                        // Not a JSON message or not the response we're looking for
                    }
                };
                
                window.addEventListener('message', handleMessage);
                
                try {
                    videoPlayer.contentWindow.postMessage(JSON.stringify({
                        event: 'command',
                        func: 'getCurrentTime',
                        id: messageId
                    }), '*');
                } catch (error) {
                    window.removeEventListener('message', handleMessage);
                    console.error("Error sending getCurrentTime message:", error);
                    resolve(player.lastKnownTime); // Return last known time as fallback
                }
                
                // Fallback in case we don't get a response
                setTimeout(() => {
                    window.removeEventListener('message', handleMessage);
                    resolve(player.lastKnownTime);
                }, 1000);
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
                
                try {
                    videoPlayer.contentWindow.postMessage(JSON.stringify({
                        event: 'command',
                        func: 'getPlayerState',
                        id: messageId
                    }), '*');
                } catch (error) {
                    window.removeEventListener('message', handleMessage);
                    console.error("Error sending getPlayerState message:", error);
                    resolve(player.playerState);
                }
                
                // Fallback in case we don't get a response
                setTimeout(() => {
                    window.removeEventListener('message', handleMessage);
                    resolve(player.playerState);
                }, 1000);
            });
        },
        
        seekTo: function(time, allowSeekAhead = true) {
            try {
                videoPlayer.contentWindow.postMessage(JSON.stringify({
                    event: 'command',
                    func: 'seekTo',
                    args: [time, allowSeekAhead]
                }), '*');
                player.lastKnownTime = time;
            } catch (error) {
                console.error("Error sending seekTo message:", error);
            }
        },
        
        playVideo: function() {
            try {
                videoPlayer.contentWindow.postMessage(JSON.stringify({
                    event: 'command',
                    func: 'playVideo'
                }), '*');
                player.playerState = 1;
            } catch (error) {
                console.error("Error sending playVideo message:", error);
            }
        },
        
        pauseVideo: function() {
            try {
                videoPlayer.contentWindow.postMessage(JSON.stringify({
                    event: 'command',
                    func: 'pauseVideo'
                }), '*');
                player.playerState = 2;
            } catch (error) {
                console.error("Error sending pauseVideo message:", error);
            }
        }
    };
    
    // Setup event listeners for the YouTube iframe
    setupYouTubeEventListeners();
    
    console.log("YouTube player control API is set up");
}

let youtubeListenerSetup = false;

// Enhanced YouTube event listener with better synchronization control
function setupYouTubeEventListeners() {
    if (youtubeListenerSetup) {
        console.log("YouTube event listeners already set up, skipping");
        return;
    }
    
    console.log("Setting up YouTube event listeners");
    
    const messageHandler = (event) => {
        if (event.origin !== "https://www.youtube.com") return;
        
        try {
            const data = JSON.parse(event.data);
            
            // Only react to YouTube API events
            if (data.event && data.event === "onStateChange") {
                // Update our internal state tracker if player exists
                if (player) {
                    player.playerState = data.info;
                }
                
                console.log("YouTube state change:", data.info, "ignoreEvents:", ignoreEvents, "isAdmin:", isAdmin);
                
                // If this is the video ending (state 0), don't restart it automatically
                if (data.info === 0) {
                    console.log("Video ended naturally");
                    return;
                }
                
                // Only the admin should control the video for everyone
                if (isAdmin && !ignoreEvents && player) {
                    // Get current time for accurate sync
                    player.getCurrentTime().then(time => {
                        if (data.info === 1) { // playing
                            console.log("Admin play detected at time:", time);
                            socket.emit('video play', time);
                            socket.emit('admin action', 'play');
                        } else if (data.info === 2) { // paused
                            console.log("Admin pause detected at time:", time);
                            socket.emit('video pause', time);
                            socket.emit('admin action', 'pause');
                        }
                    }).catch(err => {
                        console.error("Error getting time during state change:", err);
                        // Send without time if we can't get it
                        if (data.info === 1) {
                            socket.emit('video play', 0);
                            socket.emit('admin action', 'play');
                        } else if (data.info === 2) {
                            socket.emit('video pause', 0);
                            socket.emit('admin action', 'pause');
                        }
                    });
                }
            }
        } catch (e) {
            // Not a JSON message or not the event we're looking for
        }
    };
    
    window.addEventListener('message', messageHandler);
    youtubeListenerSetup = true;
}

// Update admin UI
function updateAdminUI() {
    if (isAdmin) {
        if (adminControls) {
            adminControls.style.display = 'block';
        }
        if (adminNotice) {
            adminNotice.style.display = 'none'; // Hide admin notice when you're the admin
        }
        if (requestAdminContainer) {
            requestAdminContainer.style.display = 'none';
        }
    } else {
        if (adminControls) {
            adminControls.style.display = 'none';
        }
        if (adminNotice) {
            adminNotice.style.display = 'none'; // Hide admin notice completely
        }
        if (requestAdminContainer) {
            requestAdminContainer.style.display = 'block';
        }
    }
}

// Socket event for loading chat history
socket.on('recent messages', (messageHistory) => {
    messageHistory.forEach(msg => {
        // Filter system messages based on current configuration
        if (msg.isSystemMessage) {
            let shouldDisplay = true;
            
            if (msg.content.includes('has joined the chat') || msg.content.includes('has left the chat')) {
                shouldDisplay = systemMessageConfig.showJoinLeaveMessages;
            } else if (msg.content.includes('is now the admin controller')) {
                shouldDisplay = systemMessageConfig.showAdminChangeMessages;
            } else if (msg.content.includes('changed the video')) {
                shouldDisplay = systemMessageConfig.showVideoChangeMessages;
            }
            // Critical messages and unknown messages are always shown
            
            if (!shouldDisplay) {
                return; // Skip this message
            }
        }
        
        const messageWrapper = document.createElement('li');
        const messageContent = document.createElement('div');
        messageContent.classList.add('message-content');
        
        if (msg.isSystemMessage) {
            messageWrapper.classList.add('system-message');
            messageContent.textContent = msg.content;
        } else {
            // Determine if this is our message
            const isOwnMessage = msg.username === username;
            
            if (isOwnMessage) {
                messageWrapper.classList.add('message-sent');
            } else {
                messageWrapper.classList.add('message-received');
                
                // Add username for received messages
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
                
                messageContent.appendChild(usernameElement);
            }
            
            // Add message text
            const messageText = document.createElement('div');
            messageText.textContent = msg.content;
            messageContent.appendChild(messageText);
            
            // Add timestamp
            const timestampElement = document.createElement('div');
            timestampElement.classList.add('timestamp');
            timestampElement.textContent = new Date(msg.timestamp).toLocaleTimeString();
            messageContent.appendChild(timestampElement);
        }
        
        messageWrapper.appendChild(messageContent);
        messages.appendChild(messageWrapper);
    });
    
    // Scroll to bottom
    document.querySelector('.chat-container').scrollTop = document.querySelector('.chat-container').scrollHeight;
});

// Handle username submission
usernameSubmit.addEventListener('click', () => {
    if (usernameInput.value.trim()) {
        username = usernameInput.value.trim();
        usernameModal.style.display = 'none';
        
        // Store guest user data
        if (isGuestMode) {
            const guestData = {
                username: username,
                isGuest: true
            };
            localStorage.setItem('userData', JSON.stringify(guestData));
            userData = guestData;
        }
        // For authenticated users, update their display name for this session
        else if (userData) {
            userData.displayName = username;
            // Don't update localStorage for authenticated users' main profile
        }
        
        // Join socket with username
        socket.emit('user join', username);
        
        // If we're on a room page, try to join the room
        const roomId = extractRoomIdFromURL();
        if (roomId) {
            setTimeout(() => {
                autoJoinRoom(roomId);
            }, 500); // Give socket time to connect
        }
        
        updateUserInterface();
        console.log('Username set and socket joined:', username);
    }
});

// Handle username input Enter key
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && usernameInput.value.trim()) {
        usernameSubmit.click();
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
    
    // Start or stop admin sync based on status
    if (isAdmin) {
        console.log("Starting admin sync interval");
        startAdminSync();
    } else {
        console.log("Stopping admin sync interval");
        stopAdminSync();
    }
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

// Enhanced sync-video event for new recommended pattern
socket.on('sync-video', (videoState) => {
    console.log("Received sync-video event:", videoState);
    
    if (videoState.url) {
        initializePlayer(videoState.url);
        videoUrlInput.value = videoState.url;
        updateVideoContainerState(true);
        
        // Wait for player to initialize then sync state
        setTimeout(() => {
            if (player) {
                console.log("Syncing to video state:", videoState);
                
                // Seek to current time if available
                if (videoState.currentTime > 0) {
                    player.seekTo(videoState.currentTime);
                }
                
                // Set play state
                setTimeout(() => {
                    if (videoState.isPlaying) {
                        player.playVideo();
                    } else {
                        player.pauseVideo();
                    }
                }, 500);
            }
        }, 1500);
    } else {
        // No video loaded
        initializePlayer('');
        videoUrlInput.value = '';
        updateVideoContainerState(false);
    }
});

// Legacy video state event (for backwards compatibility)
socket.on('video state', (state) => {
    initializePlayer(state.url);
    videoUrlInput.value = state.url || '';
    updateVideoContainerState(!!state.url);
    
    // Wait for player to initialize then set the correct time and play state
    setTimeout(() => {
        if (player && state.url) {
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
    console.log("Change video event received:", url);
    initializePlayer(url);
    videoUrlInput.value = url || '';
    updateVideoContainerState(!!url);
});

// Enhanced video play event handler with better YouTube sync
// Enhanced video play event handler optimized for HTML5 video player
socket.on('video play', (data) => {
    console.log("Received video play event, player exists:", !!player, "data:", data);
    
    if (!player) {
        console.log("Player not initialized yet");
        return;
    }
    
    ignoreEvents = true;
    
    // Handle both old format (time only) and new enhanced format
    let time, serverTime, videoId;
    
    if (typeof data === 'object') {
        time = data.currentTime || data.time;
        serverTime = data.serverTime || Date.now();
        videoId = data.videoId;
    } else {
        time = data;
        serverTime = Date.now();
    }
    
    // Calculate network latency compensation
    const networkDelay = Date.now() - serverTime;
    const compensatedTime = time + (networkDelay / 1000); // Convert ms to seconds
    
    console.log("Video play event received, time:", time, "network delay:", networkDelay, "ms", "videoId:", videoId);
    
    // For HTML5 video player (direct videos)
    player.getCurrentTime().then(currentPlayerTime => {
        const timeDiff = Math.abs(compensatedTime - currentPlayerTime);
        
        // Only seek if time difference is significant (more than 1 second)
        if (timeDiff > 1) {
            console.log("Seeking from", currentPlayerTime, "to", compensatedTime);
            player.seekTo(compensatedTime);
            
            // Wait for seek to complete before playing
            setTimeout(() => {
                player.playVideo();
                setTimeout(() => { ignoreEvents = false; }, 500);
            }, 200);
        } else {
            // Time is close enough, just play
            player.playVideo();
            setTimeout(() => { ignoreEvents = false; }, 300);
        }
    }).catch(err => {
        console.error("Error getting current time:", err);
        // Fallback - just seek and play
        player.seekTo(compensatedTime);
        setTimeout(() => {
            player.playVideo();
            ignoreEvents = false;
        }, 500);
    });
    
    // Show visual indicator for non-admins
    if (!isAdmin && adminViewingNotice) {
        adminViewingNotice.textContent = "Admin started playback";
        adminViewingNotice.style.display = 'block';
        setTimeout(() => {
            if (adminViewingNotice) {
                adminViewingNotice.style.display = 'none';
            }
        }, 3000);
    }
});

// Enhanced video pause event handler with better YouTube sync
// Enhanced video pause event handler optimized for HTML5 video player
socket.on('video pause', (data) => {
    if (!player) {
        console.log("Player not initialized yet");
        return;
    }
    
    ignoreEvents = true;
    
    // Handle both old format (time only) and new enhanced format
    let time, serverTime, videoId;
    
    if (typeof data === 'object') {
        time = data.currentTime || data.time;
        serverTime = data.serverTime || Date.now();
        videoId = data.videoId;
    } else {
        time = data;
        serverTime = Date.now();
    }
    
    // Calculate network latency compensation
    const networkDelay = Date.now() - serverTime;
    const compensatedTime = time + (networkDelay / 1000);
    
    console.log("Video pause event received, time:", time, "network delay:", networkDelay, "ms", "videoId:", videoId);
    
    // For HTML5 video player (direct videos)
    // First pause immediately to stop playback
    player.pauseVideo();
    
    // Then check if we need to seek
    player.getCurrentTime().then(currentPlayerTime => {
        const timeDiff = Math.abs(compensatedTime - currentPlayerTime);
        
        if (timeDiff > 1) {
            console.log("Seeking on pause from", currentPlayerTime, "to", compensatedTime);
            player.seekTo(compensatedTime);
            setTimeout(() => { ignoreEvents = false; }, 500);
        } else {
            setTimeout(() => { ignoreEvents = false; }, 200);
        }
    }).catch(err => {
        console.error("Error in pause sync:", err);
        setTimeout(() => { ignoreEvents = false; }, 300);
    });
    
    // Show visual indicator for non-admins
    if (!isAdmin && adminViewingNotice) {
        adminViewingNotice.textContent = "Admin paused playback";
        adminViewingNotice.style.display = 'block';
        setTimeout(() => {
            if (adminViewingNotice) {
                adminViewingNotice.style.display = 'none';
            }
        }, 3000);
    }
});

socket.on('video seek', (data) => {
    if (!isAdmin) { // Only non-admins should respond to seek commands
        ignoreEvents = true;
        
        // Handle both old format (time only) and new enhanced format
        let time, videoId;
        
        if (typeof data === 'object') {
            time = data.currentTime || data.time;
            videoId = data.videoId;
        } else {
            time = data;
        }
        
        console.log("Seeking to time:", time, "videoId:", videoId);
        
        if (player) {
            player.seekTo(time);
        }
        
        setTimeout(() => {
            ignoreEvents = false;
        }, 300);
    }
});

// Enhanced periodic sync with admin (every 5 seconds for better accuracy)
let adminSyncInterval;

function startAdminSync() {
    if (adminSyncInterval) {
        clearInterval(adminSyncInterval);
    }
    
    adminSyncInterval = setInterval(() => {
        if (isAdmin && player) {
            Promise.all([
                player.getCurrentTime(),
                player.getPlayerState()
            ]).then(([currentTime, playerState]) => {
                const syncData = {
                    time: currentTime,
                    state: playerState,
                    timestamp: Date.now()
                };
                
                socket.emit('detailed sync', syncData);
                console.log("Admin broadcasting sync:", syncData);
            }).catch(err => {
                console.error("Error getting player state for sync:", err);
            });
        }
    }, 5000); // Sync every 5 seconds instead of 30
}

function stopAdminSync() {
    if (adminSyncInterval) {
        clearInterval(adminSyncInterval);
        adminSyncInterval = null;
    }
}

// Listen for time sync events
socket.on('sync time', (data) => {
    if (!isAdmin) {
        ignoreEvents = true;
        
        // Handle both old format (time only) and new enhanced format
        let time, videoId;
        
        if (typeof data === 'object') {
            time = data.currentTime || data.time;
            videoId = data.videoId;
        } else {
            time = data;
        }
        
        console.log("Syncing to time:", time, "videoId:", videoId);
        
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
    
    const messageWrapper = document.createElement('li');
    const messageContent = document.createElement('div');
    messageContent.classList.add('message-content');
    
    const timestamp = new Date().toLocaleTimeString();
    
    // Determine if this is our message
    const isOwnMessage = msg.username === username;
    
    if (isOwnMessage) {
        messageWrapper.classList.add('message-sent');
    } else {
        messageWrapper.classList.add('message-received');
        
        // Add username for received messages
        const usernameElement = document.createElement('div');
        usernameElement.classList.add('username');
        usernameElement.textContent = msg.username;
        
        if (msg.isAdmin) {
            const adminBadge = document.createElement('span');
            adminBadge.classList.add('admin-badge');
            adminBadge.textContent = 'ADMIN';
            usernameElement.appendChild(adminBadge);
        }
        
        messageContent.appendChild(usernameElement);
    }
    
    // Add message text
    const messageText = document.createElement('div');
    messageText.textContent = msg.message;
    messageContent.appendChild(messageText);
    
    // Add timestamp
    const timestampElement = document.createElement('div');
    timestampElement.classList.add('timestamp');
    timestampElement.textContent = msg.timestamp || timestamp;
    messageContent.appendChild(timestampElement);
    
    messageWrapper.appendChild(messageContent);
    messages.appendChild(messageWrapper);
    
    // Scroll to bottom
    const chatContainer = document.querySelector('.chat-container');
    chatContainer.scrollTop = chatContainer.scrollHeight;
});

// Handle system messages (join/leave)
socket.on('system message', (msg) => {
    console.log('System message:', msg);
    
    // Check if we should display this message based on user preferences
    let shouldDisplay = true;
    
    if (msg.includes('has joined the chat') || msg.includes('has left the chat')) {
        shouldDisplay = systemMessageConfig.showJoinLeaveMessages;
    } else if (msg.includes('is now the admin controller')) {
        shouldDisplay = systemMessageConfig.showAdminChangeMessages;
    } else if (msg.includes('changed the video')) {
        shouldDisplay = systemMessageConfig.showVideoChangeMessages;
    }
    // Critical messages and unknown messages are always shown
    
    if (shouldDisplay) {
        const messageWrapper = document.createElement('li');
        const messageContent = document.createElement('div');
        
        messageWrapper.classList.add('system-message');
        messageContent.classList.add('message-content');
        messageContent.textContent = msg;
        
        messageWrapper.appendChild(messageContent);
        messages.appendChild(messageWrapper);
        
        const chatContainer = document.querySelector('.chat-container');
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
});

// Handle system message configuration updates
socket.on('system message config', (config) => {
    console.log('System message config updated:', config);
    systemMessageConfig = { ...systemMessageConfig, ...config };
    
    // Update toggle states in the main area
    if (toggleJoinLeave) {
        toggleJoinLeave.checked = systemMessageConfig.showJoinLeaveMessages;
    }
    if (toggleAdminChange) {
        toggleAdminChange.checked = systemMessageConfig.showAdminChangeMessages;
    }
    if (toggleVideoChange) {
        toggleVideoChange.checked = systemMessageConfig.showVideoChangeMessages;
    }
    
    // Update modal toggle states
    const modalToggleJoinLeave = document.getElementById('modal-toggle-join-leave');
    const modalToggleAdminChange = document.getElementById('modal-toggle-admin-change');
    const modalToggleVideoChange = document.getElementById('modal-toggle-video-change');
    
    if (modalToggleJoinLeave) {
        modalToggleJoinLeave.checked = systemMessageConfig.showJoinLeaveMessages;
    }
    if (modalToggleAdminChange) {
        modalToggleAdminChange.checked = systemMessageConfig.showAdminChangeMessages;
    }
    if (modalToggleVideoChange) {
        modalToggleVideoChange.checked = systemMessageConfig.showVideoChangeMessages;
    }
});

// Handle error messages
socket.on('error message', (msg) => {
    console.log('Error message:', msg);
    showNotification(msg, 'error');
});

// Handle video history response
socket.on('video history', (history) => {
    const container = document.getElementById('video-history');
    if (!container) return;
    
    if (!history || history.length === 0) {
        container.innerHTML = `
            <div class="video-history-header">
                <h3><i class="fas fa-history"></i> Video History</h3>
                <button class="close-history-btn" onclick="toggleVideoHistory()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="video-history-empty">
                <i class="fas fa-film"></i>
                <p>No videos have been played yet</p>
            </div>
        `;
        return;
    }
    
    const historyHtml = history.map(video => `
        <div class="video-history-item" onclick="changeVideoFromHistory('${video.url}')">
            <div class="video-info">
                <div class="video-title">${video.title || 'Untitled Video'}</div>
                <div class="video-url">${video.url}</div>
                <div class="video-date">${new Date(video.timestamp).toLocaleString()}</div>
            </div>
            <button class="replay-btn" onclick="event.stopPropagation(); changeVideoFromHistory('${video.url}')" title="Play this video">
                <i class="fas fa-play"></i>
            </button>
        </div>
    `).join('');
    
    container.innerHTML = `
        <div class="video-history-header">
            <h3><i class="fas fa-history"></i> Video History</h3>
            <button class="close-history-btn" onclick="toggleVideoHistory()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="video-history-list">
            ${historyHtml}
        </div>
    `;
});

// Admin play button - Fix to maintain current time
if (adminPlayBtn) {
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
}

// Admin pause button - Fix to maintain current time
if (adminPauseBtn) {
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
}

// Admin restart button
if (adminRestartBtn) {
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
}

// Listen for admin actions for visual cues
socket.on('admin action', (action) => {
    if (!isAdmin && adminViewingNotice) {
        adminViewingNotice.textContent = `Admin ${action}ed the video`;
        adminViewingNotice.style.display = 'block';
        setTimeout(() => {
            if (adminViewingNotice) {
                adminViewingNotice.style.display = 'none';
            }
        }, 3000);
    }
});

// Simple Voice Chat System
class VoiceChat {
    constructor() {
        this.isInVoiceRoom = false;
        this.isMicEnabled = false;
        this.localStream = null;
        this.peerConnections = {};
        this.audioElements = {};
        
        // UI Elements  
        this.toggleBtn = document.getElementById('voice-chat-toggle');
        this.voiceStatus = null; // Voice status display removed
        this.usersInCall = document.getElementById('users-in-call');
        
        this.initializeEventListeners();
    }
    
    initializeEventListeners() {
        // Voice chat toggle button
        if (this.toggleBtn) {
            this.toggleBtn.addEventListener('click', () => {
                if (!this.isInVoiceRoom) {
                    this.joinVoiceRoom();
                } else {
                    this.leaveVoiceRoom();
                }
            });
        }
        
        // Add microphone toggle on double-click
        if (this.toggleBtn) {
            this.toggleBtn.addEventListener('dblclick', (e) => {
                e.preventDefault();
                if (this.isInVoiceRoom) {
                    this.toggleMicrophone();
                }
            });
        }
    }
    
    async joinVoiceRoom() {
        try {
            this.isInVoiceRoom = true;
            
            // Join as listener first
            socket.emit('join voice room', { username, listenOnly: true });
            
            // Voice status display removed
            // this.voiceStatus.textContent = 'Listening...';
            this.updateButtonState();
            
            showNotification('Joined voice chat - Double-click to enable microphone', 'success');
            
        } catch (error) {
            console.error('Error joining voice room:', error);
            showNotification('Failed to join voice chat', 'error');
            this.isInVoiceRoom = false;
            this.updateButtonState();
        }
    }
    
    async toggleMicrophone() {
        if (!this.isInVoiceRoom) return;
        
        if (!this.isMicEnabled) {
            await this.enableMicrophone();
        } else {
            this.disableMicrophone();
        }
    }
    
    async enableMicrophone() {
        try {
            // Get microphone access
            this.localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });
            
            this.isMicEnabled = true;
            
            // Add our audio track to all existing peer connections
            Object.values(this.peerConnections).forEach(pc => {
                this.localStream.getAudioTracks().forEach(track => {
                    pc.addTrack(track, this.localStream);
                });
            });
            
            // Notify server
            socket.emit('microphone enabled', { username });
            
            // Voice status display removed
            // this.voiceStatus.textContent = 'Speaking enabled';
            this.updateButtonState();
            
            showNotification('Microphone enabled', 'success');
            
        } catch (error) {
            console.error('Error accessing microphone:', error);
            showNotification('Unable to access microphone. Check permissions.', 'error');
        }
    }
    
    disableMicrophone() {
        if (this.localStream) {
            // Stop only audio tracks (microphone)
            this.localStream.getAudioTracks().forEach(track => track.stop());
            
            // Remove tracks from peer connections
            Object.values(this.peerConnections).forEach(pc => {
                const senders = pc.getSenders();
                senders.forEach(sender => {
                    if (sender.track && sender.track.kind === 'audio') {
                        pc.removeTrack(sender);
                    }
                });
            });
            
            this.localStream = null;
        }
        
        this.isMicEnabled = false;
        
        // Notify server
        socket.emit('microphone disabled', { username });
        
        // Voice status display removed
        // this.voiceStatus.textContent = 'Listening only';
        this.updateButtonState();
        
        showNotification('Microphone disabled - You can still hear others', 'info');
    }
    
    leaveVoiceRoom() {
        this.isInVoiceRoom = false;
        this.disableMicrophone();
        
        // Close all peer connections
        Object.values(this.peerConnections).forEach(pc => pc.close());
        this.peerConnections = {};
        
        // Remove all audio elements
        Object.values(this.audioElements).forEach(audio => audio.remove());
        this.audioElements = {};
        
        // Clear users in call
        if (this.usersInCall) {
            this.usersInCall.innerHTML = '';
        }
        
        // Notify server
        socket.emit('leave voice room');
        
        // Voice status display removed
        // this.voiceStatus.textContent = 'Voice chat inactive';
        this.updateButtonState();
        
        showNotification('Left voice chat', 'info');
    }
    
    updateButtonState() {
        if (!this.toggleBtn) return;
        
        if (this.isInVoiceRoom) {
            this.toggleBtn.classList.add('active');
            if (this.isMicEnabled) {
                this.toggleBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                this.toggleBtn.title = 'Speaking enabled (Click to leave, Double-click to mute)';
            } else {
                this.toggleBtn.innerHTML = '<i class="fas fa-headphones"></i>';
                this.toggleBtn.title = 'Listening (Click to leave, Double-click to speak)';
            }
        } else {
            this.toggleBtn.classList.remove('active');
            this.toggleBtn.innerHTML = '<i class="fas fa-microphone"></i>';
            this.toggleBtn.title = 'Join voice chat';
        }
    }
    
    async createPeerConnection(userId) {
        try {
            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' }
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
        audio.volume = 0.8;
        audio.style.display = 'none';
        
        document.body.appendChild(audio);
        this.audioElements[userId] = audio;
        
        console.log(`Audio stream received from user ${userId}`);
    }
    
    addUserToCall(userData) {
        const existingUser = document.getElementById(`voice-user-${userData.userId}`);
        if (existingUser) return;
        
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
        
        if (this.usersInCall) {
            this.usersInCall.appendChild(userElement);
        }
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

// Enhanced detailed sync handler with better error handling
socket.on('detailed sync', (data) => {
    if (!isAdmin && player && currentVideoType === 'youtube') {
        console.log("Received detailed sync:", data);
        
        // Validate sync data
        if (!data.timestamp) {
            data.timestamp = Date.now();
            console.log("Missing timestamp in sync data, using current time");
        }
        
        // Calculate network delay compensation
        const networkDelay = Date.now() - data.timestamp;
        const compensatedTime = data.time + (networkDelay / 1000);
        
        console.log("Network delay:", networkDelay, "ms, compensated time:", compensatedTime);
        
        // Set ignore flag to prevent event feedback loops
        ignoreEvents = true;
        
        // Get current player state
        Promise.all([
            player.getCurrentTime(),
            player.getPlayerState()
        ]).then(([currentTime, currentState]) => {
            console.log("Current state - Time:", currentTime, "State:", currentState, "Target - Time:", compensatedTime, "State:", data.state);
            
            // Check time sync (only sync if difference is significant)
            const timeDiff = Math.abs(currentTime - compensatedTime);
            const needsTimeSync = timeDiff > 2; // 2 second tolerance
            
            // Check state sync
            const needsStateSync = currentState !== data.state;
            
            if (needsTimeSync) {
                console.log("Syncing time: current =", currentTime, "target =", compensatedTime, "diff =", timeDiff);
                player.seekTo(compensatedTime, true);
            }
            
            if (needsStateSync) {
                console.log("Syncing state: current =", currentState, "target =", data.state);
                
                setTimeout(() => {
                    if (data.state === 1) { // YT.PlayerState.PLAYING
                        player.playVideo();
                    } else if (data.state === 2) { // YT.PlayerState.PAUSED
                        player.pauseVideo();
                    }
                }, needsTimeSync ? 500 : 0); // Wait for seek if needed
            }
            
            // Clear ignore flag after operations complete
            setTimeout(() => {
                ignoreEvents = false;
            }, needsTimeSync || needsStateSync ? 1000 : 300);
            
        }).catch(err => {
            console.error("Error in detailed sync:", err);
            setTimeout(() => { ignoreEvents = false; }, 500);
        });
    }
});

// Update online users count
function updateOnlineUsersCount(count) {
    const onlineUsersElement = document.getElementById('online-users');
    if (onlineUsersElement) {
        const userText = count === 1 ? 'user' : 'users';
        onlineUsersElement.innerHTML = `<span class="online-indicator"></span>${count} ${userText} online`;
    }
}

// Handle user count updates
socket.on('user count', (count) => {
    updateOnlineUsersCount(count);
    
    // Update room settings modal if it's open
    const connectedUsersCount = document.getElementById('connected-users-count');
    if (connectedUsersCount) {
        connectedUsersCount.textContent = count;
    }
});

// Handle user list updates  
socket.on('user list', (users) => {
    updateOnlineUsersCount(users.length);
    
    // Update room settings modal if it's open
    const connectedUsersCount = document.getElementById('connected-users-count');
    if (connectedUsersCount) {
        connectedUsersCount.textContent = users.length;
    }
    
    // You could also update a user list display here
    console.log('Users online:', users);
});

// Authentication and initialization
document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on a room page and extract room ID
    const roomId = extractRoomIdFromURL();
    
    // Initialize authentication logic
    initializeAuth();
    
    // Initialize user interface
    initializeUI();
    
    // Auto-join room if on room page
    if (roomId) {
        autoJoinRoom(roomId);
    }
});

// Extract room ID from URL path like /room/ABC12345
function extractRoomIdFromURL() {
    const path = window.location.pathname;
    const roomMatch = path.match(/^\/room\/([A-Z0-9]{8})$/i);
    if (roomMatch) {
        return roomMatch[1];
    }
    return null;
}

// Auto-join room based on URL
async function autoJoinRoom(roomId) {
    console.log('Auto-joining room:', roomId);
    
    try {
        // First check if room exists and get info
        const response = await fetch(`/api/rooms/${roomId}`, {
            headers: {
                'Authorization': authToken ? `Bearer ${authToken}` : ''
            }
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                showNotification('Room not found', 'error');
                setTimeout(() => {
                    window.location.href = '/';
                }, 2000);
            } else {
                showNotification('Failed to load room', 'error');
            }
            return;
        }
        
        const roomInfo = await response.json();
        console.log('Room info:', roomInfo);
        
        // Wait for username to be set if needed
        const waitForUsername = () => {
            return new Promise((resolve) => {
                if (username) {
                    resolve();
                    return;
                }
                
                // If no username, wait for it to be set
                const checkUsername = () => {
                    if (username) {
                        resolve();
                    } else {
                        setTimeout(checkUsername, 100);
                    }
                };
                checkUsername();
            });
        };
        
        await waitForUsername();
        
        // Join the room
        const joinResponse = await fetch('/api/rooms/join', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authToken ? `Bearer ${authToken}` : ''
            },
            body: JSON.stringify({
                roomCode: roomId,
                username: username
            })
        });
        
        if (!joinResponse.ok) {
            const error = await joinResponse.json();
            showNotification(error.message || 'Failed to join room', 'error');
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
            return;
        }
        
        const joinResult = await joinResponse.json();
        console.log('Successfully joined room:', joinResult);
        
        // Emit socket join event
        socket.emit('join room', {
            roomId: roomId,
            username: username
        });
        
        showNotification(`Joined ${roomInfo.room.name}!`, 'success');
        
    } catch (error) {
        console.error('Error auto-joining room:', error);
        showNotification('Failed to join room', 'error');
        setTimeout(() => {
            window.location.href = '/';
        }, 2000);
    }
}

function initializeAuth() {
    console.log('🔍 Initializing authentication...');
    console.log('  📊 Auth state:', { authToken: !!authToken, userData: !!userData, isGuestMode });
    
    const roomId = extractRoomIdFromURL();
    const isOnRoomPage = !!roomId;
    
    // If user is authenticated, use their data
    if (authToken && userData && userData.username) {
        console.log('  ✅ User is authenticated:', userData.username);
        username = userData.username;
        
        // For room pages, always prompt for display name confirmation/customization
        // For home page, skip the modal
        if (isOnRoomPage) {
            console.log('  🎬 On room page, prompting for display name confirmation');
            const usernameModal = document.getElementById('username-modal');
            const usernameInput = document.getElementById('username-input');
            if (usernameModal && usernameInput) {
                // Pre-fill with existing username
                usernameInput.value = username;
                usernameInput.placeholder = 'Confirm your display name...';
                usernameModal.style.display = 'flex';
                
                // Auto-focus and select text for easy editing
                setTimeout(() => {
                    usernameInput.focus();
                    usernameInput.select();
                }, 100);
            }
            console.log('  🔗 Showing username modal for room access (authenticated user)');
        } else {
            // Hide the username modal for home page
            const usernameModal = document.getElementById('username-modal');
            if (usernameModal) {
                usernameModal.style.display = 'none';
            }
            
            // Join socket with username
            socket.emit('user join', username);
            updateUserInterface();
            console.log('  🔗 Socket joined with username:', username);
        }
    } 
    // If user has auth token but no userData, try to fetch user info or fallback to guest
    else if (authToken) {
        console.log('  ⚠️ Auth token exists but no userData found');
        // Auth token exists but no user data - this shouldn't happen but let's handle it
        console.warn('Auth token exists but no userData found');
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        
        // Show username modal for guest mode
        const usernameModal = document.getElementById('username-modal');
        if (usernameModal) {
            usernameModal.style.display = 'flex';
        }
        console.log('  🔗 Showing username modal (fallback to guest)');
    }
    // If user is in guest mode, check if they already have userData (from invite join)
    else if (isGuestMode) {
        console.log('  👤 User is in guest mode');
        
        // If user already has userData (from invite join), use it
        if (userData && userData.username) {
            console.log('  ✅ Guest user has existing data:', userData.username);
            username = userData.username;
            
            // For room pages, still allow display name customization
            // For home page, skip the modal
            if (isOnRoomPage) {
                console.log('  🎬 On room page, allowing display name customization for guest');
                const usernameModal = document.getElementById('username-modal');
                const usernameInput = document.getElementById('username-input');
                if (usernameModal && usernameInput) {
                    // Pre-fill with existing username
                    usernameInput.value = username;
                    usernameInput.placeholder = 'Customize your display name...';
                    usernameModal.style.display = 'flex';
                    
                    // Auto-focus and select text for easy editing
                    setTimeout(() => {
                        usernameInput.focus();
                        usernameInput.select();
                    }, 100);
                }
                console.log('  🔗 Showing username modal for room access (existing guest)');
            } else {
                // Hide the username modal for home page
                const usernameModal = document.getElementById('username-modal');
                if (usernameModal) {
                    usernameModal.style.display = 'none';
                }
                
                // Join socket with username
                socket.emit('user join', username);
                updateUserInterface();
                console.log('  🔗 Socket joined with existing guest username:', username);
            }
        } else {
            // Show username modal for new guest users
            const usernameModal = document.getElementById('username-modal');
            if (usernameModal) {
                usernameModal.style.display = 'flex';
            }
            console.log('  🔗 Showing username modal (new guest user)');
        }
    } 
    // If not authenticated and not guest, check if we're on a room page
    else {
        if (roomId) {
            // User is trying to access a room directly, allow guest mode
            console.log('  🎬 Direct room access, enabling guest mode for room:', roomId);
            localStorage.setItem('guestMode', 'true');
            isGuestMode = true;
            
            // Show username modal for guest access
            const usernameModal = document.getElementById('username-modal');
            if (usernameModal) {
                usernameModal.style.display = 'flex';
            }
            console.log('  🔗 Showing username modal (direct room access)');
        } else {
            // Not authenticated and not on a room page, redirect to login
            console.log('  🔒 Not authenticated, redirecting to login');
            
            // Only store room URLs for return after login, not other pages
            if (roomId) {
                localStorage.setItem('preLoginUrl', window.location.href);
            }
            
            window.location.href = '/login.html';
            return; // Don't continue if redirecting
        }
    }
}



function updateUserInterface() {
    // Update the compact user info in the chat header
    const userInfoCompact = document.getElementById('user-info-compact');
    if (!userInfoCompact) return;
    
    // Create compact user info HTML
    const isAdmin = userData && userData.isAdmin;
    const avatarText = (userData && userData.avatar) ? userData.avatar : (username || 'GU').substring(0, 2).toUpperCase();
    
    userInfoCompact.innerHTML = `
        <div class="user-info-compact">
            <div class="user-avatar-small">${avatarText}</div>
            <span class="user-name-small">${username || 'Guest'}</span>
            ${isAdmin ? '<span class="admin-badge-small">Admin</span>' : ''}
        </div>
        <div style="display: flex; gap: 4px; align-items: center;">
            ${!authToken ? `
                <button onclick="goToLogin()" 
                        style="background: transparent; 
                               border: 1px solid var(--border-color); 
                               color: var(--text-secondary); 
                               padding: 3px 6px; 
                               border-radius: 4px; 
                               cursor: pointer;
                               font-size: 10px;
                               transition: all 0.2s ease;"
                        title="Login">
                    Login
                </button>
            ` : ''}
            <button onclick="logout()" 
                    style="background: transparent; 
                           border: 1px solid var(--border-color); 
                           color: var(--text-secondary); 
                           padding: 3px 6px; 
                           border-radius: 4px; 
                           cursor: pointer;
                           font-size: 10px;
                           transition: all 0.2s ease;"
                    title="Logout">
                <i class="fas fa-sign-out-alt"></i>
            </button>
        </div>
    `;
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
    
    // Initialize header button functionality
    initializeHeaderButtons();
    
    // Initialize invite system
    initializeInviteSystem();
    
    // Initialize room settings modal
    initializeRoomSettingsModal();
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
        max-width
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

// ========================================
// INVITE SYSTEM FUNCTIONALITY
// ========================================

// Invite system variables
let currentInviteCode = null;
let currentInviteUrl = null;

// Get invite modal elements
const inviteModal = document.getElementById('invite-modal');
const inviteButton = document.getElementById('invite-button');
const closeInviteModal = document.getElementById('close-invite-modal');
const generateInviteBtn = document.getElementById('generate-invite');
const revokeInviteBtn = document.getElementById('revoke-invite');
const inviteLinkInput = document.getElementById('invite-link');
const copyInviteLinkBtn = document.getElementById('copy-invite-link');
const inviteStats = document.getElementById('invite-stats');
const inviteExpires = document.getElementById('invite-expires');
const inviteStatus = document.getElementById('invite-status');

// Initialize invite system
function initializeInviteSystem() {
    // Add event listeners
    if (inviteButton) {
        inviteButton.addEventListener('click', openInviteModal);
    }
    
    if (closeInviteModal) {
        closeInviteModal.addEventListener('click', closeInviteModalHandler);
    }
    
    if (generateInviteBtn) {
        generateInviteBtn.addEventListener('click', generateInviteLink);
    }
    
    if (revokeInviteBtn) {
        revokeInviteBtn.addEventListener('click', revokeInviteLink);
    }
    
    if (copyInviteLinkBtn) {
        copyInviteLinkBtn.addEventListener('click', copyInviteLink);
    }
    
    // Close modal when clicking outside
    if (inviteModal) {
        inviteModal.addEventListener('click', (e) => {
            if (e.target === inviteModal) {
                closeInviteModalHandler();
            }
        });
    }
}

function initializeHeaderButtons() {
    // Room Settings Button
    const roomSettingsBtn = document.getElementById('room-settings');
    if (roomSettingsBtn) {
        roomSettingsBtn.addEventListener('click', openRoomSettingsModal);
    }
    
    // Video History Button
    const videoHistoryBtn = document.getElementById('video-history-btn');
    if (videoHistoryBtn) {
        videoHistoryBtn.addEventListener('click', toggleVideoHistory);
    }
    
    // Exit Room Button
    const exitRoomBtn = document.getElementById('exit-room-btn');
    if (exitRoomBtn) {
        exitRoomBtn.addEventListener('click', exitRoom);
    }
}

function initializeRoomSettingsModal() {
    // Close button handlers
    const closeBtn = document.getElementById('close-room-settings-modal');
    const closeBtn2 = document.getElementById('close-room-settings-btn');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeRoomSettingsModal);
    }
    
    if (closeBtn2) {
        closeBtn2.addEventListener('click', closeRoomSettingsModal);
    }
    
    // Modal background click to close
    const modal = document.getElementById('room-settings-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeRoomSettingsModal();
            }
        });
    }
    
    // System message toggles
    const toggleJoinLeave = document.getElementById('modal-toggle-join-leave');
    const toggleAdminChange = document.getElementById('modal-toggle-admin-change');
    const toggleVideoChange = document.getElementById('modal-toggle-video-change');
    
    if (toggleJoinLeave) {
        toggleJoinLeave.addEventListener('change', (e) => {
            updateSystemMessageSetting('showJoinLeaveMessages', e.target.checked);
        });
    }
    
    if (toggleAdminChange) {
        toggleAdminChange.addEventListener('change', (e) => {
            updateSystemMessageSetting('showAdminChangeMessages', e.target.checked);
        });
    }
    
    if (toggleVideoChange) {
        toggleVideoChange.addEventListener('change', (e) => {
            updateSystemMessageSetting('showVideoChangeMessages', e.target.checked);
        });
    }
}

function openInviteModal() {
    console.log("Opening invite modal");
    if (!isAdmin) {
        showNotification('Only room admin can invite users', 'error');
        return;
    }
    
    inviteModal.style.display = 'flex';
    console.log("Invite modal display set to flex");
    
    // Reset modal state
    resetInviteModal();
}

function closeInviteModalHandler() {
    inviteModal.style.display = 'none';
}

function openRoomSettingsModal() {
    console.log("Opening room settings modal");
    const modal = document.getElementById('room-settings-modal');
    if (modal) {
        modal.style.display = 'flex';
    console.log("Modal display set to flex");
        updateRoomSettings();
    }
}

function closeRoomSettingsModal() {
    const modal = document.getElementById('room-settings-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function updateRoomSettings() {
    const roomCodeDisplay = document.getElementById('room-code-display');
    if (roomCodeDisplay) {
        const roomId = extractRoomIdFromURL() || 'default';
        roomCodeDisplay.textContent = roomId.toUpperCase();
    }
    
    const adminDisplay = document.getElementById('current-admin-display');
    if (adminDisplay) {
        adminDisplay.textContent = currentAdminUser || 'None';
    }
    
    socket.emit('get user count');
}

function updateSystemMessageSetting(setting, value) {
    if (!isAdmin) {
        showNotification('Only room admin can change these settings', 'error');
        return;
    }
    
    systemMessageConfig[setting] = value;
    socket.emit('update system message config', systemMessageConfig);
    showNotification('Setting updated', 'success');
}

function toggleVideoHistory() {
    console.log("Toggling video history");
    const container = document.getElementById('video-history');
    if (!container) return;
    
    if (container.style.display === 'none' || !container.style.display) {
        container.style.display = 'block';
        loadVideoHistory();
        
        const btn = document.getElementById('video-history-btn');
        if (btn) {
            btn.classList.add('active');
            btn.title = 'Hide Video History';
        }
    } else {
        container.style.display = 'none';
        
        const btn = document.getElementById('video-history-btn');
        if (btn) {
            btn.classList.remove('active');
            btn.title = 'Video History';
        }
    }
}

function loadVideoHistory() {
    const container = document.getElementById('video-history');
    if (!container) return;
    
    container.innerHTML = `
        <div class="video-history-header">
            <h3><i class="fas fa-history"></i> Video History</h3>
            <button class="close-history-btn" onclick="toggleVideoHistory()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="video-history-loading">
            <i class="fas fa-spinner fa-spin"></i>
            Loading history...
        </div>
    `;
    
    socket.emit('get video history');
}

function exitRoom() {
    console.log("Exiting room");
    if (confirm('Are you sure you want to leave this room?')) {
        if (socket) {
            socket.disconnect();
        }
        
        if (syncInterval) {
            clearInterval(syncInterval);
        }
        
        window.location.href = '/home.html';
    }
}

function changeVideoFromHistory(url) {
    if (!isAdmin) {
        showNotification('Only admin can change the video', 'error');
        return;
    }
    
    const videoUrlInput = document.getElementById('video-url');
    if (videoUrlInput) {
        videoUrlInput.value = url;
        
        // Trigger the change video functionality
        const changeVideoBtn = document.getElementById('change-video');
        if (changeVideoBtn) {
            changeVideoBtn.click();
        }
    }
    
    // Close video history
    toggleVideoHistory();
}

function resetInviteModal() {
    // Hide the link container and show generate button
    const inviteLinkContainer = document.querySelector('.invite-link-container');
    const generateInviteContainer = document.querySelector('.generate-invite-container');
    
    if (inviteLinkContainer) inviteLinkContainer.style.display = 'none';
    if (generateInviteContainer) generateInviteContainer.style.display = 'block';
    
    // Reset link input and buttons with null checks
    if (inviteLinkInput) if (inviteLinkInput) inviteLinkInput.value = '';
    if (copyInviteLinkBtn) if (copyInviteLinkBtn) copyInviteLinkBtn.disabled = true;
    if (revokeInviteBtn) if (revokeInviteBtn) revokeInviteBtn.style.display = 'none';
    if (inviteStats) if (inviteStats) inviteStats.style.display = 'none';
    

    // Hide share options

    const shareOptions = document.querySelector('.share-options');

    if (shareOptions) shareOptions.style.display = 'none';
    if (generateInviteBtn) {
        if (generateInviteBtn) generateInviteBtn.style.display = 'block';
        if (generateInviteBtn) generateInviteBtn.disabled = false;
    }
}

function oldResetInviteModal() {
    if (inviteLinkInput) inviteLinkInput.value = '';
    if (copyInviteLinkBtn) copyInviteLinkBtn.disabled = true;
    if (revokeInviteBtn) revokeInviteBtn.style.display = 'none';
    if (inviteStats) inviteStats.style.display = 'none';
    if (generateInviteBtn) generateInviteBtn.style.display = 'block';
    if (generateInviteBtn) generateInviteBtn.disabled = false;
}

async function generateInviteLink() {
    if (!isAdmin) {
        showNotification('Only room admin can generate invite links', 'error');
        return;
    }
    
    generateInviteBtn.disabled = true;
    generateInviteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    
    try {
        const response = await fetch('/api/rooms/default/invite', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken || ''}`
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            currentInviteCode = result.inviteCode;
            currentInviteUrl = result.inviteUrl;
            
            // Update UI
            const inviteLinkContainer = document.querySelector('.invite-link-container');
            const generateInviteContainer = document.querySelector('.generate-invite-container');
            if (inviteLinkContainer) inviteLinkContainer.style.display = 'block';
            if (generateInviteContainer) generateInviteContainer.style.display = 'none';
            
            // Update link and buttons
            if (inviteLinkInput) inviteLinkInput.value = currentInviteUrl;
            if (copyInviteLinkBtn) copyInviteLinkBtn.disabled = false;
            if (revokeInviteBtn) revokeInviteBtn.style.display = 'block';
            if (generateInviteBtn) generateInviteBtn.style.display = 'none';
            
            // Update stats
            if (inviteExpires) inviteExpires.textContent = new Date(result.expiresAt).toLocaleDateString();
            if (inviteStatus) inviteStatus.textContent = 'Active';
            if (inviteStats) inviteStats.style.display = 'flex';
            

            // Show share options

            const shareOptions = document.querySelector('.share-options');

            if (shareOptions) shareOptions.style.display = 'block';
            
            showNotification('Invite link generated successfully!', 'success');
        } else {
            showNotification(result.message || 'Failed to generate invite link', 'error');
        }
    } catch (error) {
        showNotification('Network error. Please try again.', 'error');
    } finally {
        if (generateInviteBtn) generateInviteBtn.disabled = false;
        if (generateInviteBtn) generateInviteBtn.innerHTML = '<i class="fas fa-link"></i> Generate Invite Link';
    }
}

async function revokeInviteLink() {
    if (!isAdmin) {
        showNotification('Only room admin can revoke invite links', 'error');
        return;
    }
    
    if (!confirm('Are you sure you want to revoke this invite link? It will no longer work.')) {
        return;
    }
    
    revokeInviteBtn.disabled = true;
    revokeInviteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Revoking...';
    
    try {
        const response = await fetch('/api/rooms/default/invite', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken || ''}`
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            currentInviteCode = null;
            currentInviteUrl = null;
            
            // Reset UI
            resetInviteModal();
            
            showNotification('Invite link revoked successfully', 'success');
        } else {
            showNotification(result.message || 'Failed to revoke invite link', 'error');
        }
    } catch (error) {
        showNotification('Network error. Please try again.', 'error');
    } finally {
        if (revokeInviteBtn) revokeInviteBtn.disabled = false;
        if (revokeInviteBtn) revokeInviteBtn.innerHTML = '<i class="fas fa-times-circle"></i> Revoke Link';
    }
}

async function copyInviteLink() {
    if (!currentInviteUrl) {
        showNotification('No invite link to copy', 'error');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(currentInviteUrl);
        
        // Update button temporarily
        const copyBtn = document.getElementById('copyInviteBtn');
        const originalContent = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        
        setTimeout(() => {
            copyBtn.innerHTML = originalContent;
        }, 2000);
        
        showNotification('Invite link copied to clipboard!', 'success');
    } catch (error) {
        showNotification('Failed to copy link. Please try again.', 'error');
}



// Share functions for invite modal

function shareViaWhatsApp() {
    const link = currentInviteUrl;
    if (!link) {
        showNotification('No invite link to share', 'error');
        return;
    }
    const url = `https://wa.me/?text=${encodeURIComponent('Join me for a watch party! ' + link)}`;
    window.open(url, '_blank');
}

    const url = `https://wa.me/?text=${encodeURIComponent('Join me for a watch party! ' + link)}`;

    window.open(url, '_blank');
}

// Function to update video container state
function updateVideoContainerState(hasVideo = false) {
    const videoContainer = document.getElementById('video-player')?.parentElement || 
                          document.getElementById('direct-video-player')?.parentElement;
    
    if (videoContainer) {
        if (hasVideo) {
            videoContainer.classList.add('has-video');
        } else {
            videoContainer.classList.remove('has-video');
        }
    }
}

// Call this function whenever video state changes
function updateVideoState(url, playing, currentTime, videoType) {
    updateVideoContainerState(!!url);
    // ...existing video state update logic...
}
