// Global variables
let lat = null;  // Will be set when Pi location is received
let lng = null;
let map;
let mark = null;  // Single marker for current location
let lineCoords = [];
let currentPath = null;  // Track current polyline
let userLocation = null;  // Store user's current location
let userMarker = null;  // Track user location marker
let directionLine = null;  // Track direction line between user and smartbag
let socket;
let updateCount = 0;
let isTracking = true;  // Start tracking by default
let mapInitialized = false;
let connectedDevices = [];  // Track connected devices
let loadingOverlay = null;  // Loading overlay element

// Initialize Leaflet Map with satellite view
function initializeMap() {
  // Initialize Leaflet map
  map = L.map('map-canvas').setView([0, 0], 2);  // World center until Pi location received
  
  // Add satellite layer with labels as default
  const satelliteLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    attribution: '© Google',
    maxZoom: 20
  }).addTo(map);
  
  // Add OpenStreetMap layer as alternative
  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  });
  
  // Layer control to switch between map types
  const baseMaps = {
    "Satellite": satelliteLayer,
    "OpenStreetMap": osmLayer
  };
  L.control.layers(baseMaps).addTo(map);
  
  // No initial marker - will be created when Pi location is received
  mark = null;
  
  mapInitialized = true;

  console.log('Leaflet map initialized with satellite view');
  
  // Initialize loading overlay
  loadingOverlay = document.getElementById('loadingOverlay');
  showLoadingOverlay(); // Show by default until device connects
  
  // Add event listener for loading overlay logout button
  const loadingLogoutBtn = document.getElementById('loadingLogoutBtn');
  if (loadingLogoutBtn) {
    loadingLogoutBtn.addEventListener('click', handleLogout);
  }
  
  // Get user's current location
  getUserLocation();
  
  // Initialize socket and events after map is ready
  initializeSocket();
  initializeEventListeners();
}

// Make initializeMap available globally
window.initializeMap = initializeMap;

// Get user's current location using HTML5 Geolocation
function getUserLocation() {
  console.log('Attempting to get user location...');
  
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      function(position) {
        userLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        console.log('✅ User location obtained:', userLocation);
        
        // Remove existing user marker if any
        if (userMarker) {
          map.removeLayer(userMarker);
        }
        
        // Add marker for user location
        userMarker = L.circleMarker([userLocation.lat, userLocation.lng], {
          radius: 8,
          fillColor: '#4285F4',
          fillOpacity: 1,
          color: '#ffffff',
          weight: 2
        }).addTo(map).bindPopup('Your Location');
        
        // Update UI to show user location is available
        document.getElementById('accuracy').innerHTML = `
          <strong>Your Location:</strong> Found<br>
          <span style="font-size: 12px;">Lat: ${userLocation.lat.toFixed(4)}, Lng: ${userLocation.lng.toFixed(4)}</span>
        `;
        
        // Auto-center map to user location if no SmartBag location yet
        if (!lat || !lng) {
          map.setView([userLocation.lat, userLocation.lng], 15);
          console.log('Map auto-centered to user location');
        } else {
          // Both locations available - fit map to show both
          centerMapToBothLocations();
        }
        
        console.log('User marker added to map');
      },
      function(error) {
        console.error('❌ Geolocation error:', error);
        let errorMsg = '';
        switch(error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = 'Location access denied by user';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = 'Location information unavailable';
            break;
          case error.TIMEOUT:
            errorMsg = 'Location request timed out';
            break;
          default:
            errorMsg = 'Unknown geolocation error';
            break;
        }
        
console.log(`Location error: ${errorMsg}. Will prompt user for manual entry.`);
        
        // Ask user to manually enter their location
        promptForUserLocation();
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,  // Increased timeout
        maximumAge: 60000 // 1 minute cache
      }
    );
  } else {
    console.error('❌ Geolocation not supported');
    promptForUserLocation();
  }
}

// Prompt user to manually enter their location
function promptForUserLocation() {
  const userChoice = confirm(
    'Cannot automatically detect your location.\n\n' +
    'Would you like to:\n' +
    '• Click OK to manually enter your location\n' +
    '• Click Cancel to use a default location for directions'
  );
  
  if (userChoice) {
    // User wants to enter location manually
    showLocationInputDialog();
  } else {
    // Use default location (SmartBag's current location if available)
    useDefaultLocation();
  }
}

