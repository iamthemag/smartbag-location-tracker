# 🎒 SmartBag Location Tracker & Configuration System

A comprehensive IoT application that combines real-time GPS location tracking with intelligent item management using QR codes. This system enables you to track both the location of your smart bag and manage the items inside it through an intuitive web interface with complete PDF history tracking.

## ✨ Key Features

### 📍 Real-Time Location Tracking
- **Live GPS Tracking**: Real-time location updates from Raspberry Pi devices via Socket.IO
- **Interactive Maps**: Built with Leaflet.js for smooth map interactions and turn-by-turn directions
- **Location History**: View historical location points with path visualization
- **Multi-Device Support**: Track multiple authorized devices simultaneously
- **Demo Mode**: Test without GPS hardware using simulated coordinates

### 📦 Enhanced QR Code Management
- **Automatic QR Generation**: Create weekly QR codes with 1.5x larger size (configurable)
- **Socket.IO Integration**: Automatic PDF upload to server without user interaction
- **PDF History Tracking**: Complete audit trail of all PDF uploads with timestamps
- **Permanent Storage**: PDFs stored permanently with timestamped filenames
- **Visual Web Interface**: Current vs Historical PDF indicators with download capabilities

### 🗄️ Advanced PDF History System
- **Persistent Storage**: Up to 50 PDFs per device with automatic cleanup
- **Rich Metadata**: Track filename, upload time, QR count, file size for each PDF
- **Individual Downloads**: Download any PDF from complete history
- **Real-Time Updates**: Instant notification when new PDFs are uploaded
- **Organized Storage**: Device-specific folders with timestamped files

### 🔧 Technical Excellence
- **WebSocket Communication**: Real-time bidirectional communication with Socket.IO
- **Secure Authentication**: Session-based login system with device authorization
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices
- **Connection Monitoring**: Visual indicators for device connection status
- **File Compression**: Automatic image compression for efficient transfer
- **Error Handling**: Comprehensive error management with reconnection logic

## 🚀 Quick Start

### Prerequisites

- **Node.js** (v14 or higher)
- **npm** (Node Package Manager)
- **Raspberry Pi** with GPS module (for location tracking)
- **Python 3.7+** (for Raspberry Pi client scripts)

### Server Setup

1. **Clone or download this project**
   ```bash
   git clone <repository-url>
   cd location-tracker-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` file and configure:
   ```env
   PORT=3000
   SESSION_SECRET=your-secret-key-here
   MAX_HISTORY=100
   AUTHORIZED_DEVICES=raspi-001,raspi-002,smartbag-device-01
   NODE_ENV=development
   ```

4. **Start the server**
   ```bash
   npm start
   ```
   
   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

5. **Access the application**
   - Navigate to: `http://localhost:3000`
   - Default login credentials:
     - Device ID: `raspi-001` (or any from AUTHORIZED_DEVICES)
     - Password: `Bag@123`

### Raspberry Pi Setup

1. **Install Python dependencies**
   ```bash
   pip install python-socketio requests pyserial pynmea2 qrcode pandas reportlab pillow
   ```

2. **Location Tracking Setup**
   - Connect your GPS module to the Raspberry Pi
   - Update the `GPS_PORT` variable in `locationtomap.py`
   - Common ports: `/dev/ttyUSB0`, `/dev/ttyAMA0`, `/dev/serial0`

3. **Update client configuration**
   Edit `locationtomap.py`:
   ```python
   SERVER_URL = "https://location-tracker-app-waa4.onrender.com"
   DEVICE_ID = "raspi-001"  # Must match authorized device
   GPS_PORT = "/dev/ttyAMA0"  # Your GPS module port
   DEMO_MODE = False  # Set to True for testing without GPS
   ```

4. **Run location tracking**
   ```bash
   # Test connection first
   python3 test-location.py
   
   # Run with demo data (for testing)
   python3 locationtomap.py demo
   
   # Run with real GPS
   python3 locationtomap.py
   ```

5. **QR Code Generation Setup**
   The enhanced QR code generator automatically uploads PDFs to the server:
   ```bash
   # Generate QR codes and automatically upload
   python3 configure-bag-items.py
   
   # With custom server and device ID
   python3 configure-bag-items.py https://location-tracker-app-waa4.onrender.com raspi-001
   
   # With custom QR size (2x larger)
   python3 configure-bag-items.py https://location-tracker-app-waa4.onrender.com raspi-001 2.0
   ```

