import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// ===== VARIÁVEIS =====
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GRAPH_VERSION = "v20.0";

// ===== WEBHOOK VERIFY =====
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ===== HELPERS =====

// Imagem inicial
async function sendImage(to) {
  await axios.post(
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "image",
      image: {
        link: "https://raw.githubusercontent.com/digitalhats2-source/whatsapp-bot/main/Menu.jpeg"
      }
    },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
  );
}

// Botões iniciais (2 apenas)
async function sendButtons(to) {
  await axios.post(
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: "Oi amor 😘\nQuer ver algo exclusivo que não vai pro feed?"
        },
        action: {
          buttons: [
            { type: "reply", reply: { id: "PREVIA", title: "🔥 Ver prévia" } },
            { type: "reply", reply: { id: "VALORES", title: "💰 Ver valores" } }
          ]
        }
      }
    },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
  );
}

// Vídeo de prévia
async function sendVideo(to) {
  await axios.post(
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "video",
      video: {
        link: "https://SEU_LINK_DE_VIDEO_AQUI.mp4",
        caption: "Só um gostinho do que tem no VIP 😈"
      }
    },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
  );
}

// Tabela de valores (texto)
async function sendPrices(to) {
  await axios.post(
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        body:
`💰 *VALORES VIP*

🔥 Acesso exclusivo
📸 Fotos + 🎥 vídeos

Pix disponível
Quer garantir o seu acesso? 😘`
      }
    },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
  );
}

// ===== RECEBER MSG =====
app.post("/webhook", async (req, res) => {
  try {
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const buttonId = msg.interactive?.button_reply?.id;

    // 🔥 VER PRÉVIA
    if (buttonId === "PREVIA") {
      await sendVideo(from);
      await new Promise(r => setTimeout(r, 600));
      await sendPrices(from);
      return res.sendStatus(200);
    }

    // 💰 VER VALORES
    if (buttonId === "VALORES") {
      await sendPrices(from);
      return res.sendStatus(200);
    }

    // PRIMEIRA MSG DO LEAD
    if (msg.text?.body) {
      await sendImage(from);
      await new Promise(r => setTimeout(r, 600));
      await sendButtons(from);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.sendStatus(200);
  }
});

// ===== TESTE =====
app.get("/", (req, res) => res.send("ok"));

app.listen(process.env.PORT || 3000, () => {
  console.log("🤖 Bot rodando");
});
