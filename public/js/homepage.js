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
                const redirectTo = loginForm.dataset.redirectTo || 'tracker';
                showSuccess(`Login successful! Redirecting to ${redirectTo}...`);
                setTimeout(() => {
                    // Redirect based on the flag
                    window.location.href = redirectTo;
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
        // Show login modal for configuration access
        $('#loginModal').modal('show');
        // Add a flag to indicate this is for configuration
        document.getElementById('loginForm').dataset.redirectTo = 'configure';
        // Update modal title
        document.getElementById('loginModalLabel').innerHTML = 
            '<i class="fas fa-cog"></i> Access SmartBag Configuration';
    });
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