## 🎒 Enhanced SmartBag QR Code System

The system includes an advanced QR code generator with automatic upload, larger QR codes, and complete PDF history tracking.

### 🔄 Automatic QR Code Generation & Upload

**Key Features:**
- **1.5x Larger QR Codes** (configurable up to any size)
- **Automatic PDF Upload** via Socket.IO (no user interaction required)
- **Real-time Server Sync** with instant web interface updates
- **Enhanced Quality** with better error correction
- **Command Line Configuration** for easy automation

### 🚀 Quick Start - QR Generation

1. **Run the enhanced QR generator**
   ```bash
   python3 configure-bag-items.py
   ```
   
2. **Enter items for each day**
   - Script prompts for items for each day of the week
   - Type `0` to move to the next day
   - Empty days are allowed
   
3. **Automatic processing**
   - Generates larger, higher-quality QR codes
   - Creates printable PDF with enhanced layout
   - **Automatically uploads** PDF and QR data to server
   - Updates web interface in real-time

### 🛠️ Advanced Configuration

**Custom Server & Device:**
```bash
# Use your own server URL and device ID
python3 configure-bag-items.py https://your-server.com raspi-002
```

**Custom QR Code Size:**
```bash
# Make QR codes 2x larger than default
python3 configure-bag-items.py https://location-tracker-app-waa4.onrender.com raspi-001 2.0
```

**Help & Options:**
```bash
# View all available options
python3 configure-bag-items.py --help
```

### 🗄️ Generated Files

- **`smart_bag.csv`**: Complete list of all items
- **`smart_bag_qr/` folder**: Individual QR code images (larger size)
- **`smart_bag_qr.pdf`**: Enhanced printable PDF with better layout
- **Server Storage**: Permanent PDF storage with timestamp

### 🌐 Web Interface Integration

**Access at `/configure` page:**

1. **Current PDF Display**: Shows most recent PDF with "Current" badge
2. **PDF History**: Browse all previous PDFs with "History" badges  
3. **File Information**: View QR count, file size, upload timestamp
4. **Individual Downloads**: Download any PDF from complete history
5. **Real-time Updates**: New PDFs appear instantly when uploaded

**Features:**
- ✅ **Visual PDF Preview** with QR code grid display
- ✅ **Complete History** with up to 50 PDFs per device
- ✅ **Smart Organization** with timestamps and metadata
- ✅ **One-Click Downloads** for current or historical PDFs
- ✅ **Real-time Notifications** when new PDFs arrive

## 📡 API Endpoints

### Authentication

#### POST /api/login
Authenticate with device credentials.

**Request Body:**
```json
{
  "deviceId": "raspi-001",
  "password": "Bag@123"
}
```

#### GET /api/auth-status
Check current authentication status.

### Location Tracking

#### POST /api/location
Submit location data (HTTP fallback - prefer Socket.IO).

**Request Body:**
```json
{
  "latitude": 40.7128,
  "longitude": -74.0060,
  "accuracy": 5.0,
  "deviceId": "raspi-001"
}
```

#### GET /api/location
Retrieve current location and history.

**Response:**
```json
{
  "current": {
    "latitude": 40.7128,
    "longitude": -74.0060,
    "accuracy": 5.0,
    "timestamp": "2023-10-17T10:30:00.000Z",
    "deviceId": "raspi-001"
  },
  "history": [...]
}
```

### PDF Management

#### POST /api/pdf
Submit PDF data from Raspberry Pi devices (HTTP fallback - prefer Socket.IO).

**Request Body:**
```json
{
  "filename": "smart_bag_qr.pdf",
  "pdfData": "base64-encoded-pdf-data",
  "qrList": [
    {
      "filename": "Monday_Keys.png",
      "label": "Monday: Keys",
      "imageData": "base64-qr-image"
    }
  ],
  "deviceId": "raspi-001"
}
```

#### GET /api/pdf-history
Get complete PDF upload history for authenticated device.

**Response:**
```json
{
  "deviceId": "raspi-001",
  "history": [
    {
      "id": "pdf_1729450876543_abc123def",
      "filename": "smart_bag_qr.pdf",
      "uploadedAt": "2025-10-20T17:54:36.543Z",
      "qrCount": 12,
      "fileSize": 245760
    }
  ],
  "totalCount": 15
}
```

