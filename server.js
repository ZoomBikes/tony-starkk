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

// Guardar contexto por sesión o usuario (aquí un ejemplo muy simple con memoria global)
const conversations = {}; // { sessionId: [ {role, content}, ... ] }

// Prompt fijo de sistema con el contexto ZoomBikes Supernova
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

// Limite máximo de mensajes en contexto
const MAX_MESSAGES = 10;

app.post('/chat', async (req, res) => {
  const { message, sessionId = 'default' } = req.body;

  if (!message) return res.status(400).json({ error: 'Message is required' });

  if (!conversations[sessionId]) {
    conversations[sessionId] = [{ role: 'system', content: SYSTEM_PROMPT }];
  }

  // Añadir el nuevo mensaje del usuario
  conversations[sessionId].push({ role: 'user', content: message });

  // Limitar el tamaño del contexto
  if (conversations[sessionId].length > MAX_MESSAGES) {
    // Mantener el prompt de sistema y los últimos MAX_MESSAGES-1 mensajes
    conversations[sessionId] = [conversations[sessionId][0], ...conversations[sessionId].slice(- (MAX_MESSAGES - 1))];
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: conversations[sessionId],
    });

    const reply = completion.choices[0].message.content;

    // Guardar respuesta del asistente en el contexto
    conversations[sessionId].push({ role: 'assistant', content: reply });

    res.json({ reply });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error en OpenAI' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Servidor corriendo en http://localhost:${port}`));
