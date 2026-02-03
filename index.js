import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// Variáveis (vão ficar no Render depois)
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GRAPH_VERSION = "v20.0";

// 1) Verificação do webhook (Meta chama via GET)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Enviar texto
async function sendText(to, body) {
  await axios.post(
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body }
    },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
  );
}

// Enviar botões (menu)
async function sendMenu(to) {
  await axios.post(
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`,
    
      {
  messaging_product: "whatsapp",
  recipient_type: "individual",
  type: "image",
  image: {
    link: "https://raw.githubusercontent.com/digitalhats2-source/whatsapp-bot/refs/heads/main/Menu.jpeg"
  }
},
    
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "Oi amor 😘\nQuer ver minhas fotos e vídeos mais ousados, que não vão pro feed? 🙈" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "PREVIA", title: "Quero uma prévia" } },
            { type: "reply", reply: { id: "VALORES", title: "Ver valores" } },
            { type: "reply", reply: { id: "PIX", title: "Pagar no Pix" } }
          ]
        }
      }
    },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
  );
}

// 2) Receber mensagens (Meta chama via POST)
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const msg = value?.messages?.[0];

    if (!msg) return res.sendStatus(200);

    const from = msg.from;

    // Se clicou em botão
    const buttonId = msg.interactive?.button_reply?.id;
    if (buttonId === "PREVIA") {
      await sendText(from, "Certo. Aqui vai a prévia: https://seu-link-aqui");
      await sendMenu(from);
      return res.sendStatus(200);
    }
    if (buttonId === "VALORES") {
      await sendText(from, "Valores: ...\nQuer pagar no Pix? Clique em 'Pagar no Pix'.");
      await sendMenu(from);
      return res.sendStatus(200);
    }
    if (buttonId === "PIX") {
      await sendText(from, "Pix:\nChave: ...\nNome: ...\nValor: R$ ...\nDepois de pagar, responda PAGO.");
      return res.sendStatus(200);
    }

    // Se mandou texto (ex: “oi”)
    const text = msg.text?.body?.trim();
    if (text) {
      await sendMenu(from);
    }

    return res.sendStatus(200);
  } catch (err) {
    // Sempre 200 pra Meta não ficar reenviando
    return res.sendStatus(200);
  }
});

// rota simples pra teste do Render
app.get("/", (req, res) => res.status(200).send("ok"));

app.listen(process.env.PORT || 3000, () => console.log("bot on"));
