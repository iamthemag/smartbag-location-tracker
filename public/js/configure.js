// Socket.IO connection and PDF configuration functionality
let socket;
let currentDeviceId = null;
let connectedDevices = new Map();
let receivedPdfs = new Map();

// DOM elements
const connectionStatus = document.getElementById('connectionStatus');
const connectionDetails = document.getElementById('connectionDetails');
const deviceStatus = document.getElementById('deviceStatus');
const deviceName = document.getElementById('deviceName');
const deviceList = document.getElementById('deviceList');
const activityLog = document.getElementById('activityLog');
const pdfStatus = document.getElementById('pdfStatus');
const pdfList = document.getElementById('pdfList');
const logoutBtn = document.getElementById('logoutBtn');
const clearLogBtn = document.getElementById('clearLogBtn');

// Initialize the configuration system
document.addEventListener('DOMContentLoaded', function() {
    checkAuthenticationStatus();
    initializeSocketConnection();
    setupEventListeners();
    logActivity('PDF Configuration system initialized', 'info');
});

// Check if user is authenticated
async function checkAuthenticationStatus() {
    try {
        const response = await fetch('/api/auth-status');
        const data = await response.json();
        
        if (!data.authenticated) {
            window.location.href = '/';
            return;
        }
        
        currentDeviceId = data.deviceId;
        updateDeviceStatus(data.deviceId, false);
        logActivity(`Authenticated as device: ${data.deviceId}`, 'success');
        
    } catch (error) {
        console.error('Auth check failed:', error);
        logActivity('Authentication check failed', 'error');
        window.location.href = '/';
    }
}

// Initialize Socket.IO connection
function initializeSocketConnection() {
    socket = io();
    
    socket.on('connect', () => {
        logActivity('Connected to server via Socket.IO', 'success');
        updateConnectionStatus('connected', 'Connected to server');
        
        // Authenticate as web client
        socket.emit('authenticate', {
            type: 'client'
        });
    });
    
    socket.on('disconnect', () => {
        logActivity('Disconnected from server', 'error');
        updateConnectionStatus('disconnected', 'Connection lost');
        clearDeviceList();
    });
    
    socket.on('connect_error', (error) => {
        logActivity(`Connection error: ${error.message}`, 'error');
        updateConnectionStatus('disconnected', 'Connection failed');
    });
    
    // Handle device status updates
    socket.on('deviceStatus', (data) => {
        logActivity(`Device status update: ${data.connectedDevices.length} devices connected`, 'info');
        updateConnectedDevices(data.connectedDevices);
    });
    
    // Handle PDF uploads from Raspberry Pi devices (via Socket.IO)
    socket.on('qrPdfReceived', (data) => {
        logActivity(`PDF received via Socket.IO: ${data.pdfInfo.filename} with ${data.pdfInfo.totalQRs} QR codes`, 'success');
        addPdfToList(data.pdfInfo, data.qrCodes);
    });
    
    // Handle PDF uploads (HTTP API broadcast)
    socket.on('pdfReceived', (data) => {
        logActivity(`PDF received via HTTP API: ${data.filename}`, 'success');
        addPdfToList({
            filename: data.filename,
            totalQRs: data.qrCodes ? data.qrCodes.length : 0,
            uploadedAt: data.uploadedAt
        }, data.qrCodes || []);
    });
    
    // Handle individual QR code uploads (fallback)
    socket.on('qrCodeReceived', (data) => {
        logActivity(`QR code received: ${data.filename}`, 'info');
    });
    
    // Handle authentication required
    socket.on('authRequired', () => {
        logActivity('Authentication required - redirecting to login', 'warning');
        window.location.href = '/';
    });
    
    // Handle device connection status
    socket.on('deviceConnectionStatus', (data) => {
        if (data.deviceId === currentDeviceId) {
            updateDeviceStatus(data.deviceId, data.connected);
            logActivity(`Device ${data.deviceId} is ${data.connected ? 'connected' : 'disconnected'}`, 
                       data.connected ? 'success' : 'warning');
        }
    });
    
    // Handle configuration data (existing PDFs)
    socket.on('configurationData', (data) => {
        logActivity('Loading existing configuration data', 'info');
        if (data.qrCodes && data.qrCodes.length > 0) {
            loadExistingPdfs();
        }
    });
}

// Setup event listeners
function setupEventListeners() {
    logoutBtn.addEventListener('click', handleLogout);
    clearLogBtn.addEventListener('click', clearActivityLog);
    
    // PDF preview modal handlers
    document.getElementById('downloadPdfBtn').addEventListener('click', downloadCurrentPdf);
}

// Update connection status indicator
function updateConnectionStatus(status, message) {
    const statusIcon = connectionStatus.querySelector('i');
    const statusText = connectionStatus.querySelector('span');
    
    statusIcon.className = 'fas fa-circle';
    
    switch (status) {
        case 'connected':
            statusIcon.classList.add('status-connected');
            break;
        case 'connecting':
            statusIcon.classList.add('status-connecting');
            break;
        default:
            statusIcon.classList.add('status-disconnected');
    }
    
    statusText.textContent = message;
    connectionDetails.textContent = `Last update: ${new Date().toLocaleTimeString()}`;
}

