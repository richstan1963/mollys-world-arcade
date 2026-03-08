import crypto from 'crypto';
import fs from 'fs';

export function computeMD5(filepath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('md5');
        const stream = fs.createReadStream(filepath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

export function computeCRC32(filepath) {
    return new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filepath);
        let crc = 0xFFFFFFFF;
        const table = makeCRC32Table();

        stream.on('data', chunk => {
            for (let i = 0; i < chunk.length; i++) {
                crc = (crc >>> 8) ^ table[(crc ^ chunk[i]) & 0xFF];
            }
        });
        stream.on('end', () => {
            crc = (crc ^ 0xFFFFFFFF) >>> 0;
            resolve(crc.toString(16).padStart(8, '0'));
        });
        stream.on('error', reject);
    });
}

let _crc32Table = null;
function makeCRC32Table() {
    if (_crc32Table) return _crc32Table;
    _crc32Table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        _crc32Table[i] = c;
    }
    return _crc32Table;
}