#### GET /api/download-pdf-history/:historyId
Download specific PDF from history by ID.

#### GET /api/download-qr-pdf
Download current/latest PDF for authenticated device.

### Configuration Management

#### GET /api/user-config
Get current QR codes and photos for authenticated device.

#### POST /api/upload-photo/:qrFilename
Upload photo for a specific QR code (with automatic compression).

#### GET /api/download-zip
Download complete configuration as ZIP file.

#### GET /api/devices
Get status of connected devices (debugging).

## 🥧 Raspberry Pi Setup

### Python Client Example

Create this script on your Raspberry Pi to send location data:

```python
#!/usr/bin/env python3
"""
Raspberry Pi GPS Location Sender
Reads GPS data and sends it to the location tracker server
"""

import requests
import time
import json
import serial
import pynmea2

# Configuration
SERVER_URL = "http://your-server-ip:3000/api/location"
GPS_PORT = "/dev/ttyUSB0"  # Adjust based on your GPS module
GPS_BAUDRATE = 9600
UPDATE_INTERVAL = 5  # seconds

def read_gps():
    """Read GPS data from the GPS module"""
    try:
        ser = serial.Serial(GPS_PORT, GPS_BAUDRATE, timeout=1)
        
        while True:
            line = ser.readline().decode('ascii', errors='replace')
            
            if line.startswith('$GPGGA') or line.startswith('$GNGGA'):
                try:
                    msg = pynmea2.parse(line)
                    if msg.latitude and msg.longitude:
                        return {
                            'latitude': float(msg.latitude),
                            'longitude': float(msg.longitude),
                            'accuracy': float(msg.horizontal_dil) if msg.horizontal_dil else None
                        }
                except pynmea2.ParseError:
                    continue
                    
    except serial.SerialException as e:
        print(f"GPS Error: {e}")
        return None

def send_location(location):
    """Send location data to the server"""
    try:
        response = requests.post(
            SERVER_URL,
            json=location,
            timeout=10,
            headers={'Content-Type': 'application/json'}
        )
        
        if response.status_code == 200:
            print(f"Location sent: {location['latitude']}, {location['longitude']}")
        else:
            print(f"Server error: {response.status_code}")
            
    except requests.exceptions.RequestException as e:
        print(f"Network error: {e}")

def main():
    """Main loop"""
    print("Starting GPS location tracker...")
    
    while True:
        location = read_gps()
        if location:
            send_location(location)
        
        time.sleep(UPDATE_INTERVAL)

if __name__ == "__main__":
    main()
```

### Required Python packages:
```bash
pip install requests pyserial pynmea2
```

### Bash Script Alternative (using curl)

```bash
#!/bin/bash
# Simple location sender using curl
# Replace with your actual coordinates or GPS reading command

SERVER_URL="http://your-server-ip:3000/api/location"

while true; do
    # Example: Get location from your GPS module
    # LAT=$(your_gps_command_for_latitude)
    # LON=$(your_gps_command_for_longitude)
    
    # For testing, you can use static coordinates:
    LAT="40.7128"
    LON="-74.0060"
    
    curl -X POST "$SERVER_URL" \
         -H "Content-Type: application/json" \
         -d "{\"latitude\": $LAT, \"longitude\": $LON, \"accuracy\": 5.0}"
    
    echo "Location sent: $LAT, $LON"
    sleep 30
done
```

## 🔧 Configuration

### Environment Variables

You can configure the server using environment variables:

```bash
export PORT=3000                    # Server port (default: 3000)
export MAX_HISTORY=100              # Max location history entries (default: 100)
```

### Server Configuration

Edit `server.js` to modify:

- **Port**: Change the `PORT` variable
- **CORS settings**: Modify the `cors` configuration
- **History limit**: Adjust `MAX_HISTORY` constant
- **Update intervals**: Modify timing in the frontend JavaScript

## 🎨 Customization

### Map Styling

To change the map tiles or styling, edit `public/js/app.js`:

```javascript
// Replace OpenStreetMap with other tile providers
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
}).addTo(map);
```

Popular alternatives:
- **Satellite**: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`
- **Dark Mode**: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`
- **Terrain**: `https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png`

