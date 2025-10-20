#!/usr/bin/env python3
"""
Weekly Smart Bag: CSV + QR + PDF with Socket.IO Upload
Generates QR codes for weekly bag items and sends PDF to server

Requirements:
- pip install pandas qrcode reportlab python-socketio pillow
"""

import os
import math
import qrcode
import pandas as pd
import base64
import socketio
import time
from datetime import datetime
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from PIL import Image
import io

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# Socket.IO Configuration
SERVER_URL = "https://location-tracker-app-waa4.onrender.com"
DEVICE_ID = "raspi-001"  # Change to your device ID

# QR Code Configuration
QR_SIZE_MULTIPLIER = 1.5  # Increase QR code size by 50%
QR_BORDER_SIZE = 4  # Border around QR codes

def get_items_by_day():
    week_items = {}
    for day in DAYS:
        print(f"\nEnter items for {day} (enter 0 to move to next day):")
        day_items = []
        while True:
            item = input(f"{day} Item: ").strip()
            if item == "0":
                break
            if item:
                day_items.append(item)
        week_items[day] = day_items
    return week_items

def save_to_csv(week_items):
    rows = []
    for day, items in week_items.items():
        for item in items:
            rows.append({"Day": day, "Item": item})
    df = pd.DataFrame(rows)
    filename = "smart_bag.csv"
    df.to_csv(filename, index=False)
    print(f"[✔] Saved items to {filename}")
    return filename

def generate_qr_codes(week_items):
    """Generate QR codes with larger sizes and return both file paths and base64 data"""
    qr_dir = "smart_bag_qr"
    os.makedirs(qr_dir, exist_ok=True)
    qr_files = {}
    qr_data_list = []  # For Socket.IO transmission
    
    # Create QR code generator with larger size
    qr_generator = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=int(10 * QR_SIZE_MULTIPLIER),  # Larger box size
        border=QR_BORDER_SIZE,
    )
    
    for day, items in week_items.items():
        qr_files[day] = []
        for i, item in enumerate(items, 1):
            qr_text = f"{day}:{item}"   # encode both day & item
            
            # Generate QR code
            qr_generator.clear()
            qr_generator.add_data(qr_text)
            qr_generator.make(fit=True)
            
            # Create QR code image
            qr_img = qr_generator.make_image(fill_color="black", back_color="white")
            
            # Save to file
            qr_filename = f"{day}_{item.replace(' ', '_')}.png"
            qr_file = os.path.join(qr_dir, qr_filename)
            qr_img.save(qr_file)
            
            # Convert to base64 for Socket.IO transmission
            img_buffer = io.BytesIO()
            qr_img.save(img_buffer, format='PNG')
            img_buffer.seek(0)
            qr_base64 = base64.b64encode(img_buffer.read()).decode('utf-8')
            
            # Store file info
            qr_files[day].append((item, qr_file))
            
            # Store data for transmission
            qr_data_list.append({
                'filename': qr_filename,
                'label': f"{day}: {item}",
                'imageData': qr_base64
            })
            
    print(f"[✔] QR codes saved in folder: {qr_dir} (larger size: {QR_SIZE_MULTIPLIER}x)")
    return qr_files, qr_data_list

def make_pdf(qr_files):
    pdf_file = "smart_bag_qr.pdf"
    c = canvas.Canvas(pdf_file, pagesize=landscape(A4))
    page_w, page_h = landscape(A4)

    margin_left = 15 * mm
    margin_top = 18 * mm
    margin_bottom = 12 * mm
    day_col_w = 30 * mm
    label_area = 7 * mm
    padding_cell = 6 * mm

    available_w = page_w - margin_left - margin_left - day_col_w
    available_h = page_h - margin_top - margin_bottom
    row_h = available_h / len(DAYS)

    qr_size = min(int(45 * mm * QR_SIZE_MULTIPLIER), row_h - label_area - 2 * padding_cell)
    cols_per_page = 3
    cell_w = available_w / cols_per_page

    max_items = max((len(v) for v in qr_files.values()), default=0)
    horizontal_pages = max(1, math.ceil(max_items / cols_per_page))

    for hp in range(horizontal_pages):
        c.setFont("Helvetica-Bold", 14)
        c.drawCentredString(page_w / 2, page_h - margin_top / 2, f"Smart Bag QR Codes (Page {hp+1}/{horizontal_pages})")

        for r, day in enumerate(DAYS):
            y_top = page_h - margin_top - r * row_h
            cell_bottom = y_top - row_h
            c.setFont("Helvetica-Bold", 9)
            c.drawCentredString(margin_left + day_col_w / 2, cell_bottom + row_h / 2, day)

            items = qr_files.get(day, [])
            start_col = hp * cols_per_page
            for col_offset in range(cols_per_page):
                col_index = start_col + col_offset
                cell_x = margin_left + day_col_w + col_offset * cell_w
                c.rect(cell_x, cell_bottom, cell_w, row_h, stroke=1, fill=0)
                if col_index < len(items):
                    item, qr_path = items[col_index]
                    qr_x = cell_x + (cell_w - qr_size) / 2
                    qr_y = cell_bottom + (row_h - qr_size) / 2
                    c.drawImage(qr_path, qr_x, qr_y, width=qr_size, height=qr_size)
                    c.setFont("Helvetica", 7)
                    c.drawCentredString(cell_x + cell_w / 2, cell_bottom + 5, item)

        c.showPage()

    c.save()
    print(f"[✔] PDF generated: {pdf_file}")
    return pdf_file

