// Crypto Utilities using Web Crypto API for Zero-Knowledge Encryption

/**
 * Derives a Key Encryption Key (KEK) from a user password and a salt using PBKDF2.
 */
export async function deriveKeyFromPassword(password, saltBuffer) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBuffer,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

/**
 * Generates a new random Master Encryption Key.
 */
export async function generateMasterKey() {
    return crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypts the Master Key with the Key Encryption Key (KEK).
 * Returns { encryptedMasterKey, iv }
 */
export async function encryptMasterKey(masterKey, kek) {
    const rawMasterKey = await crypto.subtle.exportKey('raw', masterKey);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        kek,
        rawMasterKey
    );
    
    return {
        encryptedMasterKey: new Uint8Array(encrypted),
        iv: iv
    };
}

/**
 * Decrypts the Master Key using the Key Encryption Key (KEK).
 */
export async function decryptMasterKey(encryptedMasterKey, iv, kek) {
    const rawMasterKey = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        kek,
        encryptedMasterKey
    );
    
    return crypto.subtle.importKey(
        'raw',
        rawMasterKey,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypts a File or Blob with the Master Key.
 * Returns { ciphertext: ArrayBuffer, iv: Uint8Array }
 */
export async function encryptFile(fileBlob, masterKey) {
    let buffer;
    if (fileBlob instanceof ArrayBuffer) {
        buffer = fileBlob;
    } else if (ArrayBuffer.isView(fileBlob)) {
        buffer = fileBlob.buffer;
    } else if (typeof fileBlob.arrayBuffer === 'function') {
        buffer = await fileBlob.arrayBuffer();
    } else if (fileBlob instanceof Blob) {
        buffer = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(fileBlob);
        });
    } else {
        throw new Error("Invalid file content type passed to encryptFile (must be ArrayBuffer, Blob, or File)");
    }
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        masterKey,
        buffer
    );
    
    return { ciphertext, iv };
}

/**
 * Decrypts an encrypted file buffer with the Master Key.
 * Returns ArrayBuffer
 */
export async function decryptFile(ciphertextBuffer, iv, masterKey) {
    return crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        masterKey,
        ciphertextBuffer
    );
}

/**
 * Helper to convert Uint8Array/ArrayBuffer to Base64
 */
export function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return self.btoa(binary);
}

/**
 * Helper to convert Base64 to Uint8Array
 */
export function base64ToBuffer(base64) {
    const binary = self.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}
