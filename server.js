const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { Client } = require('ssh2');
const multer = require('multer');
const fs = require('fs');

// Load environment variables
require('dotenv').config();

const app = express();

// Trust proxy for Render deployment
app.set('trust proxy', 1);

const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? ["https://location-tracker-app-waa4.onrender.com"] 
            : "*",
        methods: ["GET", "POST"]
    }
});

// Session configuration (only one instance needed)
app.use(session({
    secret: process.env.SESSION_SECRET || 'smartbag-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Use HTTPS in production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    },
    name: 'smartbag-session'
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
    console.log('Auth check - Session:', {
        sessionID: req.sessionID,
        authenticated: req.session?.authenticated,
        deviceId: req.session?.deviceId
    });
    
    if (req.session && req.session.authenticated) {
        console.log('✅ User authenticated, proceeding to tracker');
        return next();
    } else {
        console.log('❌ User not authenticated, redirecting to homepage');
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

app.get('/configure', (req, res) => {
    console.log('Serving configure page');
    res.sendFile(path.join(__dirname, 'public', 'configure.html'));
});

// Debug route (remove in production)
app.get('/debug/session', (req, res) => {
    res.json({
        sessionID: req.sessionID,
        authenticated: req.session?.authenticated,
        deviceId: req.session?.deviceId,
        cookie: req.session?.cookie
    });
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

// Configure multer for file uploads
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        // Check if file is an image
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// SSH connection testing endpoint
app.post('/api/ssh/test', (req, res) => {
    const { hostname, username, password } = req.body;
    
    if (!hostname || !username || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    
    const conn = new Client();
    
    conn.on('ready', () => {
        console.log(`SSH connection ready to ${hostname}`);
        conn.end();
        res.json({ success: true, message: 'SSH connection successful' });
    }).on('error', (err) => {
        console.error('SSH connection error:', err.message);
        res.status(500).json({ error: 'SSH connection failed: ' + err.message });
    }).connect({
        host: hostname,
        username: username,
        password: password,
        timeout: 10000
    });
});

// Photo upload endpoint
app.post('/api/ssh/upload-photo', upload.single('photo'), (req, res) => {
    const { hostname, username, password, itemName, day } = req.body;
    const file = req.file;
    
    if (!hostname || !username || !password || !itemName || !day || !file) {
        return res.status(400).json({ error: 'All fields and photo are required' });
    }
    
    const conn = new Client();
    
    conn.on('ready', () => {
        console.log(`SSH connection ready for photo upload to ${hostname}`);
        
        // Create the items directory if it doesn't exist
        conn.exec('mkdir -p ~/Desktop/items', (err, stream) => {
            if (err) {
                conn.end();
                return res.status(500).json({ error: 'Failed to create directory: ' + err.message });
            }
            
            stream.on('close', () => {
                // Upload the file
                const remotePath = `~/Desktop/items/${day}_${itemName}_${Date.now()}.jpg`;
                
                conn.sftp((err, sftp) => {
                    if (err) {
                        conn.end();
                        return res.status(500).json({ error: 'SFTP error: ' + err.message });
                    }
                    
                    const readStream = fs.createReadStream(file.path);
                    const writeStream = sftp.createWriteStream(remotePath);
                    
                    writeStream.on('close', () => {
                        console.log(`Photo uploaded successfully: ${remotePath}`);
                        // Clean up local file
                        fs.unlinkSync(file.path);
                        conn.end();
                        res.json({ 
                            success: true, 
                            message: 'Photo uploaded successfully',
                            remotePath: remotePath
                        });
                    }).on('error', (err) => {
                        fs.unlinkSync(file.path);
                        conn.end();
                        res.status(500).json({ error: 'Upload failed: ' + err.message });
                    });
                    
                    readStream.pipe(writeStream);
                });
            }).on('error', (err) => {
                conn.end();
                res.status(500).json({ error: 'Directory creation failed: ' + err.message });
            });
        });
    }).on('error', (err) => {
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        console.error('SSH connection error:', err.message);
        res.status(500).json({ error: 'SSH connection failed: ' + err.message });
    }).connect({
        host: hostname,
        username: username,
        password: password,
        timeout: 10000
    });
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

// API endpoint to get app configuration
app.get('/api/config', (req, res) => {
    res.json({
        mapProvider: 'leaflet',
        version: '1.0.0'
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

server.listen(PORT, () => {
    console.log(`Location Tracker Server running on port ${PORT}`);
    console.log(`Web interface: http://localhost:${PORT}`);
    console.log(`API endpoint: http://localhost:${PORT}/api/location`);
});