def send_pdf_to_server(pdf_file, qr_data_list):
    """Send PDF and QR data to server via Socket.IO"""
    try:
        # Initialize Socket.IO client
        sio = socketio.Client(reconnection=True, reconnection_attempts=5)
        
        upload_success = False
        error_message = None
        
        @sio.event
        def connect():
            print(f"[✔] Connected to server at {SERVER_URL}")
            # Authenticate with device ID
            sio.emit('authenticate', {
                'type': 'device',
                'deviceId': DEVICE_ID
            })
        
        @sio.event
        def disconnect():
            print("[!] Disconnected from server")
        
        @sio.on('authSuccess')
        def on_auth_success(data):
            print(f"[✔] Device authenticated: {data}")
            upload_pdf_and_qr_data()
        
        @sio.on('authError')
        def on_auth_error(data):
            nonlocal error_message
            error_message = f"Authentication failed: {data}"
            print(f"[✗] {error_message}")
            sio.disconnect()
        
        @sio.on('qrPdfUploadAck')
        def on_qr_pdf_upload_ack(data):
            nonlocal upload_success
            upload_success = True
            print(f"[✔] PDF upload acknowledged: {data}")
            sio.disconnect()
        
        @sio.on('qrPdfUploadError')
        def on_qr_pdf_upload_error(data):
            nonlocal error_message
            error_message = f"PDF upload error: {data}"
            print(f"[✗] {error_message}")
            sio.disconnect()
        
        def upload_pdf_and_qr_data():
            try:
                # Read PDF and encode as base64
                with open(pdf_file, "rb") as pdf_file_obj:
                    pdf_base64 = base64.b64encode(pdf_file_obj.read()).decode('utf-8')
                
                # Prepare upload data
                upload_data = {
                    'filename': os.path.basename(pdf_file),
                    'pdfData': pdf_base64,
                    'qrList': qr_data_list,
                    'timestamp': datetime.now().isoformat()
                }
                
                print(f"[⬆️] Uploading PDF ({len(pdf_base64)} bytes) with {len(qr_data_list)} QR codes...")
                
                # Send PDF and QR data to server
                sio.emit('qrPdfUpload', upload_data)
                
            except Exception as e:
                nonlocal error_message
                error_message = f"Error preparing upload data: {e}"
                print(f"[✗] {error_message}")
                sio.disconnect()
        
        # Connect to server
        print(f"[⬆️] Connecting to server at {SERVER_URL}...")
        sio.connect(SERVER_URL)
        
        # Wait for upload to complete (with timeout)
        timeout = 30  # 30 seconds
        start_time = time.time()
        while sio.connected and (time.time() - start_time) < timeout and not upload_success and not error_message:
            time.sleep(0.1)
        
        if sio.connected:
            sio.disconnect()
            
        if upload_success:
            print("[✔] PDF successfully sent to server!")
            print(f"Visit {SERVER_URL}/configure to view and download the PDF")
            return True
        else:
            print(f"[✗] Failed to upload PDF: {error_message or 'Timeout or unknown error'}")
            return False
            
    except Exception as e:
        print(f"[✗] Socket.IO error: {e}")
        return False

def main():
    print("=" * 60)
    print("🎒 Enhanced Smart Bag QR Code Generator with Socket.IO Upload")
    print("=" * 60)
    print(f"Server URL: {SERVER_URL}")
    print(f"Device ID: {DEVICE_ID}")
    print(f"QR Size Multiplier: {QR_SIZE_MULTIPLIER}x")
    print("-" * 60)
    
    week_items = get_items_by_day()
    if not any(week_items.values()):
        print("No items entered. Exiting.")
        return

    # Generate files
    save_to_csv(week_items)
    qr_files, qr_data_list = generate_qr_codes(week_items)
    pdf_file = make_pdf(qr_files)
    
    # Automatically upload to server
    print("\n=== Uploading to Server ===")
    success = send_pdf_to_server(pdf_file, qr_data_list)
    if success:
        print("[✔] Upload completed successfully!")
    else:
        print("[✗] Upload failed. Check server connection and device authorization.")
    
    print(f"\n=== Summary ===")
    print(f"• CSV file: smart_bag.csv")
    print(f"• QR codes: smart_bag_qr/ folder")
    print(f"• PDF file: {pdf_file}")
    print(f"• Total QR codes: {len(qr_data_list)}")
    print(f"• QR code size: {QR_SIZE_MULTIPLIER}x larger than default")

if __name__ == "__main__":
    import sys
    
    # Handle command line arguments
    if len(sys.argv) > 1:
        if sys.argv[1] != "--help":
            SERVER_URL = sys.argv[1]
            print(f"Using server URL: {SERVER_URL}")
    
    if len(sys.argv) > 2:
        DEVICE_ID = sys.argv[2]
        print(f"Using device ID: {DEVICE_ID}")
    
    if len(sys.argv) > 3:
        try:
            QR_SIZE_MULTIPLIER = float(sys.argv[3])
            print(f"Using QR size multiplier: {QR_SIZE_MULTIPLIER}x")
        except ValueError:
            print("Invalid QR size multiplier, using default.")
    
    # Show help
    if len(sys.argv) > 1 and sys.argv[1] == "--help":
        print("Usage: python3 configure-bag-items.py [SERVER_URL] [DEVICE_ID] [QR_SIZE_MULTIPLIER]")
        print("")
        print("Arguments:")
        print("  SERVER_URL         : Server URL (default: https://location-tracker-app-waa4.onrender.com)")
        print("  DEVICE_ID          : Device ID (default: raspi-001)")
        print("  QR_SIZE_MULTIPLIER : QR code size multiplier (default: 1.5)")
        print("")
        print("Examples:")
        print("  python3 configure-bag-items.py")
        print("  python3 configure-bag-items.py http://localhost:3000 raspi-002")
        print("  python3 configure-bag-items.py http://localhost:3000 raspi-001 2.0")
        sys.exit(0)
    
    main()
