const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const sharp = require('sharp');
const archiver = require('archiver');
const path_module = require('path');

// Load environment variables
require('dotenv').config();

const app = express();

// Trust proxy for Render deployment
app.set('trust proxy', 1);

const server = http.createServer(app);

// Session configuration
const sessionMiddleware = session({
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
});
const io = socketIO(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? ["https://location-tracker-app-waa4.onrender.com"] 
            : "*",
        methods: ["GET", "POST"]
    }
});

// Share session with Socket.IO
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

// Make session accessible in handshake
io.use((socket, next) => {
    socket.handshake.session = socket.request.session;
    next();
});

// Use the shared session middleware
app.use(sessionMiddleware);

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

// Store user configurations
let userConfigurations = new Map(); // deviceId -> { qrCodes: [], itemImages: [], completed: false }

// Store PDF history for each device
let pdfHistory = new Map(); // deviceId -> [{ filename, uploadedAt, filePath, qrCount, fileSize }]

// Ensure directories exist
const ensureDirectories = () => {
    const dirs = ['uploads', 'qr-codes', 'item-images', 'zip-exports'];
    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`Created directory: ${dir}`);
        }
    });
};
ensureDirectories();

// Helper functions
function extractLabelFromFilename(filename) {
    // Extract label from filename like "Monday_Keys.png" -> "Monday - Keys"
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
    const parts = nameWithoutExt.split('_');
    if (parts.length >= 2) {
        return `${parts[0]} - ${parts.slice(1).join(' ')}`;
    }
    return nameWithoutExt;
}

function broadcastToWebClients(deviceId, event, data) {
    // Broadcast to web clients that are authenticated for this device
    io.sockets.sockets.forEach((socket) => {
        if (socket.deviceType === 'client' && socket.authenticatedDeviceId === deviceId) {
            socket.emit(event, data);
        }
    });
}

