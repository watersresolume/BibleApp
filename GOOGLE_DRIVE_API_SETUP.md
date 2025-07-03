# 🔗 Google Drive API Setup Guide

To enable **real file loading** in your Bible App's media tab, you need to set up Google Drive API credentials. This will allow the app to fetch and display your actual Google Drive files as thumbnails.

## 📋 Step-by-Step Setup

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **"New Project"** or select an existing project
3. Give your project a name (e.g., "Bible App Media Integration")
4. Click **"Create"**

### 2. Enable Google Drive API

1. In your Google Cloud Console, go to **APIs & Services > Library**
2. Search for **"Google Drive API"**
3. Click on it and press **"Enable"**

### 3. Create API Credentials

#### A. Create an API Key:
1. Go to **APIs & Services > Credentials**
2. Click **"+ CREATE CREDENTIALS"** → **"API key"**
3. Copy the generated API key
4. Click **"Restrict Key"** for security:
   - Under **"API restrictions"**, select **"Restrict key"**
   - Choose **"Google Drive API"**
   - Under **"Website restrictions"**, add your domain (e.g., `192.168.1.126:8080` or your domain)

#### B. Create OAuth 2.0 Client ID:
1. Still in **Credentials**, click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**
2. If prompted, configure the **OAuth consent screen**:
   - Choose **"External"** (unless you have a Google Workspace)
   - Fill in required fields:
     - App name: "Bible App Media"
     - User support email: Your email
     - Developer contact: Your email
   - Add scopes: `https://www.googleapis.com/auth/drive.readonly`
3. Choose **"Web application"**
4. Add authorized origins: `http://192.168.1.126:8080` (your app's URL)
5. Copy the **Client ID**

### 4. Update Your App Code

Open `bible-app/app.js` and find this section around line 1140:

```javascript
await gapi.client.init({
    apiKey: 'YOUR_API_KEY', // Replace with your actual API key
    clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com', // Replace with your Client ID
    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    scope: 'https://www.googleapis.com/auth/drive.readonly'
});
```

**Replace:**
- `YOUR_API_KEY` with your actual API key
- `YOUR_CLIENT_ID.apps.googleusercontent.com` with your actual Client ID

### 5. Set Folder Permissions

Make sure your Google Drive folder is accessible:

1. Right-click your Google Drive folder
2. Choose **"Share"**
3. Either:
   - **Option A**: Make it **"Anyone with the link can view"** (easiest)
   - **Option B**: Add your Google account email with **"Viewer"** permissions

### 6. Test the Integration

1. Save your changes to `app.js`
2. Refresh your Bible app
3. Switch to a media tab
4. Click the gear icon (⚙️) **"Media Source"** card
5. Paste your Google Drive folder link
6. Click **"Save & Load Media Thumbnails"**

The app should now:
- ✅ Prompt you to sign in to Google (if not already signed in)
- ✅ Load and display your real files as thumbnails
- ✅ Show file types, names, and sizes
- ✅ Allow drag-and-drop of real files to the canvas

## 🔧 Troubleshooting

### "Failed to initialize Google Drive API"
- Check that your API key and Client ID are correct
- Verify that Google Drive API is enabled in Google Cloud Console
- Make sure your domain is added to authorized origins

### "Authentication Required" 
- Click the authentication card to sign in
- Make sure the OAuth consent screen is properly configured
- Check that the scope `https://www.googleapis.com/auth/drive.readonly` is added

### "Error Loading Files"
- Verify that the folder ID is correct
- Check folder permissions (make sure it's shared properly)
- Try refreshing the page and re-authenticating

### No Files Showing
- Make sure there are actually files in the folder
- Check that files aren't in the trash
- Verify folder permissions

## 🔐 Security Notes

- **Never commit your API credentials to version control**
- Consider using environment variables for production
- The `drive.readonly` scope only allows reading files, not modifying them
- API keys should be restricted to specific APIs and domains

## 🎉 Success!

Once set up correctly, your media tab will show **real thumbnails** of your Google Drive files, complete with:
- 🖼️ Actual image thumbnails
- 📁 Proper file type icons
- 📊 File sizes and names
- 🔄 Drag-and-drop functionality with real files

Your Bible app now has full Google Drive integration! 🎊 