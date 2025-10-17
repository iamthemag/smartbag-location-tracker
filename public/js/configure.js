// Global variables
let sshCredentials = null;
let uploadHistory = [];

// DOM elements
const connectionForm = document.getElementById('connectionForm');
const uploadForm = document.getElementById('uploadForm');
const connectionCard = document.getElementById('connectionCard');
const uploadCard = document.getElementById('uploadCard');
const historyCard = document.getElementById('historyCard');
const photoFileInput = document.getElementById('photoFile');
const photoPreview = document.getElementById('photoPreview');
const previewImage = document.getElementById('previewImage');
const previewText = document.getElementById('previewText');

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    initializePage();
});

function initializePage() {
    setupEventListeners();
    loadUploadHistory();
    console.log('Configure page initialized');
}

function setupEventListeners() {
    // Connection form
    connectionForm.addEventListener('submit', handleConnectionTest);
    
    // Upload form
    uploadForm.addEventListener('submit', handlePhotoUpload);
    
    // File input change
    photoFileInput.addEventListener('change', handleFileSelect);
    
    // Custom file input label update
    photoFileInput.addEventListener('change', function() {
        const fileName = this.files[0]?.name || 'Choose photo...';
        document.querySelector('.custom-file-label').textContent = fileName;
    });
}

// Handle SSH connection testing
async function handleConnectionTest(e) {
    e.preventDefault();
    
    const hostname = document.getElementById('hostname').value.trim();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    
    if (!hostname || !username || !password) {
        showStatus('connectionStatus', 'Please fill in all fields', 'danger');
        return;
    }
    
    // Show loading state
    const testBtn = document.getElementById('testConnectionBtn');
    const originalBtnText = testBtn.innerHTML;
    testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing Connection...';
    testBtn.disabled = true;
    
    try {
        showStatus('connectionStatus', 'Testing SSH connection...', 'info');
        
        const response = await fetch('/api/ssh/test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                hostname,
                username,
                password
            })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            // Connection successful
            sshCredentials = { hostname, username, password };
            showStatus('connectionStatus', 
                `<i class="fas fa-check-circle status-connected"></i> Connected to ${hostname} successfully!`, 
                'success'
            );
            
            // Show upload form
            uploadCard.style.display = 'block';
            historyCard.style.display = 'block';
            
            // Scroll to upload form
            setTimeout(() => {
                uploadCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 500);
            
        } else {
            // Show detailed error with suggestions
            let errorHtml = `<i class="fas fa-times-circle status-disconnected"></i> ${result.error}`;
            
            if (result.suggestions && result.suggestions.length > 0) {
                errorHtml += '<br><br><strong>Suggestions:</strong><ul>';
                result.suggestions.forEach(suggestion => {
                    errorHtml += `<li>${suggestion}</li>`;
                });
                errorHtml += '</ul>';
            }
            
            if (result.errorCode === 'ENOTFOUND') {
                errorHtml += '<br><br><div class="alert alert-info mt-2"><strong>💡 Quick Fix:</strong> Since you can connect via PuTTY, try using your Pi\'s IP address instead of the hostname. You can find it by running <code>hostname -I</code> on your Pi or check your router\'s admin panel.</div>';
            }
            
            showStatus('connectionStatus', errorHtml, 'danger');
        }
        
    } catch (error) {
        console.error('Connection test error:', error);
        showStatus('connectionStatus', 
            `<i class="fas fa-exclamation-triangle status-disconnected"></i> Connection error: ${error.message}`, 
            'danger'
        );
    } finally {
        // Reset button
        testBtn.innerHTML = originalBtnText;
        testBtn.disabled = false;
    }
}

// Handle file selection and preview
function handleFileSelect(e) {
    const file = e.target.files[0];
    
    if (!file) {
        photoPreview.style.display = 'none';
        return;
    }
    
    // Check file size (5MB limit)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
        showStatus('uploadStatus', 
            `<i class="fas fa-exclamation-triangle"></i> File too large! Maximum size is 5MB. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB.`, 
            'danger'
        );
        e.target.value = ''; // Clear file input
        photoPreview.style.display = 'none';
        return;
    }
    
    // Show preview
    const reader = new FileReader();
    reader.onload = function(e) {
        previewImage.src = e.target.result;
        previewText.innerHTML = `
            <strong>File:</strong> ${file.name}<br>
            <strong>Size:</strong> ${(file.size / 1024 / 1024).toFixed(2)} MB<br>
            <strong>Type:</strong> ${file.type}
        `;
        photoPreview.style.display = 'block';
    };
    reader.readAsDataURL(file);
    
    // Clear any previous upload status
    document.getElementById('uploadStatus').innerHTML = '';
}

