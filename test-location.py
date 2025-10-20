#!/usr/bin/env python3
"""
Simple Location Tracker Test Script
Tests connection to the /tracker endpoint using both Socket.IO and HTTP API
"""

import socketio
import requests
import time
import random
from datetime import datetime

# Configuration
SERVER_URL = "https://location-tracker-app-waa4.onrender.com"
DEVICE_ID = "raspi-001"
HTTP_API_URL = SERVER_URL + "/api/location"

def test_http_api():
    """Test HTTP API endpoint"""
    print("\n=== Testing HTTP API ===")
    
    # Generate demo location
    lat = 40.7128 + random.uniform(-0.001, 0.001)
    lng = -74.0060 + random.uniform(-0.001, 0.001)
    accuracy = random.uniform(3.0, 15.0)
    
    payload = {
        'latitude': lat,
        'longitude': lng,
        'deviceId': DEVICE_ID,
        'accuracy': accuracy,
        'timestamp': datetime.now().isoformat()
    }
    
    try:
        print(f"Sending to: {HTTP_API_URL}")
        print(f"Payload: {payload}")
        
        response = requests.post(HTTP_API_URL, json=payload, timeout=10)
        
        if response.status_code == 200:
            print("✅ HTTP API test successful!")
            print(f"Response: {response.json()}")
            return True
        else:
            print(f"❌ HTTP API test failed: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ HTTP API error: {e}")
        return False

def test_socketio():
    """Test Socket.IO connection"""
    print("\n=== Testing Socket.IO ===")
    
    sio = socketio.Client()
    success = False
    
    @sio.event
    def connect():
        print("✅ Socket.IO connected!")
        # Authenticate
        sio.emit('authenticate', {
            'type': 'device',
            'deviceId': DEVICE_ID
        })
    
    @sio.event
    def disconnect():
        print("❌ Socket.IO disconnected")
    
    @sio.on('authSuccess')
    def on_auth_success(data):
        nonlocal success
        print(f"✅ Authentication successful: {data}")
        
        # Send test location
        lat = 40.7128 + random.uniform(-0.001, 0.001)
        lng = -74.0060 + random.uniform(-0.001, 0.001)
        accuracy = random.uniform(3.0, 15.0)
        
        payload = {
            'latitude': lat,
            'longitude': lng,
            'accuracy': accuracy
        }
        
        print(f"📡 Sending location: {payload}")
        sio.emit('locationUpdate', payload)
        success = True
    
    @sio.on('authError')
    def on_auth_error(data):
        print(f"❌ Authentication failed: {data}")
    
    @sio.on('locationAck')
    def on_location_ack(data):
        print(f"✅ Location acknowledged: {data}")
        sio.disconnect()
    
    @sio.on('locationError')
    def on_location_error(data):
        print(f"❌ Location error: {data}")
        sio.disconnect()
    
    try:
        print(f"Connecting to: {SERVER_URL}")
        sio.connect(SERVER_URL)
        
        # Wait for response
        time.sleep(5)
        
        if sio.connected:
            sio.disconnect()
        
        return success
        
    except Exception as e:
        print(f"❌ Socket.IO error: {e}")
        return False

def main():
    print("🧪 Location Tracker Connection Test")
    print("=" * 50)
    print(f"Server: {SERVER_URL}")
    print(f"Device ID: {DEVICE_ID}")
    print("=" * 50)
    
    # Test HTTP API
    http_success = test_http_api()
    
    # Wait a bit
    time.sleep(2)
    
    # Test Socket.IO
    socketio_success = test_socketio()
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 TEST SUMMARY")
    print("=" * 50)
    print(f"HTTP API: {'✅ PASS' if http_success else '❌ FAIL'}")
    print(f"Socket.IO: {'✅ PASS' if socketio_success else '❌ FAIL'}")
    
    if http_success and socketio_success:
        print("\n🎉 All tests passed! Your setup is working correctly.")
        print("You can now run locationtomap.py safely.")
    else:
        print("\n⚠️  Some tests failed. Please check:")
        print("1. Server is running on http://localhost:3000")
        print("2. Device ID 'raspi-001' is in AUTHORIZED_DEVICES")
        print("3. No firewall blocking the connection")

if __name__ == "__main__":
    main()