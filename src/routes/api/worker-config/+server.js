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

    if (Array.isArray(body.firebase_databases)) {
      updated.firebase_databases = body.firebase_databases;
    }

    try {
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf8');

      // Also ensure .env has FIREBASE_DATABASE_URL set
      if (Array.isArray(updated.firebase_databases) && updated.firebase_databases.length > 0) {
        try {
          const envPath = path.resolve(dir, '.env');
          if (fs.existsSync(envPath)) {
            let envContent = fs.readFileSync(envPath, 'utf8');
            if (envContent.includes('FIREBASE_DATABASE_URL=')) {
              envContent = envContent.replace(/FIREBASE_DATABASE_URL=.*/, `FIREBASE_DATABASE_URL=${updated.firebase_databases[0]}`);
            } else {
              envContent += `\nFIREBASE_DATABASE_URL=${updated.firebase_databases[0]}\n`;
            }
            fs.writeFileSync(envPath, envContent, 'utf8');
          }
        } catch {}
      }
    } catch (writeErr) {
      // Serverless environments (like Vercel) have a read-only filesystem
      return json({ success: true, config: updated, readOnly: true, warning: writeErr.message });
    }

    return json({ success: true, config: updated });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 200 });
  }
}
