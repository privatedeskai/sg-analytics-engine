import { secp256k1 } from '@noble/curves/secp256k1.js';

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

export async function createGonkaSignature(
  privateKeyHex: string,
  requestBody: unknown,
  timestampNs: bigint,
  providerAddress: string
): Promise<string> {
  const privateKeyBytes = hexToBytes(privateKeyHex);

  const payloadBytes = new TextEncoder().encode(JSON.stringify(requestBody));
  const timestampBytes = new TextEncoder().encode(timestampNs.toString());
  const providerBytes = new TextEncoder().encode(providerAddress);
  const message = concatBytes(payloadBytes, timestampBytes, providerBytes);

  const msgHashBuffer = await crypto.subtle.digest('SHA-256', message);
  const msgHashBytes = new Uint8Array(msgHashBuffer);

  // v2: sign() returns Uint8Array compact format (64 bytes: r32 + s32)
  // prehash: false — передаём уже готовый SHA-256 хеш
  // lowS: true — по умолчанию, нормализация встроена
  const sigBytes = secp256k1.sign(msgHashBytes, privateKeyBytes, { prehash: false });

  // sigBytes уже Uint8Array 64 байта в compact формате
  return bytesToBase64(sigBytes);
}
