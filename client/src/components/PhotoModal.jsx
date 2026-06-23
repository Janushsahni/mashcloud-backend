import React, { useState, useRef, useCallback } from 'react';
import { X, RotateCw, User, Minus, Plus } from 'lucide-react';
import Cropper from 'react-easy-crop';
import getCroppedImg from '../utils/cropUtils';
import './PhotoModal.css';

const PhotoModal = ({ isOpen, onClose, onSave, currentPhoto }) => {
    const [imageSrc, setImageSrc] = useState(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
    const fileInputRef = useRef(null);

    const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    if (!isOpen) return null;

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setImageSrc(url);
        }
        e.target.value = null;
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            setImageSrc(url);
        }
    };

    const handleSave = async () => {
        if (imageSrc && croppedAreaPixels && onSave) {
            try {
                const croppedImageBase64 = await getCroppedImg(
                    imageSrc,
                    croppedAreaPixels,
                    rotation
                );
                onSave(croppedImageBase64);
                onClose();
            } catch (e) {
                console.error(e);
            }
        } else {
            onClose();
        }
    };

    return (
        <div className="photo-modal-overlay">
            <div className="photo-modal">
                <button className="photo-modal-close" onClick={onClose}>
                    <X size={24} />
                </button>
                
                <div className="photo-modal-header">
                    <div className="photo-modal-icon">
                        <User size={32} color="#fff" />
                    </div>
                    <h2>Change Mashcloud Account Photo</h2>
                </div>

                <div className="photo-modal-content">
                    <div 
                        className="photo-crop-area"
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        style={{ position: 'relative', height: '300px', backgroundColor: '#1c1c1e', overflow: 'hidden' }}
                    >
                        {imageSrc ? (
                            <Cropper
                                image={imageSrc}
                                crop={crop}
                                zoom={zoom}
                                rotation={rotation}
                                aspect={1}
                                cropShape="round"
                                showGrid={false}
                                onCropChange={setCrop}
                                onCropComplete={onCropComplete}
                                onZoomChange={setZoom}
                                onRotationChange={setRotation}
                            />
                        ) : (
                            <div className="photo-placeholder"></div>
                        )}
                    </div>
                    
                    {imageSrc && (
                        <div className="photo-controls" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
                            <div className="zoom-control" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <Minus size={16} color="#86868b" />
                                <input 
                                    type="range" 
                                    min={1} 
                                    max={3} 
                                    step={0.1}
                                    value={zoom} 
                                    onChange={(e) => setZoom(Number(e.target.value))} 
                                    className="zoom-slider"
                                    style={{ flex: 1 }}
                                />
                                <Plus size={16} color="#86868b" />
                            </div>
                            <div className="zoom-control" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <RotateCw size={16} color="#86868b" />
                                <input 
                                    type="range" 
                                    min={0} 
                                    max={360} 
                                    step={1}
                                    value={rotation} 
                                    onChange={(e) => setRotation(Number(e.target.value))} 
                                    className="zoom-slider"
                                    style={{ flex: 1 }}
                                />
                            </div>
                            <div style={{ textAlign: 'center', marginTop: '16px' }}>
                                <button 
                                    onClick={() => fileInputRef.current?.click()} 
                                    style={{ 
                                        background: 'rgba(255,255,255,0.1)', 
                                        color: '#fff', 
                                        border: '1px solid rgba(255,255,255,0.2)', 
                                        padding: '8px 16px', 
                                        borderRadius: '16px', 
                                        cursor: 'pointer', 
                                        fontSize: '13px', 
                                        fontWeight: '500',
                                        transition: 'background 0.2s'
                                    }}
                                    onMouseOver={(e) => e.target.style.background = 'rgba(255,255,255,0.2)'}
                                    onMouseOut={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
                                >
                                    Choose different image...
                                </button>
                            </div>
                        </div>
                    )}
                    
                    {!imageSrc && (
                        <div className="photo-upload-text">
                            <p>To replace your Mashcloud Account photo, drag an image<br/>onto the box or browse your device.</p>
                            <span className="browse-link" onClick={() => fileInputRef.current?.click()}>
                                Browse your device for a new image...
                            </span>
                        </div>
                    )}

                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        style={{ display: 'none' }} 
                        accept="image/*"
                        onChange={handleFileChange}
                    />
                </div>

                <div className="photo-modal-footer">
                    <button className="photo-btn-cancel" onClick={onClose}>Cancel</button>
                    <button className="photo-btn-save" onClick={handleSave}>Save</button>
                </div>
            </div>
        </div>
    );
};

export default PhotoModal;
