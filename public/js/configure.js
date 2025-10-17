// Configure page JavaScript for Socket.IO-based QR/Photo workflow
let socket;
let deviceId = null;
let isDeviceConnected = false;
let qrCodes = [];
let currentCameraQR = null;
let cameraStream = null;

// DOM elements
const deviceStatus = document.getElementById('deviceStatus');
const connectionStatus = document.getElementById('connectionStatus');
const connectionDetails = document.getElementById('connectionDetails');
const qrGallery = document.getElementById('qrGallery');
const qrGalleryCard = document.getElementById('qrGalleryCard');
const cameraCard = document.getElementById('cameraCard');
const downloadCard = document.getElementById('downloadCard');
const cameraVideo = document.getElementById('cameraVideo');
const cameraCanvas = document.getElementById('cameraCanvas');
const photoPreview = document.getElementById('photoPreview');
const previewImage = document.getElementById('previewImage');

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    initializePage();
});

function initializePage() {
    console.log('🛠️ Initializing SmartBag Configure Page');
    
    // Set up event listeners
    setupEventListeners();
    
    // Initialize Socket.IO connection
    initializeSocket();
    
    // Set up logout functionality
    setupLogout();
}

function setupEventListeners() {
    // Camera controls
    document.getElementById('startCameraBtn').addEventListener('click', startCamera);
    document.getElementById('captureBtn').addEventListener('click', capturePhoto);
    document.getElementById('retakeBtn').addEventListener('click', retakePhoto);
    document.getElementById('savePhotoBtn').addEventListener('click', savePhoto);
    document.getElementById('closeCameraBtn').addEventListener('click', closeCamera);
    
    // Download button
    document.getElementById('downloadZipBtn').addEventListener('click', downloadZip);
}

function setupLogout() {
    document.getElementById('logoutBtn').addEventListener('click', function() {
        if (confirm('Are you sure you want to logout?')) {
            fetch('/api/logout', { method: 'POST' })
                .then(() => {
                    window.location.href = '/';
                })
                .catch(error => {
                    console.error('Logout error:', error);
                    window.location.href = '/';
                });
        }
    });
}

function initializeSocket() {
    console.log('🔌 Connecting to Socket.IO server...');
    socket = io();
    
    socket.on('connect', function() {
        console.log('✅ Connected to server');
        socket.emit('authenticate', { type: 'client' });
    });
    
    socket.on('disconnect', function() {
        console.log('❌ Disconnected from server');
        updateConnectionStatus(false, 'Disconnected from server');
    });
    
    // Authentication required
    socket.on('authRequired', function() {
        console.log('🔐 Authentication required');
        alert('Please login first');
        window.location.href = '/';
    });
    
    // Device connection status
    socket.on('deviceConnectionStatus', function(data) {
        console.log('📱 Device connection status:', data);
        deviceId = data.deviceId;
        isDeviceConnected = data.connected;
        updateConnectionStatus(data.connected, data.connected ? `Connected to ${data.deviceId}` : `Waiting for ${data.deviceId} to connect`);
        updateDeviceStatus(data.connected, data.deviceId);
    });
    
    // Configuration data (existing QR codes)
    socket.on('configurationData', function(data) {
        console.log('📋 Configuration data received:', data);
        qrCodes = data.qrCodes || [];
        displayQRCodes();
        updateCompletionStatus();
    });
    
    // New QR code received from Pi
    socket.on('qrCodeReceived', function(qrData) {
        console.log('📟 New QR code received:', qrData);
        qrCodes.push(qrData);
        displayQRCodes();
        updateCompletionStatus();
        
        // Show notification
        showNotification(`New QR code received: ${qrData.label}`, 'success');
    });
    
    // Photo uploaded confirmation
    socket.on('photoUploaded', function(data) {
        console.log('📷 Photo uploaded:', data);
        
        // Update QR code status
        const qr = qrCodes.find(q => q.filename === data.qrFilename);
        if (qr) {
            qr.hasPhoto = true;
            displayQRCodes();
            updateCompletionStatus();
        }
        
        showNotification(`Photo uploaded for ${data.qrFilename}`, 'success');
    });
}