// Handle photo upload
async function handlePhotoUpload(e) {
    e.preventDefault();
    
    if (!sshCredentials) {
        showStatus('uploadStatus', 'Please connect to Raspberry Pi first', 'danger');
        return;
    }
    
    const itemName = document.getElementById('itemName').value.trim();
    const day = document.getElementById('day').value;
    const photoFile = photoFileInput.files[0];
    
    if (!itemName || !day || !photoFile) {
        showStatus('uploadStatus', 'Please fill in all fields and select a photo', 'danger');
        return;
    }
    
    // Show loading state
    const uploadBtn = document.getElementById('uploadBtn');
    const originalBtnText = uploadBtn.innerHTML;
    uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    uploadBtn.disabled = true;
    
    // Create FormData
    const formData = new FormData();
    formData.append('photo', photoFile);
    formData.append('hostname', sshCredentials.hostname);
    formData.append('username', sshCredentials.username);
    formData.append('password', sshCredentials.password);
    formData.append('itemName', itemName);
    formData.append('day', day);
    
    try {
        showStatus('uploadStatus', 'Uploading photo to Raspberry Pi...', 'info');
        
        const response = await fetch('/api/ssh/upload-photo', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showStatus('uploadStatus', 
                `<i class="fas fa-check-circle"></i> Photo uploaded successfully!<br><small>Saved as: ${result.remotePath}</small>`, 
                'success'
            );
            
            // Add to upload history
            const historyItem = {
                itemName,
                day,
                fileName: photoFile.name,
                remotePath: result.remotePath,
                timestamp: new Date().toLocaleString(),
                size: (photoFile.size / 1024 / 1024).toFixed(2) + ' MB'
            };
            
            uploadHistory.unshift(historyItem);
            saveUploadHistory();
            updateUploadHistoryDisplay();
            
            // Reset form
            uploadForm.reset();
            document.querySelector('.custom-file-label').textContent = 'Choose photo...';
            photoPreview.style.display = 'none';
            
        } else {
            showStatus('uploadStatus', 
                `<i class="fas fa-times-circle"></i> Upload failed: ${result.error}`, 
                'danger'
            );
        }
        
    } catch (error) {
        console.error('Upload error:', error);
        showStatus('uploadStatus', 
            `<i class="fas fa-exclamation-triangle"></i> Upload error: ${error.message}`, 
            'danger'
        );
    } finally {
        // Reset button
        uploadBtn.innerHTML = originalBtnText;
        uploadBtn.disabled = false;
    }
}

// Show status messages
function showStatus(elementId, message, type) {
    const statusElement = document.getElementById(elementId);
    const alertClass = `alert alert-${type}`;
    
    statusElement.innerHTML = `
        <div class="${alertClass}">
            ${message}
        </div>
    `;
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            statusElement.innerHTML = '';
        }, 5000);
    }
}

// Upload history management
function loadUploadHistory() {
    const saved = localStorage.getItem('smartbag_upload_history');
    if (saved) {
        try {
            uploadHistory = JSON.parse(saved);
            updateUploadHistoryDisplay();
        } catch (e) {
            console.error('Error loading upload history:', e);
            uploadHistory = [];
        }
    }
}

function saveUploadHistory() {
    try {
        // Keep only last 20 items
        const historyToSave = uploadHistory.slice(0, 20);
        localStorage.setItem('smartbag_upload_history', JSON.stringify(historyToSave));
    } catch (e) {
        console.error('Error saving upload history:', e);
    }
}

function updateUploadHistoryDisplay() {
    const historyContainer = document.getElementById('uploadHistory');
    
    if (uploadHistory.length === 0) {
        historyContainer.innerHTML = '<p class="text-muted text-center">No uploads yet</p>';
        return;
    }
    
    const historyHTML = uploadHistory.map(item => `
        <div class="history-item">
            <h6><i class="fas fa-image"></i> ${item.itemName}</h6>
            <p class="mb-1">
                <strong>Day:</strong> ${item.day} | 
                <strong>Size:</strong> ${item.size}
            </p>
            <small class="text-muted">
                <i class="fas fa-clock"></i> ${item.timestamp}<br>
                <i class="fas fa-folder"></i> ${item.remotePath}
            </small>
        </div>
    `).join('');
    
    historyContainer.innerHTML = historyHTML;
}

// Utility functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Handle page visibility for connection management
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        console.log('Configure page hidden');
    } else {
        console.log('Configure page visible');
    }
});

// Error handling for fetch requests
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    showStatus('connectionStatus', 
        `<i class="fas fa-exclamation-triangle"></i> An unexpected error occurred: ${event.reason?.message || 'Unknown error'}`, 
        'danger'
    );
});

// Console welcome message
console.log(`
🛠️ SmartBag Configuration Interface
📡 SSH Connection & Photo Upload System
🔧 Ready to configure your SmartBag items!
`);