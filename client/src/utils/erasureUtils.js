import { ReedSolomonErasure } from '@subspace/reed-solomon-erasure.wasm';
import wasmUrl from '@subspace/reed-solomon-erasure.wasm/dist/reed_solomon_erasure_bg.wasm?url';

const SHARD_SIZE = 1024 * 1024;

let rsInstance = null;
async function getRS() {
    if (!rsInstance) {
        rsInstance = await ReedSolomonErasure.fromResponse(fetch(wasmUrl));
    }
    return rsInstance;
}

export async function createShards(buffer, dataShards = 4, parityShards = 2) {
    const rs = await getRS();
    
    const byteLength = buffer.byteLength;
    const shardSize = Math.ceil(byteLength / dataShards);
    const paddedLength = shardSize * dataShards;
    
    // We need a single contiguous array for all shards (data + parity)
    const shardsArray = new Uint8Array(shardSize * (dataShards + parityShards));
    
    // Copy original data into the beginning
    shardsArray.set(new Uint8Array(buffer), 0);
    
    // Encode modifies the array in-place, adding parity to the end
    const encodeResult = rs.encode(shardsArray, dataShards, parityShards);
    if (encodeResult !== ReedSolomonErasure.RESULT_OK) {
        console.error('ReedSolomon encoding failed with result code:', encodeResult);
    }
    
    // The previous implementation returned an array of Uint8Arrays
    const shards = [];
    for (let i = 0; i < dataShards + parityShards; i++) {
        shards.push(shardsArray.slice(i * shardSize, (i + 1) * shardSize));
    }
    
    return {
        shards,
        originalLength: byteLength,
        shardSize: shardSize
    };
}

export async function reconstructShards(shardsArrayInput, dataShards, parityShards, originalLength) {
    const rs = await getRS();
    
    // Find shard size from first available shard
    let shardSize = 0;
    for (const shard of shardsArrayInput) {
        if (shard && shard.length > 0) {
            shardSize = shard.length;
            break;
        }
    }
    
    const shardsAvailable = [];
    const contiguousShards = new Uint8Array(shardSize * (dataShards + parityShards));
    
    for (let i = 0; i < dataShards + parityShards; i++) {
        if (shardsArrayInput[i] && shardsArrayInput[i].length === shardSize) {
            shardsAvailable.push(true);
            contiguousShards.set(shardsArrayInput[i], i * shardSize);
        } else {
            shardsAvailable.push(false);
        }
    }
    
    const result = rs.reconstruct(contiguousShards, dataShards, parityShards, shardsAvailable);
    if (result !== ReedSolomonErasure.RESULT_OK) {
        console.error('ReedSolomon reconstruction failed with result code:', result);
    }
    
    const totalDataLength = dataShards * shardSize;
    const reconstructed = new Uint8Array(totalDataLength);
    
    for (let i = 0; i < dataShards; i++) {
        reconstructed.set(contiguousShards.slice(i * shardSize, (i + 1) * shardSize), i * shardSize);
    }
    
    return reconstructed.slice(0, originalLength).buffer;
}

export { createShards as splitIntoShards, reconstructShards as reconstructFromShards };