// Helper function to manage PDF history
function addToPdfHistory(deviceId, filename, filePath, qrCount, fileSize) {
    if (!pdfHistory.has(deviceId)) {
        pdfHistory.set(deviceId, []);
    }
    
    const history = pdfHistory.get(deviceId);
    const historyEntry = {
        filename: filename,
        uploadedAt: new Date().toISOString(),
        filePath: filePath,
        qrCount: qrCount,
        fileSize: fileSize,
        id: `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    
    // Add to beginning of array (most recent first)
    history.unshift(historyEntry);
    
    // Keep last 50 PDF uploads per device
    if (history.length > 50) {
        // Remove old files from filesystem
        const oldEntry = history.pop();
        try {
            if (fs.existsSync(oldEntry.filePath)) {
                fs.unlinkSync(oldEntry.filePath);
                console.log(`🗑️ Removed old PDF: ${oldEntry.filename}`);
            }
        } catch (error) {
            console.error(`Error removing old PDF file: ${error.message}`);
        }
    }
    
    console.log(`📚 Added to PDF history for ${deviceId}: ${filename} (${history.length} total)`);
    return historyEntry;
}

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

app.get('/configure', requireAuth, (req, res) => {
    console.log('Serving configure page to authenticated user:', req.session.deviceId);
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

// Debug route for server state
app.get('/debug/server-state', (req, res) => {
    const deviceId = req.session?.deviceId || 'unknown';
    res.json({
        userConfigurations: Array.from(userConfigurations.entries()),
        pdfHistory: Array.from(pdfHistory.entries()),
        connectedDevices: Array.from(connectedDevices.keys()),
        sessionDeviceId: deviceId,
        authenticated: req.session?.authenticated || false
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


// Photo upload endpoint for web clients
app.post('/api/upload-photo/:qrFilename', upload.single('photo'), async (req, res) => {
    try {
        if (!req.session || !req.session.authenticated) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        const deviceId = req.session.deviceId;
        const qrFilename = req.params.qrFilename;
        const file = req.file;
        
        if (!file) {
            return res.status(400).json({ error: 'No photo uploaded' });
        }
        
        console.log(`📷 Photo upload for ${deviceId}, QR: ${qrFilename}`);
        
        // Get user configuration
        const userConfig = userConfigurations.get(deviceId);
        if (!userConfig) {
            return res.status(404).json({ error: 'No QR codes found for this device' });
        }
        
        // Find the matching QR code
        const qrCode = userConfig.qrCodes.find(qr => qr.filename === qrFilename);
        if (!qrCode) {
            return res.status(404).json({ error: 'QR code not found' });
        }
        
        // Generate filename based on QR code name (same name, different extension)
        const photoFilename = qrFilename.replace(/\.[^/.]+$/, '.jpg');
        
        // Compress image using Sharp
        const compressedBuffer = await sharp(file.path)
            .jpeg({ quality: 85 })
            .resize({ width: 1920, height: 1080, fit: 'inside', withoutEnlargement: true })
            .toBuffer();
        
        // Ensure compressed size is under 5MB
        const maxSize = 5 * 1024 * 1024; // 5MB
        let finalBuffer = compressedBuffer;
        let quality = 85;
        
        while (finalBuffer.length > maxSize && quality > 20) {
            quality -= 10;
            finalBuffer = await sharp(file.path)
                .jpeg({ quality })
                .resize({ width: 1920, height: 1080, fit: 'inside', withoutEnlargement: true })
                .toBuffer();
        }
        
        // Save compressed photo
        const photoPath = path_module.join('item-images', deviceId);
        if (!fs.existsSync(photoPath)) {
            fs.mkdirSync(photoPath, { recursive: true });
        }
        
        const photoFilePath = path_module.join(photoPath, photoFilename);
        fs.writeFileSync(photoFilePath, finalBuffer);
        
        // Update user configuration
        const photoData = {
            filename: photoFilename,
            qrFilename: qrFilename,
            filePath: photoFilePath,
            compressedData: finalBuffer.toString('base64'),
            uploadedAt: new Date().toISOString(),
            size: finalBuffer.length,
            compressed: true
        };
        
        userConfig.itemImages.push(photoData);
        qrCode.hasPhoto = true;
        
        // Clean up original uploaded file
        fs.unlinkSync(file.path);
        
        // Send photo to Pi immediately
        const deviceSocket = connectedDevices.get(deviceId);
        if (deviceSocket) {
            deviceSocket.emit('photoData', {
                filename: photoFilename,
                data: photoData.compressedData,
                originalQR: qrFilename
            });
        }
        
        // Broadcast update to web clients
        broadcastToWebClients(deviceId, 'photoUploaded', {
            qrFilename: qrFilename,
            photoFilename: photoFilename,
            size: finalBuffer.length
        });
        
        res.json({
            success: true,
            message: 'Photo uploaded and compressed successfully',
            filename: photoFilename,
            size: finalBuffer.length,
            sentToPi: !!deviceSocket
        });
        
    } catch (error) {
        console.error('Photo upload error:', error);
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: 'Photo upload failed: ' + error.message });
    }
});

// Get user configuration endpoint
app.get('/api/user-config', (req, res) => {
    if (!req.session || !req.session.authenticated) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    const deviceId = req.session.deviceId;
    const userConfig = userConfigurations.get(deviceId);
    
    if (!userConfig) {
        return res.json({ qrCodes: [], itemImages: [], completed: false });
    }
    
    // Don't send full base64 data, just metadata
    const sanitizedConfig = {
        qrCodes: userConfig.qrCodes.map(qr => ({
            filename: qr.filename,
            label: qr.label,
            uploadedAt: qr.uploadedAt,
            hasPhoto: qr.hasPhoto
        })),
        itemImages: userConfig.itemImages.map(img => ({
            filename: img.filename,
            qrFilename: img.qrFilename,
            uploadedAt: img.uploadedAt,
            size: img.size
        })),
        completed: userConfig.completed,
        qrPdf: userConfig.qrPdf ? {
            filename: userConfig.qrPdf.filename,
            uploadedAt: userConfig.qrPdf.uploadedAt
        } : null
    };
    
    res.json(sanitizedConfig);
});

// Download ZIP endpoint
app.get('/api/download-zip', (req, res) => {
    if (!req.session || !req.session.authenticated) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    const deviceId = req.session.deviceId;
    const userConfig = userConfigurations.get(deviceId);
    
    if (!userConfig || userConfig.qrCodes.length === 0) {
        return res.status(404).json({ error: 'No configuration data found' });
    }
    
    const zipFilename = `smartbag-config-${deviceId}-${Date.now()}.zip`;
    const zipPath = path_module.join('zip-exports', zipFilename);
    
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = fs.createWriteStream(zipPath);
    
    archive.pipe(stream);
    
    // Add QR codes to ZIP
    userConfig.qrCodes.forEach(qr => {
        if (fs.existsSync(qr.filePath)) {
            archive.file(qr.filePath, { name: `qr-codes/${qr.filename}` });
        }
    });
    
    // Add item photos to ZIP
    userConfig.itemImages.forEach(img => {
        if (fs.existsSync(img.filePath)) {
            archive.file(img.filePath, { name: `item-photos/${img.filename}` });
        }
    });
    
    archive.finalize();
    
    stream.on('close', () => {
        // Send the ZIP file
        res.download(zipPath, zipFilename, (err) => {
            if (!err) {
                // Clean up ZIP file after download
                setTimeout(() => {
                    if (fs.existsSync(zipPath)) {
                        fs.unlinkSync(zipPath);
                    }
                }, 60000); // Delete after 1 minute
            }
        });
    });
    
    archive.on('error', (err) => {
        console.error('ZIP creation error:', err);
        res.status(500).json({ error: 'Failed to create ZIP file' });
    });
});

// QR PDF download endpoint
app.get('/api/download-qr-pdf', (req, res) => {
    if (!req.session || !req.session.authenticated) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    const deviceId = req.session.deviceId;
    const userConfig = userConfigurations.get(deviceId);
    
    if (!userConfig || !userConfig.qrPdf) {
        return res.status(404).json({ error: 'QR PDF not found' });
    }
    
    const pdfPath = userConfig.qrPdf.filePath;
    
    if (fs.existsSync(pdfPath)) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${userConfig.qrPdf.filename}"`);
        res.sendFile(path_module.resolve(pdfPath));
    } else {
        res.status(404).json({ error: 'QR PDF file not found on server' });
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

// API endpoint for PDF upload from devices
app.post('/api/pdf', (req, res) => {
    const { filename, pdfData, qrList, deviceId } = req.body;
    
    if (!filename || !pdfData) {
        return res.status(400).json({ error: 'Filename and PDF data are required' });
    }
    
    if (!deviceId) {
        return res.status(400).json({ error: 'Device ID is required' });
    }
    
    // Check if device is authorized
    if (!AUTHORIZED_DEVICES.includes(deviceId)) {
        console.log(`Unauthorized device attempted PDF upload: ${deviceId}`);
        return res.status(403).json({ error: 'Unauthorized device' });
    }

    try {
        console.log(`📄 PDF upload via HTTP from ${deviceId}: ${filename}`);
        
        // Initialize user configuration if not exists
        if (!userConfigurations.has(deviceId)) {
            userConfigurations.set(deviceId, {
                qrCodes: [],
                itemImages: [],
                completed: false,
                qrPdf: null
            });
        }
        
        const userConfig = userConfigurations.get(deviceId);
        
        // Create timestamped filename for permanent storage
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const permanentFilename = `${timestamp}_${filename}`;
        
        // Save PDF to filesystem with permanent storage
        const pdfPath = path_module.join('qr-codes', deviceId);
        if (!fs.existsSync(pdfPath)) {
            fs.mkdirSync(pdfPath, { recursive: true });
        }
        
        const pdfFilePath = path_module.join(pdfPath, permanentFilename);
        const pdfBuffer = Buffer.from(pdfData, 'base64');
        fs.writeFileSync(pdfFilePath, pdfBuffer);
        
        // Add to PDF history
        const historyEntry = addToPdfHistory(deviceId, filename, pdfFilePath, 
                                           qrList ? qrList.length : 0, pdfBuffer.length);
        
        // Store current PDF info (most recent)
        userConfig.qrPdf = {
            filename: filename,
            originalFilename: filename,
            permanentFilename: permanentFilename,
            filePath: pdfFilePath,
            uploadedAt: historyEntry.uploadedAt,
            historyId: historyEntry.id
        };
        
        // Process QR code list if provided
        if (qrList && Array.isArray(qrList)) {
            userConfig.qrCodes = qrList.map(qrInfo => ({
                filename: qrInfo.filename,
                label: qrInfo.label || extractLabelFromFilename(qrInfo.filename),
                uploadedAt: new Date().toISOString(),
                hasPhoto: false,
                imageData: qrInfo.imageData
            }));
        }
        
        // Broadcast to web clients
        broadcastToWebClients(deviceId, 'pdfReceived', {
            filename: filename,
            qrCodes: userConfig.qrCodes,
            uploadedAt: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'PDF received via HTTP. Socket.IO provides real-time updates.',
            filename: filename,
            processedQRs: userConfig.qrCodes.length,
            socketUrl: process.env.NODE_ENV === 'production' 
                ? `wss://${process.env.RENDER_EXTERNAL_HOSTNAME}` 
                : `ws://localhost:${PORT}`
        });
        
    } catch (error) {
        console.error('PDF upload error:', error);
        res.status(500).json({ error: 'PDF upload failed: ' + error.message });
    }
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

// API endpoint to get PDF history
app.get('/api/pdf-history', (req, res) => {
    if (!req.session || !req.session.authenticated) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    const deviceId = req.session.deviceId;
    const history = pdfHistory.get(deviceId) || [];
    
    // Return history without file paths for security
    const sanitizedHistory = history.map(entry => ({
        id: entry.id,
        filename: entry.filename,
        uploadedAt: entry.uploadedAt,
        qrCount: entry.qrCount,
        fileSize: entry.fileSize
    }));
    
    res.json({
        deviceId: deviceId,
        history: sanitizedHistory,
        totalCount: sanitizedHistory.length
    });
});

// API endpoint to download specific PDF from history
app.get('/api/download-pdf-history/:historyId', (req, res) => {
    if (!req.session || !req.session.authenticated) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    const deviceId = req.session.deviceId;
    const historyId = req.params.historyId;
    const history = pdfHistory.get(deviceId) || [];
    
    const pdfEntry = history.find(entry => entry.id === historyId);
    
    if (!pdfEntry) {
        return res.status(404).json({ error: 'PDF not found in history' });
    }
    
    if (fs.existsSync(pdfEntry.filePath)) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${pdfEntry.filename}"`);
        res.sendFile(path_module.resolve(pdfEntry.filePath));
    } else {
        res.status(404).json({ error: 'PDF file not found on server' });
    }
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
            
            // Handle QR PDF upload from Pi
            socket.on('qrPdfUpload', (data) => {
                if (socket.deviceId && AUTHORIZED_DEVICES.includes(socket.deviceId)) {
                    console.log(`📄 QR PDF upload from ${socket.deviceId}:`, data.filename, 'with', data.qrList.length, 'QR codes');
                    
                    // Initialize user configuration if not exists
                    if (!userConfigurations.has(socket.deviceId)) {
                        userConfigurations.set(socket.deviceId, {
                            qrCodes: [],
                            itemImages: [],
                            completed: false,
                            qrPdf: null
                        });
                    }
                    
                    const userConfig = userConfigurations.get(socket.deviceId);
                    
                    // Create timestamped filename for permanent storage
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const permanentFilename = `${timestamp}_${data.filename}`;
                    
                    // Save PDF to filesystem with permanent storage
                    const pdfPath = path_module.join('qr-codes', socket.deviceId);
                    if (!fs.existsSync(pdfPath)) {
                        fs.mkdirSync(pdfPath, { recursive: true });
                    }
                    
                    const pdfFilePath = path_module.join(pdfPath, permanentFilename);
                    const pdfBuffer = Buffer.from(data.pdfData, 'base64');
                    fs.writeFileSync(pdfFilePath, pdfBuffer);
                    
                    // Add to PDF history
                    const historyEntry = addToPdfHistory(socket.deviceId, data.filename, pdfFilePath, 
                                                       data.qrList.length, pdfBuffer.length);
                    
                    // Store current PDF info (most recent)
                    userConfig.qrPdf = {
                        filename: data.filename,
                        originalFilename: data.filename,
                        permanentFilename: permanentFilename,
                        filePath: pdfFilePath,
                        uploadedAt: historyEntry.uploadedAt,
                        historyId: historyEntry.id
                    };
                    
                    // Process QR code list and create individual QR entries
                    userConfig.qrCodes = data.qrList.map(qrInfo => ({
                        filename: qrInfo.filename, // e.g., "Monday_Keys.png"
                        label: qrInfo.label || extractLabelFromFilename(qrInfo.filename),
                        uploadedAt: new Date().toISOString(),
                        hasPhoto: false,
                        imageData: qrInfo.imageData // base64 QR image for display
                    }));
                    
                    console.log(`✅ Processed ${userConfig.qrCodes.length} QR codes from PDF`);
                    
                    // Broadcast to web clients
                    broadcastToWebClients(socket.deviceId, 'qrPdfReceived', {
                        qrCodes: userConfig.qrCodes,
                        pdfInfo: {
                            filename: data.filename,
                            totalQRs: data.qrList.length
                        }
                    });
                    
                    socket.emit('qrPdfUploadAck', { 
                        success: true, 
                        filename: data.filename,
                        processedQRs: userConfig.qrCodes.length
                    });
                } else {
                    socket.emit('qrPdfUploadError', { error: 'Unauthorized QR PDF upload' });
                }
            });
            
            // Handle individual QR code upload (fallback for backward compatibility)
            socket.on('qrUpload', (data) => {
                if (socket.deviceId && AUTHORIZED_DEVICES.includes(socket.deviceId)) {
                    console.log(`📟 Individual QR upload from ${socket.deviceId}:`, data.filename);
                    
                    // Initialize user configuration if not exists
                    if (!userConfigurations.has(socket.deviceId)) {
                        userConfigurations.set(socket.deviceId, {
                            qrCodes: [],
                            itemImages: [],
                            completed: false,
                            qrPdf: null
                        });
                    }
                    
                    const userConfig = userConfigurations.get(socket.deviceId);
                    
                    // Save QR code data
                    const qrData = {
                        filename: data.filename,
                        data: data.imageData, // base64 image data
                        label: data.label || extractLabelFromFilename(data.filename),
                        uploadedAt: new Date().toISOString(),
                        hasPhoto: false
                    };
                    
                    userConfig.qrCodes.push(qrData);
                    
                    // Broadcast to web clients for this device
                    broadcastToWebClients(socket.deviceId, 'qrCodeReceived', qrData);
                    
                    socket.emit('qrUploadAck', { success: true, filename: data.filename });
                } else {
                    socket.emit('qrUploadError', { error: 'Unauthorized QR upload' });
                }
            });
            
            // Handle photo request from Pi
            socket.on('requestPhotos', () => {
                if (socket.deviceId && AUTHORIZED_DEVICES.includes(socket.deviceId)) {
                    const userConfig = userConfigurations.get(socket.deviceId);
                    if (userConfig) {
                        // Send all available photos back to Pi
                        const photosToSend = userConfig.itemImages.filter(img => img.compressed);
                        photosToSend.forEach(photo => {
                            socket.emit('photoData', {
                                filename: photo.filename,
                                data: photo.compressedData,
                                originalQR: photo.qrFilename
                            });
                        });
                        socket.emit('photoTransferComplete', { count: photosToSend.length });
                    }
                }
            });
            
        } else {
            // This is a web client - check if authenticated
            if (socket.handshake.session && socket.handshake.session.authenticated) {
                socket.deviceType = 'client';
                socket.authenticatedDeviceId = socket.handshake.session.deviceId;
                console.log('Authenticated web client connected:', socket.id, 'for device:', socket.authenticatedDeviceId);
                
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
                
                // Send current configuration data
                const userConfig = userConfigurations.get(socket.authenticatedDeviceId);
                if (userConfig) {
                    socket.emit('configurationData', {
                        qrCodes: userConfig.qrCodes.map(qr => ({
                            filename: qr.filename,
                            label: qr.label,
                            uploadedAt: qr.uploadedAt,
                            hasPhoto: qr.hasPhoto,
                            imageData: qr.data // Send base64 data for display
                        })),
                        itemImages: userConfig.itemImages.map(img => ({
                            filename: img.filename,
                            qrFilename: img.qrFilename,
                            uploadedAt: img.uploadedAt,
                            size: img.size
                        }))
                    });
                }
                
                // Check if device is currently connected
                const isDeviceConnected = connectedDevices.has(socket.authenticatedDeviceId);
                socket.emit('deviceConnectionStatus', {
                    connected: isDeviceConnected,
                    deviceId: socket.authenticatedDeviceId
                });
            } else {
                socket.deviceType = 'client';
                console.log('Unauthenticated web client connected:', socket.id);
                socket.emit('authRequired');
            }
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