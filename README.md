//install this https://nodejs.org/en
//then
//start server


# Bible App

A minimalist Bible reading app with annotation features and Google Drive integration.

## 🎯 Features

- 📖 Multiple Bible translations (KJV, NIV, ESV, NKJV)
- ✏️ Drawing and highlighting annotations
- 📱 Touch-friendly interface optimized for touchscreen TVs
- ☁️ Google Drive media integration
- 📑 Multi-tab support
- 🔄 Undo/Redo functionality
- 💾 Local annotation persistence

## 🚀 Live Demo

Visit: `https://[your-username].github.io/bible-app`

## 🛠️ Local Development

1. Clone this repository
2. Install Node.js from https://nodejs.org/en
3. Run: `node server.js`
4. Open: `http://localhost:8080`

## ☁️ Google Drive Setup

To enable Google Drive integration:

1. Create a Google Cloud Console project
2. Enable Google Drive API
3. Create OAuth 2.0 credentials
4. Add your GitHub Pages domain to authorized JavaScript origins
5. Update the API key and Client ID in `app.js`

## 📖 Usage

- Create new tabs with the "+" button
- Switch between Bible and Media modes
- Use the toolbar to draw, highlight, and annotate
- Connect Google Drive folders for media content
- All annotations are saved locally in your browser

## 🎨 Tools

- **Select Tool**: Navigate and select text
- **Pen Tool**: Draw with customizable colors and sizes
- **Highlighter**: Highlight text with transparency
- **Eraser**: Remove annotations
- **Undo/Redo**: Full history management
- **Clear**: Remove all annotations

## 🖥️ TV Setup

1. Open your TV's web browser
2. Navigate to the live demo URL
3. The app will load automatically
4. Use touch gestures to interact

## 🤝 Contributing

Feel free to open issues and submit pull requests! 

## 📄 License

MIT License

# Bible App - Deployment Package

## 📦 What's Included

This folder contains all the essential files needed to deploy your Bible app:

- `index.html` - Main Bible application
- `styles.css` - Styling and responsive design
- `app.js` - Application logic and functionality
- `bible-data.js` - Bible text data (KJV, NIV, ESV, NKJV)
- `package.json` - Project configuration
- `deploy-to-netlify.html` - Deployment guide
- `README.md` - This file

## 🚀 Quick Deployment

### Option 1: Netlify (Recommended)
1. Open `deploy-to-netlify.html` in your browser
2. Follow the step-by-step instructions
3. Drag this entire folder to Netlify's drop zone
4. Get your free URL in seconds

### Option 2: GitHub Pages
1. Create a GitHub repository
2. Upload all files in this folder
3. Enable GitHub Pages in repository settings
4. Access via `https://username.github.io/repository-name`

### Option 3: Any Web Server
1. Upload all files to your web server
2. Access via your domain name
3. Works on any hosting service

## 🎯 Features

- **Multiple Bible Translations**: KJV, NIV, ESV, NKJV
- **Touch-Optimized**: Designed for touchscreen TVs
- **Annotation Tools**: Highlight, underline, circle, erase
- **Session Management**: Annotations persist during session
- **Responsive Design**: Works on all screen sizes
- **Offline Capable**: Bible text stored locally

## 📱 Access URLs

Once deployed, your Bible app will be available at:
- **Netlify**: `https://your-app-name.netlify.app`
- **GitHub Pages**: `https://username.github.io/repository-name`
- **Custom Domain**: Your own domain name

## 🖥️ TV Setup

1. Open your TV's web browser
2. Navigate to your deployed URL
3. The app will load automatically
4. Use touch gestures to interact

## 🧪 Testing

Before deploying to your TV:
1. Test locally by opening `index.html` in a browser
2. Verify all features work correctly
3. Test on different devices if possible

## 📞 Support

If you encounter any issues:
1. Check that all files are present
2. Verify the URL loads on a computer first
3. Ensure your TV's browser supports modern web features

---

**🎉 Your Bible app is ready for deployment!** 