// Show input dialog for manual location entry
function showLocationInputDialog() {
  const locationInput = prompt(
    'Please enter your location:\n\n' +
    'You can enter:\n' +
    '• Address (e.g., "New York, NY")\n' +
    '• Coordinates (e.g., "40.7128, -74.0060")\n' +
    '• Postal code (e.g., "10001")'
  );
  
  if (locationInput && locationInput.trim() !== '') {
    geocodeUserLocation(locationInput.trim());
  } else {
    useDefaultLocation();
  }
}

// Geocode user's entered location (simplified without Google Geocoding API)
function geocodeUserLocation(locationString) {
  // Try to parse coordinates directly
  const coords = locationString.match(/^([+-]?\d*\.?\d+),\s*([+-]?\d*\.?\d+)$/);
  
  if (coords) {
    userLocation = {
      lat: parseFloat(coords[1]),
      lng: parseFloat(coords[2])
    };
    
    console.log('✅ User coordinates parsed:', userLocation);
    
    // Remove existing user marker if any
    if (userMarker) {
      map.removeLayer(userMarker);
    }
    
    // Add marker for user location
    userMarker = L.circleMarker([userLocation.lat, userLocation.lng], {
      radius: 10,
      fillColor: '#4285F4',
      fillOpacity: 1,
      color: '#ffffff',
      weight: 2
    }).addTo(map).bindPopup('Your Location (Entered)');
    
    // Update UI
    document.getElementById('accuracy').innerHTML = `
      <strong>Your Location:</strong> Coordinates entered<br>
      <span style="font-size: 12px;">Lat: ${userLocation.lat.toFixed(4)}, Lng: ${userLocation.lng.toFixed(4)}</span>
    `;
    
  } else {
    console.error('❌ Could not parse coordinates');
    alert('Please enter coordinates in format: "latitude, longitude" (e.g., "40.7128, -74.0060")');
    useDefaultLocation();
  }
}

// Use default location as fallback
function useDefaultLocation() {
  if (lat !== null && lng !== null) {
    // Use SmartBag's location as default
    userLocation = {lat: lat, lng: lng};
    console.log('Using SmartBag location as user location');
    
    // Remove existing user marker if any
    if (userMarker) {
      map.removeLayer(userMarker);
    }
    
    // Add marker
    userMarker = L.circleMarker([userLocation.lat, userLocation.lng], {
      radius: 8,
      fillColor: '#FF9800',
      fillOpacity: 1,
      color: '#ffffff',
      weight: 2
    }).addTo(map).bindPopup('Default Location (SmartBag Position)');
    
    document.getElementById('accuracy').innerHTML = `
      <strong>Your Location:</strong> Using SmartBag position<br>
      <span style="font-size: 12px;">Directions will show path from SmartBag to SmartBag</span>
    `;
  } else {
    // Use NYC as absolute fallback
    userLocation = {lat: 40.7128, lng: -74.0060};
    console.log('Using NYC as default location');
    
    // Remove existing user marker if any
    if (userMarker) {
      map.removeLayer(userMarker);
    }
    
    userMarker = L.circleMarker([userLocation.lat, userLocation.lng], {
      radius: 8,
      fillColor: '#FF5722',
      fillOpacity: 1,
      color: '#ffffff',
      weight: 2
    }).addTo(map).bindPopup('Default Location (NYC)');
    
    document.getElementById('accuracy').innerHTML = `
      <strong>Your Location:</strong> Default (NYC)<br>
      <span style="font-size: 12px;">You can click "Get Directions" to manually set your location</span>
    `;
  }
}

// Loading overlay management functions
function showLoadingOverlay() {
  if (loadingOverlay) {
    loadingOverlay.classList.add('show');
    console.log('Loading overlay shown - no devices connected');
  }
}

function hideLoadingOverlay() {
  if (loadingOverlay) {
    loadingOverlay.classList.remove('show');
    console.log('Loading overlay hidden - devices connected');
  }
}

