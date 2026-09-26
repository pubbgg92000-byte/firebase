import { json } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';

function getConfigPath() {
  return path.resolve(process.cwd(), '_python_worker_ref', 'worker_config.json');
}

/** @type {import('./$types').RequestHandler} */
export async function GET() {
  try {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) {
      return json({
        telegram: {
          api_id: '',
          api_hash: '',
          bot_username: '',
          phone: '',
          otp_timeout: 60,
          response_keyword: 'swiggy'
        },
        firebase_databases: []
      });
    }

    const raw = fs.readFileSync(configPath, 'utf8');
    const data = JSON.parse(raw);
    return json(data);
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
  try {
    const body = await request.json();
    const configPath = getConfigPath();

    let current = {};
    if (fs.existsSync(configPath)) {
      try {
        current = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch {
        current = {};
      }
    }

    // Merge telegram credentials
    const updated = {
      ...current,
      telegram: {
        ...(current.telegram || {}),
        api_id: body.api_id !== undefined ? String(body.api_id).trim() : (current.telegram?.api_id || ''),
        api_hash: body.api_hash !== undefined ? String(body.api_hash).trim() : (current.telegram?.api_hash || ''),
        bot_username: body.bot_username !== undefined ? String(body.bot_username).trim() : (current.telegram?.bot_username || ''),
        phone: body.phone !== undefined ? String(body.phone).trim() : (current.telegram?.phone || ''),
        otp_timeout: body.otp_timeout ? Number(body.otp_timeout) : (current.telegram?.otp_timeout || 60),
        response_keyword: body.response_keyword !== undefined ? String(body.response_keyword).trim().toLowerCase() : (current.telegram?.response_keyword || 'swiggy')
      }
    };

    if (Array.isArray(body.firebase_databases) && body.firebase_databases.length > 0) {
      updated.firebase_databases = body.firebase_databases;
    }

    fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf8');
    return json({ success: true, config: updated });
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
}
