#!/usr/bin/env python3
"""Debug script to examine user config structure"""

import requests
import json

def debug_user_config():
    server_url = "https://location-tracker-app-waa4.onrender.com"
    
    # Login
    login_data = {
        'deviceId': 'raspi-001',
        'password': 'Bag@123'
    }
    
    session = requests.Session()
    
    print("🔐 Logging in...")
    login_response = session.post(f"{server_url}/api/login", json=login_data)
    
    if login_response.status_code != 200:
        print(f"❌ Login failed: {login_response.status_code}")
        return
        
    print("✅ Login successful")
    
    # Get user config
    print("\n📋 Getting user config...")
    config_response = session.get(f"{server_url}/api/user-config")
    
    if config_response.status_code != 200:
        print(f"❌ Config request failed: {config_response.status_code}")
        return
        
    config = config_response.json()
    
    print("✅ Config retrieved")
    print("\n🔍 PDF Info Structure:")
    if config.get('qrPdf'):
        print(json.dumps(config['qrPdf'], indent=2))
    else:
        print("No qrPdf found")
        
    print(f"\n📊 QR Codes Count: {len(config.get('qrCodes', []))}")
    
    if config.get('qrCodes'):
        print("\n🏷️ Sample QR Code Structure:")
        print(json.dumps(config['qrCodes'][0], indent=2))
        
    print("\n🔍 Full Config Keys:", list(config.keys()))

if __name__ == "__main__":
    debug_user_config()