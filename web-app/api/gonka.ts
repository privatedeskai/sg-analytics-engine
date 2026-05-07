import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/curves/abstract/utils.js';

const NODES = [
  'http://node1.gonka.ai:8000',
  'http://node2.gonka.ai:8000',
  'http://node3.gonka.ai:8000',
];

function toBytes(hex: string): Uint8Array {
  return hexToBytes(hex.startsWith('0x') ? hex.slice(2) : hex);
}

function getAddress(pk: string): string {
  return 'gonka1' + bytesToHex(sha256(secp256k1.getPublicKey(toBytes(pk), true))).slice(0, 38);
}

async function getEndpoint(): Promise<{ url: string; address: string }> {
  for (const node of NODES) {
    try {
      const r = await fetch(node + '/v1/epochs/current/participants');
      if (!r.ok) continue;
      const data: any = await r.json();

      const list: any[] = (data?.active_participants?.participants || [])
        .filter((p: any) => p.inference_url && p.index);

      if (list.length === 0) continue;

      list.sort((a: any, b: any) => (b.weight || 0) - (a.weight || 0));
      const p = list[0];

      return {
        url: p.inference_url + '/v1/chat/completions',
        address: p.index,
      };
    } catch {
      continue;
    }
  }
  throw new Error('No endpoints');
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
    const ep = await getEndpoint();

    const ts = (Date.now() * 1000000).toString();
    const payload = new TextEncoder().encode(body + ts + ep.address);
    const hash = sha256(payload);
    const sig = secp256k1.sign(hash, toBytes(pk));
    const sigBytes = sig.toCompactBytes();
    const sigB64 = btoa(String.fromCharCode(...sigBytes));

    const r = await fetch(ep.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': sigB64,
        'X-Timestamp': ts,
        'X-Requester-Address': getAddress(pk),
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
