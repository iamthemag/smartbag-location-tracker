#!/usr/bin/env python3
"""
Raspberry Pi GPS Location Sender with Socket.IO Authentication
Connects to the location tracker server using Socket.IO with device ID authentication

Requirements:
- pip install python-socketio requests pyserial pynmea2
- GPS module connected to Raspberry Pi
- Server running and accessible from the Pi
"""

import socketio
import time
import sys
import os
from datetime import datetime

try:
    import serial
    import pynmea2
    GPS_AVAILABLE = True
except ImportError:
    GPS_AVAILABLE = False
    print("Warning: GPS libraries not installed. Using demo mode.")
    print("Install with: pip install pyserial pynmea2")

# Configuration
SERVER_URL = "http://localhost:3000"  # Change to your server IP
DEVICE_ID = "raspi-001"  # Change this to your unique device ID (must be in AUTHORIZED_DEVICES list)
GPS_PORT = "/dev/ttyUSB0"  # Common GPS module ports: /dev/ttyUSB0, /dev/ttyAMA0, /dev/serial0
GPS_BAUDRATE = 9600
UPDATE_INTERVAL = 5  # seconds between updates
DEMO_MODE = not GPS_AVAILABLE  # Use demo coordinates if GPS not available

# Demo coordinates (New York City area)
DEMO_COORDS = [
    (40.7128, -74.0060),  # NYC
    (40.7580, -73.9855),  # Times Square
    (40.6892, -74.0445),  # Statue of Liberty
    (40.7614, -73.9776),  # Central Park
    (40.7505, -73.9934),  # Empire State Building
]
demo_index = 0

# Create Socket.IO client
sio = socketio.Client(reconnection=True, reconnection_delay=5)

def read_gps_data():
    """Read GPS data from the GPS module"""
    if not GPS_AVAILABLE:
        return None
        
    try:
        ser = serial.Serial(GPS_PORT, GPS_BAUDRATE, timeout=1)
        print(f"Connected to GPS on {GPS_PORT}")
        
        while True:
            try:
                line = ser.readline().decode('ascii', errors='replace').strip()
                
                if line.startswith('$GPGGA') or line.startswith('$GNGGA'):
                    msg = pynmea2.parse(line)
                    if msg.latitude and msg.longitude:
                        return {
                            'latitude': float(msg.latitude),
                            'longitude': float(msg.longitude),
                            'accuracy': float(msg.horizontal_dil) * 5 if msg.horizontal_dil else None,
                            'altitude': float(msg.altitude) if msg.altitude else None,
                            'satellites': int(msg.num_sats) if msg.num_sats else None
                        }
            except (pynmea2.ParseError, ValueError, UnicodeDecodeError):
                continue
            except KeyboardInterrupt:
                ser.close()
                raise
                
    except serial.SerialException as e:
        print(f"GPS Error: {e}")
        return None

def get_demo_location():
    """Generate demo location data for testing"""
    global demo_index
    
    lat, lon = DEMO_COORDS[demo_index % len(DEMO_COORDS)]
    
    # Add small random variation to simulate movement
    import random
    lat += random.uniform(-0.001, 0.001)
    lon += random.uniform(-0.001, 0.001)
    
    demo_index += 1
    
    return {
        'latitude': lat,
        'longitude': lon,
        'accuracy': random.uniform(3.0, 15.0),
        'altitude': random.uniform(0, 100),
        'satellites': random.randint(4, 12)
    }

# Socket.IO event handlers
@sio.event
def connect():
    print("✅ Connected to server")
    # Authenticate as a device
    sio.emit('authenticate', {
        'type': 'device',
        'deviceId': DEVICE_ID
    })

@sio.event
def disconnect():
    print("❌ Disconnected from server")

@sio.on('authSuccess')
def on_auth_success(data):
    print(f"🔐 Authentication successful: {data['message']}")
    print("📡 Ready to send location updates")

@sio.on('authError')
def on_auth_error(data):
    print(f"🚫 Authentication failed: {data['error']}")
    print("Check your DEVICE_ID and ensure it's in the server's AUTHORIZED_DEVICES list")
    sio.disconnect()

@sio.on('locationAck')
def on_location_ack(data):
    if data['success']:
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] ✅ Location update acknowledged")

@sio.on('locationError')
def on_location_error(data):
    print(f"❌ Location update error: {data['error']}")

def send_location(location_data):
    """Send location data via Socket.IO"""
    if sio.connected:
        # Prepare payload for Socket.IO
        payload = {
            'latitude': location_data['latitude'],
            'longitude': location_data['longitude']
        }
        
        if location_data.get('accuracy'):
            payload['accuracy'] = location_data['accuracy']
            
        sio.emit('locationUpdate', payload)
        return True
    else:
        print("⚠️ Not connected to server")
        return False

def main():
    """Main loop"""
    print("=" * 50)
    print("🗺️  Location Tracker Client with Socket.IO")
    print("=" * 50)
    print(f"Device ID: {DEVICE_ID}")
    print(f"Server URL: {SERVER_URL}")
    
    if DEMO_MODE:
        print("🎭 Running in DEMO mode with simulated coordinates")
        print("   Install GPS libraries for real GPS data:")
        print("   pip install pyserial pynmea2")
    else:
        print(f"🛰️  GPS mode - connecting to {GPS_PORT}")
    
    print(f"📡 Sending updates every {UPDATE_INTERVAL} seconds")
    print("   Press Ctrl+C to stop")
    print("-" * 50)
    
    try:
        # Connect to server
        sio.connect(SERVER_URL)
        
        # Wait for authentication
        time.sleep(2)
        
        if not sio.connected:
            print("Failed to connect to server")
            return
        
        consecutive_failures = 0
        max_failures = 5
        
        while True:
            # Get location data
            if DEMO_MODE:
                location = get_demo_location()
            else:
                location = read_gps_data()
            
            if location:
                success = send_location(location)
                if success:
                    consecutive_failures = 0
                else:
                    consecutive_failures += 1
            else:
                if not DEMO_MODE:
                    print("⏳ Waiting for GPS fix...")
                consecutive_failures += 1
            
            # Exit if too many consecutive failures
            if consecutive_failures >= max_failures:
                print(f"❌ Too many consecutive failures ({consecutive_failures}). Exiting.")
                break
                
            time.sleep(UPDATE_INTERVAL)
            
    except KeyboardInterrupt:
        print("\n🛑 Stopped by user")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
    finally:
        sio.disconnect()
        print("📱 Location tracking stopped")

if __name__ == "__main__":
    # Handle command line arguments
    if len(sys.argv) > 1:
        SERVER_URL = sys.argv[1]
        print(f"Using server URL: {SERVER_URL}")
    
    if len(sys.argv) > 2:
        DEVICE_ID = sys.argv[2]
        print(f"Using device ID: {DEVICE_ID}")
    
    main()