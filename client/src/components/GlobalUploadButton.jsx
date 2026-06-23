import React, { useRef, useState } from 'react';
import { UploadCloud, Loader2 } from 'lucide-react';
import { encryptFile, bufferToBase64, base64ToBuffer } from '../utils/cryptoUtils';
import { splitIntoShards } from '../utils/erasureUtils';
import { api } from '../api';

const GlobalUploadButton = ({ showToast }) => {
    const fileInputRef = useRef(null);
    const [isUploading, setIsUploading] = useState(false);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsUploading(true);
        try {
            // 1. Get Master Key
            const mkB64 = sessionStorage.getItem('mashcloud_mk');
            if (!mkB64) throw new Error("Encryption key not found. Please log in again.");
            const mkBuffer = base64ToBuffer(mkB64);
            const masterKey = await crypto.subtle.importKey('raw', mkBuffer, 'AES-GCM', true, ['encrypt', 'decrypt']);

            // 2. Encrypt File
            const { ciphertext: encryptedBuffer, iv } = await encryptFile(file, masterKey);
            const ivB64 = bufferToBase64(iv);

            const dataShards = 4;
            const parityShards = 2;
            const { shards } = await splitIntoShards(new Uint8Array(encryptedBuffer), dataShards, parityShards);

            const isMedia = file.type.startsWith('image/') || file.type.startsWith('video/');

            if (isMedia) {
                // Route to Photos
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

                const formData = new FormData();
                formData.append('originalName', file.name);
                formData.append('mimetype', file.type);
                formData.append('originalSize', file.size.toString());
                formData.append('iv', ivB64);
                formData.append('dataShards', dataShards.toString());
                formData.append('parityShards', parityShards.toString());

                shards.forEach((shard, index) => {
                    const blob = new Blob([shard], { type: 'application/octet-stream' });
                    formData.append('shards', blob, `shard${index}`);
                });

                const res = await api('/api/photos/upload', { method: 'POST', body: formData });
                const newPhoto = await res.json();
                
                if (thumbnailBase64 && res.ok && newPhoto.id) {
                    try {
                        await api('/api/ai/process-photo', {
                            method: 'POST',
                            body: JSON.stringify({ id: newPhoto.id, thumbnailBase64 })
                        });
                    } catch (aiErr) { console.error('AI processing failed:', aiErr); }
                }
                showToast('Media moved to Photos tab', 'success');
            } else {
                // Generate unencrypted AI text snippet if it's a text file
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
                formData.append('iv', ivB64);
                formData.append('dataShards', dataShards.toString());
                formData.append('parityShards', parityShards.toString());

                shards.forEach((shard, index) => {
                    const blob = new Blob([shard], { type: 'application/octet-stream' });
                    formData.append('shards', blob, `shard${index}`);
                });

                const res = await api('/api/files/upload', { method: 'POST', body: formData });
                const newFile = await res.json();
                
                if (textSnippet && res.ok && newFile.id) {
                    try {
                        await api('/api/ai/process-file', {
                            method: 'POST',
                            body: JSON.stringify({ id: newFile.id, textSnippet })
                        });
                    } catch (aiErr) { console.error('AI processing failed:', aiErr); }
                }
                showToast('File uploaded successfully', 'success');
            }
            
            // Dispatch event to tell Drive/Photos to refresh
            window.dispatchEvent(new CustomEvent('mashcloud_upload_complete'));
        } catch (err) {
            console.error(err);
            showToast(err.message || "Upload failed", "error");
        } finally {
            setIsUploading(false);
            if (e.target) e.target.value = '';
        }
    };

    return (
        <>
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
            <button
                className="btn-upload"
                onClick={() => !isUploading && fileInputRef.current.click()}
                disabled={isUploading}
                title="Upload File"
            >
                {isUploading ? (
                    <Loader2 size={16} className="spinner" style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                    <><UploadCloud size={16} /> Upload</>
                )}
            </button>
        </>
    );
};

export default GlobalUploadButton;
