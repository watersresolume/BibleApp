// Local Media Handler
export default class LocalMediaHandler {
    constructor() {
        this.mediaFolderPath = "G:\\Shared drives\\Location Assets\\Presentation Media";
        this.setupMediaView();
    }

    setupMediaView() {
        const mediaContent = `
            <div class="media-workspace">
                <div class="media-thumbnails-section">
                    <div class="media-card-grid">
                        <div class="media-card" id="refreshMediaBtn">
                            <div class="card-content">
                                <div class="card-icon">🔄</div>
                                <div class="card-title">Refresh Media</div>
                                <div class="card-subtitle">Click to reload</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="media-canvas" id="mediaCanvas">
                    <div class="canvas-content">
                        <div class="canvas-placeholder">
                            <div class="placeholder-icon">🖼️</div>
                            <div class="placeholder-text">Loading media from ${this.mediaFolderPath}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Replace the media content
        const mediaContentDiv = document.querySelector('.media-content');
        if (mediaContentDiv) {
            mediaContentDiv.innerHTML = mediaContent;
            this.setupEventListeners();
            this.loadMediaFromFolder();
        }
    }

    setupEventListeners() {
        const refreshBtn = document.getElementById('refreshMediaBtn');
        
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadMediaFromFolder();
            });
        }

        // Setup drag and drop for canvas
        const mediaCanvas = document.getElementById('mediaCanvas');
        if (mediaCanvas) {
            mediaCanvas.addEventListener('dragover', (e) => {
                e.preventDefault();
                mediaCanvas.classList.add('drag-over');
            });

            mediaCanvas.addEventListener('dragleave', (e) => {
                if (!mediaCanvas.contains(e.relatedTarget)) {
                    mediaCanvas.classList.remove('drag-over');
                }
            });

            mediaCanvas.addEventListener('drop', (e) => {
                e.preventDefault();
                mediaCanvas.classList.remove('drag-over');
                
                try {
                    const mediaData = JSON.parse(e.dataTransfer.getData('text/plain'));
                    this.addMediaToCanvas(mediaData, e.clientX, e.clientY, mediaCanvas);
                } catch (error) {
                    console.error('Error handling media drop:', error);
                }
            });
        }
    }

    async loadMediaFromFolder() {
        const mediaGrid = document.querySelector('.media-card-grid');
        if (!mediaGrid) return;

        // Keep the refresh button
        const refreshBtn = mediaGrid.querySelector('#refreshMediaBtn');
        mediaGrid.innerHTML = '';
        if (refreshBtn) mediaGrid.appendChild(refreshBtn);

        try {
            // Show loading state
            const loadingCard = document.createElement('div');
            loadingCard.className = 'media-card loading-card';
            loadingCard.innerHTML = `
                <div class="card-content">
                    <div class="card-icon">⏳</div>
                    <div class="card-title">Loading files...</div>
                    <div class="card-subtitle">Reading folder</div>
                </div>
            `;
            mediaGrid.appendChild(loadingCard);

            // Read directory using IPC
            const files = await window.electron.ipcRenderer.invoke('read-directory', this.mediaFolderPath);

            // Remove loading card
            loadingCard.remove();

            // Display files
            files.forEach(file => {
                const mediaCard = document.createElement('div');
                mediaCard.className = 'media-card';
                mediaCard.dataset.mediaPath = file.path;
                mediaCard.dataset.mediaType = this.getFileType(file.type);
                mediaCard.draggable = true;
                
                mediaCard.innerHTML = `
                    <div class="card-content">
                        <div class="card-thumbnail">
                            ${this.getFileType(file.type) === 'image' 
                                ? `<img src="file://${file.path}" alt="${file.name}" onerror="this.parentElement.innerHTML='${this.getFileIcon(this.getFileType(file.type))}'">`
                                : `<div class="card-icon">${this.getFileIcon(this.getFileType(file.type))}</div>`
                            }
                        </div>
                        <div class="card-title" title="${file.name}">${this.truncateFileName(file.name)}</div>
                        <div class="card-subtitle">${this.getFileType(file.type)} • ${this.formatFileSize(file.size)}</div>
                    </div>
                `;

                this.setupDragListeners(mediaCard);
                mediaGrid.appendChild(mediaCard);
            });

            if (files.length === 0) {
                const emptyCard = document.createElement('div');
                emptyCard.className = 'media-card empty-card';
                emptyCard.innerHTML = `
                    <div class="card-content">
                        <div class="card-icon">📂</div>
                        <div class="card-title">Empty Folder</div>
                        <div class="card-subtitle">No media files found</div>
                    </div>
                `;
                mediaGrid.appendChild(emptyCard);
            }

        } catch (error) {
            console.error('Error loading media files:', error);
            const errorCard = document.createElement('div');
            errorCard.className = 'media-card error-card';
            errorCard.innerHTML = `
                <div class="card-content">
                    <div class="card-icon">❌</div>
                    <div class="card-title">Error Loading Files</div>
                    <div class="card-subtitle">${error.message}</div>
                </div>
            `;
            mediaGrid.appendChild(errorCard);
        }
    }

    setupDragListeners(card) {
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', JSON.stringify({
                path: card.dataset.mediaPath,
                type: card.dataset.mediaType,
                name: card.querySelector('.card-title').textContent
            }));
            card.classList.add('dragging');
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });
    }

    addMediaToCanvas(mediaData, x, y, canvas) {
        // Remove placeholder if it exists
        const placeholder = canvas.querySelector('.canvas-placeholder');
        if (placeholder) {
            placeholder.remove();
        }

        // Create media item
        const mediaItem = document.createElement('div');
        mediaItem.className = 'canvas-media-item';
        mediaItem.dataset.mediaPath = mediaData.path;
        mediaItem.style.left = (x - canvas.getBoundingClientRect().left) + 'px';
        mediaItem.style.top = (y - canvas.getBoundingClientRect().top) + 'px';
        
        let contentHtml = '';
        if (mediaData.type === 'image') {
            contentHtml = `<img src="file://${mediaData.path}" alt="${mediaData.name}">`;
        } else {
            contentHtml = `
                <div class="media-item-icon">${this.getFileIcon(mediaData.type)}</div>
                <div class="media-item-name">${mediaData.name}</div>
            `;
        }

        mediaItem.innerHTML = `
            <div class="media-item-content">
                ${contentHtml}
                <div class="media-item-controls">
                    <button class="resize-handle">⤡</button>
                    <button class="remove-item">&times;</button>
                </div>
            </div>
        `;

        canvas.querySelector('.canvas-content').appendChild(mediaItem);
        this.makeMediaItemInteractive(mediaItem);
    }

    makeMediaItemInteractive(item) {
        let isDragging = false;
        let isResizing = false;
        let startX, startY, startLeft, startTop, startWidth, startHeight;

        // Dragging functionality
        const handleMouseDown = (e) => {
            if (e.target.classList.contains('resize-handle')) {
                isResizing = true;
                startX = e.clientX;
                startY = e.clientY;
                startWidth = parseInt(getComputedStyle(item).width);
                startHeight = parseInt(getComputedStyle(item).height);
            } else if (!e.target.classList.contains('remove-item')) {
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                startLeft = parseInt(item.style.left);
                startTop = parseInt(item.style.top);
            }
            
            e.preventDefault();
        };

        const handleMouseMove = (e) => {
            if (isDragging) {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                item.style.left = (startLeft + deltaX) + 'px';
                item.style.top = (startTop + deltaY) + 'px';
            } else if (isResizing) {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                item.style.width = Math.max(150, startWidth + deltaX) + 'px';
                item.style.height = Math.max(100, startHeight + deltaY) + 'px';
            }
        };

        const handleMouseUp = () => {
            isDragging = false;
            isResizing = false;
        };

        item.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        // Remove button functionality
        const removeBtn = item.querySelector('.remove-item');
        removeBtn.addEventListener('click', () => {
            item.remove();
        });
    }

    getFileType(extension) {
        const typeMap = {
            jpg: 'image',
            jpeg: 'image',
            png: 'image',
            gif: 'image',
            mp4: 'video',
            mp3: 'audio',
            pdf: 'pdf'
        };
        return typeMap[extension.toLowerCase()] || 'file';
    }

    getFileIcon(fileType) {
        const icons = {
            image: '🖼️',
            video: '🎥',
            audio: '🎵',
            pdf: '📄',
            file: '📁'
        };
        return icons[fileType] || '📁';
    }

    truncateFileName(name, maxLength = 15) {
        if (name.length <= maxLength) return name;
        const ext = name.split('.').pop();
        const nameWithoutExt = name.slice(0, -(ext.length + 1));
        return nameWithoutExt.slice(0, maxLength - 3) + '...' + ext;
    }

    formatFileSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${Math.round(size * 10) / 10} ${units[unitIndex]}`;
    }
}

// Initialize when the page loads
window.addEventListener('load', () => {
    window.localMediaHandler = new LocalMediaHandler();
});