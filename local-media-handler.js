// Local Media Handler
export default class LocalMediaHandler {
    constructor() {
        this.setupMediaView();
    }

    setupMediaView() {
        const mediaContent = `
            <div class="media-workspace">
                <div class="media-thumbnails-section">
                    <div class="media-scroll-container">
                        <div class="media-card add-files" id="refreshMediaBtn">
                            <input type="file" id="fileInput" multiple style="display: none" accept="image/*,video/*,audio/*,.pdf"/>
                            <div class="media-thumbnail">
                                <div class="add-icon">+</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="media-canvas" id="mediaCanvas">
                    <div class="canvas-content">
                        <div class="canvas-placeholder">
                            <div class="placeholder-icon">🖼️</div>
                            <div class="placeholder-text">Drag media here</div>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                .media-workspace {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: #1e1e1e;
                }

                .media-thumbnails-section {
                    flex: 0 0 120px;
                    background: #2d2d2d;
                    border-bottom: 1px solid #3d3d3d;
                    padding: 10px;
                    overflow: hidden;
                }

                .media-scroll-container {
                    display: flex;
                    gap: 10px;
                    overflow-x: auto;
                    overflow-y: hidden;
                    height: 100%;
                    padding-bottom: 10px; /* Space for scrollbar */
                    white-space: nowrap;
                }

                .media-scroll-container::-webkit-scrollbar {
                    height: 6px;
                }

                .media-scroll-container::-webkit-scrollbar-track {
                    background: #1e1e1e;
                    border-radius: 3px;
                }

                .media-scroll-container::-webkit-scrollbar-thumb {
                    background: #4d4d4d;
                    border-radius: 3px;
                }

                .media-scroll-container::-webkit-scrollbar-thumb:hover {
                    background: #555;
                }

                .media-card {
                    flex: 0 0 100px;
                    height: 100px;
                    background: #363636;
                    border-radius: 8px;
                    overflow: hidden;
                    cursor: grab;
                    transition: all 0.2s ease;
                    position: relative;
                }

                .media-card:hover {
                    background: #404040;
                    transform: translateY(-2px);
                }

                .media-card.add-files {
                    cursor: pointer;
                    border: 2px dashed #4d4d4d;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .add-icon {
                    font-size: 32px;
                    color: #6d6d6d;
                }

                .media-thumbnail {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                }

                .media-thumbnail img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .media-thumbnail .file-icon {
                    font-size: 32px;
                    color: #fff;
                }

                .media-canvas {
                    flex: 1;
                    position: relative;
                    overflow: auto;
                }

                .canvas-content {
                    min-height: 100%;
                    position: relative;
                }

                .canvas-placeholder {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    text-align: center;
                    color: #6d6d6d;
                }

                .canvas-media-item {
                    position: absolute;
                    min-width: 150px;
                    min-height: 100px;
                    background: rgba(45, 45, 45, 0.9);
                    border-radius: 8px;
                    overflow: hidden;
                    cursor: grab;
                }

                .canvas-media-item img {
                    width: 100%;
                    height: 100%;
                    object-fit: contain;
                }

                .media-item-controls {
                    position: absolute;
                    top: 5px;
                    right: 5px;
                    display: flex;
                    gap: 5px;
                    opacity: 0;
                    transition: opacity 0.2s;
                }

                .canvas-media-item:hover .media-item-controls {
                    opacity: 1;
                }

                .media-item-controls button {
                    width: 24px;
                    height: 24px;
                    border: none;
                    border-radius: 4px;
                    background: rgba(0, 0, 0, 0.6);
                    color: white;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                }

                .media-item-controls button:hover {
                    background: rgba(0, 0, 0, 0.8);
                }

                .drag-over {
                    border: 2px dashed #4d9fff !important;
                }
            </style>
        `;

        // Replace the media content
        const mediaContentDiv = document.querySelector('.media-content');
        if (mediaContentDiv) {
            mediaContentDiv.innerHTML = mediaContent;
            this.setupEventListeners();
        }
    }

    setupEventListeners() {
        const refreshBtn = document.getElementById('refreshMediaBtn');
        const fileInput = document.getElementById('fileInput');
        
        if (refreshBtn && fileInput) {
            refreshBtn.addEventListener('click', () => {
                fileInput.click();
            });

            fileInput.addEventListener('change', (e) => {
                this.handleFileSelection(e.target.files);
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

    handleFileSelection(files) {
        const scrollContainer = document.querySelector('.media-scroll-container');
        if (!scrollContainer) return;

        // Keep the add files button
        const refreshBtn = scrollContainer.querySelector('#refreshMediaBtn');
        scrollContainer.innerHTML = '';
        if (refreshBtn) scrollContainer.appendChild(refreshBtn);

        Array.from(files).forEach(file => {
            const card = document.createElement('div');
            card.className = 'media-card';
            card.draggable = true;

            const fileType = this.getFileType(file.name.split('.').pop());
            const fileURL = URL.createObjectURL(file);

            card.dataset.mediaPath = fileURL;
            card.dataset.mediaType = fileType;
            card.title = file.name; // Show filename on hover

            let thumbnailHtml = '';
            if (fileType === 'image') {
                thumbnailHtml = `<img src="${fileURL}" alt="${file.name}">`;
            } else {
                thumbnailHtml = `<div class="file-icon">${this.getFileIcon(fileType)}</div>`;
            }

            card.innerHTML = `
                <div class="media-thumbnail">
                    ${thumbnailHtml}
                </div>
            `;

            this.setupDragListeners(card);
            scrollContainer.appendChild(card);
        });
    }

    setupDragListeners(card) {
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', JSON.stringify({
                path: card.dataset.mediaPath,
                type: card.dataset.mediaType,
                name: card.title
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
            contentHtml = `<img src="${mediaData.path}" alt="${mediaData.name}">`;
        } else {
            contentHtml = `<div class="file-icon">${this.getFileIcon(mediaData.type)}</div>`;
        }

        mediaItem.innerHTML = `
            <div class="media-item-content">
                ${contentHtml}
                <div class="media-item-controls">
                    <button class="resize-handle">⤡</button>
                    <button class="remove-item">×</button>
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
}

