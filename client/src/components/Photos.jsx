import React, { useEffect, useState, useContext, useRef } from 'react';
import { api } from '../api';
import API_BASE from '../api';
import { useNavigate } from 'react-router-dom';
import { 
    Cloud, Grid, Plus, Bell, MoreHorizontal, ChevronRight, ChevronDown,
    Image as ImageIcon, Heart, Clock, Folder, Users, EyeOff, Trash2, Link,
    Share, Download, Heart as HeartOutline, Trash, X, ChevronLeft, Sidebar, CloudUpload,
    FolderPlus, RefreshCw, AlertTriangle, Grid as GridIcon, Search
} from 'lucide-react';
import $ from 'jquery';
import './Photos.css';
import { AuthContext } from '../context/AuthContext';
import Toast from './Toast';
import DecryptedImage from './DecryptedImage';
import HiddenPasswordModal from './HiddenPasswordModal';
import { encryptFile, decryptFile, bufferToBase64, base64ToBuffer } from '../utils/cryptoUtils';
import { splitIntoShards, reconstructFromShards } from '../utils/erasureUtils';

const Photos = () => {
    const navigate = useNavigate();
    const { user } = useContext(AuthContext);
    
    useEffect(() => {
        document.body.classList.add('settings-theme');
        return () => {
            document.body.classList.remove('settings-theme');
        };
    }, []);

    const [currentView, setCurrentView] = useState('library'); // library, favorites, hidden, deleted, album
    
    // Auto-lock hidden folder when navigating away
    useEffect(() => {
        if (currentView !== 'hidden') {
            setIsHiddenUnlocked(false);
        }
    }, [currentView]);

    const [currentAlbumId, setCurrentAlbumId] = useState(null);
    const [currentAlbumName, setCurrentAlbumName] = useState('');
    
    const [photos, setPhotos] = useState([]);
    const [albums, setAlbums] = useState([]);
    const [recoveryItems, setRecoveryItems] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');

    const filteredPhotos = photos.filter(p => 
        (p.original_name && p.original_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.ai_tags && p.ai_tags.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const filteredRecoveryItems = recoveryItems.filter(item => 
        item.original_name && item.original_name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    const [selectedPhoto, setSelectedPhoto] = useState(null);
    const [selectedRecovery, setSelectedRecovery] = useState(null);
    const [isDragging, setIsDragging] = useState(false);

    const [isHiddenUnlocked, setIsHiddenUnlocked] = useState(false);
    const [showHiddenModal, setShowHiddenModal] = useState(false);
    const [hiddenModalMode, setHiddenModalMode] = useState('verify');
    const [pendingAction, setPendingAction] = useState(null);
    
    
    const [previewPhoto, setPreviewPhoto] = useState(null);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [isCreatingAlbum, setIsCreatingAlbum] = useState(false);
    const [newAlbumName, setNewAlbumName] = useState('');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    
    const [toast, setToast] = useState(null);
    const fileInputRef = useRef(null);

    const showToast = (message, type = 'info') => {
        setToast({ message, type });
    };

    const fetchAlbums = async () => {
        try {
            const res = await api('/api/albums');
            if (res.ok) {
                setAlbums(await res.json());
            }
        } catch (e) {
            console.error('Failed to fetch albums', e);
        }
    };

    const fetchData = async () => {
        setSelectedPhoto(null);
        setSelectedRecovery(null);
        
        try {
            if (currentView === 'deleted') {
                const res = await api('/api/recovery');
                if (res.ok) {
                    const data = await res.json();
                    setRecoveryItems(data.filter(item => item.type === 'photo'));
                }
                return;
            }

            if (currentView === 'album' && currentAlbumId) {
                const res = await api(`/api/albums/${currentAlbumId}/photos`);
                if (res.ok) setPhotos(await res.json());
                return;
            }

            let url = '/api/photos?';
            if (currentView === 'favorites') url += 'is_favorite=true';
            if (currentView === 'hidden') url += 'is_hidden=true';
            
            const res = await api(url);
            if (res.ok) {
                const data = await res.json();
                setPhotos(data);
            }
        } catch (error) {
            console.error('Failed to fetch data', error);
        }
    };

    useEffect(() => {
        fetchAlbums();
    }, []);

    useEffect(() => {
        setSearchQuery('');
        fetchData();
        
        const handleGlobalUpload = () => fetchData();
        window.addEventListener('mashcloud_upload_complete', handleGlobalUpload);
        return () => window.removeEventListener('mashcloud_upload_complete', handleGlobalUpload);
        // eslint-disable-next-line
    }, [currentView, currentAlbumId]);

    const uploadPhotoFile = async (file) => {
        setIsUploading(true);
        try {
            // 1. Get Master Key
            const mkB64 = sessionStorage.getItem('mashcloud_mk');
            if (!mkB64) throw new Error("Encryption key not found. Please log in again.");
            const mkBuffer = base64ToBuffer(mkB64);
            const masterKey = await crypto.subtle.importKey('raw', mkBuffer, 'AES-GCM', true, ['encrypt', 'decrypt']);

            // Extract file buffer to send to worker
            const fileBuffer = await file.arrayBuffer();

            // Web Worker for Encryption and Erasure Coding
            const { shards, ivB64 } = await new Promise((resolve, reject) => {
                const worker = new Worker(new URL('../uploadWorker.js', import.meta.url), { type: 'module' });
                worker.onmessage = (e) => {
                    if (e.data.success) {
                        resolve({ shards: e.data.shards, ivB64: e.data.ivB64 });
                    } else {
                        reject(new Error(e.data.error || 'Worker processing failed'));
                    }
                    worker.terminate();
                };
                worker.onerror = (e) => {
                    reject(new Error('Worker error: ' + e.message));
                    worker.terminate();
                };
                worker.postMessage({
                    fileBuffer,
                    masterKey,
                    dataShards: 4,
                    parityShards: 2
                }, [fileBuffer]); // Transfer fileBuffer
            });

            const dataShards = 4;
            const parityShards = 2;

            // 5. Generate unencrypted AI thumbnail
            let thumbnailBase64 = null;
            if (file.type.startsWith('image/')) {
                const img = new Image();
                img.src = URL.createObjectURL(file);
                await new Promise((resolve) => { img.onload = resolve; });
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const maxSize = 224;
                let width = img.width;
                let height = img.height;
                if (width > height) {
                    if (width > maxSize) {
                        height *= maxSize / width;
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width *= maxSize / height;
                        height = maxSize;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                thumbnailBase64 = canvas.toDataURL('image/jpeg', 0.8);
                URL.revokeObjectURL(img.src);
            } else if (file.type.startsWith('video/')) {
                const video = document.createElement('video');
                video.src = URL.createObjectURL(file);
                video.muted = true;
                video.playsInline = true;
                video.play().catch(() => {});
                await new Promise((resolve) => {
                    video.onloadeddata = () => {
                        video.pause();
                        resolve();
                    };
                    video.onerror = resolve;
                    setTimeout(resolve, 3000);
                });
                if (video.videoWidth) {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const maxSize = 224;
                    let width = video.videoWidth;
                    let height = video.videoHeight;
                    if (width > height) {
                        if (width > maxSize) { height *= maxSize / width; width = maxSize; }
                    } else {
                        if (height > maxSize) { width *= maxSize / height; height = maxSize; }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(video, 0, 0, width, height);
                    thumbnailBase64 = canvas.toDataURL('image/jpeg', 0.8);
                }
                URL.revokeObjectURL(video.src);
            }

            // 6. Upload Multipart
            const formData = new FormData();
            formData.append('originalName', file.name);
            formData.append('mimetype', file.type);
            formData.append('originalSize', file.size.toString());
            formData.append('iv', ivB64);
            formData.append('dataShards', dataShards.toString());
            formData.append('parityShards', parityShards.toString());
            if (thumbnailBase64) {
                formData.append('thumbnail_base64', thumbnailBase64);
            }

            shards.forEach((shard, index) => {
                const blob = new Blob([shard], { type: 'application/octet-stream' });
                formData.append('shards', blob, `shard${index}`);
            });

            const res = await api('/api/photos/upload', {
                method: 'POST',
                body: formData
            });
            const newPhoto = await res.json();
            
            // 7. Send thumbnail to AI
            if (res.ok && newPhoto.id) {
                try {
                    await api('/api/ai/process-photo', {
                        method: 'POST',
                        body: JSON.stringify({ id: newPhoto.id, thumbnailBase64 })
                    });
                } catch (aiErr) {
                    console.error('AI processing failed:', aiErr);
                }
            }
            
            // If we are in an album, also add the photo to the album
            if (currentView === 'album' && currentAlbumId && res.ok && newPhoto.filename) {
                // (Omitted: album logic to be implemented later)
            }
            fetchData();
            showToast('Media uploaded successfully', 'success');
        } catch (error) {
            console.error('Upload failed', error);
            showToast(error.message || 'Upload failed', 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        await uploadPhotoFile(file);
        e.target.value = null; // reset input
    };

    const handleDragEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        if (!isDragging) setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;
        
        if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
            setIsDragging(false);
        }
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const filesDropped = e.dataTransfer.files;
        if (filesDropped.length === 0) return;

        const file = filesDropped[0];
        
        // Smart Routing: If it's a PDF, redirect to Drive and pass the file!
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'pdf') {
            showToast('PDF detected. Routing to Drive...', 'info');
            setTimeout(() => {
                navigate('/drive', { state: { fileToUpload: file } });
            }, 1000);
            return;
        }

        // Accept only photo/video
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            showToast('Only images and videos are accepted in Photos', 'error');
            return;
        }

        await uploadPhotoFile(file);
    };
    
    const handleCreateAlbum = async () => {
        if (!newAlbumName.trim()) return setIsCreatingAlbum(false);
        try {
            await api('/api/albums', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newAlbumName })
            });
            setNewAlbumName('');
            setIsCreatingAlbum(false);
            fetchAlbums();
        } catch (error) {
            showToast('Failed to create album', 'error');
        }
    };

    const handleDelete = async () => {
        if (!selectedPhoto) return;
        try {
            await api(`/api/photos/${selectedPhoto}`, { method: 'DELETE' });
            setSelectedPhoto(null);
            fetchData();
            showToast('Moved to Recently Deleted', 'info');
        } catch (error) {
            console.error('Delete failed', error);
        }
    };
    
    
    const openLightbox = (photo, index) => {
        setPreviewPhoto(photo);
        setPreviewIndex(index);
    };
    
    const closeLightbox = () => {
        setPreviewPhoto(null);
    };
    
    const prevPhoto = (e) => {
        e.stopPropagation();
        const arr = currentView === 'deleted' ? filteredRecoveryItems : filteredPhotos;
        if (previewIndex > 0) {
            setPreviewPhoto(arr[previewIndex - 1]);
            setPreviewIndex(previewIndex - 1);
        }
    };
    
    const nextPhoto = (e) => {
        e.stopPropagation();
        const arr = currentView === 'deleted' ? filteredRecoveryItems : filteredPhotos;
        if (previewIndex < arr.length - 1) {
            setPreviewPhoto(arr[previewIndex + 1]);
            setPreviewIndex(previewIndex + 1);
        }
    };
    const handleToggleFavorite = async () => {
        if (!selectedPhoto) return;
        try {
            await api(`/api/photos/${selectedPhoto}/favorite`, { method: 'POST' });
            fetchData();
        } catch (error) {
            console.error('Favorite toggle failed', error);
        }
    };

    const handleToggleHidden = async (photoIdToToggle = selectedPhoto) => {
        if (!photoIdToToggle) return;
        
        const photoMeta = photos.find(p => p.id === photoIdToToggle);
        if (!photoMeta) return;

        // If we are unhiding (photo is currently hidden) and we haven't unlocked yet
        if (photoMeta.is_hidden && !isHiddenUnlocked) {
            setPendingAction(() => () => toggleHiddenActual(photoIdToToggle));
            
            try {
                const res = await api('/api/hidden-password/status');
                const data = await res.json();
                setHiddenModalMode(data.isSet ? 'verify' : 'setup');
                setShowHiddenModal(true);
            } catch (error) {
                console.error('Failed to check hidden password status', error);
            }
            return;
        }

        await toggleHiddenActual(photoIdToToggle);
    };

    const toggleHiddenActual = async (photoIdToToggle) => {
        try {
            await api(`/api/photos/${photoIdToToggle}/hide`, { method: 'POST' });
            fetchData();
            showToast('Hidden status updated', 'info');
        } catch (error) {
            console.error('Hide toggle failed', error);
        }
    };
    
    const handleHiddenViewClick = async () => {
        if (isHiddenUnlocked) {
            setCurrentView('hidden');
            return;
        }

        try {
            const res = await api('/api/hidden-password/status');
            const data = await res.json();
            
            setPendingAction(() => () => setCurrentView('hidden'));
            setHiddenModalMode(data.isSet ? 'verify' : 'setup');
            setShowHiddenModal(true);
        } catch (error) {
            console.error('Failed to check hidden password status', error);
        }
    };

    const handleRestore = async () => {
        if (!selectedRecovery) return;
        try {
            await api(`/api/recovery/photo/${selectedRecovery}/restore`, { method: 'POST' });
            fetchData();
            showToast('Photo restored', 'info');
        } catch (error) {
            console.error('Restore failed', error);
        }
    };

    const handlePermanentDelete = async () => {
        if (!selectedRecovery) return;
        if (!window.confirm('Are you sure you want to permanently delete this photo? This cannot be undone.')) return;
        try {
            await api(`/api/recovery/photo/${selectedRecovery}/permanent`, { method: 'DELETE' });
            fetchData();
            showToast('Photo permanently deleted', 'info');
        } catch (error) {
            console.error('Permanent delete failed', error);
        }
    };

    useEffect(() => {
        $('body').addClass('photos-theme');
        return () => {
            $('body').removeClass('photos-theme');
        };
    }, []);

    const handleDownload = async (fileId, fileName) => {
        if (!fileId) return;
        try {
            const photoMeta = photos.find(p => p.id === fileId);
            if (!photoMeta) throw new Error("Photo metadata not found locally");
            if (!photoMeta.iv) {
                // Legacy unencrypted file
                const res = await api(`/api/shards/photo/${fileId}/0`);
                if (!res.ok) throw new Error('Download failed');
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                triggerDownload(url, fileName);
                return;
            }

            // 1. Get Master Key
            const mkB64 = sessionStorage.getItem('mashcloud_mk');
            if (!mkB64) throw new Error("Encryption key not found. Please log in again.");
            const masterKey = await crypto.subtle.importKey('raw', base64ToBuffer(mkB64), 'AES-GCM', true, ['encrypt', 'decrypt']);

            // 2. Fetch Shards
            const { data_shards, parity_shards, total_shards, iv } = photoMeta;
            const fetchPromises = [];
            for (let i = 0; i < total_shards; i++) {
                fetchPromises.push(
                    api(`/api/shards/photo/${fileId}/${i}`).then(res => res.ok ? res.arrayBuffer() : null).catch(() => null)
                );
            }
            
            const downloadedShards = await Promise.all(fetchPromises);
            const validShards = downloadedShards.map(buffer => buffer ? new Uint8Array(buffer) : null);
            const numValid = validShards.filter(s => s !== null).length;

            if (numValid < data_shards) {
                throw new Error("Not enough shards could be recovered from the network");
            }

            // 3. Reconstruct
            const reconstructedEncrypted = await reconstructFromShards(validShards, data_shards, parity_shards, Number(photoMeta.size) + 16);

            // 4. Decrypt
            const ivBuffer = base64ToBuffer(iv);
            const decryptedBuffer = await decryptFile(reconstructedEncrypted, ivBuffer, masterKey);

            // 5. Download
            const blob = new Blob([decryptedBuffer], { type: photoMeta.mimetype || 'image/jpeg' });
            const url = window.URL.createObjectURL(blob);
            triggerDownload(url, fileName);
            
        } catch (error) {
            console.error('Download error:', error);
            showToast(error.message || 'Failed to download photo', 'error');
        }
    };

    const triggerDownload = (url, fileName) => {
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName || 'downloaded_photo';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => window.URL.revokeObjectURL(url), 10000);
    };

    const profilePhotoUrl = user?.profile_photo || `https://ui-avatars.com/api/?name=${user?.firstName || 'M'}+${user?.lastName || 'C'}&background=0a84ff&color=fff`;
    
    const storageUsed = user ? user.storage_used : 0;
    const storageQuota = user ? user.storage_quota : 5368709120;
    const isStorageFull = storageUsed >= storageQuota;

    return (
        <div 
            className="photos-app"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {isDragging && (
                <div className="drag-drop-overlay">
                    <div className="drag-drop-content">
                        <CloudUpload size={48} className="drag-icon" color="var(--accent-primary)" style={{ animation: 'bounce 1s infinite' }} />
                        <h3>Drop to Upload to Photos</h3>
                        <p>Only images and videos are accepted in the Photos library.</p>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '12px' }}>
                            💡 PDF files will automatically route and upload to your Drive!
                        </p>
                    </div>
                </div>
            )}
            <nav className="photos-nav">
                <div className="nav-left">
                    <Cloud size={20} style={{cursor: 'pointer'}} onClick={() => navigate('/dashboard')} />
                    <span className="photos-title">Mashcloud <span>Photos</span></span>
                </div>
                <div className="nav-right" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <button className="icon-btn" onClick={() => navigate('/drive')} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                        <GridIcon size={20} />
                    </button>
                    <img src={profilePhotoUrl} alt="Profile" style={{width: '28px', height: '28px', borderRadius: '50%'}} />
                </div>
            </nav>

            <div className="photos-body">
                <aside className="photos-sidebar">
                    <div className="sidebar-section">
                        <div className="sidebar-title">Photos</div>
                        <div className={`sidebar-item ${currentView === 'library' ? 'active' : ''}`} onClick={() => setCurrentView('library')}>
                            <ImageIcon size={18} className="sidebar-icon" />
                            <span>Library</span>
                        </div>
                        <div className={`sidebar-item ${currentView === 'favorites' ? 'active' : ''}`} onClick={() => setCurrentView('favorites')}>
                            <HeartOutline size={18} className="sidebar-icon" />
                            <span>Favorites</span>
                        </div>
                    </div>

                    <div className="sidebar-section">
                        <div className="sidebar-title" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: '10px'}}>
                            Collections
                            <Plus size={16} style={{cursor: 'pointer'}} onClick={() => setIsCreatingAlbum(true)} />
                        </div>
                        {albums.map(album => (
                            <div key={album.id} className={`sidebar-item ${currentView === 'album' && currentAlbumId === album.id ? 'active' : ''}`} onClick={() => { setCurrentView('album'); setCurrentAlbumId(album.id); setCurrentAlbumName(album.name); }}>
                                <Folder size={18} className="sidebar-icon" />
                                <span>{album.name}</span>
                            </div>
                        ))}
                        <div className={`sidebar-item ${currentView === 'hidden' ? 'active' : ''}`} onClick={handleHiddenViewClick}>
                            <EyeOff size={18} className="sidebar-icon" />
                            <span>Hidden</span>
                        </div>
                        <div className={`sidebar-item ${currentView === 'deleted' ? 'active' : ''}`} onClick={() => setCurrentView('deleted')}>
                            <Trash2 size={18} className="sidebar-icon" />
                            <span>Recently Deleted</span>
                        </div>
                    </div>
                </aside>

                <main className="photos-main">
                    <div className="photos-toolbar">
                        <div className="toolbar-left" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                            <Sidebar size={20} className="toolbar-icon hide-on-mobile" />
                            <div className="photos-search-container">
                                <Search size={14} className="search-icon" />
                                <input 
                                    type="text" 
                                    placeholder="Search photos, tags..." 
                                    value={searchQuery} 
                                    onChange={e => setSearchQuery(e.target.value)} 
                                    className="photos-search-input"
                                />
                                {searchQuery && <X size={14} className="search-clear" onClick={() => setSearchQuery('')} />}
                            </div>
                            <div 
                                className="mobile-dropdown-trigger" 
                                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                                style={{ display: 'none', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '18px', fontWeight: '600' }}
                            >
                                <span>
                                    {currentView === 'library' && 'Library'}
                                    {currentView === 'favorites' && 'Favorites'}
                                    {currentView === 'hidden' && 'Hidden'}
                                    {currentView === 'deleted' && 'Recently Deleted'}
                                    {currentView === 'album' && currentAlbumName}
                                </span>
                                <ChevronDown size={18} />
                            </div>
                            
                            {isMobileMenuOpen && (
                                <div className="mobile-dropdown-menu">
                                    <div className={`mobile-dropdown-item ${currentView === 'library' ? 'active' : ''}`} onClick={() => { setCurrentView('library'); setIsMobileMenuOpen(false); }}>
                                        <div className="mobile-dropdown-icon-container"><ImageIcon size={18} /></div>
                                        <span>Library</span>
                                    </div>
                                    <div className={`mobile-dropdown-item ${currentView === 'favorites' ? 'active' : ''}`} onClick={() => { setCurrentView('favorites'); setIsMobileMenuOpen(false); }}>
                                        <div className="mobile-dropdown-icon-container"><HeartOutline size={18} /></div>
                                        <span>Favorites</span>
                                    </div>
                                    <div className={`mobile-dropdown-item ${currentView === 'hidden' ? 'active' : ''}`} onClick={() => { handleHiddenViewClick(); setIsMobileMenuOpen(false); }}>
                                        <div className="mobile-dropdown-icon-container"><EyeOff size={18} /></div>
                                        <span>Hidden</span>
                                    </div>
                                    <div className={`mobile-dropdown-item ${currentView === 'deleted' ? 'active' : ''}`} onClick={() => { setCurrentView('deleted'); setIsMobileMenuOpen(false); }}>
                                        <div className="mobile-dropdown-icon-container"><Trash size={18} /></div>
                                        <span>Recently Deleted</span>
                                    </div>
                                    
                                    <div className="mobile-dropdown-divider"></div>
                                    <div className="mobile-dropdown-section-title">Collections</div>
                                    {albums.map(album => (
                                        <div key={album.id} className={`mobile-dropdown-item ${currentView === 'album' && currentAlbumId === album.id ? 'active' : ''}`} onClick={() => { setCurrentView('album'); setCurrentAlbumId(album.id); setCurrentAlbumName(album.name); setIsMobileMenuOpen(false); }}>
                                            <div className="mobile-dropdown-icon-container"><Folder size={18} /></div>
                                            <span>{album.name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="toolbar-right">
                            {currentView !== 'deleted' && (
                                <>
                                    <input type="file" accept="image/*,video/*" ref={fileInputRef} style={{display: 'none'}} onChange={handlePhotoUpload} />
                                    <CloudUpload size={20} className="toolbar-icon" style={{ cursor: isUploading ? 'wait' : 'pointer', color: isUploading ? '#0a84ff' : '' }} onClick={() => !isUploading && fileInputRef.current.click()} />
                                    
                                    <HeartOutline size={20} className="toolbar-icon" style={{ cursor: selectedPhoto ? 'pointer' : 'not-allowed', color: selectedPhoto ? (photos.find(p => p.id === selectedPhoto)?.is_favorite ? '#0a84ff' : '') : 'rgba(255,255,255,0.2)' }} onClick={handleToggleFavorite} />
                                    
                                    <EyeOff size={20} className="toolbar-icon" style={{ cursor: selectedPhoto ? 'pointer' : 'not-allowed', color: selectedPhoto ? (photos.find(p => p.id === selectedPhoto)?.is_hidden ? '#0a84ff' : '') : 'rgba(255,255,255,0.2)' }} onClick={() => handleToggleHidden()} />
                                    
                                    <Download size={20} className="toolbar-icon" style={{ cursor: selectedPhoto ? 'pointer' : 'not-allowed', color: selectedPhoto ? '' : 'rgba(255,255,255,0.2)' }} onClick={() => selectedPhoto && handleDownload(selectedPhoto, photos.find(p=>p.id===selectedPhoto)?.original_name)} />
                                    
                                    <Trash size={20} className="toolbar-icon" style={{ cursor: selectedPhoto ? 'pointer' : 'not-allowed', color: selectedPhoto ? '#ff3b30' : 'rgba(255,255,255,0.2)' }} onClick={handleDelete} />
                                </>
                            )}

                            {currentView === 'deleted' && (
                                <>
                                    <RefreshCw size={20} className="toolbar-icon" style={{ cursor: selectedRecovery ? 'pointer' : 'not-allowed', color: selectedRecovery ? '#0a84ff' : 'rgba(255,255,255,0.2)' }} onClick={handleRestore} />
                                    <AlertTriangle size={20} className="toolbar-icon" style={{ cursor: selectedRecovery ? 'pointer' : 'not-allowed', color: selectedRecovery ? '#ff3b30' : 'rgba(255,255,255,0.2)' }} onClick={handlePermanentDelete} />
                                </>
                            )}
                        </div>
                    </div>

                    <div className="photo-grid-container">
                        <div className="date-header">
                            {currentView === 'library' && <><h2>All Photos</h2><p>Your complete collection</p></>}
                            {currentView === 'favorites' && <><h2>Favorites</h2><p>Photos you loved</p></>}
                            {currentView === 'hidden' && <><h2>Hidden</h2><p>Private photos</p></>}
                            {currentView === 'deleted' && <><h2>Recently Deleted</h2><p>Will be permanently removed eventually</p></>}
                            {currentView === 'album' && <><h2>{currentAlbumName}</h2><p>Album</p></>}
                        </div>

                        {isCreatingAlbum && (
                            <div style={{padding: '10px 20px', background: '#1c1c1e', marginBottom: '20px', borderRadius: '8px', display: 'flex', gap: '10px'}}>
                                <input 
                                    type="text" 
                                    autoFocus
                                    placeholder="Album Name" 
                                    value={newAlbumName} 
                                    onChange={e => setNewAlbumName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleCreateAlbum()}
                                    style={{flex: 1, background: '#2c2c2e', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: '4px'}}
                                />
                                <button onClick={handleCreateAlbum} style={{background: '#0a84ff', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer'}}>Create</button>
                                <button onClick={() => setIsCreatingAlbum(false)} style={{background: '#424245', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer'}}>Cancel</button>
                            </div>
                        )}

                        <div className="photo-grid">
                            {currentView !== 'deleted' && filteredPhotos.map(photo => (
                                <div 
                                    key={`photo-${photo.id}`} 
                                    className={`photo-item ${selectedPhoto === photo.id ? 'selected' : ''}`}
                                    onClick={() => setSelectedPhoto(photo.id)} onDoubleClick={() => openLightbox(photo, filteredPhotos.indexOf(photo))}
                                >
                                    <DecryptedImage photo={photo} alt="Photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    {photo.is_favorite && <Heart size={16} color="#0a84ff" style={{fill: '#0a84ff', position: 'absolute', bottom: '8px', right: '8px'}} />}
                                    {photo.is_hidden && <EyeOff size={16} color="#fff" style={{position: 'absolute', bottom: '8px', left: '8px', opacity: 0.7}} />}
                                    {photo.ai_tags && (
                                        <div style={{
                                            position: 'absolute', top: 0, left: 0, right: 0, 
                                            background: 'rgba(0,0,0,0.6)', padding: '6px', 
                                            fontSize: '11px', color: '#fff', 
                                            opacity: selectedPhoto === photo.id ? 1 : 0, 
                                            transition: 'opacity 0.2s', zIndex: 10,
                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                        }}>
                                            <span style={{color: '#0a84ff', fontWeight: 'bold'}}>AI Tags:</span> {photo.ai_tags}
                                        </div>
                                    )}
                                </div>
                            ))}
                            
                            {currentView === 'deleted' && filteredRecoveryItems.map(item => (
                                <div 
                                    key={`rec-${item.id}`} 
                                    className={`photo-item ${selectedRecovery === item.id ? 'selected' : ''}`}
                                    onClick={() => setSelectedRecovery(item.id)} onDoubleClick={() => openLightbox(item, filteredRecoveryItems.indexOf(item))}
                                    style={{ border: selectedRecovery === item.id ? '2px solid #0a84ff' : 'none', cursor: 'pointer', position: 'relative', opacity: 0.5 }}
                                >
                                    <DecryptedImage photo={item} alt="Deleted Photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                            ))}
                        </div>
                        
                        {(currentView !== 'deleted' ? filteredPhotos.length === 0 : filteredRecoveryItems.length === 0) && (
                            <div style={{padding: '40px', textAlign: 'center', color: '#a1a1a6'}}>No photos found.</div>
                        )}

                        <div className="photos-footer">
                            <h3>{currentView === 'deleted' ? filteredRecoveryItems.length : filteredPhotos.length} Photos</h3>
                            {isStorageFull && <p>Photos and videos are no longer syncing to Mashcloud</p>}

                            {isStorageFull && (
                                <div className="storage-warning">
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #ff3b30', color: '#ff3b30', borderRadius: '50%', width: '24px', height: '24px', fontSize: '14px', fontWeight: 'bold' }}>!</div>
                                    <div className="storage-warning-text">
                                        <h4>Mashcloud Storage is Full</h4>
                                        <p>New photos and videos won't be synced to Mashcloud</p>
                                        <a href="#" onClick={(e) => { e.preventDefault(); navigate('/settings'); }}>Get More Storage</a>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div>
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
            {previewPhoto && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ position: 'absolute', top: 20, right: 20, display: 'flex', gap: '15px', zIndex: 1001 }}>
                        <button onClick={() => handleDownload(previewPhoto.id, previewPhoto.original_name)} style={{ background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer' }}>
                            <Download size={24} />
                        </button>
                        <button onClick={closeLightbox} style={{ background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer' }}>
                            <X size={28} />
                        </button>
                    </div>
                    
                    <button onClick={prevPhoto} style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', zIndex: 1001, opacity: previewIndex > 0 ? 1 : 0.2 }}>
                        <ChevronLeft size={48} />
                    </button>
                    
                    <div style={{ width: '90%', height: '90%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <DecryptedImage photo={previewPhoto} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} alt="Lightbox" />
                    </div>
                    
                    <button onClick={nextPhoto} style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', zIndex: 1001, opacity: previewIndex < (currentView === 'deleted' ? filteredRecoveryItems.length : filteredPhotos.length) - 1 ? 1 : 0.2 }}>
                        <ChevronRight size={48} />
                    </button>
                </div>
            )}
            {showHiddenModal && (
                <HiddenPasswordModal
                    mode={hiddenModalMode}
                    onSuccess={() => {
                        setIsHiddenUnlocked(true);
                        setShowHiddenModal(false);
                        if (pendingAction) {
                            pendingAction();
                            setPendingAction(null);
                        }
                    }}
                    onCancel={() => {
                        setShowHiddenModal(false);
                        setPendingAction(null);
                    }}
                />
            )}
        </div>
    );
};

export default Photos;