// Center map to show both user and SmartBag locations
function centerMapToBothLocations() {
  if (userLocation && lat && lng) {
    const bounds = L.latLngBounds([
      [userLocation.lat, userLocation.lng],
      [lat, lng]
    ]);
    map.fitBounds(bounds, { padding: [50, 50] });
    console.log('Map centered to show both locations');
  }
}

// Simple distance calculation using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Show directions with visual dotted line
function showDirections(destination) {
  console.log('Showing directions to destination...');
  console.log('User location:', userLocation);
  console.log('Destination:', destination);
  
  if (!userLocation) {
    console.log('⚠️ User location not available yet');
    document.getElementById('accuracy').innerHTML = `
      <strong>Error:</strong> Your location not found<br>
      <span style="font-size: 12px;">Please allow location access</span>
    `;
    return;
  }
  
  if (!destination || !destination.lat || !destination.lng) {
    console.log('⚠️ Invalid destination');
    return;
  }
  
  // Remove existing direction line
  if (directionLine) {
    map.removeLayer(directionLine);
  }
  
  // Create dotted line between user location and SmartBag
  const coordinates = [
    [userLocation.lat, userLocation.lng],
    [destination.lat, destination.lng]
  ];
  
  directionLine = L.polyline(coordinates, {
    color: '#0099FF',
    weight: 3,
    opacity: 0.8,
    dashArray: '10, 10'  // Creates dotted line pattern
  }).addTo(map);
  
  // Calculate distance
  const distance = calculateDistance(userLocation.lat, userLocation.lng, destination.lat, destination.lng);
  
  // Calculate bearing (simplified)
  const dLon = (destination.lng - userLocation.lng) * Math.PI / 180;
  const lat1 = userLocation.lat * Math.PI / 180;
  const lat2 = destination.lat * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  bearing = (bearing + 360) % 360;
  
  // Convert bearing to compass direction
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const compassDirection = directions[Math.round(bearing / 45) % 8];
  
  console.log(`Distance: ${distance.toFixed(2)} km, Direction: ${compassDirection}`);
  
  // Fit map to show both points
  const bounds = L.latLngBounds(coordinates);
  map.fitBounds(bounds, { padding: [50, 50] });
  
  // Update UI with distance info
  document.getElementById('accuracy').innerHTML = `
    <strong>Distance:</strong> ${distance.toFixed(2)} km<br>
    <strong>Direction:</strong> ${compassDirection}<br>
    <strong>Route:</strong> Direct line shown
  `;
}

// Initialize Socket.IO connection
function initializeSocket() {
    socket = io();
    
    // Connection status handling
    socket.on('connect', function() {
        console.log('Connected to server');
        
        // Authenticate as a web client
        socket.emit('authenticate', { type: 'client' });
        
        updateConnectionStatus(true);
    });
    
    socket.on('disconnect', function() {
        console.log('Disconnected from server');
        connectedDevices = [];  // Clear devices on disconnect
        showLoadingOverlay();   // Show loading overlay when disconnected
        updateConnectionStatus(false);
    });
    
    // Handle location updates
    socket.on('locationUpdate', function(location) {
        console.log('Location update received from device:', location.deviceId || 'unknown', location);
        if (isTracking) {
            redraw(location);
            
            // Automatically update directions if user location is available
            if (userLocation && lat && lng) {
                console.log('Auto-updating directions with new SmartBag location');
                const smartBagLocation = {lat: lat, lng: lng};
                showDirections(smartBagLocation);
            }
        }
    });
    
    // Handle location history
    socket.on('locationHistory', function(history) {
        console.log('Location history received:', history.length, 'points');
        locationHistory = history;
        if (showHistory) {
            // Clear existing lines and redraw if needed
            lineCoords = [];
        }
    });
    
    // Handle device status updates
    socket.on('deviceStatus', function(status) {
        console.log('Device status update received:', status);
        console.log('Connected devices:', status.connectedDevices);
        console.log('Total devices:', status.totalDevices);
        updateDeviceStatus(status);
    });
}

