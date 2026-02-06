#!/usr/bin/env python3
"""
Raspberry Pi Emergency Switch Sender

- Wiring:
- Connect one side of the switch to a GPIO pin (default 16).
- Connect the other side to GND.
- This script uses the internal pull-up resistor (so pin is HIGH when open, LOW when closed).

Behavior:
- When the switch is turned ON (closed -> pin pulled to GND), the script sends an "emergency" signal to the server.
- When the switch is turned OFF (opened -> pin released -> pulled HIGH), the script sends an "clearEmergency" signal.

Usage:
  sudo python3 raspberry-pi-emergency-switch.py [SERVER_URL] [DEVICE_ID] [GPIO_PIN]

Examples:
  sudo python3 raspberry-pi-emergency-switch.py http://your-server:3000 raspi-001 17

Notes:
- Requires `python-socketio` and `requests`.
  pip install python-socketio requests
- Must run with root (or use gpio group) to access GPIO on Raspberry Pi.
- If RPi.GPIO is not available (running on non-RPi), the script falls back to a keyboard demo mode where you can type `on`/`off` to simulate the switch.
"""

import sys
import time
import socketio
import requests
import threading
from datetime import datetime

# Try to import RPi.GPIO; if not available, we'll simulate
try:
    import RPi.GPIO as GPIO
    GPIO_AVAILABLE = True
except Exception:
    GPIO_AVAILABLE = False

# Configuration
SERVER_URL = sys.argv[1] if len(sys.argv) > 1 else "https://location-tracker-app-waa4.onrender.com/"
DEVICE_ID = sys.argv[2] if len(sys.argv) > 2 else "raspi-001"
SWITCH_PIN = int(sys.argv[3]) if len(sys.argv) > 3 else 16
PULL_UP = True  # We assume switch connects pin to GND when closed
DEBOUNCE_MS = 300
HTTP_FALLBACK = True  # Use HTTP if socket isn't connected

sio = socketio.Client(reconnection=True, reconnection_attempts=0)
last_event_time = 0


def log(*args):
    print("[switch]", *args)


@sio.event
def connect():
    log("Connected to server via Socket.IO")
    sio.emit('authenticate', { 'type': 'device', 'deviceId': DEVICE_ID })


@sio.on('authSuccess')
def on_auth_success(data):
    log('Authentication successful')


@sio.on('authError')
def on_auth_error(data):
    log('Authentication failed:', data)


@sio.event
def disconnect():
    log("Disconnected from server")


def send_emergency_via_socket(message=None):
    try:
        payload = { 'message': message or 'Emergency from switch', 'latitude': None, 'longitude': None }
        sio.emit('emergency', payload)
        log('Sent emergency via socket')
    except Exception as e:
        log('Socket emergency send error:', e)


def send_clear_via_socket():
    try:
        sio.emit('clearEmergency')
        log('Sent clearEmergency via socket')
    except Exception as e:
        log('Socket clear send error:', e)


# HTTP fallback helpers

def send_emergency_via_http(message=None):
    try:
        url = SERVER_URL.rstrip('/') + '/api/emergency'
        resp = requests.post(url, json={ 'deviceId': DEVICE_ID, 'message': message or 'Emergency from switch' }, timeout=5)
        log('HTTP emergency response:', resp.status_code, resp.text)
    except Exception as e:
        log('HTTP emergency send error:', e)


def send_clear_via_http():
    try:
        url = SERVER_URL.rstrip('/') + '/api/clear-emergency'
        resp = requests.post(url, json={ 'deviceId': DEVICE_ID }, timeout=5)
        log('HTTP clear response:', resp.status_code, resp.text)
    except Exception as e:
        log('HTTP clear send error:', e)


# High-level senders that try socket first, then HTTP fallback

def send_emergency(message=None):
    if sio.connected:
        send_emergency_via_socket(message)
    elif HTTP_FALLBACK:
        send_emergency_via_http(message)
    else:
        log('No connection available to send emergency')


def send_clear():
    if sio.connected:
        send_clear_via_socket()
    elif HTTP_FALLBACK:
        send_clear_via_http()
    else:
        log('No connection available to send clear')


# GPIO handler

def gpio_callback(channel):
    global last_event_time
    now = int(time.time() * 1000)
    if now - last_event_time < DEBOUNCE_MS:
        return
    last_event_time = now

    state = GPIO.input(SWITCH_PIN) if GPIO_AVAILABLE else None
    # For pull-up config: closed switch => LOW (0)
    is_active = False
    if GPIO_AVAILABLE:
        if PULL_UP:
            is_active = (state == GPIO.LOW)
        else:
            is_active = (state == GPIO.HIGH)
    else:
        # Shouldn't happen in GPIO mode
        pass

    if is_active:
        log('Switch ON detected -> sending emergency')
        send_emergency('Switch pressed')
    else:
        log('Switch OFF detected -> sending clear')
        send_clear()


# Keyboard/demo loop for non-RPi environments

def demo_loop():
    log('Running in demo mode (no GPIO). Type "on" or "off" and press Enter to simulate the switch.')
    try:
        while True:
            cmd = input('> ').strip().lower()
            if cmd in ('on', '1'):
                log('Simulating ON')
                send_emergency('Demo: ON')
            elif cmd in ('off', '0'):
                log('Simulating OFF')
                send_clear()
            elif cmd in ('quit', 'exit'):
                break
    except (KeyboardInterrupt, EOFError):
        log('Demo loop stopped')


def main():
    log('Starting emergency switch client')
    log('Server URL:', SERVER_URL, 'Device ID:', DEVICE_ID, 'Switch pin:', SWITCH_PIN)

    # Connect socket client in background thread
    try:
        sio.connect(SERVER_URL)
    except Exception as e:
        log('Socket connect error (will use HTTP fallback if configured):', e)

    if GPIO_AVAILABLE:
        log('RPi.GPIO available - initializing pin')
        GPIO.setmode(GPIO.BCM)
        if PULL_UP:
            pull = GPIO.PUD_UP
        else:
            pull = GPIO.PUD_DOWN
        GPIO.setup(SWITCH_PIN, GPIO.IN, pull_up_down=pull)

        # Add event detection for both rising and falling edges
        GPIO.add_event_detect(SWITCH_PIN, GPIO.BOTH, callback=gpio_callback, bouncetime=DEBOUNCE_MS)

        log('Waiting for switch events. Press Ctrl+C to exit.')
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            log('Stopping...')
        finally:
            GPIO.cleanup()
            sio.disconnect()
            log('Clean exit')
    else:
        demo_loop()
        sio.disconnect()


if __name__ == '__main__':
    main()