function updateConnectionStatus(connected, message) {
    const statusIcon = connectionStatus.querySelector('i');
    const statusText = connectionStatus.querySelector('span');
    
    if (connected) {
        statusIcon.className = 'fas fa-circle status-connected';
        statusText.textContent = message;
        connectionDetails.textContent = 'Socket.IO connection active';
    } else {
        statusIcon.className = 'fas fa-circle status-disconnected';
        statusText.textContent = message;
        connectionDetails.textContent = 'Waiting for device connection...';
    }
}

function updateDeviceStatus(connected, deviceName) {
    const deviceStatusIcon = deviceStatus.querySelector('i');
    const deviceNameSpan = document.getElementById('deviceName');
    
    if (connected) {
        deviceStatusIcon.className = 'fas fa-circle status-connected';
        deviceNameSpan.textContent = deviceName;
    } else {
        deviceStatusIcon.className = 'fas fa-circle status-disconnected';
        deviceNameSpan.textContent = `Waiting for ${deviceName || 'device'}`;
    }
}

function displayQRCodes() {
    if (qrCodes.length === 0) {
        qrGalleryCard.style.display = 'none';
        return;
    }
    
    qrGalleryCard.style.display = 'block';
    
    const gallery = qrCodes.map(qr => `
        <div class="qr-item ${qr.hasPhoto ? 'has-photo' : ''}" data-filename="${qr.filename}">
            <div class="qr-image">
                <img src="data:image/png;base64,${qr.imageData}" alt="${qr.label}">
                ${qr.hasPhoto ? '<div class="photo-badge"><i class="fas fa-check"></i></div>' : ''}
            </div>
            <div class="qr-info">
                <h6>${qr.label}</h6>
                <small class="text-muted">Uploaded: ${new Date(qr.uploadedAt).toLocaleString()}</small>
            </div>
            <div class="qr-actions">
                ${qr.hasPhoto ? 
                    '<button class="btn btn-sm btn-success" disabled><i class="fas fa-check"></i> Photo Added</button>' :
                    `<button class="btn btn-sm btn-primary" onclick="takePhotoForQR('${qr.filename}', '${qr.label}')">
                        <i class="fas fa-camera"></i> Take Photo
                    </button>`
                }
            </div>
        </div>
    `).join('');
    
    qrGallery.innerHTML = gallery;
    updateCompletionStatus();
}

function takePhotoForQR(filename, label) {
    currentCameraQR = { filename, label };
    document.getElementById('currentItem').textContent = label;
    cameraCard.style.display = 'block';
    
    // Scroll to camera
    cameraCard.scrollIntoView({ behavior: 'smooth' });
    
    // Reset camera state
    resetCameraState();
}

function startCamera() {
    console.log('📷 Starting camera...');
    
    navigator.mediaDevices.getUserMedia({ 
        video: { 
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: 'environment' // Use back camera on mobile
        } 
    })
    .then(function(stream) {
        cameraStream = stream;
        cameraVideo.srcObject = stream;
        cameraVideo.style.display = 'block';
        
        // Update button states
        document.getElementById('startCameraBtn').style.display = 'none';
        document.getElementById('captureBtn').style.display = 'inline-block';
        
        console.log('✅ Camera started successfully');
    })
    .catch(function(error) {
        console.error('❌ Camera error:', error);
        alert('Failed to access camera: ' + error.message);
    });
}

function capturePhoto() {
    if (!cameraStream) {
        alert('Camera not started');
        return;
    }
    
    const canvas = cameraCanvas;
    const context = canvas.getContext('2d');
    
    // Set canvas dimensions to match video
    canvas.width = cameraVideo.videoWidth;
    canvas.height = cameraVideo.videoHeight;
    
    // Draw the video frame to canvas
    context.drawImage(cameraVideo, 0, 0);
    
    // Get image data
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
    
    // Show preview
    previewImage.src = imageDataUrl;
    photoPreview.style.display = 'block';
    
    // Update photo info
    document.getElementById('photoInfo').innerHTML = `
        <strong>Photo captured for:</strong> ${currentCameraQR.label}<br>
        <strong>Resolution:</strong> ${canvas.width}x${canvas.height}
    `;
    
    // Update button states
    document.getElementById('captureBtn').style.display = 'none';
    document.getElementById('retakeBtn').style.display = 'inline-block';
    document.getElementById('savePhotoBtn').style.display = 'inline-block';
    
    // Hide video
    cameraVideo.style.display = 'none';
}

