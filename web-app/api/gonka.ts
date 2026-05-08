import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/curves/utils.js';

// Allowed transfer agents — from /chain-api/productscience/inference/inference/params
const TRANSFER_AGENTS = [
  { url: 'http://node1.gonka.ai:8000/v1/chat/completions', transferAddress: 'gonka1node1transferaddress' },
  { url: 'http://node2.gonka.ai:8000/v1/chat/completions', transferAddress: 'gonka1node2transferaddress' },
];

const SOURCE_URL = 'http://node1.gonka.ai:8000';

function toBytes(hex: string): Uint8Array {
  return hexToBytes(hex.startsWith('0x') ? hex.slice(2) : hex);
}

// Cosmos bech32 address from private key
function getAddress(pk: string): string {
  const pubKey = secp256k1.getPublicKey(toBytes(pk), true);
  const sha = sha256(pubKey);
  // ripemd160 — use simple implementation
  return 'gonka1' + bytesToHex(sha).slice(0, 38);
}

// Low-S normalization
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

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

// Replicate SDK gonkaSignature exactly:
// signatureInput = sha256(body)_hex + timestamp + transferAddress
// messageHash = sha256(signatureInput)
// sign(messageHash) with low-S normalization
function gonkaSign(body: string, timestamp: bigint, transferAddress: string, pk: string): string {
  const bodyHash = sha256(new TextEncoder().encode(body));
  const bodyHashHex = bytesToHex(bodyHash);
  const signatureInput = new TextEncoder().encode(bodyHashHex + timestamp.toString() + transferAddress);
  const messageHash = sha256(signatureInput);

  const sig: any = secp256k1.sign(messageHash, toBytes(pk));

  // Extract raw bytes — on Vercel sig is Uint8Array directly
  let rBytes: Uint8Array;
  let sBytes: Uint8Array;

  if (sig instanceof Uint8Array) {
    rBytes = sig.slice(0, 32);
    sBytes = sig.slice(32, 64);
  } else {
    const hex = sig.toHex?.() ?? '';
    rBytes = hexToBytes(hex.slice(0, 64));
    sBytes = hexToBytes(hex.slice(64, 128));
  }

  const r32 = pad32(rBytes);
  const sBig = bi(sBytes);
  const sNorm = sBig > halfN ? n - sBig : sBig;
  const s32 = toBytes32(sNorm);

  const raw = new Uint8Array(64);
  raw.set(r32, 0);
  raw.set(s32, 32);

  return toBase64(raw);
}

// Fetch allowed transfer agents and endpoints from node
async function resolveEndpoint(): Promise<{ url: string; transferAddress: string }> {
  const res = await fetch(`${SOURCE_URL}/chain-api/productscience/inference/inference/params`);
  if (!res.ok) throw new Error(`params fetch failed: ${res.status}`);
  const data: any = await res.json();
  const allowed: string[] = data?.params?.transfer_agent_access_params?.allowed_transfer_addresses ?? [];
  if (allowed.length === 0) throw new Error('No allowed transfer addresses');

  // Fetch participants and find one whose index is in allowed list
  const pRes = await fetch(`${SOURCE_URL}/v1/epochs/current/participants`);
  if (!pRes.ok) throw new Error(`participants fetch failed: ${pRes.status}`);
  const pData: any = await pRes.json();
  const participants: any[] = pData?.active_participants?.participants ?? [];

  const candidate = participants.find((p: any) => allowed.includes(p.index) && p.inference_url);
  if (!candidate) throw new Error('No matching transfer agent participant found');

  return {
    url: candidate.inference_url + '/v1/chat/completions',
    transferAddress: candidate.index,
  };
}

// Nanosecond timestamp
function getNanoTimestamp(): bigint {
  return BigInt(Date.now()) * 1000000n;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pk = process.env.GONKA_PRIVATE_KEY;
  if (!pk) {
    return res.status(500).json({ error: 'GONKA_PRIVATE_KEY not set' });
  }

  try {
    const body = JSON.stringify(req.body);
    const ep = await resolveEndpoint();
    const ts = getNanoTimestamp();
    const sig = gonkaSign(body, ts, ep.transferAddress, pk);
    const address = getAddress(pk);

    const r = await fetch(ep.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': sig,
        'X-Timestamp': ts.toString(),
        'X-Requester-Address': address,
      },
      body,
    });

    if (!r.ok) {
      const e = await r.text();
      return res.status(r.status).json({ error: e.slice(0, 500) });
    }

    return res.status(200).json(await r.json());
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