### UI Colors and Styling

Modify `public/css/style.css` to change:
- Color scheme
- Button styles
- Layout and spacing
- Responsive breakpoints

## 🌐 Web Interface Overview

The application provides three main web interfaces:

### 1. 🏠 Homepage (`/`)
- **Login Interface**: Secure authentication with device ID and password
- **Device Selection**: Choose from authorized devices
- **Quick Access**: Links to tracker and configure pages

### 2. 🗺️ Location Tracker (`/tracker`)
- **Real-time GPS Tracking**: Live location updates with interactive map
- **Location History**: View historical location points and paths
- **Turn-by-turn Directions**: Get directions to your bag's location
- **Device Status**: Monitor connection status of Raspberry Pi devices
- **Activity Log**: Real-time activity feed with all location updates

### 3. 📦 PDF Configuration (`/configure`)
- **PDF Reception**: Real-time display of uploaded QR code PDFs
- **History Browser**: Complete audit trail of all PDF uploads
- **Visual Indicators**: Current vs Historical PDF badges
- **File Information**: QR count, file size, upload timestamps
- **One-Click Downloads**: Download current or historical PDFs
- **Real-time Updates**: Instant notifications when new PDFs arrive

## 🧪 Testing & Verification

### Connection Testing

**Test Raspberry Pi Connection:**
```bash
# Run connection test script
python3 test-location.py
```
This tests both Socket.IO and HTTP API connectivity.

### Manual API Testing

**Location API:**
```bash
# Send test location
curl -X POST https://location-tracker-app-waa4.onrender.com/api/location \
     -H "Content-Type: application/json" \
     -d '{"latitude": 40.7128, "longitude": -74.0060, "accuracy": 5.0, "deviceId": "raspi-001"}'

# Get current location
curl https://location-tracker-app-waa4.onrender.com/api/location
```

**PDF API:**
```bash
# Test PDF upload (requires base64 PDF data)
curl -X POST https://location-tracker-app-waa4.onrender.com/api/pdf \
     -H "Content-Type: application/json" \
     -d '{"filename": "test.pdf", "pdfData": "base64-data", "qrList": [], "deviceId": "raspi-001"}'
```

### Socket.IO Testing

**Browser Console Testing:**
```javascript
// Connect to server
const socket = io();

// Test device authentication
socket.emit('authenticate', {
    type: 'device',
    deviceId: 'raspi-001'
});

// Listen for location updates
socket.on('locationUpdate', (data) => {
    console.log('Location update:', data);
});

// Listen for PDF updates
socket.on('qrPdfReceived', (data) => {
    console.log('PDF received:', data);
});
```

### Demo Mode Testing

**Location Tracking Demo:**
```bash
# Run location tracker in demo mode (simulated GPS)
python3 locationtomap.py demo
```

**QR Code Generation:**
```bash
# Generate QR codes and upload to server
python3 configure-bag-items.py
```

## 🚀 Live Deployment

The SmartBag system is deployed and ready to use:

