#!/usr/bin/env python3
"""
Enhanced Raspberry Pi GPS Location Sender with Location Caching
Features:
- Stores recent locations in a list for offline resilience
- Sends most recent cached location upon reconnection
- Automatically updates and sends new locations after reconnection

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
import json
import os
from datetime import datetime
from collections import deque
from urllib.parse import urlparse
import requests

# Configuration
SERVER_URL = "https://location-tracker-app-waa4.onrender.com"  # Deployed app URL
DEVICE_ID = "raspi-001"  # Change this to your unique device ID (must be in AUTHORIZED_DEVICES list)
GPS_PORT = "/dev/ttyAMA0"  # GPS port - common options: /dev/ttyUSB0, /dev/ttyAMA0, /dev/serial0
GPS_BAUDRATE = 9600
UPDATE_INTERVAL = 5  # seconds between updates (set to 0 for continuous)
SINGLE_FIX = False  # Set to True to stop after first valid fix
LOCATION_CACHE_SIZE = 5  # Number of recent locations to keep (reduced buffer)
DEMO_MODE = False  # Set to True to use simulated GPS data for testing

# Global variables
NO_FIX_RESTART_SECONDS = 180  # restart the script if no valid GPS fix within this many seconds
RECONNECT_BACKOFFS = [2, 5, 10, 20, 30]  # seconds between reconnect attempts
location_cache = deque(maxlen=LOCATION_CACHE_SIZE)  # Store recent locations
authenticated = False
gps_serial = None
sending_location = False  # Flag to prevent multiple simultaneous sends
last_send_time = 0  # Track when we last sent a location
send_timeout = 10  # Timeout in seconds before sending cached location

# Create Socket.IO client with compatible reconnection settings
sio = socketio.Client(
    reconnection=True, 
    reconnection_delay=2,
    reconnection_delay_max=30
)

# Always use Socket.IO for real-time updates
USE_SOCKET = True
# HTTP API endpoint for fallback
HTTP_API_URL = SERVER_URL + "/api/location"

def create_location_entry(lat, lng, accuracy=None):
    """Create a standardized location entry with timestamp"""
    return {
        'latitude': lat,
        'longitude': lng,
        'accuracy': accuracy,
        'timestamp': datetime.now().isoformat(),
        'device_id': DEVICE_ID
    }

def cache_location(lat, lng, accuracy=None):
    """Cache location data for offline resilience"""
    location_entry = create_location_entry(lat, lng, accuracy)
    location_cache.append(location_entry)
    
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] 💾 Location cached ({len(location_cache)}/{LOCATION_CACHE_SIZE})")
    
    return location_entry

def send_cached_location():
    """Send the most recent cached location to server (only if not already sending)"""
    global sending_location, last_send_time
    
    if sending_location:
        print("⏳ Already sending location, skipping cached send")
        return False
        
    if location_cache and sio.connected and authenticated:
        sending_location = True  # Set flag to prevent multiple sends
        recent_location = location_cache[-1]  # Get most recent location
        
        payload = {
            'latitude': recent_location['latitude'],
            'longitude': recent_location['longitude'],
            'timestamp': recent_location['timestamp']  # Include original timestamp
        }
        
        if recent_location['accuracy']:
            payload['accuracy'] = recent_location['accuracy']
        
        sio.emit('locationUpdate', payload)
        last_send_time = time.time()
        
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] 📡 Sent cached location: {recent_location['latitude']:.6f}, {recent_location['longitude']:.6f}")
        print(f"[{timestamp}] 🕒 Original timestamp: {recent_location['timestamp']}")
        
        return True
    return False

def http_post_location(lat, lng, accuracy=None):
    """Fallback: send location via HTTP POST to /api/location when Socket.IO is unavailable."""
    try:
        payload = {
            'latitude': lat,
            'longitude': lng,
            'deviceId': DEVICE_ID,
            'timestamp': datetime.now().isoformat()
        }
        if accuracy is not None:
            payload['accuracy'] = accuracy
        resp = requests.post(HTTP_API_URL, json=payload, timeout=8)
        ok = 200 <= resp.status_code < 300
        ts = datetime.now().strftime("%H:%M:%S")
        if ok:
            print(f"[{ts}] 📮 HTTP POST sent ok (status {resp.status_code})")
            return True
        else:
            print(f"[{ts}] ❌ HTTP POST failed (status {resp.status_code}): {resp.text[:120]}")
            return False
    except Exception as e:
        ts = datetime.now().strftime("%H:%M:%S")
        print(f"[{ts}] ❌ HTTP POST error: {e}")
        return False


def send_location_to_server(lat, lng, accuracy=None, is_cached=False):
    """Send location data to server via Socket.IO (only if not already sending)"""
    global sending_location, last_send_time
    
    current_time = time.time()
    
    # Check if we're already sending or if we should wait
    if sending_location:
        # If it's taking too long, send from cache instead
        if (current_time - last_send_time) > send_timeout:
            timestamp = datetime.now().strftime("%H:%M:%S")
            print(f"[{timestamp}] 🕒 Current send taking too long, using cached location")
            sending_location = False  # Reset flag
            return send_cached_location()
        else:
            timestamp = datetime.now().strftime("%H:%M:%S")
            print(f"[{timestamp}] ⏳ Location send in progress, skipping...")
            return False
    
    if not is_cached:
        # Cache the location first
        location_entry = cache_location(lat, lng, accuracy)
    
    if USE_SOCKET and sio.connected and authenticated:
        sending_location = True  # Set flag to prevent multiple sends
        
        payload = {
            'latitude': lat,
            'longitude': lng
        }
        
        if accuracy:
            payload['accuracy'] = accuracy
            
        sio.emit('locationUpdate', payload)
        last_send_time = current_time
        
        # Print Google Maps link in terminal
        link = f"https://www.google.com/maps?q={lat},{lng}"
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] 📍 Location: {lat:.6f}, {lng:.6f}")
        if accuracy:
            print(f"[{timestamp}] 🎯 Accuracy: ±{accuracy:.1f}m")
        print(f"[{timestamp}] 🗺️ Maps: {link}")
        return True
    else:
        # Try HTTP fallback to REST endpoint
        ok = http_post_location(lat, lng, accuracy)
        if not ok:
            timestamp = datetime.now().strftime("%H:%M:%S")
            print(f"[{timestamp}] ⚠️ Not connected to socket - location cached only")
        return ok

# Socket.IO event handlers
@sio.event
def connect():
    global authenticated
    authenticated = False
    print("✅ Connected to server")
    # Authenticate as a device
    sio.emit('authenticate', {
        'type': 'device',
        'deviceId': DEVICE_ID
    })

@sio.event
def disconnect():
    global authenticated
    authenticated = False
    print("❌ Disconnected from server")
    print("🔄 Will attempt to reconnect...")

@sio.on('authSuccess')
def on_auth_success(data):
    global authenticated
    authenticated = True
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] 🔐 Authentication successful: {data['message']}")
    print(f"[{timestamp}] 📡 Ready to send location updates")
    
    # Send most recent cached location immediately after authentication
    if location_cache:
        print(f"[{timestamp}] 📤 Sending most recent cached location...")
        send_cached_location()
    else:
        print(f"[{timestamp}] 📭 No cached locations to send")

@sio.on('authError')
def on_auth_error(data):
    global authenticated
    authenticated = False
    print(f"🚫 Authentication failed: {data['error']}")
    print("Check your DEVICE_ID and ensure it's in the server's AUTHORIZED_DEVICES list")
    sio.disconnect()

@sio.on('locationAck')
def on_location_ack(data):
    global sending_location
    if data['success']:
        sending_location = False  # Reset flag when server confirms receipt
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] ✅ Location confirmed by server")

@sio.on('locationError')
def on_location_error(data):
    global sending_location
    sending_location = False  # Reset flag on error
    print(f"❌ Location update error: {data['error']}")

def get_demo_location():
    """Generate demo location data for testing"""
    import random
    
    # Demo coordinates (New York City area with some variation)
    base_coords = [
        (40.7128, -74.0060),  # NYC
        (40.7580, -73.9855),  # Times Square
        (40.6892, -74.0445),  # Statue of Liberty
        (40.7614, -73.9776),  # Central Park
        (40.7505, -73.9934),  # Empire State Building
    ]
    
    # Pick a random base and add small variation
    base_lat, base_lng = random.choice(base_coords)
    lat = base_lat + random.uniform(-0.001, 0.001)
    lng = base_lng + random.uniform(-0.001, 0.001)
    accuracy = random.uniform(3.0, 15.0)
    
    return lat, lng, accuracy

def get_gps_reading():
    """Get a single GPS reading from the serial port or demo data"""
    global gps_serial
    
    if DEMO_MODE:
        return get_demo_location()
    
    if not gps_serial:
        return None, None, None
    
    try:
        newdata = gps_serial.readline().decode('ascii', errors='replace').strip()
        
        if newdata.startswith('$GPRMC'):
            msg = pynmea2.parse(newdata)
            if msg.status == 'A':  # A = valid fix
                lat = float(msg.latitude)
                lng = float(msg.longitude)
                return lat, lng, None
                
        elif newdata.startswith('$GPGGA') or newdata.startswith('$GNGGA'):
            try:
                msg = pynmea2.parse(newdata)
                if msg.latitude and msg.longitude:
                    lat = float(msg.latitude)
                    lng = float(msg.longitude)
                    accuracy = float(msg.horizontal_dil) * 5 if msg.horizontal_dil else None
                    return lat, lng, accuracy
            except (ValueError, AttributeError):
                pass
                
    except pynmea2.ParseError:
        pass
    except serial.SerialException as e:
        print(f"❌ GPS Error: {e}")
        
    return None, None, None

def restart_self():
    """Restart this script in-place to recover from stuck states"""
    try:
        print("🔁 Restarting location tracker process to recover...")
        python = sys.executable or "/usr/bin/python3"
        os.execv(python, [python, os.path.abspath(__file__)] + sys.argv[1:])
    except Exception as e:
        print(f"❌ Failed to restart self: {e}")
        sys.exit(1)


def _socketio_base(url: str) -> str:
    """Return scheme://host:port for a given URL (strip any path like /api/...)."""
    try:
        p = urlparse(url)
        if p.scheme and p.netloc:
            return f"{p.scheme}://{p.netloc}"
    except Exception:
        pass
    return url


