import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import nodemailer from "nodemailer";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

app.post("/chat", async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Mensaje vacío" });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message },
      ],
    });

    const reply = completion.choices[0].message.content;

    let tarjeta = null;
    if (message.toLowerCase().includes("supernova 20")) {
      tarjeta = {
        nombre: "Zoom Bike 20”",
        imagen: "https://www.zoombikes.es/images/supernova-20.png",
        precio: "1299 €",
        url: "https://www.zoombikes.es/product/supernova-20",
      };
    } else if (message.toLowerCase().includes("supernova 18")) {
      tarjeta = {
        nombre: "Zoom Bike 18”",
        imagen: "https://www.zoombikes.es/images/supernova-18.png",
        precio: "999 €",
        url: "https://www.zoombikes.es/product/supernova-18",
      };
    }

    res.json({ reply, tarjeta });
  } catch (err) {
    console.error("Error en /chat:", err);
    res.status(500).json({ error: "Error procesando el chat" });
  }
});

app.post("/chat/end", async (req, res) => {
  const { sessionId } = req.body;

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"ZoomBot" <${process.env.SMTP_USER}>`,
      to: process.env.EMAIL_TO,
      subject: "Fin de conversación ZoomBot",
      text: `El usuario con sessionId ${sessionId} ha finalizado la conversación.`,
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Error enviando email:", err);
    res.status(500).json({ error: "No se pudo enviar el email" });
  }
});

app.listen(port, () => {
  console.log(`Servidor ZoomBot escuchando en http://localhost:${port}`);
});