- **🌐 Web App**: [https://location-tracker-app-waa4.onrender.com](https://location-tracker-app-waa4.onrender.com)
- **🗺️ Location Tracker**: [/tracker](https://location-tracker-app-waa4.onrender.com/tracker)
- **📦 PDF Configuration**: [/configure](https://location-tracker-app-waa4.onrender.com/configure)

### 🔑 Login Credentials

**Default Device IDs:**
- `raspi-001`
- `raspi-002`  
- `smartbag-device-01`
- `raspi-tracker-main`

**Password:** `Bag@123`

### 🔄 Auto-Deployment

The app uses Render.com with automatic deployment:
- **GitHub Integration**: Pushes to `main` branch automatically deploy
- **Environment**: Production environment with HTTPS
- **Uptime**: Free tier sleeps after 15 minutes of inactivity

## 😨 Troubleshooting

### 🗺️ Location Tracking Issues

1. **GPS not working**
   - Check GPS module connection to Raspberry Pi
   - Verify `GPS_PORT` setting (`/dev/ttyUSB0`, `/dev/ttyAMA0`, `/dev/serial0`)
   - Run in demo mode first: `python3 locationtomap.py demo`
   - Test with: `python3 test-location.py`

2. **Connection failed**
   - Verify server URL is correct
   - Check device ID is in `AUTHORIZED_DEVICES` list
   - Test internet connectivity on Pi
   - Check server status at deployment URL

3. **Socket.IO authentication failed**
   - Ensure device ID matches server authorization list
   - Check server logs for authentication errors
   - Verify no firewall blocking connections

### 📦 PDF Generation Issues

1. **PDF upload failed**
   - Check internet connection on Raspberry Pi
   - Verify device ID authorization on server
   - Test with smaller PDF first
   - Check server logs for upload errors

2. **QR codes too small**
   - Increase size multiplier: `python3 configure-bag-items.py ... ... 2.0`
   - Check PDF viewer settings
   - Print at actual size (100%), not "fit to page"

3. **Dependencies missing**
   ```bash
   pip install pandas qrcode reportlab python-socketio pillow
   ```

### 🌐 Web Interface Issues

1. **Login failed**
   - Use correct device ID from authorized list
   - Password is case-sensitive: `Bag@123`
   - Clear browser cache and cookies

2. **Real-time updates not working**
   - Check browser console for WebSocket errors
   - Refresh page to re-establish connection
   - Verify server is running and accessible

3. **PDFs not appearing**
   - Check if Raspberry Pi is connected and authenticated
   - Verify PDF was uploaded successfully
   - Check activity log for error messages

### 🚑 Server Issues

1. **"npm: command not found"**
   - Install Node.js from [nodejs.org](https://nodejs.org/)

2. **Port already in use**
   - Change port in environment variables or `server.js`
   - Kill existing process: `lsof -ti:3000 | xargs kill`

3. **Environment variables not set**
   - Copy `.env.example` to `.env`
   - Set `AUTHORIZED_DEVICES`, `SESSION_SECRET`
   - Restart server after changes

3. **GPS module not detected on Raspberry Pi**
   - Check the device path: `ls /dev/tty*`
   - Verify GPS module connections
   - Install GPS utilities: `sudo apt install gpsd gpsd-clients`

4. **Location not updating**
   - Check server logs for errors
   - Verify the Raspberry Pi can reach the server
   - Test API endpoints manually

5. **Map not loading**
   - Check internet connection (Leaflet requires external resources)
   - Verify browser console for JavaScript errors

### Debugging

Enable debug mode by setting environment variable:
```bash
DEBUG=socket.io:* npm start
```

## 📝 License

MIT License - feel free to use this project for any purpose.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

For issues and questions:
- Check the troubleshooting section above
- Review server logs for error messages
- Test API endpoints manually
- Verify network connectivity between devices

## 🎆 Project Summary

The **SmartBag Location Tracker & Configuration System** is a comprehensive IoT solution that combines:

### 🎯 **Core Capabilities**
- ✅ **Real-time GPS tracking** with interactive maps
- ✅ **Enhanced QR code generation** with 1.5x larger codes
- ✅ **Automatic PDF upload** via Socket.IO
- ✅ **Complete PDF history** with up to 50 files per device
- ✅ **Permanent storage** with timestamped filenames
- ✅ **Real-time web interface** with live updates

### 🚀 **Technology Stack**
- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: HTML5, JavaScript, Bootstrap, Leaflet.js
- **Raspberry Pi**: Python 3, GPS modules, QR generation
- **Database**: In-memory with persistent file storage
- **Deployment**: Render.com with auto-deployment

### 🏆 **Key Achievements**
- **Automatic PDF Management**: No manual intervention required
- **Enhanced QR Quality**: Larger, clearer QR codes for better scanning
- **Complete Audit Trail**: Full history of all PDF uploads
- **Real-time Sync**: Instant updates between Pi and web interface
- **Production Ready**: Deployed and accessible via HTTPS

### 🔗 **Quick Links**
- **🌐 Live App**: [https://location-tracker-app-waa4.onrender.com](https://location-tracker-app-waa4.onrender.com)
- **🗺️ Location Tracking**: [/tracker](https://location-tracker-app-waa4.onrender.com/tracker)
- **📦 PDF Management**: [/configure](https://location-tracker-app-waa4.onrender.com/configure)
- **👨‍💻 GitHub Repository**: [smartbag-location-tracker](https://github.com/iamthemag/smartbag-location-tracker)

---

**🎒 Happy SmartBag tracking with enhanced QR codes and complete PDF history! 📈📍**
