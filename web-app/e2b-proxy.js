const { Sandbox } = require("@e2b/code-interpreter");

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "Missing code" });
  let sandbox;
  try {
    sandbox = await Sandbox.create({ apiKey: process.env.E2B_API_KEY });
    const execution = await sandbox.runCode(code);
    res.json({
      stdout: execution.logs.stdout.join("\n"),
      stderr: execution.logs.stderr.join("\n"),
      error: execution.error ? execution.error.value : null,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  } finally {
    if (sandbox) await sandbox.kill().catch(() => {});
  }
}