def ensure_connected():
    """Ensure Socket.IO client is connected; retry in a loop on failure"""
    if not USE_SOCKET:
        # Socket disabled; skip
        return
    attempt = 0
    while not sio.connected:
        delay = RECONNECT_BACKOFFS[min(attempt, len(RECONNECT_BACKOFFS)-1)]
        try:
            print(f"🔗 Connecting to server... ({SERVER_URL})")
            # Use polling transport for better compatibility
            sio.connect(SERVER_URL)
            if sio.connected:
                print("✅ Socket connected")
                return
        except Exception as e:
            print(f"⚠️ Connect failed: {e}. Retrying in {delay}s...")
        time.sleep(delay)
        attempt += 1


def main():
    global gps_serial
    
    print("=" * 60)
    print("🗺️ Enhanced GPS Location Tracker with Caching")
    print("=" * 60)
    print(f"Device ID: {DEVICE_ID}")
    print(f"Server URL: {SERVER_URL}")
    print(f"HTTP API: {HTTP_API_URL}")
    print(f"GPS Port: {GPS_PORT}")
    print(f"Demo Mode: {DEMO_MODE}")
    print(f"Cache Size: {LOCATION_CACHE_SIZE} locations")
    print("-" * 60)
    
    try:
        # Ensure server connection (with retries) if using socket mode
        ensure_connected()
        
        # Initialize GPS connection (skip if in demo mode)
        if not DEMO_MODE:
            print(f"🛰️ Connecting to GPS on {GPS_PORT}...")
            gps_serial = serial.Serial(GPS_PORT, baudrate=GPS_BAUDRATE, timeout=1)
            print("✅ GPS connection established")
            print("⏳ Waiting for GPS fix... (may take a few minutes)")
        else:
            print("🎭 Demo mode enabled - using simulated GPS data")
        
        consecutive_failures = 0
        max_failures = 10
        last_location_time = 0
        last_any_read_time = time.time()  # time of last any NMEA line parsed (even if invalid)
        
        while True:
            try:
                current_time = time.time()
                
                # Get GPS reading
                lat, lng, accuracy = get_gps_reading()
                if lat is not None or lng is not None:
                    last_any_read_time = current_time
                
                if lat and lng:
                    # Send to server and cache
                    success = send_location_to_server(lat, lng, accuracy)
                    
                    if success:
                        consecutive_failures = 0
                        last_location_time = current_time
                        
                        # If single fix mode
                        if SINGLE_FIX:
                            print("📱 Single fix mode - stopping after first valid location")
                            break
                    else:
                        # Still cache even if server send failed
                        consecutive_failures += 1
                        
                # Ensure socket stays connected
                if USE_SOCKET and not sio.connected:
                    ensure_connected()

                # Check for reconnection and immediate location update
                if sio.connected and authenticated and (current_time - last_location_time) > 1:
                    # Try to get fresh GPS reading for immediate update after reconnection
                    fresh_lat, fresh_lng, fresh_accuracy = get_gps_reading()
                    if fresh_lat and fresh_lng:
                        send_location_to_server(fresh_lat, fresh_lng, fresh_accuracy)
                        last_location_time = current_time
                        
            except Exception as e:
                print(f"❌ Error in main loop: {e}")
                consecutive_failures += 1
                
            # Restart if too many consecutive failures
            if consecutive_failures >= max_failures:
                print(f"❌ Too many consecutive failures ({consecutive_failures}). Restarting...")
                restart_self()
                
            # Restart if no valid GPS fix for too long
            if not SINGLE_FIX and last_location_time and (time.time() - last_location_time) > NO_FIX_RESTART_SECONDS:
                print(f"⏱️ No valid GPS fix for {int(time.time() - last_location_time)}s (threshold {NO_FIX_RESTART_SECONDS}s) - restarting...")
                restart_self()

            # Wait before next reading (if not single fix mode)
            if not SINGLE_FIX and UPDATE_INTERVAL > 0:
                time.sleep(UPDATE_INTERVAL)
            elif not SINGLE_FIX:
                time.sleep(1)  # Default 1 second
                
    except KeyboardInterrupt:
        print("\n🛑 Stopped by user")
    except serial.SerialException as e:
        print(f"❌ Cannot connect to GPS on {GPS_PORT}: {e}")
        print("Check your GPS module connection and port settings")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
    finally:
        try:
            if gps_serial:
                gps_serial.close()
                print("📡 GPS connection closed")
        except:
            pass
        
        try:
            # Avoid closing if we plan to restart; let execv replace the process
            if USE_SOCKET and sio.connected:
                sio.disconnect()
                print("📱 Socket.IO connection closed")
        except:
            pass
            
        print("🏁 Location tracking stopped")
        
        # Print cache summary
        if location_cache:
            print(f"📊 Cache Summary: {len(location_cache)} locations stored")
            print("🕒 Most recent cached locations:")
            for i, loc in enumerate(list(location_cache)[-3:], 1):  # Show last 3
                print(f"   {i}. {loc['latitude']:.6f}, {loc['longitude']:.6f} @ {loc['timestamp']}")

