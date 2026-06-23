import React, { useEffect, useState, useContext, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
    Cloud, Grid, Plus, Bell, MoreHorizontal, ChevronRight, ChevronLeft,
    Image as ImageIcon, Heart, Clock, CheckCircle, Search, Settings, Edit2, Check,
    Share, Download, Heart as HeartOutline, Trash, X, Sidebar, CloudUpload,
    List, Grid as GridIcon, Mail, FolderPlus, RefreshCw, AlertTriangle, Eye, FileText,
    Monitor, FileSpreadsheet, Folder, Trash2, Users, EyeOff, Link
} from 'lucide-react';
import $ from 'jquery';
import './Drive.css';
import { AuthContext } from '../context/AuthContext';
import { api } from '../api';
import { encryptFile, decryptFile, bufferToBase64, base64ToBuffer } from '../utils/cryptoUtils';
import { splitIntoShards, reconstructFromShards } from '../utils/erasureUtils';
import Toast from './Toast';
import DecryptedImage from './DecryptedImage';

const getFileIconBg = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (['pdf'].includes(ext)) return '#ff3b30'; // Red
    if (['ppt', 'pptx'].includes(ext)) return '#ff9500'; // Orange
    if (['doc', 'docx'].includes(ext)) return '#0a84ff'; // Blue
    if (['xls', 'xlsx'].includes(ext)) return '#34c759'; // Green
    if (['zip', 'rar', '7z'].includes(ext)) return '#8e8e93'; // Gray
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return '#ffcc00'; // Yellow
    return '#5c5c5f'; // Default gray
};

const getFileIcon = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (['pdf', 'doc', 'docx'].includes(ext)) return <FileText size={16} color="#fff" />;
    if (['ppt', 'pptx'].includes(ext)) return <Monitor size={16} color="#fff" />;
    if (['xls', 'xlsx'].includes(ext)) return <FileSpreadsheet size={16} color="#fff" />;
    if (['zip', 'rar', '7z'].includes(ext)) return <Folder size={16} color="#fff" />;
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return <ImageIcon size={16} color="#fff" />;
    return <FileText size={16} color="#fff" />;
};

// P2P Swarm Simulation: Parallel Shard Racing
// Instead of waiting for all nodes, we instantly resolve as soon as we hit the required data_shards count.
const fetchShardsWithRacing = async (fileId, totalShards, requiredShards) => {
    return new Promise((resolve, reject) => {
        const validShards = new Array(totalShards).fill(null);
        let successCount = 0;
        let failCount = 0;
        let resolved = false;

        for (let i = 0; i < totalShards; i++) {
            // In a real libp2p mesh, this would ping diverse DHT peers.
            // Here, we simulate routing to parallel nodes by racing the shard requests.
            api(`/api/shards/file/${fileId}/${i}`)
                .then(r => r.ok ? r.arrayBuffer() : Promise.reject('Not OK'))
                .then(buffer => {
                    if (resolved) return;
                    validShards[i] = new Uint8Array(buffer);
                    successCount++;
                    if (successCount >= requiredShards) {
                        resolved = true;
                        resolve(validShards);
                    }
                })
                .catch(() => {
                    if (resolved) return;
                    failCount++;
                    // If too many nodes fail such that we can't meet the required shards, reject
                    if (failCount > totalShards - requiredShards) {
                        resolved = true;
                        reject(new Error("Not enough P2P peers responded to reconstruct file"));
                    }
                });
        }
    });
};

