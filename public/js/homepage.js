// User credentials (in a real app, this would be securely stored server-side)
const validCredentials = [
    { deviceId: 'raspi-001', passwordHash: 'smartbag123' },
    { deviceId: 'raspi-002', passwordHash: 'smartbag456' },
    { deviceId: 'smartbag-device-01', passwordHash: 'mysmartbag' },
    { deviceId: 'test-device', passwordHash: 'test123' }
];

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
    initializeHomepage();
});

function initializeHomepage() {
    // Initialize event listeners
    setupLoginForm();
    setupHeroConfigureButton();
    setupAnimations();
    
    console.log('SmartBag Homepage initialized');
}

// Setup login form functionality
function setupLoginForm() {
    const loginForm = document.getElementById('loginForm');
    const loginModal = $('#loginModal');
    
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const deviceId = document.getElementById('deviceId').value.trim();
        const password = document.getElementById('password').value;
        
        if (!deviceId || !password) {
            showError('Please enter both Device ID and Password');
            return;
        }
        
        // Authenticate with server
        showLoading(true);
        
        console.log(`Attempting login with Device ID: ${deviceId}, Password: ${password}`);
        
        // Send login request to server
        fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ deviceId, password })
        })
        .then(response => {
            console.log('Server response status:', response.status);
            return response.json();
        })
        .then(data => {
            console.log('Server response data:', data);
            if (data.success) {
                showSuccess('Login successful! Redirecting...');
                setTimeout(() => {
                    // Redirect to location tracker
                    window.location.href = 'tracker';
                }, 1500);
            } else {
                showError(data.message || 'Invalid Device ID or Password');
                showLoading(false);
            }
        })
        .catch(error => {
            console.error('Login error:', error);
            showError('Login failed. Please try again.');
            showLoading(false);
        });
    });
}

// Setup hero configure button
function setupHeroConfigureButton() {
    const heroConfigureBtn = document.getElementById('heroConfigureBtn');
    
    heroConfigureBtn.addEventListener('click', function() {
        // Show configuration options
        const configChoice = confirm(
            'SmartBag Configuration\n\n' +
            'Choose your preferred configuration method:\n\n' +
            '• Click OK for Web Interface (Wi-Fi hotspot)\n' +
            '• Click Cancel for Mobile App (Bluetooth)'
        );
        
        if (configChoice) {
            // Web interface configuration
            showWebConfigInstructions();
        } else {
            // Mobile app configuration  
            showMobileAppInstructions();
        }
        
        // Visual feedback
        this.innerHTML = '<i class="fas fa-check"></i> Instructions Shown!';
        this.classList.remove('btn-success');
        this.classList.add('btn-info');
        
        setTimeout(() => {
            this.innerHTML = '<i class="fas fa-cog"></i> Configure Bag Items';
            this.classList.remove('btn-info');
            this.classList.add('btn-success');
        }, 3000);
    });
}

// Show web interface configuration instructions
function showWebConfigInstructions() {
    alert(
        'SmartBag Web Configuration\n\n' +
        'Follow these steps:\n\n' +
        '1️⃣ Put your SmartBag in Configuration Mode\n' +
        '   • Press and hold the Config button for 3 seconds\n' +
        '   • Blue LED will start blinking\n\n' +
        '2️⃣ Connect to SmartBag Wi-Fi\n' +
        '   • Network: "SmartBag-Setup"\n' +
        '   • Password: "smartbag123"\n\n' +
        '3️⃣ Open Configuration Interface\n' +
        '   • Go to: http://192.168.4.1\n' +
        '   • Configure daily items and schedules\n\n' +
        '4️⃣ Save and Exit\n' +
        '   • Click "Save Configuration"\n' +
        '   • SmartBag will restart automatically'
    );
}

// Show mobile app configuration instructions
function showMobileAppInstructions() {
    alert(
        'SmartBag Mobile App Configuration\n\n' +
        'Coming Soon Features:\n\n' +
        '📱 Download the SmartBag App\n' +
        '   • Available on Google Play & App Store\n' +
        '   • Search: "SmartBag Organizer"\n\n' +
        '🔗 Bluetooth Connection\n' +
        '   • Automatic device discovery\n' +
        '   • Secure pairing process\n\n' +
        '⚙️ Easy Configuration\n' +
        '   • Drag-and-drop item setup\n' +
        '   • Weekly schedule management\n' +
        '   • Voice command setup\n\n' +
        'For now, please use the Web Interface method.'
    );
}

