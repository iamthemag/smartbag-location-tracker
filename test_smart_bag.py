#!/usr/bin/env python3
"""
Test script for Smart Bag Generator - creates sample data without user input
"""

import os
import math
import qrcode
import pandas as pd
import base64
from datetime import datetime
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
import socketio
import time
from PIL import Image
import io

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# Socket.IO configuration
SERVER_URL = "http://localhost:3000"  # Update with your server URL
DEVICE_ID = "pi-001"  # Update with your Pi device ID

def get_sample_items():
    """Generate sample weekly items for testing"""
    sample_items = {
        "Monday": ["Laptop", "Phone Charger", "Work Badge"],
        "Tuesday": ["Gym Clothes", "Water Bottle", "Protein Bar"],
        "Wednesday": ["Meeting Notes", "Presentation Slides", "Coffee Mug"],
        "Thursday": ["Headphones", "Power Bank", "Snacks"],
        "Friday": ["Weekend Plans", "Car Keys", "Sunglasses"],
        "Saturday": ["Shopping List", "Reusable Bags", "Wallet"],
        "Sunday": ["Book", "Journal", "Pens"]
    }
    return sample_items

def save_to_csv(week_items):
    rows = []
    for day, items in week_items.items():
        for item in items:
            rows.append({"Day": day, "Item": item})
    df = pd.DataFrame(rows)
    filename = "smart_bag_test.csv"
    df.to_csv(filename, index=False)
    print(f"[✔] Saved items to {filename}")
    return filename

def generate_qr_codes(week_items):
    qr_dir = "smart_bag_qr_test"
    os.makedirs(qr_dir, exist_ok=True)
    qr_files = {}
    qr_data_list = []
    
    for day, items in week_items.items():
        qr_files[day] = []
        for i, item in enumerate(items, 1):
            qr_text = f"{day}:{item}"   # encode both day & item
            qr = qrcode.make(qr_text)
            qr_file = os.path.join(qr_dir, f"{day}_{item.replace(' ', '_')}.png")
            qr.save(qr_file)
            qr_files[day].append((item, qr_file))
            
            # Convert QR code to base64 for socket transmission
            with open(qr_file, "rb") as img_file:
                qr_base64 = base64.b64encode(img_file.read()).decode('utf-8')
            
            qr_data_list.append({
                'filename': f"{day}_{item.replace(' ', '_')}.png",
                'label': f"{day}: {item}",
                'imageData': qr_base64
            })
    
    print(f"[✔] QR codes saved in folder: {qr_dir}")
    return qr_files, qr_data_list

def make_pdf(qr_files):
    pdf_file = "smart_bag_qr_test.pdf"
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

    qr_size = min(45 * mm, row_h - label_area - 2 * padding_cell)
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

def send_to_server(pdf_file, qr_data_list):
    """Send PDF and QR data to server via Socket.IO"""
    try:
        # Initialize Socket.IO client
        sio = socketio.Client(reconnection=True, reconnection_attempts=5)
        
        upload_completed = False
        
        @sio.event
        def connect():
            print(f"[✔] Connected to server at {SERVER_URL}")
            # Authenticate with device ID
            sio.emit('deviceAuth', {'deviceId': DEVICE_ID})
        
        @sio.event
        def disconnect():
            print("[!] Disconnected from server")
        
        @sio.event
        def deviceAuthSuccess(data):
            print(f"[✔] Device authenticated: {data}")
            upload_pdf_and_qr_data()
        
        @sio.event
        def deviceAuthError(data):
            print(f"[✗] Device authentication failed: {data}")
            nonlocal upload_completed
            upload_completed = True
        
        @sio.event
        def qrPdfUploadAck(data):
            print(f"[✔] PDF upload acknowledged: {data}")
            nonlocal upload_completed
            upload_completed = True
        
        @sio.event
        def qrPdfUploadError(data):
            print(f"[✗] PDF upload error: {data}")
            nonlocal upload_completed
            upload_completed = True
        
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
                
                print(f"[⬆] Uploading PDF ({len(pdf_base64)} bytes) with {len(qr_data_list)} QR codes...")
                
                # Send PDF and QR data to server
                sio.emit('qrPdfUpload', upload_data)
                
            except Exception as e:
                print(f"[✗] Error preparing upload data: {e}")
                nonlocal upload_completed
                upload_completed = True
        
        # Connect to server
        print(f"[⬆] Connecting to server at {SERVER_URL}...")
        sio.connect(SERVER_URL)
        
        # Wait for upload to complete (with timeout)
        timeout = 30  # 30 seconds
        start_time = time.time()
        while not upload_completed and (time.time() - start_time) < timeout:
            time.sleep(0.1)
        
        sio.disconnect()
        return upload_completed
            
    except Exception as e:
        print(f"[✗] Socket.IO error: {e}")
        return False

def main():
    print("=== Smart Bag QR Code Generator (Test Mode) ===")
    
    # Use sample data instead of user input
    week_items = get_sample_items()
    
    # Generate CSV, QR codes, and PDF
    save_to_csv(week_items)
    qr_files, qr_data_list = generate_qr_codes(week_items)
    pdf_file = make_pdf(qr_files)
    
    print(f"\n=== Local Files Created ===")
    print(f"• CSV file: smart_bag_test.csv")
    print(f"• QR codes: smart_bag_qr_test/ folder")
    print(f"• PDF file: {pdf_file}")
    print(f"• Total QR codes: {len(qr_data_list)}")
    
    # Ask user if they want to upload to server
    upload_choice = input("\nDo you want to upload the PDF and QR data to the server? (y/n): ").strip().lower()
    
    if upload_choice in ['y', 'yes']:
        print("\n=== Uploading to Server ===")
        success = send_to_server(pdf_file, qr_data_list)
        if success:
            print("[✔] Upload completed successfully!")
            print("Now check your web interface to see the PDF download option!")
        else:
            print("[✗] Upload failed. Check server connection and ensure server is running.")
    else:
        print("[!] Skipping server upload.")
    
    print("\n=== Test Completed ===")

if __name__ == "__main__":
    main()