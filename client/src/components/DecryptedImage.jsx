import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { decryptFile, base64ToBuffer } from '../utils/cryptoUtils';
import { reconstructFromShards } from '../utils/erasureUtils';

const DecryptedImage = ({ photo, alt, style, type = 'photo' }) => {
    const [blobUrl, setBlobUrl] = useState(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let isMounted = true;

        if (photo.thumbnail_base64) {
            setBlobUrl(photo.thumbnail_base64);
            return;
        }

        const fetchAndDecrypt = async () => {
            try {
                if (!photo.iv) {
                    // Legacy unencrypted photo
                    const res = await api(`/api/shards/${type}/${photo.id}/0`);
                    if (!res.ok) throw new Error('Fetch failed');
                    const blob = await res.blob();
                    if (isMounted) setBlobUrl(window.URL.createObjectURL(blob));
                    return;
                }

                const mkB64 = sessionStorage.getItem('mashcloud_mk');
                if (!mkB64) throw new Error("Encryption key not found.");
                const masterKey = await crypto.subtle.importKey('raw', base64ToBuffer(mkB64), 'AES-GCM', true, ['encrypt', 'decrypt']);

                const { data_shards, parity_shards, total_shards, iv } = photo;
                const fetchPromises = [];
                for (let i = 0; i < total_shards; i++) {
                    fetchPromises.push(
                        api(`/api/shards/${type}/${photo.id}/${i}`).then(res => res.ok ? res.arrayBuffer() : null).catch(() => null)
                    );
                }

                const downloadedShards = await Promise.all(fetchPromises);
                const validShards = downloadedShards.map(buffer => buffer ? new Uint8Array(buffer) : null);
                const numValid = validShards.filter(s => s !== null).length;

                if (numValid < data_shards) {
                    throw new Error("Not enough shards");
                }

                const reconstructedEncrypted = await reconstructFromShards(validShards, data_shards, parity_shards, Number(photo.size) + 16);
                const ivBuffer = base64ToBuffer(iv);
                const decryptedBuffer = await decryptFile(reconstructedEncrypted, ivBuffer, masterKey);

                const blob = new Blob([decryptedBuffer], { type: photo.mimetype || 'image/jpeg' });
                if (isMounted) setBlobUrl(window.URL.createObjectURL(blob));

            } catch (err) {
                console.error("Image decryption failed:", err);
                if (isMounted) setError(true);
            }
        };

        fetchAndDecrypt();

        return () => {
            isMounted = false;
            if (blobUrl) window.URL.revokeObjectURL(blobUrl);
        };
    }, [photo]);

    if (error) return <div style={{...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#333', color: '#fff'}}>Error</div>;
    if (!blobUrl) return <div style={{...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#222'}}><div className="spinner"></div></div>;

    return <img src={blobUrl} alt={alt} style={style} />;
};

export default DecryptedImage;
