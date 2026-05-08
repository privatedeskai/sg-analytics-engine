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

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function gonkaSign(body: string, timestamp: bigint, transferAddress: string, pk: string): string {
  const bodyHash = sha256(new TextEncoder().encode(body));
  const bodyHashHex = bytesToHex(bodyHash);
  const signatureInput = new TextEncoder().encode(bodyHashHex + timestamp.toString() + transferAddress);
  const messageHash = sha256(signatureInput);

  const sig: any = secp256k1.sign(messageHash, toBytes(pk));

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

async function resolveEndpoint(): Promise<{ url: string; transferAddress: string }> {
  const paramsRes = await fetch(`${SOURCE_URL}/chain-api/productscience/inference/inference/params`);
  if (!paramsRes.ok) throw new Error(`params fetch failed: ${paramsRes.status}`);
  const paramsData: any = await paramsRes.json();
  const allowed: string[] = paramsData?.params?.transfer_agent_access_params?.allowed_transfer_addresses ?? [];
  if (allowed.length === 0) throw new Error('No allowed transfer addresses');

  const pRes = await fetch(`${SOURCE_URL}/v1/epochs/current/participants`);
  if (!pRes.ok) throw new Error(`participants fetch failed: ${pRes.status}`);
  const pData: any = await pRes.json();
  const participants: any[] = pData?.active_participants?.participants ?? [];

  const candidate = participants.find((p: any) => allowed.includes(p.index) && p.inference_url);
  if (!candidate) throw new Error('No matching transfer agent participant found');

  let inferenceUrl = candidate.inference_url;
  try {
    const identityRes = await fetch(`${inferenceUrl}/v1/identity`);
    if (identityRes.ok) {
      const identityData: any = await identityRes.json();
      const delegateTa: Record<string, string> = identityData?.data?.delegate_ta ?? {};
      const delegateUrls = Object.keys(delegateTa);
      if (delegateUrls.length > 0) {
        inferenceUrl = delegateUrls[0].endsWith('/v1')
          ? delegateUrls[0]
          : delegateUrls[0] + '/v1';
      }
    }
  } catch { /* use original url */ }

  return {
    url: inferenceUrl + '/chat/completions',
    transferAddress: candidate.index,
  };
}

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
