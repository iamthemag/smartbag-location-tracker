# Smart Bag QR PDF Integration

This document explains the new PDF-based QR code functionality that replaces individual QR image uploads.

## Overview

Instead of uploading individual QR code images, the Raspberry Pi now generates and uploads:
1. **A single PDF file** containing all QR codes organized by day
2. **Individual QR image data** for web display (embedded in the upload)

## Python Scripts

### 1. `smart_bag_generator.py` - Interactive Generator
The main script that prompts for weekly items and generates:
- CSV file with all items
- Individual QR code images in a folder
- PDF with all QR codes organized by day
- Optional upload to server via Socket.IO

**Usage:**
```bash
pip install -r requirements.txt
python smart_bag_generator.py
```

### 2. `test_smart_bag.py` - Test Script  
A test version with pre-filled sample data for quick testing:
```bash
python test_smart_bag.py
```

## Server Changes

### New Socket.IO Events

#### `qrPdfUpload` (from Pi to Server)
```javascript
{
  filename: "smart_bag_qr.pdf",
  pdfData: "base64-encoded-pdf-data",
  qrList: [
    {
      filename: "Monday_Laptop.png", 
      label: "Monday: Laptop",
      imageData: "base64-qr-image"
    },
    // ... more QR codes
  ],
  timestamp: "2024-01-01T12:00:00.000Z"
}
```

#### `qrPdfReceived` (from Server to Web Clients)
```javascript
{
  qrCodes: [/* processed QR list */],
  pdfInfo: {
    filename: "smart_bag_qr.pdf",
    totalQRs: 21
  }
}
```

### New API Endpoints

- **`GET /api/download-qr-pdf`** - Download the PDF file
- **`GET /api/user-config`** - Now includes `qrPdf` info

## Web Interface Changes

### New Features
1. **PDF Download Section** - Appears when PDF is received
2. **QR Code Display** - Individual QR codes shown from PDF data  
3. **Photo Upload Workflow** - Unchanged, still matches QR codes to items

### User Workflow
1. Pi generates and uploads PDF with QR codes
2. Web interface shows PDF download button
3. User can download PDF immediately
4. User uploads photos for each item (matching QR codes in PDF)
5. System pairs photos with QR codes by filename matching

## File Structure

```
location-tracker-app/
├── smart_bag_generator.py      # Main interactive generator
├── test_smart_bag.py          # Test script with sample data
├── requirements.txt           # Python dependencies  
├── server.js                  # Updated with PDF handling
├── public/js/configure.js     # Updated frontend
└── qr-codes/                  # Server storage for PDFs
    └── {device-id}/
        └── smart_bag_qr.pdf
```

## Installation & Setup

1. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Update configuration in Python scripts:**
   ```python
   SERVER_URL = "http://your-server:3000"  
   DEVICE_ID = "your-pi-device-id"
   ```

3. **Start the Node.js server:**
   ```bash
   npm start
   ```

4. **Run the generator:**
   ```bash
   python smart_bag_generator.py
   # or for testing:
   python test_smart_bag.py
   ```

## Testing

1. Start the server (`npm start`)
2. Login to web interface 
3. Run `python test_smart_bag.py`
4. Choose 'y' to upload when prompted
5. Check web interface - you should see:
   - PDF download button
   - Individual QR codes displayed
   - Photo upload buttons for each item

## Dependencies

### Python (requirements.txt)
- `qrcode[pil]==7.4.2` - QR code generation
- `pandas==2.1.4` - CSV handling
- `reportlab==4.0.8` - PDF generation  
- `python-socketio[client]==5.10.0` - Socket.IO client
- `Pillow==10.1.0` - Image processing

### Node.js (existing)
- `socket.io` - Real-time communication
- `express` - Web server
- `multer` - File uploads
- `sharp` - Image processing

## Benefits

1. **Single PDF Download** - User gets all QR codes at once
2. **Better Organization** - QR codes organized by day in PDF
3. **Immediate Availability** - PDF available as soon as Pi uploads
4. **Backward Compatibility** - Still supports individual QR uploads
5. **Better UX** - Clear workflow with PDF first, photos second