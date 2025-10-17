#!/usr/bin/env python3
"""
Updated Raspberry Pi GPS Location Sender with Socket.IO Authentication
Based on the original GPS template but enhanced with Socket.IO connectivity

Requirements:
- pip install python-socketio pyserial pynmea2
- GPS module connected to Raspberry Pi
- Server running and accessible from the Pi
"""

import time
import serial
import pynmea2
import socketio
import sys
from datetime import datetime

# Configuration
SERVER_URL = "http://localhost:3000"  # Change to your server IP
DEVICE_ID = "raspi-001"  # Change this to your unique device ID (must be in AUTHORIZED_DEVICES list)
GPS_PORT = "/dev/ttyAMA0"  # GPS port from your template
GPS_BAUDRATE = 9600
UPDATE_INTERVAL = 5  # seconds between updates (set to 0 for continuous)
SINGLE_FIX = False  # Set to True to stop after first valid fix (like original template)

# Create Socket.IO client
sio = socketio.Client(reconnection=True, reconnection_delay=5)

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
        print(f"[{timestamp}] ✅ Location sent successfully")

@sio.on('locationError')
def on_location_error(data):
    print(f"❌ Location update error: {data['error']}")

def send_location_to_server(lat, lng, accuracy=None):
    """Send location data to server via Socket.IO"""
    if sio.connected:
        payload = {
            'latitude': lat,
            'longitude': lng
        }
        
        if accuracy:
            payload['accuracy'] = accuracy
            
        sio.emit('locationUpdate', payload)
        
        # Print Google Maps link in terminal (like original template)
        link = f"https://www.google.com/maps?q={lat},{lng}"
        print(f"📍 Location: {lat}, {lng}")
        print(f"🗺️  Open this link to see location: {link}")
        return True
    else:
        print("⚠️ Not connected to server")
        return False

def main():
    print("=" * 60)
    print("🗺️  GPS Location Tracker with Socket.IO")
    print("=" * 60)
    print(f"Device ID: {DEVICE_ID}")
    print(f"Server URL: {SERVER_URL}")
    print(f"GPS Port: {GPS_PORT}")
    print("-" * 60)
    
    try:
        # Connect to server first
        print("🔗 Connecting to server...")
        sio.connect(SERVER_URL)
        
        # Wait for authentication
        time.sleep(2)
        
        if not sio.connected:
            print("❌ Failed to connect to server")
            return
            
        # Initialize GPS connection
        print(f"🛰️  Connecting to GPS on {GPS_PORT}...")
        ser = serial.Serial(GPS_PORT, baudrate=GPS_BAUDRATE, timeout=1)
        print("✅ GPS connection established")
        print("⏳ Waiting for GPS fix... (may take a few minutes)")
        
        consecutive_failures = 0
        max_failures = 10
        
        while True:
            try:
                newdata = ser.readline().decode('ascii', errors='replace').strip()
                
                if newdata.startswith('$GPRMC'):
                    msg = pynmea2.parse(newdata)
                    if msg.status == 'A':  # A = valid fix
                        lat = float(msg.latitude)
                        lng = float(msg.longitude)
                        
                        # Calculate accuracy if available
                        accuracy = None
                        
                        # Send to server
                        success = send_location_to_server(lat, lng, accuracy)
                        
                        if success:
                            consecutive_failures = 0
                            
                            # If single fix mode (like original template)
                            if SINGLE_FIX:
                                print("📱 Single fix mode - stopping after first valid location")
                                break
                        else:
                            consecutive_failures += 1
                            
                elif newdata.startswith('$GPGGA') or newdata.startswith('$GNGGA'):
                    # Alternative: Use GGA for more detailed info including accuracy
                    try:
                        msg = pynmea2.parse(newdata)
                        if msg.latitude and msg.longitude:
                            lat = float(msg.latitude)
                            lng = float(msg.longitude)
                            accuracy = float(msg.horizontal_dil) * 5 if msg.horizontal_dil else None
                            
                            # Send to server
                            success = send_location_to_server(lat, lng, accuracy)
                            
                            if success:
                                consecutive_failures = 0
                                
                                # If single fix mode
                                if SINGLE_FIX:
                                    print("📱 Single fix mode - stopping after first valid location")
                                    break
                            else:
                                consecutive_failures += 1
                                
                    except (ValueError, AttributeError):
                        continue
                        
            except pynmea2.ParseError:
                continue
            except serial.SerialException as e:
                print(f"❌ GPS Error: {e}")
                consecutive_failures += 1
                
            # Exit if too many consecutive failures
            if consecutive_failures >= max_failures:
                print(f"❌ Too many consecutive failures ({consecutive_failures}). Check GPS connection.")
                break
                
            # Wait before next reading (if not single fix mode)
            if not SINGLE_FIX and UPDATE_INTERVAL > 0:
                time.sleep(UPDATE_INTERVAL)
            elif not SINGLE_FIX:
                time.sleep(1)  # Default 1 second like original template
                
    except KeyboardInterrupt:
        print("\n🛑 Stopped by user")
    except serial.SerialException as e:
        print(f"❌ Cannot connect to GPS on {GPS_PORT}: {e}")
        print("Check your GPS module connection and port settings")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
    finally:
        try:
            ser.close()
            print("📡 GPS connection closed")
        except:
            pass
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
        
    if len(sys.argv) > 3:
        SINGLE_FIX = sys.argv[3].lower() in ['true', '1', 'yes', 'single']
        print(f"Single fix mode: {SINGLE_FIX}")
    
    main()