// Initialize event listeners
function initializeEventListeners() {
    // Tracking button (starts ON by default)
    document.getElementById('trackingBtn').addEventListener('click', function() {
      const btn = document.getElementById("trackingBtn");
      if (btn.textContent === "Stop Tracking") {
        isTracking = false;
        btn.classList.remove('btn-danger');
        btn.classList.add('btn-success');
        btn.textContent = 'Start Tracking';
        console.log('Stopped tracking locations');
      } else {
        isTracking = true;
        btn.classList.remove('btn-success');
        btn.classList.add('btn-danger');
        btn.textContent = 'Stop Tracking';
        console.log('Started tracking locations');
      }
    });

    // Center map button
    document.getElementById('centerMapBtn').addEventListener('click', function() {
        if (mark && lat !== null && lng !== null) {
            map.setView([lat, lng], 15);
        } else {
            alert('No SmartBag location available yet!');
        }
    });
    
    
    // Get Directions button
    document.getElementById('directionsBtn').addEventListener('click', function() {
        if (lat !== null && lng !== null) {
            // Check if we have user location
            if (!userLocation) {
                const retry = confirm('No starting location set. Would you like to enter your location now?');
                if (retry) {
                    showLocationInputDialog();
                    return;
                }
            }
            
            const smartBagLocation = {lat: lat, lng: lng};
            showDirections(smartBagLocation);
            this.textContent = 'Auto-Directions ON';
            this.classList.remove('btn-primary');
            this.classList.add('btn-success');
            // Keep it as 'Auto-Directions ON' to show it's automatically updating
            console.log('Manual directions activated - auto-updates will continue');
        } else {
            alert('No SmartBag location available yet!');
        }
    });
    
    // Reset Location button
    document.getElementById('resetLocationBtn').addEventListener('click', function() {
        // Clear existing user location
        userLocation = null;
        
        // Remove direction line if exists
        if (directionLine) {
            map.removeLayer(directionLine);
            directionLine = null;
        }
        
        // Remove user marker
        if (userMarker) {
            map.removeLayer(userMarker);
            userMarker = null;
        }
        
        // Prompt for new location
        const choice = confirm(
            'Reset your location?\n\n' +
            'Click OK to enter a new location\n' +
            'Click Cancel to use automatic detection'
        );
        
        if (choice) {
            showLocationInputDialog();
        } else {
            getUserLocation();
        }
        
        // Update UI
        document.getElementById('accuracy').innerHTML = `
            <strong>Your Location:</strong> Resetting...<br>
            <span style="font-size: 12px;">Please wait</span>
        `;
    });
    
    // Logout button
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // Clear Directions button
    document.getElementById('clearDirectionsBtn').addEventListener('click', function() {
        // Remove direction line from map
        if (directionLine) {
            map.removeLayer(directionLine);
            directionLine = null;
        }
        
        // Clear directions display (reset to user location info)
        if (userLocation) {
            document.getElementById('accuracy').innerHTML = `
                <strong>Your Location:</strong> Found<br>
                <span style="font-size: 12px;">Lat: ${userLocation.lat.toFixed(4)}, Lng: ${userLocation.lng.toFixed(4)}</span>
            `;
        } else {
            document.getElementById('accuracy').innerHTML = `
                <strong>Your Location:</strong> Not found<br>
                <span style="font-size: 12px;">Please allow location access</span>
            `;
        }
        
        console.log('Directions cleared');
        
        // Update button feedback
        this.textContent = 'Directions Cleared!';
        this.classList.remove('btn-info');
        this.classList.add('btn-success');
        
        // Reset Get Directions button state
        const directionsBtn = document.getElementById('directionsBtn');
        if (directionsBtn) {
            directionsBtn.textContent = 'Get Directions';
            directionsBtn.classList.remove('btn-success');
            directionsBtn.classList.add('btn-primary');
        }
        
        setTimeout(() => {
            this.textContent = 'Clear Directions';
            this.classList.remove('btn-success');
            this.classList.add('btn-info');
        }, 1500);
    });
}

