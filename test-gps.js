const io = require('socket.io-client');

// Connect to the server
const socket = io('http://localhost:3000');

// Simulate a SmartBag device
const DEVICE_ID = 'smartbag-device-01';

// Test coordinates (you can change these to your preferred location)
let testLat = 40.7128;  // New York City
let testLng = -74.0060;

console.log(`🧪 GPS Test Client starting for device: ${DEVICE_ID}`);

socket.on('connect', () => {
    console.log('✅ Connected to server');
    
    // Authenticate as a device
    socket.emit('authenticate', {
        deviceId: DEVICE_ID,
        type: 'device'
    });
});

socket.on('authSuccess', (data) => {
    console.log('✅ Device authenticated:', data.message);
    console.log('📍 Starting to send test GPS data...');
    
    // Send initial location
    sendLocation();
    
    // Send location updates every 5 seconds with slight movement
    setInterval(() => {
        // Simulate slight movement (random walk)
        testLat += (Math.random() - 0.5) * 0.001;  // Small random changes
        testLng += (Math.random() - 0.5) * 0.001;
        
        sendLocation();
    }, 5000);
});

socket.on('authError', (error) => {
    console.error('❌ Authentication failed:', error);
    process.exit(1);
});

socket.on('locationAck', (response) => {
    console.log('📍 Location acknowledged by server');
});

socket.on('locationError', (error) => {
    console.error('❌ Location error:', error);
});

socket.on('disconnect', () => {
    console.log('❌ Disconnected from server');
});

function sendLocation() {
    const locationData = {
        latitude: testLat,
        longitude: testLng,
        accuracy: Math.random() * 10 + 5  // Random accuracy between 5-15 meters
    };
    
    console.log(`📍 Sending location: ${testLat.toFixed(6)}, ${testLng.toFixed(6)}`);
    socket.emit('locationUpdate', locationData);
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log('\n🛑 Stopping GPS test client...');
    socket.disconnect();
    process.exit(0);
});

// Handle errors
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught error:', error);
    process.exit(1);
});