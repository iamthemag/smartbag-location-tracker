# 🎒 SmartBag Location Tracker & Configuration System

A comprehensive IoT application that combines real-time GPS location tracking with intelligent item management using QR codes. This system enables you to track both the location of your smart bag and manage the items inside it through an intuitive web interface.

## ✨ Features

### 📍 Location Tracking
- **Real-time GPS Tracking**: Live location updates from Raspberry Pi devices
- **Interactive Map**: Built with Leaflet.js for smooth map interactions
- **Location History**: View historical location points with path visualization
- **Multi-device Support**: Track multiple devices simultaneously
- **Turn-by-turn Directions**: Get directions to your bag's location

### 📦 Smart Item Management
- **QR Code Generation**: Generate weekly QR codes for bag items
- **Photo Upload**: Associate photos with QR-coded items
- **Device Authentication**: Secure login system for device management
- **Configuration Sync**: Seamless data sync between Pi and web interface
- **Batch Operations**: Download configurations as ZIP files

### 🔧 Technical Features
- **WebSocket Communication**: Real-time bidirectional communication with Socket.IO
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Connection Status**: Visual indicators for device connection status
- **Session Management**: Secure authentication with session handling
- **File Compression**: Automatic image compression for efficient transfer

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

2. **Configure GPS connection**
   - Connect your GPS module to the Raspberry Pi
   - Update the `GPS_PORT` variable in `raspberry-pi-client.py`
   - Common ports: `/dev/ttyUSB0`, `/dev/ttyAMA0`, `/dev/serial0`

3. **Update client configuration**
   Edit `locationtomap.py` or `raspberry-pi-client.py`:
   ```python
   SERVER_URL = "https://location-tracker-app-waa4.onrender.com"
   DEVICE_ID = "raspi-001"  # Must match authorized device
   ```

4. **Run the GPS client**
   ```bash
   python3 raspberry-pi-client.py
   ```

## 📦 SmartBag QR Code Generation

The system includes a powerful QR code generator for organizing weekly items:

### Generate QR Codes for Weekly Items

1. **Run the QR generator**
   ```bash
   python3 smart_bag_generator.py
   ```

2. **Enter items for each day**
   - The script will prompt you for items for each day of the week
   - Type `0` to move to the next day
   - Empty days are allowed

3. **Generated files**
   - `smart_bag.csv`: List of all items
   - `smart_bag_qr/`: Folder containing individual QR code images
   - `smart_bag_qr.pdf`: Printable PDF with all QR codes

4. **Upload to server** (optional)
   - The generator can automatically upload the QR data to your server
   - Configure `SERVER_URL` and `DEVICE_ID` in the script
   - Data is transmitted via Socket.IO for real-time sync

### Using QR Codes

1. **Print the PDF**: Print `smart_bag_qr.pdf` and attach QR codes to items
2. **Web interface**: Use `/configure` page to:
   - View uploaded QR codes
   - Upload photos for each QR-coded item
   - Download configuration as ZIP file
3. **Automatic sync**: Photos are automatically sent to the Pi device

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

### Configuration Management

#### GET /api/user-config
Get QR codes and photos for authenticated device.

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

## 🧪 Testing

### Test the API manually:

```bash
# Send a test location
curl -X POST http://localhost:3000/api/location \
     -H "Content-Type: application/json" \
     -d '{"latitude": 40.7128, "longitude": -74.0060, "accuracy": 5.0}'

# Get current location
curl http://localhost:3000/api/location
```

### WebSocket Testing

Open browser developer console and test Socket.IO connection:

```javascript
// Connect to server
const socket = io();

// Listen for location updates
socket.on('locationUpdate', (data) => {
    console.log('Location update:', data);
});
```

## 🚨 Troubleshooting

### Common Issues

1. **"npm: command not found"**
   - Install Node.js from [nodejs.org](https://nodejs.org/)

2. **Port already in use**
   - Change the port in `server.js` or kill the process using the port

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

---

**Happy tracking! 🎯**