// Update device status in navbar
function updateDeviceStatus(deviceId, connected) {
    const statusIcon = deviceStatus.querySelector('i');
    
    statusIcon.className = 'fas fa-circle';
    if (connected) {
        statusIcon.classList.add('status-connected');
        deviceName.textContent = `${deviceId} (Connected)`;
    } else {
        statusIcon.classList.add('status-disconnected');
        deviceName.textContent = `${deviceId} (Waiting...)`;
    }
}

// Update connected devices list
function updateConnectedDevices(devices) {
    if (devices.length === 0) {
        clearDeviceList();
        return;
    }
    
    const deviceListHtml = devices.map(deviceId => {
        const isCurrentDevice = deviceId === currentDeviceId;
        const badgeClass = isCurrentDevice ? 'status-online' : 'status-offline';
        const badgeText = isCurrentDevice ? 'Your Device' : 'Other Device';
        
        return `
            <div class="device-item">
                <div class="device-icon">
                    <i class="fas fa-microchip"></i>
                </div>
                <div class="device-info">
                    <h6>${deviceId}</h6>
                    <small>Connected via Socket.IO</small>
                </div>
                <div class="ml-auto">
                    <span class="status-badge ${badgeClass}">${badgeText}</span>
                </div>
            </div>
        `;
    }).join('');
    
    deviceList.innerHTML = deviceListHtml;
}

// Clear device list
function clearDeviceList() {
    deviceList.innerHTML = '<p class="text-muted">No devices connected</p>';
}

// Add PDF to the list
function addPdfToList(pdfInfo, qrCodes) {
    const pdfId = `pdf_${Date.now()}`;
    receivedPdfs.set(pdfId, { pdfInfo, qrCodes });
    
    // Hide "no PDFs" message and show PDF list
    pdfStatus.style.display = 'none';
    pdfList.style.display = 'block';
    
    const pdfItemHtml = `
        <div class="pdf-item" data-pdf-id="${pdfId}">
            <div class="pdf-info">
                <div class="pdf-title">
                    <i class="fas fa-file-pdf"></i> ${pdfInfo.filename}
                </div>
                <div class="pdf-details">
                    <small>
                        <i class="fas fa-qrcode"></i> ${pdfInfo.totalQRs} QR codes • 
                        <i class="fas fa-clock"></i> ${new Date(pdfInfo.uploadedAt || Date.now()).toLocaleString()}
                        • <i class="fas fa-microchip"></i> Received via ${qrCodes.length > 0 ? 'Socket.IO' : 'HTTP API'}
                    </small>
                </div>
            </div>
            <div class="pdf-actions">
                <button class="btn btn-pdf btn-preview" onclick="previewPdf('${pdfId}')">
                    <i class="fas fa-eye"></i> Preview
                </button>
                <button class="btn btn-pdf btn-download" onclick="downloadPdf('${pdfId}')">
                    <i class="fas fa-download"></i> Download
                </button>
            </div>
        </div>
    `;
    
    pdfList.insertAdjacentHTML('afterbegin', pdfItemHtml);
}