function retakePhoto() {
    // Show video again
    cameraVideo.style.display = 'block';
    photoPreview.style.display = 'none';
    
    // Update button states
    document.getElementById('captureBtn').style.display = 'inline-block';
    document.getElementById('retakeBtn').style.display = 'none';
    document.getElementById('savePhotoBtn').style.display = 'none';
}

async function savePhoto() {
    if (!currentCameraQR) {
        alert('No QR code selected');
        return;
    }
    
    const canvas = cameraCanvas;
    
    try {
        // Show loading
        const saveBtn = document.getElementById('savePhotoBtn');
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        saveBtn.disabled = true;
        
        // Convert canvas to blob
        const blob = await new Promise(resolve => {
            canvas.toBlob(resolve, 'image/jpeg', 0.85);
        });
        
        // Create form data
        const formData = new FormData();
        formData.append('photo', blob, `${currentCameraQR.filename}.jpg`);
        
        // Upload photo
        const response = await fetch(`/api/upload-photo/${currentCameraQR.filename}`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showNotification(`Photo saved successfully! Size: ${(result.size / 1024).toFixed(1)}KB`, 'success');
            closeCamera();
            
            // Update QR code display
            const qr = qrCodes.find(q => q.filename === currentCameraQR.filename);
            if (qr) {
                qr.hasPhoto = true;
                displayQRCodes();
            }
        } else {
            throw new Error(result.error || 'Upload failed');
        }
        
    } catch (error) {
        console.error('Photo save error:', error);
        showNotification(`Failed to save photo: ${error.message}`, 'error');
        
        // Reset button
        const saveBtn = document.getElementById('savePhotoBtn');
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
}

function closeCamera() {
    // Stop camera stream
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    
    // Hide camera interface
    cameraCard.style.display = 'none';
    resetCameraState();
    currentCameraQR = null;
}

function resetCameraState() {
    cameraVideo.style.display = 'none';
    photoPreview.style.display = 'none';
    
    // Reset buttons
    document.getElementById('startCameraBtn').style.display = 'inline-block';
    document.getElementById('captureBtn').style.display = 'none';
    document.getElementById('retakeBtn').style.display = 'none';
    document.getElementById('savePhotoBtn').style.display = 'none';
}

function updateCompletionStatus() {
    const totalQRs = qrCodes.length;
    const completedQRs = qrCodes.filter(qr => qr.hasPhoto).length;
    const percentage = totalQRs > 0 ? Math.round((completedQRs / totalQRs) * 100) : 0;
    
    // Update progress bar
    const progressBar = document.getElementById('completionProgress');
    progressBar.style.width = `${percentage}%`;
    progressBar.textContent = `${percentage}%`;
    
    // Update text
    document.getElementById('completionText').textContent = `${completedQRs} of ${totalQRs} items configured`;
    
    // Show download card if we have QR codes
    if (totalQRs > 0) {
        downloadCard.style.display = 'block';
    }
    
    // Enable download button if all completed
    const downloadBtn = document.getElementById('downloadZipBtn');
    if (completedQRs === totalQRs && totalQRs > 0) {
        downloadBtn.disabled = false;
        document.getElementById('completionStatus').textContent = 'Configuration Complete!';
    } else {
        downloadBtn.disabled = true;
        document.getElementById('completionStatus').textContent = 'Configuration in Progress';
    }
}

function downloadZip() {
    window.location.href = '/api/download-zip';
    showNotification('Starting download...', 'info');
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} notification`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'times' : 'info'}"></i>
        ${message}
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
    
    console.log(`📢 ${type.toUpperCase()}: ${message}`);
}

// Global function for QR buttons (called from HTML)
window.takePhotoForQR = takePhotoForQR;

console.log('🎯 Configure page JavaScript loaded');