// Validate user credentials
function validateCredentials(deviceId, password) {
    // Simple hash simulation (in production, use proper hashing)
    const credential = validCredentials.find(cred => cred.deviceId === deviceId);
    
    if (!credential) {
        return false;
    }
    
    // In production, hash the input password and compare with stored hash
    return credential.passwordHash === password;
}

// Show loading state
function showLoading(show) {
    const submitBtn = document.querySelector('#loginForm button[type="submit"]');
    
    if (show) {
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Authenticating...';
        submitBtn.disabled = true;
        submitBtn.dataset.originalText = submitBtn.innerHTML;
    } else {
        submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Access Location Tracker';
        submitBtn.disabled = false;
    }
}

// Show success message
function showSuccess(message) {
    showMessage(message, 'success');
}

// Show error message
function showError(message) {
    showMessage(message, 'danger');
}

// Show info message
function showInfo(message) {
    showMessage(message, 'info');
}

// Generic message display
function showMessage(message, type) {
    // Remove existing alerts
    const existingAlerts = document.querySelectorAll('.alert');
    existingAlerts.forEach(alert => alert.remove());
    
    // Create new alert
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show mt-3`;
    alert.innerHTML = `
        ${message}
        <button type=\"button\" class=\"close\" data-dismiss=\"alert\" aria-label=\"Close\">
            <span aria-hidden=\"true\">&times;</span>
        </button>
    `;
    
    // Insert alert into modal
    const modalBody = document.querySelector('#loginModal .modal-body');
    modalBody.appendChild(alert);
    
    // Auto-dismiss after 5 seconds for non-error messages
    if (type !== 'danger') {
        setTimeout(() => {
            if (alert.parentNode) {
                alert.remove();
            }
        }, 5000);
    }
}

// Smooth scroll to features section
function scrollToFeatures() {
    const featuresSection = document.getElementById('features');
    featuresSection.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });
}

// Setup scroll animations
function setupAnimations() {
    // Intersection Observer for scroll animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animationPlayState = 'running';
            }
        });
    }, observerOptions);
    
    // Observe all animated cards
    const animatedCards = document.querySelectorAll('.animate-card');
    animatedCards.forEach(card => {
        card.style.animationPlayState = 'paused';
        observer.observe(card);
    });
}

// Handle modal events
$(document).ready(function() {
    $('#loginModal').on('hidden.bs.modal', function() {
        // Clear form when modal is closed
        document.getElementById('loginForm').reset();
        
        // Remove any alerts
        const alerts = document.querySelectorAll('.alert');
        alerts.forEach(alert => alert.remove());
        
        // Reset loading state
        showLoading(false);
    });
    
    // Handle form input focus effects
    $('.form-control').on('focus', function() {
        $(this).parent().addClass('focused');
    });
    
    $('.form-control').on('blur', function() {
        if (!$(this).val()) {
            $(this).parent().removeClass('focused');
        }
    });
});

// Add some interactive effects
document.addEventListener('mousemove', function(e) {
    const circles = document.querySelectorAll('.circle');
    const x = e.clientX / window.innerWidth;
    const y = e.clientY / window.innerHeight;
    
    circles.forEach((circle, index) => {
        const speed = (index + 1) * 0.02;
        const xMove = (x - 0.5) * speed * 100;
        const yMove = (y - 0.5) * speed * 100;
        
        circle.style.transform = `translate(${xMove}px, ${yMove}px)`;
    });
});

// Add some particle effects on button hover
document.querySelectorAll('.btn').forEach(button => {
    button.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-2px) scale(1.05)';
    });
    
    button.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0) scale(1)';
    });
});

// Console welcome message
console.log(`
🎒 SmartBag Intelligent Daily Organizer
📱 Welcome to the future of smart organization!
🔧 Features: AI Object Detection, GPS Tracking, Voice Feedback
🚀 Ready to revolutionize your daily routine!
`);