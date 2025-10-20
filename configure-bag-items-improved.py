#!/usr/bin/env python3
"""
Enhanced Weekly Smart Bag: CSV + QR + PDF with Socket.IO Upload
Intelligently handles items that are used on multiple days

Features:
- Detects items used on multiple days
- Creates single QR codes for shared items
- Optimizes PDF layout for better space usage
- Maintains compatibility with existing server

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
from collections import defaultdict

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# Socket.IO Configuration
SERVER_URL = "https://location-tracker-app-waa4.onrender.com"
DEVICE_ID = "raspi-001"  # Change to your device ID

# QR Code Configuration
QR_SIZE_MULTIPLIER = 1.5  # Increase QR code size by 50%
QR_BORDER_SIZE = 4  # Border around QR codes

def get_items_by_day():
    """Collect items for each day and detect duplicates"""
    week_items = {}
    print("\n📅 Enter items for each day of the week")
    print("💡 Tip: Items used on multiple days will be automatically optimized")
    
    for day in DAYS:
        print(f"\n📦 Enter items for {day} (enter '0' to move to next day):")
        day_items = []
        item_count = 1
        while True:
            item = input(f"  {item_count}. {day} Item: ").strip()
            if item == "0":
                break
            if item:
                day_items.append(item)
                item_count += 1
        week_items[day] = day_items
        print(f"    ✅ Added {len(day_items)} items for {day}")
    
    return week_items

def analyze_item_usage(week_items):
    """Analyze which items are used on multiple days"""
    item_usage = defaultdict(list)  # item -> list of days
    
    for day, items in week_items.items():
        for item in items:
            item_usage[item].append(day)
    
    # Categorize items
    unique_items = {}  # item -> single day
    shared_items = {}  # item -> list of days
    
    for item, days in item_usage.items():
        if len(days) == 1:
            unique_items[item] = days[0]
        else:
            shared_items[item] = days
    
    return unique_items, shared_items

def print_item_analysis(unique_items, shared_items):
    """Print analysis of item usage patterns"""
    print("\n📊 Item Usage Analysis:")
    print("-" * 50)
    
    if shared_items:
        print("🔄 Items used on multiple days:")
        for item, days in shared_items.items():
            days_str = ", ".join(days)
            print(f"  • {item} → {days_str}")
    
    print(f"\n📈 Summary:")
    print(f"  • Unique items: {len(unique_items)}")
    print(f"  • Shared items: {len(shared_items)}")
    print(f"  • Total unique QR codes needed: {len(unique_items) + len(shared_items)}")
    
    return len(unique_items) + len(shared_items)

def save_to_csv(week_items, unique_items, shared_items):
    """Save items to CSV with usage pattern information"""
    rows = []
    
    # Add unique items
    for item, day in unique_items.items():
        rows.append({
            "Item": item,
            "Days": day,
            "Usage_Type": "Single Day",
            "QR_Code_Type": "Day-specific"
        })
    
    # Add shared items
    for item, days in shared_items.items():
        days_str = ", ".join(days)
        rows.append({
            "Item": item,
            "Days": days_str,
            "Usage_Type": "Multi-Day",
            "QR_Code_Type": "Shared"
        })
    
    df = pd.DataFrame(rows)
    filename = "smart_bag_enhanced.csv"
    df.to_csv(filename, index=False)
    print(f"[✔] Enhanced CSV saved: {filename}")
    return filename

def generate_optimized_qr_codes(unique_items, shared_items):
    """Generate QR codes with optimized approach for shared items"""
    qr_dir = "smart_bag_qr_optimized"
    os.makedirs(qr_dir, exist_ok=True)
    
    qr_files = {}
    qr_data_list = []
    
    # Create QR code generator with larger size
    qr_generator = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=int(10 * QR_SIZE_MULTIPLIER),
        border=QR_BORDER_SIZE,
    )
    
    print(f"\n🔧 Generating optimized QR codes...")
    
    # Generate QR codes for unique items (day-specific)
    for item, day in unique_items.items():
        qr_text = f"{day}:{item}"
        qr_filename = f"{day}_{item.replace(' ', '_')}.png"
        
        qr_generator.clear()
        qr_generator.add_data(qr_text)
        qr_generator.make(fit=True)
        
        qr_img = qr_generator.make_image(fill_color="black", back_color="white")
        qr_file = os.path.join(qr_dir, qr_filename)
        qr_img.save(qr_file)
        
        # Convert to base64
        img_buffer = io.BytesIO()
        qr_img.save(img_buffer, format='PNG')
        img_buffer.seek(0)
        qr_base64 = base64.b64encode(img_buffer.read()).decode('utf-8')
        
        # Store for day
        if day not in qr_files:
            qr_files[day] = []
        qr_files[day].append((item, qr_file, "unique"))
        
        qr_data_list.append({
            'filename': qr_filename,
            'label': f"{day}: {item}",
            'imageData': qr_base64
        })
    
    # Generate QR codes for shared items (generic)
    shared_qr_files = {}  # item -> qr_file for shared items
    
    for item, days in shared_items.items():
        # For shared items, use a generic QR code without day prefix
        qr_text = f"SHARED:{item}"  # Generic QR code for shared items
        qr_filename = f"SHARED_{item.replace(' ', '_')}.png"
        
        qr_generator.clear()
        qr_generator.add_data(qr_text)
        qr_generator.make(fit=True)
        
        qr_img = qr_generator.make_image(fill_color="black", back_color="white")
        qr_file = os.path.join(qr_dir, qr_filename)
        qr_img.save(qr_file)
        
        # Convert to base64
        img_buffer = io.BytesIO()
        qr_img.save(img_buffer, format='PNG')
        img_buffer.seek(0)
        qr_base64 = base64.b64encode(img_buffer.read()).decode('utf-8')
        
        shared_qr_files[item] = qr_file
        
        # Add to each day where this item is used
        for day in days:
            if day not in qr_files:
                qr_files[day] = []
            qr_files[day].append((item, qr_file, "shared"))
        
        # Create label showing all days
        days_str = " + ".join(days)
        qr_data_list.append({
            'filename': qr_filename,
            'label': f"Multi-day: {item} ({days_str})",
            'imageData': qr_base64
        })
    
    print(f"[✔] Optimized QR codes saved in folder: {qr_dir}")
    print(f"    • Unique QR codes: {len(unique_items)}")
    print(f"    • Shared QR codes: {len(shared_items)}")
    print(f"    • Total QR codes generated: {len(qr_data_list)}")
    
    return qr_files, qr_data_list

def make_enhanced_pdf(qr_files, shared_items):
    """Create PDF with enhanced layout for shared items"""
    pdf_file = "smart_bag_qr_enhanced.pdf"
    c = canvas.Canvas(pdf_file, pagesize=landscape(A4))
    page_w, page_h = landscape(A4)

    margin_left = 15 * mm
    margin_top = 20 * mm
    margin_bottom = 12 * mm
    day_col_w = 35 * mm
    
    # Calculate layout
    available_w = page_w - margin_left - margin_left - day_col_w
    available_h = page_h - margin_top - margin_bottom
    row_h = available_h / len(DAYS)
    
    qr_size = min(int(45 * mm * QR_SIZE_MULTIPLIER), row_h - 10 * mm)
    cols_per_page = 3
    cell_w = available_w / cols_per_page

    # Calculate pages needed
    max_items = max((len(v) for v in qr_files.values()), default=0)
    horizontal_pages = max(1, math.ceil(max_items / cols_per_page))

    # Generate pages
    for hp in range(horizontal_pages):
        # Title
        c.setFont("Helvetica-Bold", 16)
        title = f"Smart Bag QR Codes - Enhanced (Page {hp+1}/{horizontal_pages})"
        c.drawCentredString(page_w / 2, page_h - margin_top / 2, title)
        
        # Legend for shared items
        if hp == 0 and shared_items:
            c.setFont("Helvetica", 8)
            c.drawString(margin_left, page_h - margin_top + 5, 
                        "🔄 Blue items are used on multiple days")

        # Draw grid
        for r, day in enumerate(DAYS):
            y_top = page_h - margin_top - r * row_h
            cell_bottom = y_top - row_h
            
            # Day label
            c.setFont("Helvetica-Bold", 10)
            c.drawCentredString(margin_left + day_col_w / 2, 
                              cell_bottom + row_h / 2, day)

            # Items for this day
            items = qr_files.get(day, [])
            start_col = hp * cols_per_page
            
            for col_offset in range(cols_per_page):
                col_index = start_col + col_offset
                cell_x = margin_left + day_col_w + col_offset * cell_w
                
                # Draw cell border
                c.rect(cell_x, cell_bottom, cell_w, row_h, stroke=1, fill=0)
                
                if col_index < len(items):
                    item, qr_path, item_type = items[col_index]
                    
                    # Position QR code
                    qr_x = cell_x + (cell_w - qr_size) / 2
                    qr_y = cell_bottom + (row_h - qr_size) / 2 + 8
                    
                    # Draw QR code
                    c.drawImage(qr_path, qr_x, qr_y, 
                              width=qr_size, height=qr_size)
                    
                    # Item label with color coding
                    if item_type == "shared":
                        c.setFillColorRGB(0, 0, 0.8)  # Blue for shared items
                        c.setFont("Helvetica-Bold", 7)
                    else:
                        c.setFillColorRGB(0, 0, 0)  # Black for unique items
                        c.setFont("Helvetica", 7)
                    
                    # Draw item name
                    text_y = cell_bottom + 8
                    c.drawCentredString(cell_x + cell_w / 2, text_y, item)
                    
                    # Add shared indicator
                    if item_type == "shared":
                        c.setFont("Helvetica", 6)
                        c.drawCentredString(cell_x + cell_w / 2, text_y - 8, 
                                          "(Multi-day)")
                    
                    c.setFillColorRGB(0, 0, 0)  # Reset color

        c.showPage()

    c.save()
    print(f"[✔] Enhanced PDF generated: {pdf_file}")
    return pdf_file

def send_pdf_to_server(pdf_file, qr_data_list):
    """Send PDF and QR data to server via Socket.IO"""
    try:
        sio = socketio.Client(reconnection=True, reconnection_attempts=5)
        
        upload_success = False
        error_message = None
        
        @sio.event
        def connect():
            print(f"[✔] Connected to server at {SERVER_URL}")
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
                with open(pdf_file, "rb") as pdf_file_obj:
                    pdf_base64 = base64.b64encode(pdf_file_obj.read()).decode('utf-8')
                
                upload_data = {
                    'filename': os.path.basename(pdf_file),
                    'pdfData': pdf_base64,
                    'qrList': qr_data_list,
                    'timestamp': datetime.now().isoformat()
                }
                
                print(f"[⬆️] Uploading enhanced PDF ({len(pdf_base64)} bytes) with {len(qr_data_list)} QR codes...")
                sio.emit('qrPdfUpload', upload_data)
                
            except Exception as e:
                nonlocal error_message
                error_message = f"Error preparing upload data: {e}"
                print(f"[✗] {error_message}")
                sio.disconnect()
        
        print(f"[⬆️] Connecting to server at {SERVER_URL}...")
        sio.connect(SERVER_URL)
        
        # Wait for upload completion
        timeout = 30
        start_time = time.time()
        while sio.connected and (time.time() - start_time) < timeout and not upload_success and not error_message:
            time.sleep(0.1)
        
        if sio.connected:
            sio.disconnect()
            
        if upload_success:
            print("[✔] Enhanced PDF successfully sent to server!")
            print(f"Visit {SERVER_URL}/configure to view and download the PDF")
            return True
        else:
            print(f"[✗] Failed to upload PDF: {error_message or 'Timeout or unknown error'}")
            return False
            
    except Exception as e:
        print(f"[✗] Socket.IO error: {e}")
        return False

def main():
    print("=" * 70)
    print("🎒 Enhanced Smart Bag QR Code Generator with Multi-Day Optimization")
    print("=" * 70)
    print(f"Server URL: {SERVER_URL}")
    print(f"Device ID: {DEVICE_ID}")
    print(f"QR Size Multiplier: {QR_SIZE_MULTIPLIER}x")
    print("-" * 70)
    
    # Collect items
    week_items = get_items_by_day()
    if not any(week_items.values()):
        print("❌ No items entered. Exiting.")
        return
    
    # Analyze usage patterns
    unique_items, shared_items = analyze_item_usage(week_items)
    total_qr_codes = print_item_analysis(unique_items, shared_items)
    
    # Generate files
    save_to_csv(week_items, unique_items, shared_items)
    qr_files, qr_data_list = generate_optimized_qr_codes(unique_items, shared_items)
    pdf_file = make_enhanced_pdf(qr_files, shared_items)
    
    # Upload to server
    print("\n=== Uploading Enhanced PDF to Server ===")
    success = send_pdf_to_server(pdf_file, qr_data_list)
    
    print(f"\n=== Enhanced Summary ===")
    print(f"• Enhanced CSV: smart_bag_enhanced.csv")
    print(f"• Optimized QR codes: smart_bag_qr_optimized/ folder")
    print(f"• Enhanced PDF: {pdf_file}")
    print(f"• Total unique QR codes: {total_qr_codes}")
    print(f"• Shared items optimized: {len(shared_items)}")
    print(f"• Upload status: {'✅ Success' if success else '❌ Failed'}")

if __name__ == "__main__":
    import sys
    
    # Handle command line arguments
    if len(sys.argv) > 1:
        if sys.argv[1] == "--help":
            print("Usage: python3 configure-bag-items-improved.py [SERVER_URL] [DEVICE_ID] [QR_SIZE_MULTIPLIER]")
            print("")
            print("Enhanced Features:")
            print("• Detects items used on multiple days")
            print("• Creates optimized QR codes for shared items")
            print("• Color-coded PDF with multi-day indicators")
            print("• Comprehensive usage analysis")
            print("")
            print("Arguments:")
            print("  SERVER_URL         : Server URL (default: https://location-tracker-app-waa4.onrender.com)")
            print("  DEVICE_ID          : Device ID (default: raspi-001)")
            print("  QR_SIZE_MULTIPLIER : QR code size multiplier (default: 1.5)")
            sys.exit(0)
        else:
            SERVER_URL = sys.argv[1]
    
    if len(sys.argv) > 2:
        DEVICE_ID = sys.argv[2]
    
    if len(sys.argv) > 3:
        try:
            QR_SIZE_MULTIPLIER = float(sys.argv[3])
        except ValueError:
            print("Invalid QR size multiplier, using default.")
    
    main()