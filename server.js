import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Productos con datos y escala para imagen
const productos = {
  "Supernova 18": {
    nombre: "Supernova 18",
    precio: "999€",
    url: "https://www.zoombikes.es/supernova-18",
    imagen: "https://cdn.prod.website-files.com/67bf93ba4c3b33d64e3d383c/6834513dc55b8043121c3e71_fc9acf18-47e0-4a38-9603-100ca7a8ab6b%20(1).png",
    scale: 0.85
  },
  "Supernova 20": {
    nombre: "Supernova 20",
    precio: "1299€",
    url: "https://www.zoombikes.es/supernova-20",
    imagen: "https://cdn.prod.website-files.com/67bf93ba4c3b33d64e3d383c/6834513dc55b8043121c3e71_fc9acf18-47e0-4a38-9603-100ca7a8ab6b%20(1).png",
    scale: 1
  }
};

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

// Memoria simple de conversaciones por sesión
const conversations = {};
const MAX_MESSAGES = 10;

app.post('/chat', async (req, res) => {
  const { message, sessionId = 'default' } = req.body;

  if (!message) return res.status(400).json({ error: 'Message is required' });

  if (!conversations[sessionId]) {
    conversations[sessionId] = [{ role: 'system', content: SYSTEM_PROMPT }];
  }

  conversations[sessionId].push({ role: 'user', content: message });

  if (conversations[sessionId].length > MAX_MESSAGES) {
    conversations[sessionId] = [conversations[sessionId][0], ...conversations[sessionId].slice(-(MAX_MESSAGES - 1))];
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: conversations[sessionId],
    });

    let reply = completion.choices[0].message.content;

    // Detectar si menciona Supernova 18 o 20 para enviar tarjeta
    let tarjeta = null;
    if (reply.includes("Supernova 18")) tarjeta = productos["Supernova 18"];
    else if (reply.includes("Supernova 20")) tarjeta = productos["Supernova 20"];

    conversations[sessionId].push({ role: 'assistant', content: reply });

    res.json({ reply, tarjeta });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error en OpenAI' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Servidor corriendo en http://localhost:${port}`));
