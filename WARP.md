# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Architecture Overview

This is a **real-time location tracking web application** built with Node.js, Express, and Socket.IO that receives GPS data from Raspberry Pi devices and displays it on an interactive map.

### Core Components

- **Server (`server.js`)**: Express server with Socket.IO for real-time communication
  - REST API for location data submission (`POST /api/location`) 
  - WebSocket events for real-time location broadcasting
  - In-memory location storage with configurable history limit (MAX_HISTORY = 100)

- **Web Client (`public/`)**: Real-time dashboard using Leaflet.js maps
  - Live location visualization with accuracy circles
  - Historical path tracking with toggle controls
  - Connection status monitoring
  - Responsive design for desktop/mobile

- **Raspberry Pi Client (`raspberry-pi-client.py`)**: Python GPS data collector
  - Supports both real GPS modules (via pyserial/pynmea2) and demo mode
  - Configurable update intervals and server endpoints
  - Robust error handling and connection monitoring

### Data Flow
1. Raspberry Pi collects GPS coordinates and sends via HTTP POST
2. Server stores location, broadcasts via WebSocket to connected clients
3. Web dashboard updates map markers and displays real-time information

## Development Commands

### Server Management
```bash
npm start          # Production server
npm run dev        # Development with auto-reload (nodemon)
npm install        # Install dependencies
```

### Testing
```bash
# Test API manually
curl -X POST http://localhost:3000/api/location -H "Content-Type: application/json" -d '{"latitude": 40.7128, "longitude": -74.0060, "accuracy": 5.0}'

# Get current location
curl http://localhost:3000/api/location
```

### Raspberry Pi Client
```bash
# Install Python dependencies
pip install requests pyserial pynmea2

# Run client (auto-detects demo mode if GPS libraries unavailable)
python raspberry-pi-client.py

# Run with custom server URL
python raspberry-pi-client.py http://your-server-ip:3000/api/location
```

## Configuration

### Environment Variables
- `PORT`: Server port (default: 3000)
- `MAX_HISTORY`: Maximum location history entries (default: 100)

### Key Configuration Points
- **GPS Settings**: Update `GPS_PORT`, `GPS_BAUDRATE` in `raspberry-pi-client.py`
- **Update Intervals**: Modify `UPDATE_INTERVAL` for location refresh rate
- **Map Tiles**: Change tile provider in `public/js/app.js` (currently OpenStreetMap)
- **CORS**: Configured for all origins (`*`) in server.js

## Map Integration Notes

The application currently uses **Leaflet.js** with OpenStreetMap tiles. The user has mentioned using Google Maps API:

```html
<script async defer src="https://maps.googleapis.com/maps/api/js?key=your-key&callback=initializeMap"></script>
```

To switch to Google Maps:
1. Replace Leaflet.js references in `public/index.html` with Google Maps API
2. Update `initializeMap()` function in `public/js/app.js` to use Google Maps API
3. Modify marker and circle creation logic for Google Maps objects
4. Add your Google Maps API key to the script tag

## Important Architecture Considerations

- **Real-time Communication**: Uses Socket.IO for bidirectional WebSocket communication
- **Location Storage**: In-memory only (not persistent) - consider database for production
- **Security**: CORS set to allow all origins - restrict for production deployment
- **Scalability**: Single server instance - horizontal scaling would require shared state management
- **Error Handling**: Client includes connection monitoring and retry logic

## Common Tasks

When working with location data:
- Ensure coordinates are properly validated (latitude: -90 to 90, longitude: -180 to 180)
- Handle accuracy values appropriately (null values are acceptable)
- Use ISO timestamp format for consistency

When modifying the map interface:
- Test across different zoom levels and coordinate ranges
- Verify marker clustering behavior with large location histories
- Check responsive design on mobile devices

When extending the Raspberry Pi client:
- Maintain backwards compatibility with the existing API format
- Handle GPS signal loss gracefully
- Consider battery optimization for mobile deployments