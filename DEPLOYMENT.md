# 🚀 EasyTable API Tester - Deployment Guide

## Quick Deploy Options (Free)

### Option 1: Render (Recommended - 2 minutes)

1. **Push to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/easy-table-api.git
   git push -u origin main
   ```

2. **Deploy on Render**:
   - Go to [render.com](https://render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repo
   - Render will auto-detect the `render.yaml` config
   - Click "Deploy"
   - **Done!** Your app will be live at `https://your-app-name.onrender.com`

### Option 2: Railway (2 minutes)

1. **Push to GitHub** (same as above)
2. **Deploy on Railway**:
   - Go to [railway.app](https://railway.app)
   - Click "Deploy from GitHub repo"
   - Select your repo
   - **Done!** Auto-deploys with zero config

### Option 3: Vercel (1 minute)

1. **Push to GitHub** (same as above)
2. **Deploy on Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repo
   - **Done!** Instant deployment

## Environment Variables (Optional)

If you want to set default API credentials on the server:

**Render/Railway**: Add in dashboard:
- `EASYTABLE_API_KEY=your-api-key`
- `EASYTABLE_PLACE_TOKEN=your-place-token`

**Vercel**: Add in project settings or use `.env` file

## Local Development

```bash
npm install
npm start
# Open http://localhost:3000
```

## Features

✅ **Real-time API testing**  
✅ **Schema validation**  
✅ **Multiple payload presets**  
✅ **Mobile-responsive UI**  
✅ **Credential management**  
✅ **Error handling & debugging**

## Usage

1. Open the deployed URL
2. Choose a preset (Split Mode, ISO Mode, or Minimal)
3. Fill in API credentials (or set as env vars)
4. Click "Test API Call" or "Validate Only"
5. View results in real-time

Perfect for sharing with coworkers for API testing! 🎉 