// Update connection status indicator with device information
function updateConnectionStatus(isConnected) {
    const statusIndicator = document.querySelector('.status-indicator');
    const statusText = document.querySelector('.status-text');
    
    console.log('updateConnectionStatus called with:', isConnected);
    console.log('connectedDevices array:', connectedDevices);
    console.log('connectedDevices.length:', connectedDevices.length);
    
    if (isConnected) {
        if (connectedDevices.length > 0) {
            console.log('Setting status to online with devices');
            statusIndicator.className = 'status-indicator online';
            statusText.textContent = `Connected - ${connectedDevices.join(', ')}`;
        } else {
            console.log('Setting status to connected but no devices');
            statusIndicator.className = 'status-indicator offline';
            statusText.textContent = 'Connected - No Device';
        }
    } else {
        console.log('Setting status to disconnected');
        statusIndicator.className = 'status-indicator offline';
        statusText.textContent = 'Disconnected - No Device';
    }
    
    console.log('Final status text:', statusText.textContent);
}

// Simple redraw function like template
function redraw(payload) {
  if (payload.latitude && payload.longitude) {
    lat = payload.latitude;
    lng = payload.longitude;
    const accuracy = payload.accuracy;
    const timestamp = payload.timestamp;

    // Update coordinates display
    document.getElementById('coordinates').innerHTML = `
        <strong>Lat:</strong> ${lat.toFixed(6)}<br>
        <strong>Lng:</strong> ${lng.toFixed(6)}<br>
        <strong>Device:</strong> ${payload.deviceId || 'Unknown'}
    `;
    
    // Update timestamp
    const date = new Date(timestamp);
    document.getElementById('timestamp').textContent = `Updated: ${date.toLocaleString()}`;
    
    // Update accuracy if available
    if (accuracy !== null && accuracy !== undefined) {
        document.getElementById('accuracy').textContent = `Accuracy: ±${accuracy.toFixed(1)}m`;
    } else {
        document.getElementById('accuracy').textContent = '';
    }

    // Create marker if this is the first Pi location
    if (!mark) {
      mark = L.marker([lat, lng]).addTo(map).bindPopup('SmartBag Location');
      console.log('Created SmartBag marker at first location');
      
      // Auto-center based on available locations
      if (userLocation) {
        // Both locations available - show both
        centerMapToBothLocations();
      } else {
        // Only SmartBag location - center to it
        map.setView([lat, lng], 15);
      }
    } else {
      // Update existing marker position
      mark.setLatLng([lat, lng]);
      
      // Auto-center if user location is available
      if (userLocation) {
        centerMapToBothLocations();
      } else {
        map.setView([lat, lng], 15);
      }
    }
    
    // Update directions if user has requested them
    if (userLocation) {
      updateDirections(lat, lng);
    }
    
    // Add to path coordinates and draw line (like template)
    lineCoords.push([lat, lng]);
    
    // Remove existing path if it exists
    if (currentPath) {
      map.removeLayer(currentPath);
    }
    
    // Only draw line if we have at least 2 points
    if (lineCoords.length > 1) {
      currentPath = L.polyline(lineCoords, {
        color: '#FF0000',  // Red color for better visibility
        opacity: 0.8,
        weight: 4
      }).addTo(map);
      
      console.log(`Path drawn with ${lineCoords.length} points`);
    }
    
    updateCount++;
    updateStats();
  }
}

// Update statistics display

// Update device status display
function updateDeviceStatus(status) {
    // Update connected devices list
    connectedDevices = status.connectedDevices || [];
    console.log(`Updating device status - Devices online: ${status.totalDevices} - ${connectedDevices.join(', ')}`);
    console.log('Previous connectedDevices:', connectedDevices);
    
    // Show/hide loading overlay based on device status
    if (connectedDevices.length > 0) {
        hideLoadingOverlay();
    } else {
        showLoadingOverlay();
    }
    
    // Update connection status with device info
    console.log('Calling updateConnectionStatus with connected=true');
    updateConnectionStatus(true);
}

// Update statistics display
function updateStats() {
    document.getElementById('updateCount').textContent = updateCount;
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
}

// Handle page visibility change to manage connections
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        console.log('Page hidden - maintaining connection');
    } else {
        console.log('Page visible - connection active');
    }
});

