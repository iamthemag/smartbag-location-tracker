# 🚀 Deploying Location Tracker App to Render.com

This guide walks you through deploying your location tracker app to Render.com.

## Prerequisites

1. **GitHub Repository**: Your code must be in a GitHub repository
2. **No API Keys Required**: This app uses free OpenStreetMap tiles!
3. **Render.com Account**: Sign up at [render.com](https://render.com)

## Step 1: Prepare Your Repository

1. **Push your code to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/location-tracker-app.git
   git push -u origin main
   ```

## Step 2: Deploy to Render

### Option A: Using render.yaml (Recommended)

1. **Connect GitHub to Render**:
   - Go to [render.com](https://render.com) and sign in
   - Click "New +" → "Blueprint"
   - Connect your GitHub account
   - Select your `location-tracker-app` repository

2. **The deployment will use the `render.yaml` file automatically**

### Option B: Manual Setup

1. **Create New Web Service**:
   - Go to Render dashboard
   - Click "New +" → "Web Service"
   - Connect your GitHub repository

2. **Configure the service**:
   - **Name**: `location-tracker-app`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

## Step 3: Set Environment Variables

In your Render service settings, add these environment variables:

### Required Variables
- **PORT**: Automatically set by Render (don't manually set this)
- **No API keys required!** 🎉

### Optional Variables
- **MAX_HISTORY**: `100` (number of location points to keep)
- **AUTHORIZED_DEVICES**: `raspi-001,raspi-002,raspi-tracker-main,smartbag-device-01`
- **NODE_ENV**: `production` (automatically set by Render)

### How to Add Environment Variables:
1. Go to your service dashboard on Render
2. Click "Environment" tab
3. Add each variable with "Add Environment Variable"
4. Click "Save Changes"

## Step 4: Update Your Domain References

After deployment, your app will be available at:
`https://location-tracker-app-waa4.onrender.com`

### Update CORS Origins (if needed)
The code is already configured to handle production URLs, but if you change the service name, update the CORS origin in `server.js`:

```javascript
origin: process.env.NODE_ENV === 'production' 
    ? ["https://your-new-service-name.onrender.com"] 
    : "*",
```

## Step 5: Configure Your Raspberry Pi

Update your Raspberry Pi client code to use the new URL:

```python
# In your Python GPS client
SERVER_URL = "https://location-tracker-app-waa4.onrender.com/api/location"
```

Or for Socket.IO connections:
```python
import socketio
sio = socketio.Client()
sio.connect('https://location-tracker-app-waa4.onrender.com')
```

## Step 6: Test Your Deployment

1. **Visit your app**: Go to `https://location-tracker-app-waa4.onrender.com`
2. **Test API endpoint**: 
   ```bash
   curl -X POST https://location-tracker-app-waa4.onrender.com/api/location \
        -H "Content-Type: application/json" \
        -d '{"latitude": 40.7128, "longitude": -74.0060, "accuracy": 5.0, "deviceId": "test-device"}'
   ```
3. **Check logs**: View logs in Render dashboard for any issues

## Important Notes

### Free Tier Limitations
- **Sleep Mode**: Free services sleep after 15 minutes of inactivity
- **Build Minutes**: 500 build minutes per month
- **Bandwidth**: Limited bandwidth

### Custom Domains (Optional)
To use a custom domain:
1. Go to service settings → "Custom Domains"
2. Add your domain
3. Update DNS records as instructed

### Environment Variables Security
- Never commit `.env` files to GitHub
- Use Render's environment variable system for secrets
- This app doesn't require API keys - uses free map tiles! 🎉

## Troubleshooting

### Common Issues

1. **Build Failures**:
   - Check that `package.json` has correct dependencies
   - Ensure Node.js version compatibility

2. **App Won't Start**:
   - Verify `npm start` works locally
   - Check environment variables are set correctly

3. **WebSocket Issues**:
   - Ensure you're using `wss://` for HTTPS connections
   - Check CORS settings allow your domain

4. **Authentication Problems**:
   - Verify device IDs match authorized devices
   - Check session configuration for HTTPS

### Monitoring
- Use Render's built-in logs and metrics
- Set up health checks for monitoring uptime
- Consider upgrading to paid plan for 24/7 availability

## Updating Your App

To deploy updates:
1. Push changes to your GitHub repository
2. Render will automatically rebuild and deploy
3. Check the deployment status in your dashboard

## Support

- **Render Documentation**: [render.com/docs](https://render.com/docs)
- **GitHub Issues**: Create issues in your repository
- **Render Community**: [community.render.com](https://community.render.com)