// server.js
// ZoomBikes — API Chat + Email (Railway ready)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import OpenAI from 'openai';

const app = express();

// ---------- Config ----------
const {
  PORT = 3000,
  NODE_ENV = 'production',
  OPENAI_API_KEY,
  WEB_ORIGIN,            // p.ej. https://www.zoombikes.es (tu Webflow)
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  EMAIL_TO,              // destino para el resumen de conversación
} = process.env;

if (!OPENAI_API_KEY) {
  console.warn('[WARN] Falta OPENAI_API_KEY en .env');
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// CORS: permite tu Webflow/zoombikes; en dev permite localhost
const allowedOrigins = new Set(
  [WEB_ORIGIN, 'http://localhost:3000', 'http://localhost:5500', 'http://127.0.0.1:5500']
    .filter(Boolean)
);
app.use(cors({
  origin: (origin, cb) => {
    // SSR/no-origin (embeds) => permitir
    if (!origin || allowedOrigins.has(origin)) return cb(null, true);
    return cb(new Error('CORS not allowed: ' + origin));
  },
  credentials: false,
}));
app.use(express.json({ limit: '1mb' }));

// Proxy trust (Railway/Cloud)
app.set('trust proxy', 1);

// ---------- Rate limit sencillo (memoria) ----------
const hits = new Map();
setInterval(() => hits.clear(), 60_000); // reset por minuto
function rateLimit(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const n = hits.get(ip) || 0;
  if (n > 60) return res.status(429).json({ error: 'Too many requests' });
  hits.set(ip, n + 1);
  next();
}

// ---------- Prompt del sistema (tuyo, íntegro) ----------
const SYSTEM_PROMPT = `Eres un asistente experto en bicicletas eléctricas infantiles de la marca ZoomBikes, específicamente en el modelo Supernova. Solo respondes preguntas relacionadas con las bicicletas Supernova, sus características técnicas, tamaños, precios, formas de pago, garantía, envíos y devoluciones.

Las bicicletas Supernova son eléctricas sin pedales, diseñadas para niños y niñas que quieren divertirse y ganar autonomía. Hay dos tamaños:

- Supernova 18: recomendada para niños desde 7 años, con altura entre 120 y 140 cm.  
- Supernova 20: recomendada para niños desde 11 años, con altura entre 135 y 165 cm.  

Puedes ayudar a recomendar la talla correcta basándote en la edad o altura del usuario.

La Supernova 20 es más potente (motor 750W, batería 48V 7.0AH) y tiene ruedas de 20 pulgadas, suspensión ajustable, y frenos de disco hidráulicos.

La Supernova 18 es igual pero con ruedas de 18 pulgadas y un precio más asequible.

El precio de la Supernova 20 es 1299€, se puede pagar en 3 plazos sin intereses con Klarna.  
La Supernova 18 cuesta 999€.

Enviamos a toda la península en 48h/2 días laborables.  
La devolución es posible en 15 días si no estás satisfecho.

Si alguien pregunta algo fuera de estos temas, responde amablemente que solo puedes ayudar con información sobre ZoomBikes y Supernova y que para otras dudas debe contactar soporte oficial.

Responde con claridad, precisión y un tono cercano, amigable y profesional.`;

// ---------- Utilidades ----------
function saneString(v, max = 2000) {
  if (typeof v !== 'string') return '';
  return v.replace(/\u0000/g, '').slice(0, max);
}

function inferCardFromText(t) {
  // Heurística simple: detecta mención de 18/20 y sugiere tarjeta
  const txt = (t || '').toLowerCase();
  if (txt.includes('supernova 20') || txt.includes('20”') || txt.includes('20"')) {
    return {
      nombre: 'Zoom Bike 20”',
      imagen: 'https://www.zoombikes.es/images/supernova-20.png', // ajusta si usas otra ruta
      precio: '1299 €',
      url: 'https://www.zoombikes.es/product/supernova-20',
      sku: 'supernova-20',
    };
  }
  if (txt.includes('supernova 18') || txt.includes('18”') || txt.includes('18"')) {
    return {
      nombre: 'Zoom Bike 18”',
      imagen: 'https://www.zoombikes.es/images/supernova-18.png',
      precio: '999 €',
      url: 'https://www.zoombikes.es/product/supernova-18',
      sku: 'supernova-18',
    };
  }
  return null;
}

// ---------- Chat (streaming por HTTP chunked) ----------
app.post('/chat', rateLimit, async (req, res) => {
  try {
    const { message, sessionId } = req.body || {};
    const userMessage = saneString(message, 2000);
    const sid = saneString(sessionId, 120);

    if (!userMessage) return res.status(400).json({ error: 'Mensaje vacío' });

    // Respuesta chunked (compatible con fetch+reader del front)
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.6,
      stream: true,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    });

    let full = '';
    for await (const chunk of stream) {
      const token = chunk.choices?.[0]?.delta?.content || '';
      if (token) {
        full += token;
        res.write(token);
      }
    }

    // Adjunta, si aplica, una tarjeta JSON al final (lo consume el front)
    const card = inferCardFromText(full);
    if (card) res.write('\n\n' + JSON.stringify({ tarjeta: card }));

    res.end();
  } catch (err) {
    console.error('CHAT ERROR', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error generando respuesta' });
    } else {
      res.end();
    }
  }
});

// ---------- Fin de conversación (email opcional con opt-in) ----------
app.post('/chat/end', rateLimit, async (req, res) => {
  try {
    const { sessionId, conversation, email } = req.body || {};
    const sid = saneString(sessionId, 120);
    const conv = Array.isArray(conversation) ? conversation.slice(0, 100) : [];

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !EMAIL_TO) {
      return res.status(200).json({ ok: true, note: 'Email desactivado (falta configuración SMTP)' });
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 587),
      secure: Number(SMTP_PORT || 587) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    const html = `
      <h2>ZoomBikes · Conversación</h2>
      <p><b>Session:</b> ${sid || 'N/A'}</p>
      ${email ? `<p><b>Email cliente (opt-in):</b> ${saneString(email, 200)}</p>` : ''}
      <hr/>
      <ol>
        ${conv.map(m => `<li><b>${m.role}:</b> ${saneString(m.content, 2000)}</li>`).join('')}
      </ol>
    `;

    await transporter.sendMail({
      from: `ZoomBikes Bot <${SMTP_USER}>`,
      to: EMAIL_TO,
      subject: `Chat ZoomBikes — ${sid || 'sin-session'}`,
      html,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('MAIL ERROR', err);
    res.status(500).json({ error: 'No se pudo enviar el email' });
  }
});

// ---------- Salud ----------
app.get('/health', (_, res) => res.json({ ok: true }));

// ---------- Arranque ----------
app.listen(PORT, () => {
  console.log(`ZoomBikes API ready on :${PORT} (${NODE_ENV})`);
});