def print_cache_status():
    """Print current cache status (can be called for debugging)"""
    if location_cache:
        print(f"📊 Cache: {len(location_cache)}/{LOCATION_CACHE_SIZE} locations")
        recent = location_cache[-1]
        print(f"🕒 Most recent: {recent['latitude']:.6f}, {recent['longitude']:.6f} @ {recent['timestamp']}")
    else:
        print("📭 Cache is empty")

if __name__ == "__main__":
    # Handle command line arguments
    if len(sys.argv) > 1:
        if sys.argv[1].lower() == 'demo':
            DEMO_MODE = True
            print("Demo mode enabled via command line")
        else:
            SERVER_URL = sys.argv[1]
            HTTP_API_URL = SERVER_URL + "/api/location"
            print(f"Using server URL: {SERVER_URL}")
    
    if len(sys.argv) > 2:
        DEVICE_ID = sys.argv[2]
        print(f"Using device ID: {DEVICE_ID}")
        
    if len(sys.argv) > 3:
        arg3 = sys.argv[3].lower()
        if arg3 in ['demo', 'test']:
            DEMO_MODE = True
            print("Demo mode enabled via command line")
        elif arg3 in ['true', '1', 'yes', 'single']:
            SINGLE_FIX = True
            print(f"Single fix mode: {SINGLE_FIX}")
    
    if len(sys.argv) > 4:
        LOCATION_CACHE_SIZE = min(int(sys.argv[4]), 5)  # Maximum 5 locations
        location_cache = deque(maxlen=LOCATION_CACHE_SIZE)
        print(f"Cache size: {LOCATION_CACHE_SIZE} (max 5)")
    
    main()