// Shared logout handler function
function handleLogout() {
    // Show confirmation dialog
    if (confirm('Are you sure you want to logout and return to the homepage?')) {
        // Logout from server
        fetch('/api/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        })
        .then(response => response.json())
        .then(data => {
            console.log('🚪 Server logout:', data.message);
        })
        .catch(error => {
            console.error('Logout error:', error);
        })
        .finally(() => {
            // Clear local storage
            localStorage.removeItem('smartbag_session');
            sessionStorage.clear();
            
            // Disconnect socket if connected
            if (socket && socket.connected) {
                socket.disconnect();
            }
            
            // Redirect to homepage
            console.log('🚪 User logged out');
            window.location.href = '/';
        });
    }
}

// Function to update turn-by-turn directions
function updateDirections(currentLat, currentLng) {
  const directionsPanel = document.getElementById('directions-panel');
  const directionsSteps = document.getElementById('directions-steps');
  
  if (!directionsPanel || !directionsSteps) {
    console.log('Directions panel not found');
    return;
  }
  
  // Mock directions data (replace with actual routing service)
  const mockDirections = [
    {
      instruction: 'Head north on Main Street',
      distance: '0.2 mi',
      duration: '1 min',
      maneuver: 'straight'
    },
    {
      instruction: 'Turn right onto Oak Avenue',
      distance: '0.5 mi',
      duration: '2 min',
      maneuver: 'turn-right'
    },
    {
      instruction: 'Continue straight for 3 blocks',
      distance: '0.3 mi',
      duration: '1 min',
      maneuver: 'straight'
    },
    {
      instruction: 'Turn left onto Destination Drive',
      distance: '0.1 mi',
      duration: '30 sec',
      maneuver: 'turn-left'
    },
    {
      instruction: 'Arrive at destination on the right',
      distance: '0.0 mi',
      duration: '0 min',
      maneuver: 'arrive'
    }
  ];
  
  // Calculate total distance and time
  const totalDistance = mockDirections.reduce((sum, step) => {
    const dist = parseFloat(step.distance.replace(' mi', ''));
    return sum + (isNaN(dist) ? 0 : dist);
  }, 0);
  
  const totalTime = mockDirections.reduce((sum, step) => {
    const time = step.duration.includes('min') ? 
      parseInt(step.duration.replace(' min', '')) : 
      (step.duration.includes('sec') ? 0.5 : 0);
    return sum + (isNaN(time) ? 0 : time);
  }, 0);
  
  // Update directions summary
  const summaryElement = directionsPanel.querySelector('.directions-summary');
  if (summaryElement) {
    summaryElement.innerHTML = `
      <div class="summary-item">
        <i class="fas fa-route"></i>
        <span>${totalDistance.toFixed(1)} mi total</span>
      </div>
      <div class="summary-item">
        <i class="fas fa-clock"></i>
        <span>${Math.ceil(totalTime)} min ETA</span>
      </div>
    `;
  }
  
  // Generate directions steps HTML
  const stepsHTML = mockDirections.map((step, index) => {
    const iconClass = getDirectionIcon(step.maneuver);
    return `
      <div class="direction-step ${index === 0 ? 'current' : ''}">
        <div class="step-icon">
          <i class="${iconClass}"></i>
        </div>
        <div class="step-content">
          <div class="step-instruction">${step.instruction}</div>
          <div class="step-details">
            <span class="step-distance">${step.distance}</span>
            <span class="step-duration">${step.duration}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  directionsSteps.innerHTML = stepsHTML;
  
  // Show directions panel
  directionsPanel.classList.add('visible');
  console.log('Turn-by-turn directions updated');
}

// Function to get appropriate icon for direction maneuver
function getDirectionIcon(maneuver) {
  const icons = {
    'straight': 'fas fa-arrow-up',
    'turn-right': 'fas fa-arrow-right',
    'turn-left': 'fas fa-arrow-left',
    'slight-right': 'fas fa-arrow-up-right',
    'slight-left': 'fas fa-arrow-up-left',
    'sharp-right': 'fas fa-redo',
    'sharp-left': 'fas fa-undo',
    'u-turn': 'fas fa-undo',
    'arrive': 'fas fa-flag-checkered',
    'depart': 'fas fa-play'
  };
  
  return icons[maneuver] || 'fas fa-arrow-up';
}

// Error handling for fetch requests
function handleFetchError(error) {
    console.error('Fetch error:', error);
    // You could show a toast notification here
}
