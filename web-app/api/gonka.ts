import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/curves/utils.js';

const SOURCE_URL = 'http://node1.gonka.ai:8000';

function toBytes(hex: string): Uint8Array {
  return hexToBytes(hex.startsWith('0x') ? hex.slice(2) : hex);
}

function getAddress(pk: string): string {
  const pubKey = secp256k1.getPublicKey(toBytes(pk), true);
  const sha = sha256(pubKey);
  return 'gonka1' + bytesToHex(sha).slice(0, 38);
}

const n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const halfN = n >> 1n;

function bi(u: Uint8Array): bigint {
  let v = 0n;
  for (const b of u) v = (v << 8n) + BigInt(b);
  return v;
}

function toBytes32(x: bigint): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) { out[i] = Number(x & 0xffn); x >>= 8n; }
  return out;
}

function pad32(u: Uint8Array): Uint8Array {
  if (u.length === 32) return u;
  const out = new Uint8Array(32);
  out.set(u, 32 - u.length);
  return out;
}

function toBase6
