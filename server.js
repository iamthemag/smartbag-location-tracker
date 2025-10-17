const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');

// Load environment variables
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? ["https://location-tracker-app.onrender.com"] 
            : "*",
        methods: ["GET", "POST"]
    }
});

// Session configuration
app.use(session({
    secret: 'smartbag-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Use HTTPS in production
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Session configuration
app.use(session({
    secret: 'smartbag-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Use HTTPS in production
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Authorized device IDs from environment variables
const AUTHORIZED_DEVICES = process.env.AUTHORIZED_DEVICES 
    ? process.env.AUTHORIZED_DEVICES.split(',').map(id => id.trim())
    : ['raspi-001', 'raspi-002', 'raspi-tracker-main', 'smartbag-device-01']; // fallback defaults

// Authentication credentials
const VALID_USERS = [
    { deviceId: 'raspi-001', passwordHash: '$2b$10$aQ9gNdm1U5IcZ6RHFflmkuLG008p1wO96vkT2LG81.uM5Mb3yzVvW' }, // Bag@123
    { deviceId: 'raspi-002', passwordHash: '$2b$10$aQ9gNdm1U5IcZ6RHFflmkuLG008p1wO96vkT2LG81.uM5Mb3yzVvW' }, // Bag@123
    { deviceId: 'smartbag-device-01', passwordHash: '$2b$10$aQ9gNdm1U5IcZ6RHFflmkuLG008p1wO96vkT2LG81.uM5Mb3yzVvW' }, // Bag@123
    { deviceId: 'test-device', passwordHash: '$2b$10$aQ9gNdm1U5IcZ6RHFflmkuLG008p1wO96vkT2LG81.uM5Mb3yzVvW' } // Bag@123
];

// Store current location data
let currentLocation = {
    latitude: null,
    longitude: null,
    timestamp: null,
    accuracy: null,
    deviceId: null
};

// Store location history
let locationHistory = [];
const MAX_HISTORY = process.env.MAX_HISTORY || 100; // Keep last N locations

// Store connected Raspberry Pi devices
let connectedDevices = new Map(); // deviceId -> socket

// Authentication middleware
function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) {
        return next();
    } else {
        return res.redirect('/');
    }
}

// Routes (BEFORE static middleware to override default index.html)
app.get('/', (req, res) => {
    console.log('Serving homepage.html for root route');
    res.sendFile(path.join(__dirname, 'public', 'homepage.html'));
});

app.get('/tracker', requireAuth, (req, res) => {
    console.log('Serving tracker page to authenticated user');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    const { deviceId, password } = req.body;
    
    console.log(`Login attempt - Device ID: ${deviceId}, Password: ${password}`);
    
    try {
        // Find user in valid users list
        const user = VALID_USERS.find(u => u.deviceId === deviceId);
        
        if (!user) {
            console.log(`❌ Invalid device ID: ${deviceId}`);
            return res.status(401).json({ success: false, message: 'Invalid device ID or password' });
        }
        
        console.log(`🔍 Found user for device: ${deviceId}`);
        console.log(`🔍 Stored hash: ${user.passwordHash}`);
        
        // Compare password with hash
        const isValidPassword = await bcrypt.compare(password, user.passwordHash);
        console.log(`🔍 Password comparison result: ${isValidPassword}`);
        
        if (!isValidPassword) {
            console.log(`❌ Invalid password for device: ${deviceId}`);
            return res.status(401).json({ success: false, message: 'Invalid device ID or password' });
        }
        
        // Set session
        req.session.authenticated = true;
        req.session.deviceId = deviceId;
        
        console.log(`✅ User authenticated successfully: ${deviceId}`);
        res.json({ success: true, message: 'Authentication successful' });
        
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
    if (req.session) {
        const deviceId = req.session.deviceId;
        req.session.destroy(err => {
            if (err) {
                console.error('Logout error:', err);
                return res.status(500).json({ success: false, message: 'Could not log out' });
            }
            console.log(`🚪 User logged out: ${deviceId}`);
            res.json({ success: true, message: 'Logged out successfully' });
        });
    } else {
        res.json({ success: true, message: 'Already logged out' });
    }
});

// Check authentication status
app.get('/api/auth-status', (req, res) => {
    if (req.session && req.session.authenticated) {
        res.json({ authenticated: true, deviceId: req.session.deviceId });
    } else {
        res.json({ authenticated: false });
    }
});

// Static file middleware AFTER specific routes
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint for initial device registration (optional fallback)
app.post('/api/location', (req, res) => {
    const { latitude, longitude, accuracy, deviceId } = req.body;
    
    if (!latitude || !longitude) {
        return res.status(400).json({ error: 'Latitude and longitude are required' });
    }
    
    if (!deviceId) {
        return res.status(400).json({ error: 'Device ID is required' });
    }
    
    // Check if device is authorized
    if (!AUTHORIZED_DEVICES.includes(deviceId)) {
        console.log(`Unauthorized device attempted to connect: ${deviceId}`);
        return res.status(403).json({ error: 'Unauthorized device' });
    }

    // Update current location
    const locationData = {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        accuracy: accuracy ? parseFloat(accuracy) : null,
        timestamp: new Date().toISOString(),
        deviceId: deviceId
    };
    
    updateLocationData(locationData);

    res.json({ 
        success: true, 
        message: 'Location received via HTTP. Please use Socket.IO for real-time updates.',
        location: locationData,
        socketUrl: process.env.NODE_ENV === 'production' 
            ? `wss://${process.env.RENDER_EXTERNAL_HOSTNAME}` 
            : `ws://localhost:${PORT}`
    });
});

// API endpoint to get current location
app.get('/api/location', (req, res) => {
    res.json({
        current: currentLocation,
        history: locationHistory
    });
});

// Helper function to update location data
function updateLocationData(locationData) {
    currentLocation = locationData;
    
    // Add to history
    locationHistory.push({ ...currentLocation });
    
    // Keep only recent locations
    if (locationHistory.length > MAX_HISTORY) {
        locationHistory.shift();
    }

    console.log(`Location updated from ${locationData.deviceId}: ${locationData.latitude}, ${locationData.longitude} at ${locationData.timestamp}`);

    // Broadcast to all connected web clients
    io.emit('locationUpdate', currentLocation);
}

// API endpoint to get Google Maps API key
app.get('/api/config', (req, res) => {
    res.json({
        googleMapsApiKey: GOOGLE_MAPS_API_KEY
    });
});

// API endpoint to get authorized devices (for debugging)
app.get('/api/devices', (req, res) => {
    res.json({
        authorizedDevices: AUTHORIZED_DEVICES,
        connectedDevices: Array.from(connectedDevices.keys()),
        totalConnected: connectedDevices.size
    });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('New connection attempt:', socket.id);
    
    // Handle device authentication for Raspberry Pi devices
    socket.on('authenticate', (data) => {
        const { deviceId, type } = data;
        
        if (type === 'device') {
            // This is a Raspberry Pi device trying to authenticate
            if (!deviceId || !AUTHORIZED_DEVICES.includes(deviceId)) {
                console.log(`Authentication failed for device: ${deviceId}`);
                socket.emit('authError', { error: 'Unauthorized device ID' });
                socket.disconnect();
                return;
            }
            
            // Check if device is already connected
            if (connectedDevices.has(deviceId)) {
                console.log(`Device ${deviceId} already connected. Replacing connection.`);
                const oldSocket = connectedDevices.get(deviceId);
                oldSocket.disconnect();
            }
            
            // Store the authenticated device
            connectedDevices.set(deviceId, socket);
            socket.deviceId = deviceId;
            socket.deviceType = 'device';
            
            console.log(`✅ Device authenticated: ${deviceId}`);
            socket.emit('authSuccess', { message: 'Device authenticated successfully' });
            
            // Broadcast device status update to all web clients
            console.log(`Broadcasting device connect - connected devices: ${Array.from(connectedDevices.keys()).join(', ')}`);
            io.emit('deviceStatus', {
                connectedDevices: Array.from(connectedDevices.keys()),
                totalDevices: connectedDevices.size
            });
            
            // Handle location updates from this device
            socket.on('locationUpdate', (locationData) => {
                if (socket.deviceId && AUTHORIZED_DEVICES.includes(socket.deviceId)) {
                    const completeLocationData = {
                        latitude: parseFloat(locationData.latitude),
                        longitude: parseFloat(locationData.longitude),
                        accuracy: locationData.accuracy ? parseFloat(locationData.accuracy) : null,
                        timestamp: new Date().toISOString(),
                        deviceId: socket.deviceId
                    };
                    
                    updateLocationData(completeLocationData);
                    socket.emit('locationAck', { success: true });
                } else {
                    socket.emit('locationError', { error: 'Unauthorized location update' });
                }
            });
            
        } else {
            // This is a web client
            socket.deviceType = 'client';
            console.log('Web client connected:', socket.id);
            
            // Send current location to newly connected web client
            if (currentLocation.latitude && currentLocation.longitude) {
                socket.emit('locationUpdate', currentLocation);
            }
            
            // Send location history
            socket.emit('locationHistory', locationHistory);
            
            // Send device status
            socket.emit('deviceStatus', {
                connectedDevices: Array.from(connectedDevices.keys()),
                totalDevices: connectedDevices.size
            });
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        if (socket.deviceType === 'device' && socket.deviceId) {
            console.log(`📱 Device disconnected: ${socket.deviceId}`);
            connectedDevices.delete(socket.deviceId);
            
            // Broadcast device status update to all web clients
            console.log(`Broadcasting device disconnect - remaining devices: ${Array.from(connectedDevices.keys()).join(', ')}`);
            io.emit('deviceStatus', {
                connectedDevices: Array.from(connectedDevices.keys()),
                totalDevices: connectedDevices.size
            });
        } else {
            console.log('Web client disconnected:', socket.id);
        }
    });
    
    // If no authentication received within 10 seconds, disconnect
    setTimeout(() => {
        if (!socket.deviceType) {
            console.log('No authentication received, disconnecting:', socket.id);
            socket.disconnect();
        }
    }, 10000);
});

const PORT = process.env.PORT || 3000;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

server.listen(PORT, () => {
    console.log(`Location Tracker Server running on port ${PORT}`);
    console.log(`Web interface: http://localhost:${PORT}`);
    console.log(`API endpoint: http://localhost:${PORT}/api/location`);
});