// Preview PDF in modal
function previewPdf(pdfId) {
    const pdfData = receivedPdfs.get(pdfId);
    if (!pdfData) {
        logActivity('PDF not found for preview', 'error');
        return;
    }
    
    const modalTitle = document.querySelector('#pdfPreviewModal .modal-title');
    const pdfViewer = document.getElementById('pdfViewer');
    
    modalTitle.textContent = `Preview: ${pdfData.pdfInfo.filename}`;
    
    // Create QR code grid preview
    if (pdfData.qrCodes && pdfData.qrCodes.length > 0) {
        const qrGrid = pdfData.qrCodes.map(qr => `
            <div class="col-md-4 mb-3">
                <div class="card">
                    <img src="data:image/png;base64,${qr.imageData || qr.data}" class="card-img-top" alt="${qr.label}">
                    <div class="card-body p-2">
                        <small class="card-text">${qr.label}</small>
                    </div>
                </div>
            </div>
        `).join('');
        
        pdfViewer.innerHTML = `
            <div class="container-fluid">
                <div class="row">
                    <div class="col-12 mb-3">
                        <h6><i class="fas fa-info-circle"></i> PDF Contents: ${pdfData.pdfInfo.totalQRs} QR Codes</h6>
                    </div>
                    ${qrGrid}
                </div>
            </div>
        `;
    } else {
        pdfViewer.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-file-pdf fa-3x text-muted mb-3"></i>
                <h5>PDF File: ${pdfData.pdfInfo.filename}</h5>
                <p class="text-muted">No QR code preview available</p>
            </div>
        `;
    }
    
    // Store current PDF ID for download
    document.getElementById('downloadPdfBtn').setAttribute('data-pdf-id', pdfId);
    
    $('#pdfPreviewModal').modal('show');
    logActivity(`Previewing PDF: ${pdfData.pdfInfo.filename}`, 'info');
}

// Download PDF
function downloadPdf(pdfId) {
    logActivity(`Downloading PDF: ${pdfId}`, 'info');
    
    // Use the existing download endpoint
    const downloadUrl = '/api/download-qr-pdf';
    
    // Create temporary link for download
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = receivedPdfs.get(pdfId)?.pdfInfo?.filename || 'smartbag.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    logActivity(`PDF download initiated`, 'success');
}

// Download current PDF from modal
function downloadCurrentPdf() {
    const pdfId = document.getElementById('downloadPdfBtn').getAttribute('data-pdf-id');
    if (pdfId) {
        downloadPdf(pdfId);
        $('#pdfPreviewModal').modal('hide');
    }
}

// Load existing PDFs
async function loadExistingPdfs() {
    try {
        const response = await fetch('/api/user-config');
        const config = await response.json();
        
        if (config.qrPdf) {
            logActivity(`Found existing PDF: ${config.qrPdf.filename}`, 'info');
            
            // Add to list
            const pdfId = `existing_${Date.now()}`;
            receivedPdfs.set(pdfId, {
                pdfInfo: {
                    filename: config.qrPdf.filename,
                    totalQRs: config.qrCodes.length,
                    uploadedAt: config.qrPdf.uploadedAt
                },
                qrCodes: config.qrCodes
            });
            
            addPdfToList({
                filename: config.qrPdf.filename,
                totalQRs: config.qrCodes.length,
                uploadedAt: config.qrPdf.uploadedAt
            }, config.qrCodes);
        }
    } catch (error) {
        logActivity('Failed to load existing PDFs', 'error');
    }
}

// Log activity with timestamp
function logActivity(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    
    logEntry.innerHTML = `
        <span class="timestamp">[${timestamp}]</span>
        <span class="message">${message}</span>
    `;
    
    activityLog.insertBefore(logEntry, activityLog.firstChild);
    
    // Limit log entries
    const entries = activityLog.querySelectorAll('.log-entry');
    if (entries.length > 50) {
        entries[entries.length - 1].remove();
    }
    
    console.log(`[${timestamp}] ${type.toUpperCase()}: ${message}`);
}

// Clear activity log
function clearActivityLog() {
    activityLog.innerHTML = '';
    logActivity('Activity log cleared', 'info');
}

// Handle logout
async function handleLogout() {
    try {
        const response = await fetch('/api/logout', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            logActivity('Logged out successfully', 'info');
            window.location.href = '/';
        } else {
            logActivity('Logout failed', 'error');
        }
    } catch (error) {
        logActivity('Logout error', 'error');
        console.error('Logout error:', error);
    }
}

// Global functions for PDF actions (called from HTML)
window.previewPdf = previewPdf;
window.downloadPdf = downloadPdf;

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
        
        // Show PDF download if available
        if (data.qrPdf) {
            showPdfDownloadSection({
                filename: data.qrPdf.filename,
                totalQRs: qrCodes.length
            });
        }
    });
    
    // QR PDF received from Pi
    socket.on('qrPdfReceived', function(data) {
        console.log('📄 QR PDF received:', data);
        
        // Store QR codes from PDF
        qrCodes = data.qrCodes || [];
        displayQRCodes();
        updateCompletionStatus();
        
        // Show PDF download section
        showPdfDownloadSection(data.pdfInfo);
        
        // Show notification
        showNotification(`PDF with ${data.qrCodes.length} QR codes received!`, 'success');
    });
    
    // New individual QR code received from Pi (fallback)
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

function showPdfDownloadSection(pdfInfo) {
    // Check if PDF section already exists
    let pdfSection = document.getElementById('pdfDownloadSection');
    
    if (!pdfSection) {
        // Create PDF download section
        pdfSection = document.createElement('div');
        pdfSection.id = 'pdfDownloadSection';
        pdfSection.className = 'card mb-4';
        pdfSection.innerHTML = `
            <div class="card-header">
                <h5 class="mb-0">
                    <i class="fas fa-file-pdf text-danger"></i>
                    QR Codes PDF
                </h5>
            </div>
            <div class="card-body">
                <p class="text-muted">Download the PDF containing all ${pdfInfo.totalQRs} QR codes generated by your Pi.</p>
                <button id="downloadPdfBtn" class="btn btn-danger">
                    <i class="fas fa-download"></i>
                    Download QR PDF (${pdfInfo.filename})
                </button>
            </div>
        `;
        
        // Insert after connection status
        const connectionCard = document.querySelector('.card');
        connectionCard.parentNode.insertBefore(pdfSection, connectionCard.nextSibling);
        
        // Add event listener
        document.getElementById('downloadPdfBtn').addEventListener('click', downloadPdf);
    } else {
        // Update existing section
        const pdfButton = pdfSection.querySelector('#downloadPdfBtn');
        pdfButton.innerHTML = `
            <i class="fas fa-download"></i>
            Download QR PDF (${pdfInfo.filename})
        `;
    }
}

function downloadPdf() {
    window.location.href = '/api/download-qr-pdf';
    showNotification('Starting PDF download...', 'info');
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