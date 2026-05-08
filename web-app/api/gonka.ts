import { gonkaSignature, gonkaAddress, resolveEndpoints, getNanoTimestamp } from 'gonka-openai';

const SOURCE_URL = 'http://node1.gonka.ai:8000';

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
    const address = gonkaAddress(pk);

    // Resolve endpoint via SDK — handles allowed transfer addresses and delegate_ta
    const endpoints = await resolveEndpoints({ sourceUrl: SOURCE_URL });
    if (!endpoints.length) throw new Error('No endpoints resolved');

    // Pick first endpoint
    const ep = endpoints[0];
    const ts = getNanoTimestamp();

    const sig = await gonkaSignature(
      {
        payload: body,
        timestamp: ts,
        transferAddress: ep.transferAddress || ep.address || '',
      },
      pk
    );

    const inferenceUrl = ep.url.endsWith('/chat/completions')
      ? ep.url
      : ep.url.replace(/\/+$/, '') + '/chat/completions';

    const r = await fetch(inferenceUrl, {
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
