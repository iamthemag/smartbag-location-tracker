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
    
    // Load existing PDFs after a short delay to ensure connection is established
    setTimeout(() => {
        loadExistingPdfs();
    }, 2000);
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
        console.log('qrPdfReceived event received:', data);
        logActivity(`PDF received via Socket.IO: ${data.pdfInfo.filename} with ${data.pdfInfo.totalQRs} QR codes`, 'success');
        addPdfToList(data.pdfInfo, data.qrCodes);
    });
    
    // Handle PDF uploads (HTTP API broadcast)
    socket.on('pdfReceived', (data) => {
        console.log('pdfReceived event received:', data);
        logActivity(`PDF received via HTTP API: ${data.filename}`, 'success');
        addPdfToList({
            filename: data.filename,
            totalQRs: data.qrCodes ? data.qrCodes.length : 0,
            uploadedAt: data.uploadedAt
        }, data.qrCodes || []);
    });
    
    // Debug: Listen for all events
    socket.onAny((eventName, ...args) => {
        console.log(`Socket event received: ${eventName}`, args);
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
        loadExistingPdfs();
    });
    
    // Handle authentication required
    socket.on('authRequired', () => {
        logActivity('Authentication required - redirecting to login', 'warning');
        window.location.href = '/';
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
    console.log('📁 addPdfToList called with:', pdfInfo, 'QR codes:', qrCodes ? qrCodes.length : 0);
    
    const pdfId = `pdf_${Date.now()}`;
    receivedPdfs.set(pdfId, { pdfInfo, qrCodes });
    
    console.log('📺 Showing PDF list, hiding status message');
    // Hide "no PDFs" message and show PDF list
    if (pdfStatus) pdfStatus.style.display = 'none';
    if (pdfList) pdfList.style.display = 'block';
    
    // Format file size
    const formatFileSize = (bytes) => {
        if (!bytes) return '';
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
    };
    
    // Create status badge
    const statusBadge = pdfInfo.isHistory ? 
        '<span class="badge badge-secondary ml-2">History</span>' : 
        '<span class="badge badge-primary ml-2">Current</span>';
    
    // Create file size display
    const fileSizeDisplay = pdfInfo.fileSize ? 
        `• <i class="fas fa-file"></i> ${formatFileSize(pdfInfo.fileSize)}` : '';
    
    const pdfItemHtml = `
        <div class="pdf-item" data-pdf-id="${pdfId}">
            <div class="pdf-info">
                <div class="pdf-title">
                    <i class="fas fa-file-pdf"></i> ${pdfInfo.filename}${statusBadge}
                </div>
                <div class="pdf-details">
                    <small>
                        <i class="fas fa-qrcode"></i> ${pdfInfo.totalQRs} QR codes • 
                        <i class="fas fa-clock"></i> ${new Date(pdfInfo.uploadedAt || Date.now()).toLocaleString()}
                        ${fileSizeDisplay}
                        • <i class="fas fa-tag"></i> ${pdfInfo.isHistory ? 'Historical' : 'Current'}
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
    
    console.log('📦 Inserting PDF HTML:', pdfItemHtml.substring(0, 100) + '...');
    if (pdfList) {
        pdfList.insertAdjacentHTML('afterbegin', pdfItemHtml);
        console.log('✅ PDF HTML inserted successfully');
    } else {
        console.error('❌ pdfList element not found!');
    }
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
    const pdfData = receivedPdfs.get(pdfId);
    if (!pdfData) {
        logActivity('PDF not found for download', 'error');
        return;
    }
    
    logActivity(`Downloading PDF: ${pdfData.pdfInfo.filename}`, 'info');
    
    // Determine download URL based on whether it's historical or current
    let downloadUrl;
    if (pdfData.pdfInfo.isHistory && pdfData.pdfInfo.historyId) {
        downloadUrl = `/api/download-pdf-history/${pdfData.pdfInfo.historyId}`;
    } else {
        downloadUrl = '/api/download-qr-pdf';
    }
    
    // Create temporary link for download
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = pdfData.pdfInfo.filename || 'smartbag.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    logActivity(`PDF download initiated: ${pdfData.pdfInfo.filename}`, 'success');
}

// Download current PDF from modal
function downloadCurrentPdf() {
    const pdfId = document.getElementById('downloadPdfBtn').getAttribute('data-pdf-id');
    if (pdfId) {
        downloadPdf(pdfId);
        $('#pdfPreviewModal').modal('hide');
    }
}

// Load existing PDFs and history
async function loadExistingPdfs() {
    console.log('Loading existing PDFs...');
    try {
        // Load current configuration
        const configResponse = await fetch('/api/user-config');
        console.log('Config response status:', configResponse.status);
        const config = await configResponse.json();
        console.log('Config data:', config);
        
        if (config.qrPdf) {
            console.log('📄 Found PDF in config:', config.qrPdf);
            console.log('📊 QR Codes available:', config.qrCodes ? config.qrCodes.length : 0);
            logActivity(`Found current PDF: ${config.qrPdf.filename}`, 'info');
            
            // Add current PDF to list
            const pdfId = `current_${Date.now()}`;
            const pdfInfo = {
                filename: config.qrPdf.filename,
                totalQRs: config.qrCodes ? config.qrCodes.length : 0,
                uploadedAt: config.qrPdf.uploadedAt,
                isHistory: false
            };
            
            console.log('📋 Calling addPdfToList with:', pdfInfo);
            
            receivedPdfs.set(pdfId, {
                pdfInfo: pdfInfo,
                qrCodes: config.qrCodes || []
            });
            
            addPdfToList(pdfInfo, config.qrCodes || []);
            
            console.log('✅ Added current PDF to list:', config.qrPdf.filename);
        } else {
            console.log('❌ No qrPdf found in config');
            logActivity('No current PDF found', 'info');
        }
        
        // Load PDF history
        console.log('Loading PDF history...');
        const historyResponse = await fetch('/api/pdf-history');
        console.log('History response status:', historyResponse.status);
        if (historyResponse.ok) {
            const historyData = await historyResponse.json();
            console.log('History data:', historyData);
            
            if (historyData.history && historyData.history.length > 0) {
                logActivity(`Found ${historyData.history.length} PDFs in history`, 'info');
                
                // Add historical PDFs (skip the first one if it matches current)
                historyData.history.forEach((historyItem, index) => {
                    // Skip if this is the current PDF (avoid duplicates)
                    if (config.qrPdf && historyItem.filename === config.qrPdf.filename && index === 0) {
                        return;
                    }
                    
                    const pdfId = `history_${historyItem.id}`;
                    receivedPdfs.set(pdfId, {
                        pdfInfo: {
                            filename: historyItem.filename,
                            totalQRs: historyItem.qrCount,
                            uploadedAt: historyItem.uploadedAt,
                            isHistory: true,
                            historyId: historyItem.id,
                            fileSize: historyItem.fileSize
                        },
                        qrCodes: []
                    });
                    
                    addPdfToList({
                        filename: historyItem.filename,
                        totalQRs: historyItem.qrCount,
                        uploadedAt: historyItem.uploadedAt,
                        isHistory: true,
                        historyId: historyItem.id,
                        fileSize: historyItem.fileSize
                    }, []);
                });
            } else {
                console.log('No PDF history found');
                logActivity('No PDF history found', 'info');
            }
        } else {
            console.log('Failed to fetch PDF history');
            logActivity('Failed to load PDF history', 'error');
        }
        
    } catch (error) {
        console.error('Failed to load PDFs:', error);
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
