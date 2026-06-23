import './workerPolyfill';
import { encryptFile, bufferToBase64 } from './utils/cryptoUtils';
import { splitIntoShards } from './utils/erasureUtils';

self.onmessage = async (e) => {
    const { id, fileBuffer, masterKey, dataShards, parityShards, generateThumbnail, fileType } = e.data;

    try {
        // 1. Encrypt File
        const { ciphertext: encryptedBuffer, iv } = await encryptFile(fileBuffer, masterKey);
        const ivB64 = bufferToBase64(iv);

        // 2. Erasure Coding
        const { shards } = await splitIntoShards(new Uint8Array(encryptedBuffer), dataShards, parityShards);

        // We cannot send Blobs or FormData easily from worker to main thread without cloning overhead, 
        // actually we can send Uint8Array shards back safely using Transferable Objects for zero-copy performance!
        
        const transferables = shards.map(s => s.buffer);

        self.postMessage({
            id,
            success: true,
            ivB64,
            shards
        }, transferables);

    } catch (error) {
        self.postMessage({ id, success: false, error: error.message });
    }
};
