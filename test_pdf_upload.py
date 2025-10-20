#!/usr/bin/env python3
"""
Test script to generate a sample PDF with QR codes and upload it to the server
"""

import json
import base64
import requests
import qrcode
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from io import BytesIO
import os

def generate_qr_code(data, label):
    """Generate a QR code image"""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(data)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    
    # Convert to base64
    img_buffer = BytesIO()
    img.save(img_buffer, format='PNG')
    img_base64 = base64.b64encode(img_buffer.getvalue()).decode()
    
    return {
        'filename': f"{label.replace(' ', '_').replace(':', '_')}.png",
        'label': label,
        'imageData': img_base64
    }

def create_sample_pdf():
    """Create a sample PDF with QR codes"""
    print("🔧 Creating sample PDF...")
    
    # Sample QR codes for testing
    sample_items = [
        "Monday: Laptop",
        "Monday: Charger", 
        "Tuesday: Notebook",
        "Tuesday: Pens",
        "Wednesday: Water Bottle",
        "Wednesday: Headphones",
        "Thursday: USB Drive",
        "Friday: Documents",
        "Saturday: Keys",
        "Sunday: Phone Charger"
    ]
    
    # Generate QR codes
    qr_codes = []
    for item in sample_items:
        qr_data = generate_qr_code(f"SMARTBAG_ITEM:{item}", item)
        qr_codes.append(qr_data)
        print(f"  ✓ Generated QR code: {item}")
    
    # Create PDF
    pdf_buffer = BytesIO()
    c = canvas.Canvas(pdf_buffer, pagesize=letter)
    width, height = letter
    
    # Title
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, height - 50, "SmartBag QR Codes - Test Upload")
    
    # Grid layout for QR codes
    qr_size = 1.5 * inch
    cols = 3
    rows_per_page = 6
    x_start = 50
    y_start = height - 100
    
    for i, qr_code in enumerate(qr_codes):
        if i > 0 and i % (cols * rows_per_page) == 0:
            c.showPage()
            c.setFont("Helvetica-Bold", 16)
            c.drawString(50, height - 50, f"SmartBag QR Codes - Page {i // (cols * rows_per_page) + 1}")
            
        row = (i % (cols * rows_per_page)) // cols
        col = i % cols
        
        x = x_start + col * (qr_size + 20)
        y = y_start - row * (qr_size + 40)
        
        # Decode base64 image and add to PDF
        try:
            from reportlab.lib.utils import ImageReader
            img_data = base64.b64decode(qr_code['imageData'])
            img_buffer = BytesIO(img_data)
            img_reader = ImageReader(img_buffer)
            
            c.drawImage(img_reader, x, y, qr_size, qr_size)
            
            # Add label
            c.setFont("Helvetica", 10)
            c.drawString(x, y - 15, qr_code['label'])
            
        except Exception as e:
            print(f"  ⚠️ Error adding QR code {qr_code['label']}: {e}")
            # Draw placeholder rectangle
            c.rect(x, y, qr_size, qr_size)
            c.setFont("Helvetica", 8)
            c.drawString(x + 10, y + qr_size/2, qr_code['label'])
    
    c.save()
    pdf_data = pdf_buffer.getvalue()
    
    print(f"✅ PDF created ({len(pdf_data)} bytes)")
    return pdf_data, qr_codes

def upload_pdf_to_server(pdf_data, qr_codes, server_url="https://location-tracker-app-waa4.onrender.com"):
    """Upload PDF to server via HTTP API"""
    print(f"\n🚀 Uploading PDF to {server_url}...")
    
    # Prepare payload
    payload = {
        'filename': 'test_sample_qr.pdf',
        'pdfData': base64.b64encode(pdf_data).decode(),
        'qrList': qr_codes,
        'deviceId': 'raspi-001'  # Use authorized raspi device ID
    }
    
    try:
        # Upload via HTTP API
        response = requests.post(
            f"{server_url}/api/pdf",
            json=payload,
            headers={'Content-Type': 'application/json'},
            timeout=30
        )
        
        print(f"📡 Response Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Upload successful!")
            print(f"   Filename: {result.get('filename')}")
            print(f"   QR Codes: {result.get('processedQRs')}")
            print(f"   Message: {result.get('message')}")
            return True
        else:
            print(f"❌ Upload failed: {response.status_code}")
            print(f"   Response: {response.text}")
            return False
            
    except requests.RequestException as e:
        print(f"❌ Upload error: {e}")
        return False

def main():
    print("🧪 SmartBag PDF Upload Test")
    print("=" * 40)
    
    # Create sample PDF
    try:
        pdf_data, qr_codes = create_sample_pdf()
        print(f"📄 Created PDF with {len(qr_codes)} QR codes")
        
        # Upload to server
        success = upload_pdf_to_server(pdf_data, qr_codes)
        
        if success:
            print("\n🎉 Test completed successfully!")
            print("🔍 Check the configure page at:")
            print("   1. Login at: https://location-tracker-app-waa4.onrender.com")
            print("   2. Use Device ID: raspi-001, Password: Bag@123")
            print("   3. Go to configure page to see the uploaded PDF")
        else:
            print("\n❌ Test failed!")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()