const Drive = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useContext(AuthContext);

    useEffect(() => {
        document.body.classList.add('settings-theme');
        return () => {
            document.body.classList.remove('settings-theme');
        };
    }, []);
    
    const [currentView, setCurrentView] = useState('recents'); // recents, browse, favorites, deleted
    const [currentFolderId, setCurrentFolderId] = useState(null);
    const [folderPath, setFolderPath] = useState([]); // Array of {id, name}
    const [searchQuery, setSearchQuery] = useState('');
    
    const [files, setFiles] = useState([]);
    const [folders, setFolders] = useState([]);
    const [recoveryItems, setRecoveryItems] = useState([]);
    
    const [selectedFile, setSelectedFile] = useState(null);
    const [selectedFolder, setSelectedFolder] = useState(null);
    const [selectedRecovery, setSelectedRecovery] = useState(null); // for deleted view
    
    
    const [previewFile, setPreviewFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [previewContent, setPreviewContent] = useState(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    
    // Context Menu & Advanced Action States
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, file: null });
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const [showGetInfo, setShowGetInfo] = useState(false);
    const [showMoveModal, setShowMoveModal] = useState(false);
    
    const [toast, setToast] = useState(null);
    const fileInputRef = useRef(null);

    const showToast = (message, type = 'info') => {
        setToast({ message, type });
    };

    const groupFilesByDate = (filesToGroup) => {
        const groups = {
            'Today': [],
            'Previous 7 Days': [],
            'Previous 30 Days': []
        };
        const now = new Date();
        const todayStr = now.toLocaleDateString();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        filesToGroup.forEach(f => {
            const date = new Date(f.upload_date);
            if (date.toLocaleDateString() === todayStr) {
                groups['Today'].push(f);
            } else if (date > sevenDaysAgo) {
                groups['Previous 7 Days'].push(f);
            } else if (date > thirtyDaysAgo) {
                groups['Previous 30 Days'].push(f);
            } else {
                const monthYear = date.toLocaleString('default', { month: 'long', year: 'numeric' });
                if (!groups[monthYear]) groups[monthYear] = [];
                groups[monthYear].push(f);
            }
        });
        
        const result = [];
        ['Today', 'Previous 7 Days', 'Previous 30 Days'].forEach(key => {
            if (groups[key] && groups[key].length > 0) result.push({ title: key, items: groups[key] });
        });
        
        const monthKeys = Object.keys(groups).filter(k => !['Today', 'Previous 7 Days', 'Previous 30 Days'].includes(k));
        monthKeys.sort((a, b) => new Date(b) - new Date(a));
        monthKeys.forEach(k => result.push({ title: k, items: groups[k] }));
        
        return result;
    };

    const handleContextMenu = (e, file) => {
        e.preventDefault();
        e.stopPropagation();
        setSelectedFile(file.id);
        setSelectedFolder(null);
        setContextMenu({
            visible: true,
            x: Math.min(e.pageX, window.innerWidth - 250),
            y: Math.min(e.pageY, window.innerHeight - 350),
            file
        });
    };

    const closeContextMenu = () => {
        if (contextMenu.visible) setContextMenu({ ...contextMenu, visible: false });
    };

    useEffect(() => {
        window.addEventListener('click', closeContextMenu);
        return () => window.removeEventListener('click', closeContextMenu);
    }, [contextMenu]);

    const handleAdvancedAction = async (action) => {
        const file = contextMenu.file;
        if (!file) return;
        
        try {
            if (action === 'rename') {
                setRenameValue(file.original_name);
                setIsRenaming(true);
            } else if (action === 'duplicate') {
                showToast('Duplicating...', 'info');
                const res = await api(`/api/files/${file.id}/duplicate`, { method: 'POST' });
                if (res.ok) {
                    showToast('File duplicated', 'success');
                    fetchData();
                } else {
                    showToast('Failed to duplicate', 'error');
                }
            } else if (action === 'info') {
                setShowGetInfo(true);
            } else if (action === 'move') {
                setShowMoveModal(true);
            }
        } catch (err) {
            console.error(err);
            showToast('Action failed', 'error');
        }
    };

    const submitRename = async () => {
        if (!renameValue.trim() || !contextMenu.file) return setIsRenaming(false);
        try {
            await api(`/api/files/${contextMenu.file.id}/rename`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: renameValue })
            });
            setIsRenaming(false);
            fetchData();
            showToast('File renamed', 'success');
        } catch (err) {
            showToast('Rename failed', 'error');
        }
    };

    const submitMove = async (targetFolderId) => {
        if (!contextMenu.file) return setShowMoveModal(false);
        try {
            await api(`/api/files/${contextMenu.file.id}/move`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder_id: targetFolderId })
            });
            setShowMoveModal(false);
            fetchData();
            showToast('File moved', 'success');
        } catch (err) {
            showToast('Move failed', 'error');
        }
    };

    const fetchData = async () => {
        setSelectedFile(null);
        setSelectedFolder(null);
        setSelectedRecovery(null);
        
        try {
            if (currentView === 'deleted') {
                const res = await api('/api/recovery');
                if (res.ok) {
                    const data = await res.json();
                    setRecoveryItems(data.filter(item => item.type === 'file'));
                }
                return;
            }

            let fileUrl = '/api/files';
            if (currentView === 'favorites') {
                fileUrl += '?is_favorite=true';
                const fileRes = await api(fileUrl);
                if (fileRes.ok) setFiles(await fileRes.json());
                setFolders([]); // No folders in favorites view for now
            } else if (currentView === 'browse') {
                fileUrl += `?folder_id=${currentFolderId || 'null'}`;
                const folderUrl = `/api/folders?parent_id=${currentFolderId || 'null'}`;
                
                const [fileRes, folderRes] = await Promise.all([
                    api(fileUrl),
                    api(folderUrl)
                ]);
                
                if (fileRes.ok) setFiles(await fileRes.json());
                if (folderRes.ok) setFolders(await folderRes.json());
            } else {
                // recents - get everything, ignore folders
                const fileRes = await api('/api/files');
                if (fileRes.ok) setFiles(await fileRes.json());
                setFolders([]);
            }
        } catch (error) {
            console.error('Failed to fetch data', error);
        }
    };

    useEffect(() => {
        setSearchQuery('');
        fetchData();
        
        // Initialize the Hyperspace AI Pod node
        const aiWorker = new Worker(new URL('../utils/aiPodWorker.js', import.meta.url), { type: 'module' });
        aiWorker.onmessage = (e) => {
            console.log("Mesh AI Task Completed:", e.data);
        };
        // Simulate receiving a DHT workload after 5 seconds
        setTimeout(() => {
            aiWorker.postMessage({ taskId: 'sim-dht-1', type: 'document_summary' });
        }, 5000);

        const handleGlobalUpload = () => fetchData();
        window.addEventListener('mashcloud_upload_complete', handleGlobalUpload);
        return () => {
            window.removeEventListener('mashcloud_upload_complete', handleGlobalUpload);
            aiWorker.terminate();
        };
        // eslint-disable-next-line
    }, [currentView, currentFolderId]);

    useEffect(() => {
        if (location.state && location.state.fileToUpload) {
            const file = location.state.fileToUpload;
            // Clear location state to prevent repeat uploads on refresh
            navigate(location.pathname, { replace: true, state: {} });
            
            showToast(`Received PDF file from Photos: ${file.name}`, 'info');
            uploadFileRaw(file);
        }
    }, [location]);

    const uploadFileRaw = async (file) => {
        setIsUploading(true);
        try {
            const mkB64 = sessionStorage.getItem('mashcloud_mk');
            if (!mkB64) throw new Error("Encryption key not found. Please log in again.");
            const mkBuffer = base64ToBuffer(mkB64);
            const masterKey = await crypto.subtle.importKey('raw', mkBuffer, 'AES-GCM', true, ['encrypt', 'decrypt']);

            const fileBuffer = await file.arrayBuffer();

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
                }, [fileBuffer]);
            });

            const dataShards = 4;
            const parityShards = 2;

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
                    if (width > maxSize) { height *= maxSize / width; width = maxSize; }
                } else {
                    if (height > maxSize) { width *= maxSize / height; height = maxSize; }
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
                    video.onloadeddata = () => { video.pause(); resolve(); };
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

            let textSnippet = null;
            if (file.type === 'text/plain' || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
                const text = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.readAsText(file);
                });
                textSnippet = text.substring(0, 1000);
            }

            const formData = new FormData();
            formData.append('originalName', file.name);
            formData.append('mimetype', file.type || 'application/octet-stream');
            formData.append('originalSize', file.size.toString());
            if (currentView === 'browse' && currentFolderId) {
                formData.append('folder_id', currentFolderId);
            }
            formData.append('iv', ivB64);
            formData.append('dataShards', dataShards.toString());
            formData.append('parityShards', parityShards.toString());
            if (thumbnailBase64) formData.append('thumbnail_base64', thumbnailBase64);

            shards.forEach((shard, index) => {
                const blob = new Blob([shard], { type: 'application/octet-stream' });
                formData.append('shards', blob, `shard${index}`);
            });

            const res = await api('/api/files/upload', {
                method: 'POST',
                body: formData
            });
            const newFile = await res.json();
            
            if (textSnippet && res.ok && newFile.id) {
                try {
                    await api('/api/ai/process-document', {
                        method: 'POST',
                        body: JSON.stringify({ id: newFile.id, textSnippet })
                    });
                } catch (aiErr) {
                    console.error('AI processing failed:', aiErr);
                }
            }

            fetchData();
            showToast('File uploaded successfully', 'success');
        } catch (error) {
            console.error('Upload failed', error);
            showToast(error.message || 'Upload failed', 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        await uploadFileRaw(file);
        e.target.value = null; // reset input
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return setIsCreatingFolder(false);
        try {
            await api('/api/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newFolderName, parent_id: currentFolderId })
            });
            setNewFolderName('');
            setIsCreatingFolder(false);
            fetchData();
        } catch (error) {
            showToast('Failed to create folder', 'error');
        }
    };

    const handleDelete = async () => {
        if (!selectedFile) return;
        try {
            await api(`/api/files/${selectedFile}`, { method: 'DELETE' });
            setSelectedFile(null);
            fetchData();
            showToast('Moved to Recently Deleted', 'info');
        } catch (error) {
            console.error('Delete failed', error);
        }
    };

    const handleToggleFavorite = async () => {
        if (!selectedFile) return;
        try {
            await api(`/api/files/${selectedFile}/favorite`, { method: 'POST' });
            fetchData();
        } catch (error) {
            console.error('Favorite toggle failed', error);
        }
    };

    const handleRestore = async () => {
        if (!selectedRecovery) return;
        try {
            await api(`/api/recovery/file/${selectedRecovery}/restore`, { method: 'POST' });
            fetchData();
            showToast('File restored', 'info');
        } catch (error) {
            console.error('Restore failed', error);
        }
    };

    const handlePermanentDelete = async () => {
        if (!selectedRecovery) return;
        if (!window.confirm('Are you sure you want to permanently delete this file? This cannot be undone.')) return;
        try {
            await api(`/api/recovery/file/${selectedRecovery}/permanent`, { method: 'DELETE' });
            fetchData();
            showToast('File permanently deleted', 'info');
        } catch (error) {
            console.error('Permanent delete failed', error);
        }
    };

    useEffect(() => {
        $('body').addClass('drive-theme');
        return () => {
            $('body').removeClass('drive-theme');
        };
    }, []);

    
    const handleDeleteFolder = async () => {
        if (!selectedFolder) return;
        try {
            const res = await api('/api/folders/' + selectedFolder, { method: 'DELETE' });
            if (res.ok) {
                showToast("Folder deleted successfully", "success");
                setSelectedFolder(null);
                fetchFiles();
            } else {
                showToast("Failed to delete folder", "error");
            }
        } catch (err) {
            showToast("Error deleting folder", "error");
        }
    };
    
    const handlePreview = async (file) => {
        setPreviewFile(file);
        setIsPreviewLoading(true);
        setPreviewUrl(null);
        setPreviewContent(null);
        
        try {
            let blob;
            if (!file.iv) {
                const res = await api(`/api/shards/file/${file.id}/0`);
                if (!res.ok) throw new Error('Download failed');
                blob = await res.blob();
            } else {
                const mkB64 = sessionStorage.getItem('mashcloud_mk');
                if (!mkB64) throw new Error("Encryption key not found.");
                const masterKey = await crypto.subtle.importKey('raw', base64ToBuffer(mkB64), 'AES-GCM', true, ['encrypt', 'decrypt']);
                
                // Swarm Fetching: Race the shards, don't wait for slow peers
                const validShards = await fetchShardsWithRacing(file.id, file.total_shards, file.data_shards);
                
                const reconstructedEncrypted = await reconstructFromShards(validShards, file.data_shards, file.parity_shards, Number(file.size) + 16);
                const ivBuffer = base64ToBuffer(file.iv);
                const decryptedBuffer = await decryptFile(reconstructedEncrypted, ivBuffer, masterKey);
                blob = new Blob([decryptedBuffer], { type: file.mimetype || 'application/octet-stream' });
            }
            
            const mime = file.mimetype || '';
            if (mime.startsWith('text/')) {
                const text = await blob.text();
                setPreviewContent(text);
            } else {
                setPreviewUrl(window.URL.createObjectURL(blob));
            }
        } catch (err) {
            showToast("Preview failed: " + err.message, "error");
            setPreviewFile(null);
        } finally {
            setIsPreviewLoading(false);
        }
    };
    
    const closePreview = () => {
        if (previewUrl) window.URL.revokeObjectURL(previewUrl);
        setPreviewFile(null);
        setPreviewUrl(null);
        setPreviewContent(null);
    };
    const handleDownload = async (fileId, fileName) => {
        if (!fileId) return;
        try {
            const fileMeta = files.find(f => f.id === fileId);
            if (!fileMeta) throw new Error("File metadata not found locally");
            if (!fileMeta.iv) {
                // Legacy unencrypted file
                const res = await api(`/api/shards/file/${fileId}/0`);
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

            // 2. Fetch Shards via P2P Swarm Racing
            const { data_shards, parity_shards, total_shards, iv } = fileMeta;
            
            const validShards = await fetchShardsWithRacing(fileId, total_shards, data_shards);

            // 3. Reconstruct
            const reconstructedEncrypted = await reconstructFromShards(validShards, data_shards, parity_shards, Number(fileMeta.size) + 16);

            // 4. Decrypt
            const ivBuffer = base64ToBuffer(iv);
            const decryptedBuffer = await decryptFile(reconstructedEncrypted, ivBuffer, masterKey);

            // 5. Download
            const blob = new Blob([decryptedBuffer], { type: fileMeta.mimetype || 'application/octet-stream' });
            const url = window.URL.createObjectURL(blob);
            triggerDownload(url, fileName);
            
        } catch (error) {
            console.error('Download error:', error);
            showToast(error.message || 'Failed to download file', 'error');
        }
    };

    const triggerDownload = (url, fileName) => {
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName || 'downloaded_file';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => window.URL.revokeObjectURL(url), 10000);
    };

    const filteredFiles = files.filter(f => 
        f.original_name && f.original_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredFolders = folders.filter(f => 
        f.name && f.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredRecoveryItems = recoveryItems.filter(item => 
        item.original_name && item.original_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const profilePhotoUrl = user?.profile_photo || `https://ui-avatars.com/api/?name=${user?.firstName || 'M'}+${user?.lastName || 'C'}&background=0a84ff&color=fff`;

    return (
        <div className="drive-app">
            <nav className="drive-nav">
                <div className="nav-left">
                    <Cloud size={20} style={{cursor: 'pointer'}} onClick={() => navigate('/dashboard')} />
                    <span className="drive-title">Mashcloud <span>Drive</span></span>
                </div>
                <div className="nav-right" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <button className="icon-btn" onClick={() => navigate('/photos')} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                        <GridIcon size={20} />
                    </button>
                    <img src={profilePhotoUrl} alt="Profile" style={{width: '28px', height: '28px', borderRadius: '50%'}} />
                </div>
            </nav>

            <div className="drive-body">
                <aside className="drive-sidebar">
                    <div className="drive-sidebar-section">
                        <div className={`drive-sidebar-item ${currentView === 'recents' ? 'active' : ''}`} onClick={() => { setCurrentView('recents'); setCurrentFolderId(null); setFolderPath([]); }}>
                            <Clock size={18} className="drive-sidebar-icon" />
                            <span>Recents</span>
                        </div>
                        <div className={`drive-sidebar-item ${currentView === 'browse' ? 'active' : ''}`} onClick={() => { setCurrentView('browse'); setCurrentFolderId(null); setFolderPath([]); }}>
                            <Folder size={18} className="drive-sidebar-icon" />
                            <span>Browse</span>
                        </div>
                        <div className={`drive-sidebar-item ${currentView === 'favorites' ? 'active' : ''}`} onClick={() => { setCurrentView('favorites'); setCurrentFolderId(null); setFolderPath([]); }}>
                            <Heart size={18} className="drive-sidebar-icon" />
                            <span>Favorites</span>
                        </div>
                        <div className={`drive-sidebar-item ${currentView === 'deleted' ? 'active' : ''}`} onClick={() => { setCurrentView('deleted'); setCurrentFolderId(null); setFolderPath([]); }}>
                            <Trash2 size={18} className="drive-sidebar-icon" />
                            <span>Recently Deleted</span>
                        </div>
                    </div>
                    
                    <div className="drive-sidebar-section" style={{marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)'}}>
                        <div className="drive-sidebar-item" style={{opacity: 0.8, cursor: 'default'}}>
                            <div style={{width: '8px', height: '8px', borderRadius: '50%', background: '#34c759', marginRight: '12px', boxShadow: '0 0 8px #34c759'}}></div>
                            <div style={{display: 'flex', flexDirection: 'column'}}>
                                <span style={{fontSize: '12px', fontWeight: '600'}}>Mesh Node Active</span>
                                <span style={{fontSize: '10px', opacity: 0.6}}>Providing 2.4 TFLOPS to Pod</span>
                            </div>
                        </div>
                    </div>
                </aside>

                <main className="drive-main">
                    <div className="drive-toolbar">
                        <div className="drive-toolbar-left">
                            {currentView === 'browse' && folderPath.length > 0 && (
                                <div style={{display: 'flex', alignItems: 'center', gap: '5px', color: '#0a84ff', cursor: 'pointer', marginRight: 'var(--space-sm)'}} onClick={() => {
                                    const newPath = [...folderPath];
                                    newPath.pop();
                                    setFolderPath(newPath);
                                    setCurrentFolderId(newPath.length > 0 ? newPath[newPath.length - 1].id : null);
                                }}>
                                    <ChevronLeft size={16} /> Back
                                </div>
                            )}
                            <div className="drive-search-container">
                                <Search size={14} className="search-icon" />
                                <input 
                                    type="text" 
                                    placeholder="Search Drive..." 
                                    value={searchQuery} 
                                    onChange={e => setSearchQuery(e.target.value)} 
                                    className="drive-search-input"
                                />
                                {searchQuery && <X size={14} className="search-clear" onClick={() => setSearchQuery('')} />}
                            </div>
                        </div>
                        <div className="drive-toolbar-right">
                            {currentView !== 'deleted' && (
                                <>
                                    {currentView === 'browse' && (
                                        <FolderPlus size={20} className="drive-toolbar-icon" onClick={() => setIsCreatingFolder(true)} />
                                    )}
                                    <input type="file" ref={fileInputRef} style={{display: 'none'}} onChange={handleFileUpload} />
                                    <CloudUpload size={20} className="drive-toolbar-icon" style={{ cursor: isUploading ? 'wait' : 'pointer', color: isUploading ? '#0a84ff' : '' }} onClick={() => !isUploading && fileInputRef.current.click()} />
                                    
                                    <HeartOutline size={20} className="drive-toolbar-icon" style={{ cursor: selectedFile ? 'pointer' : 'not-allowed', color: selectedFile ? (files.find(f => f.id === selectedFile)?.is_favorite ? '#0a84ff' : '') : 'rgba(255,255,255,0.2)' }} onClick={handleToggleFavorite} />
                                    <Eye size={20} className="drive-toolbar-icon" style={{ cursor: selectedFile ? 'pointer' : 'not-allowed', color: selectedFile ? '' : 'rgba(255,255,255,0.2)' }} onClick={() => selectedFile && handlePreview(files.find(f => f.id === selectedFile))} />
                                    <Download size={20} className="drive-toolbar-icon" style={{ cursor: selectedFile ? 'pointer' : 'not-allowed', color: selectedFile ? '' : 'rgba(255,255,255,0.2)' }} onClick={() => selectedFile && handleDownload(selectedFile, files.find(f=>f.id===selectedFile)?.original_name)} />
                                    
                                    <Trash size={20} className="drive-toolbar-icon" style={{ cursor: selectedFile || selectedFolder ? 'pointer' : 'not-allowed', color: selectedFile || selectedFolder ? '#ff3b30' : 'rgba(255,255,255,0.2)' }} onClick={selectedFile ? handleDelete : () => handleDeleteFolder()} />
                                </>
                            )}
                            
                            {currentView === 'deleted' && (
                                <>
                                    <RefreshCw size={20} className="drive-toolbar-icon" style={{ cursor: selectedRecovery ? 'pointer' : 'not-allowed', color: selectedRecovery ? '#0a84ff' : 'rgba(255,255,255,0.2)' }} onClick={handleRestore} />
                                    <AlertTriangle size={20} className="drive-toolbar-icon" style={{ cursor: selectedRecovery ? 'pointer' : 'not-allowed', color: selectedRecovery ? '#ff3b30' : 'rgba(255,255,255,0.2)' }} onClick={handlePermanentDelete} />
                                </>
                            )}
                        </div>
                    </div>

                    <div className="drive-list-container">
                        <div className="drive-list-header-title">
                            {currentView === 'recents' && <><Clock size={24} color="#f5f5f7" /><h2>Recents</h2></>}
                            {currentView === 'favorites' && <><Heart size={24} color="#f5f5f7" /><h2>Favorites</h2></>}
                            {currentView === 'deleted' && <><Trash2 size={24} color="#f5f5f7" /><h2>Recently Deleted</h2></>}
                            {currentView === 'browse' && <><Folder size={24} color="#f5f5f7" /><h2>{folderPath.length > 0 ? folderPath[folderPath.length - 1].name : 'Browse'}</h2></>}
                        </div>

                        {isCreatingFolder && (
                            <div style={{padding: '10px 20px', background: '#1c1c1e', margin: '0 40px 20px 40px', borderRadius: '8px', display: 'flex', gap: '10px'}}>
                                <input 
                                    type="text" 
                                    autoFocus
                                    placeholder="Folder Name" 
                                    value={newFolderName} 
                                    onChange={e => setNewFolderName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                                    style={{flex: 1, background: '#2c2c2e', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: '4px'}}
                                />
                                <button onClick={handleCreateFolder} style={{background: '#0a84ff', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer'}}>Create</button>
                                <button onClick={() => setIsCreatingFolder(false)} style={{background: '#424245', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer'}}>Cancel</button>
                            </div>
                        )}

                        <div className="drive-table">
                            <div className="drive-table-header">
                                <div>Name</div>
                                <div>Kind</div>
                                <div>Size</div>
                                <div>Date</div>
                            </div>

                            {/* Folders */}
                            {filteredFolders.length > 0 && <div className="drive-section-header">Folders <span>{filteredFolders.length}</span></div>}
                            {filteredFolders.map(folder => (
                                <div 
                                    key={`folder-${folder.id}`} 
                                    className={`drive-table-row ${selectedFolder === folder.id ? 'selected' : ''}`} 
                                    onClick={() => { setSelectedFolder(folder.id); setSelectedFile(null); }}
                                    onDoubleClick={() => {
                                        setFolderPath([...folderPath, {id: folder.id, name: folder.name}]);
                                        setCurrentFolderId(folder.id);
                                    }}
                                >
                                    <div className="drive-cell drive-cell-name">
                                        <Folder size={18} color="#0a84ff" style={{marginRight: '12px'}} />
                                        {folder.name}
                                    </div>
                                    <div className="drive-cell">Folder</div>
                                    <div className="drive-cell">--</div>
                                    <div className="drive-cell">{new Date(folder.created_at).toLocaleString()}</div>
                                </div>
                            ))}

                            {/* Files */}
                            {currentView !== 'deleted' && (
                                <>
                                    {groupFilesByDate(filteredFiles).map((group) => (
                                        <React.Fragment key={group.title}>
                                            <div className="drive-section-header">{group.title} <span>{group.items.length} {group.items.length === 1 ? 'item' : 'items'}</span></div>
                                            {group.items.map(file => (
                                                <div 
                                                    key={`file-${file.id}`} 
                                                    className={`drive-table-row ${selectedFile === file.id ? 'selected' : ''}`} 
                                                    style={{ position: 'relative' }}
                                                    onClick={() => { setSelectedFile(file.id); setSelectedFolder(null); }}
                                                    onDoubleClick={() => handlePreview(file)}
                                                    onContextMenu={(e) => handleContextMenu(e, file)}
                                                >
                                                    <div className="drive-cell drive-cell-name" style={{alignItems: 'flex-start', paddingTop: '12px'}}>
                                                        <div className="drive-file-icon" style={{
                                                            marginTop: '2px', 
                                                            background: getFileIconBg(file.original_name),
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            borderRadius: '6px', width: '32px', height: '32px', overflow: 'hidden'
                                                        }}>
                                                            {file.mimetype && file.mimetype.startsWith('image/') ? (
                                                                <DecryptedImage photo={file} type="file" alt={file.original_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                            ) : (
                                                                getFileIcon(file.original_name)
                                                            )}
                                                        </div>
                                                        <div style={{display: 'flex', flexDirection: 'column', flex: 1}}>
                                                            <div style={{display: 'flex', alignItems: 'center'}}>
                                                                {file.original_name}
                                                                {file.is_favorite && <Heart size={12} color="#0a84ff" style={{marginLeft: '8px', fill: '#0a84ff'}} />}
                                                            </div>
                                                            {file.ai_summary && (
                                                                <div style={{fontSize: '12px', color: '#86868b', marginTop: '6px', maxWidth: '400px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                                                                    <span style={{color: '#0a84ff', fontWeight: 'bold'}}>AI Summary:</span> {file.ai_summary}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="drive-cell" style={{textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '150px'}}>{file.mimetype}</div>
                                                    <div className="drive-cell">{(file.size / 1024).toFixed(2)} KB</div>
                                                    <div className="drive-cell">
                                                        {new Date(file.upload_date).toLocaleString()}
                                                        <div 
                                                            className="row-ellipsis-btn" 
                                                            style={{
                                                                display: selectedFile === file.id ? 'flex' : 'none',
                                                                position: 'absolute',
                                                                right: '20px',
                                                                top: '50%',
                                                                transform: 'translateY(-50%)',
                                                                background: '#0a84ff',
                                                                borderRadius: '50%',
                                                                width: '28px',
                                                                height: '28px',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                cursor: 'pointer'
                                                            }}
                                                            onClick={(e) => handleContextMenu(e, file)}
                                                        >
                                                            <MoreHorizontal size={18} color="#fff" />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                    {filteredFiles.length === 0 && filteredFolders.length === 0 && <div style={{padding: '40px', textAlign: 'center', color: '#a1a1a6'}}>No items found.</div>}
                                </>
                            )}

                            {/* Recovery Items */}
                            {currentView === 'deleted' && (
                                <>
                                    <div className="drive-section-header">Deleted Files <span>{filteredRecoveryItems.length}</span></div>
                                    {filteredRecoveryItems.map(item => (
                                        <div 
                                            key={`rec-${item.id}`} 
                                            className={`drive-table-row ${selectedRecovery === item.id ? 'selected' : ''}`} 
                                            onClick={() => setSelectedRecovery(item.id)}
                                        >
                                            <div className="drive-cell drive-cell-name">
                                                <div className="drive-file-icon" style={{
                                                    background: getFileIconBg(item.original_name),
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    borderRadius: '6px', width: '32px', height: '32px', overflow: 'hidden'
                                                }}>
                                                    {getFileIcon(item.original_name)}
                                                </div>
                                                <span style={{textDecoration: 'line-through', color: '#888'}}>{item.original_name}</span>
                                            </div>
                                            <div className="drive-cell">Deleted File</div>
                                            <div className="drive-cell">{(item.size / 1024).toFixed(2)} KB</div>
                                            <div className="drive-cell">{new Date(item.deleted_at).toLocaleString()}</div>
                                        </div>
                                    ))}
                                    {filteredRecoveryItems.length === 0 && <div style={{padding: '40px', textAlign: 'center', color: '#a1a1a6'}}>No deleted files.</div>}
                                </>
                            )}
                        </div>
                    </div>
                </main>
            </div>
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
            {previewFile && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ position: 'absolute', top: 20, right: 20, display: 'flex', gap: '10px' }}>
                        <button onClick={() => handleDownload(previewFile.id, previewFile.original_name)} style={{ background: '#0a84ff', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <Download size={16} /> Download
                        </button>
                        <button onClick={closePreview} style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <X size={20} />
                        </button>
                    </div>
                    
                    {isPreviewLoading ? (
                        <div className="spinner"></div>
                    ) : (
                        <div style={{ width: '80%', height: '80%', background: '#1c1c1e', borderRadius: '12px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {previewFile.mimetype?.startsWith('image/') && previewUrl ? (
                                <img src={previewUrl} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} alt="Preview" />
                            ) : previewFile.mimetype?.startsWith('text/') && previewContent !== null ? (
                                <pre style={{ width: '100%', height: '100%', overflow: 'auto', padding: '20px', margin: 0, color: '#fff', textAlign: 'left', whiteSpace: 'pre-wrap' }}>
                                    {previewContent}
                                </pre>
                            ) : previewFile.mimetype === 'application/pdf' && previewUrl ? (
                                <iframe src={previewUrl} style={{ width: '100%', height: '100%', border: 'none' }} title="PDF Preview" />
                            ) : previewFile.mimetype?.startsWith('video/') && previewUrl ? (
                                <video src={previewUrl} controls autoPlay style={{ maxWidth: '100%', maxHeight: '100%' }} />
                            ) : previewFile.mimetype?.startsWith('audio/') && previewUrl ? (
                                <audio src={previewUrl} controls autoPlay />
                            ) : (
                                <div style={{ color: '#a1a1a6', textAlign: 'center' }}>
                                    <FileText size={64} style={{ marginBottom: '16px', opacity: 0.5 }} />
                                    <p>No preview available for this file type.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Context Menu */}
            {contextMenu.visible && (
                <div 
                    className="context-menu" 
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    <div className="context-menu-item" onClick={() => { handlePreview(contextMenu.file); closeContextMenu(); }}>
                        <Eye size={16} /> Open
                    </div>
                    <div className="context-menu-divider" />
                    <div className="context-menu-item" onClick={() => { handleAdvancedAction('info'); closeContextMenu(); }}>
                        <FileText size={16} /> Get Info
                    </div>
                    <div className="context-menu-item" onClick={() => { handleAdvancedAction('rename'); closeContextMenu(); }}>
                        <FileText size={16} /> Rename
                    </div>
                    <div className="context-menu-divider" />
                    <div className="context-menu-item" onClick={() => { handleDownload(contextMenu.file.id, contextMenu.file.original_name); closeContextMenu(); }}>
                        <Download size={16} /> Download a Copy...
                    </div>
                    <div className="context-menu-item" onClick={() => { handleAdvancedAction('duplicate'); closeContextMenu(); }}>
                        <FileText size={16} /> Duplicate
                    </div>
                    <div className="context-menu-item" onClick={() => { handleAdvancedAction('move'); closeContextMenu(); }}>
                        <Folder size={16} /> Move to Folder...
                    </div>
                    <div className="context-menu-divider" />
                    <div className="context-menu-item" style={{ color: '#ff3b30' }} onClick={() => { handleDelete(); closeContextMenu(); }}>
                        <Trash size={16} /> Delete Selected
                    </div>
                </div>
            )}

            {/* Rename Modal */}
            {isRenaming && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Rename File</h3>
                        <input 
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && submitRename()}
                            className="rename-input"
                        />
                        <div className="modal-actions">
                            <button onClick={() => setIsRenaming(false)}>Cancel</button>
                            <button onClick={submitRename} style={{ color: '#0a84ff' }}>Rename</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Move to Folder Modal */}
            {showMoveModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Move to Folder</h3>
                        <div className="folder-list">
                            <div className="folder-item" onClick={() => submitMove(null)}>
                                <Folder size={16} /> <span>Root</span>
                            </div>
                            {folders.map(f => (
                                <div key={f.id} className="folder-item" onClick={() => submitMove(f.id)}>
                                    <Folder size={16} /> <span>{f.name}</span>
                                </div>
                            ))}
                        </div>
                        <div className="modal-actions">
                            <button onClick={() => setShowMoveModal(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Get Info Modal */}
            {showGetInfo && contextMenu.file && (
                <div className="modal-overlay">
                    <div className="modal-content get-info">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '250px' }}>{contextMenu.file.original_name}</h3>
                            <X size={20} style={{ cursor: 'pointer' }} onClick={() => setShowGetInfo(false)} />
                        </div>
                        <div className="info-row">
                            <span>Kind</span> <span>{contextMenu.file.mimetype}</span>
                        </div>
                        <div className="info-row">
                            <span>Size</span> <span>{(contextMenu.file.size / 1024).toFixed(2)} KB</span>
                        </div>
                        <div className="info-row">
                            <span>Where</span> <span>{folderPath.length > 0 ? folderPath.map(f=>f.name).join(' / ') : 'Root'}</span>
                        </div>
                        <div className="info-row">
                            <span>Created</span> <span>{new Date(contextMenu.file.upload_date).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Drive;
