import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// ===== VARIÁVEIS DE AMBIENTE =====
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GRAPH_VERSION = "v20.0";

// ===== WEBHOOK VERIFICATION (GET) =====
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

// Enviar imagem (primeira mensagem)
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
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// Enviar botões
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
          text: "Oi amor 😘\nQuer ver minhas fotos e vídeos mais ousados, que não vão pro feed? 🙈"
        },
        action: {
          buttons: [
            { type: "reply", reply: { id: "PREVIA", title: "Quero uma prévia" } },
            { type: "reply", reply: { id: "VALORES", title: "Ver valores" } },
            { type: "reply", reply: { id: "PIX", title: "Pagar no Pix" } }
          ]
        }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// Enviar texto simples
async function sendText(to, body) {
  await axios.post(
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body }
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// ===== RECEBER MENSAGENS (POST) =====
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const msg = value?.messages?.[0];

    if (!msg) return res.sendStatus(200);

    const from = msg.from;

    // ===== CLIQUE EM BOTÃO =====
    const buttonId = msg.interactive?.button_reply?.id;

    if (buttonId === "PREVIA") {
      await sendText(from, "Essa é só uma prévia 😈\nQuer ver tudo? Clica em *Pagar no Pix*.");
      return res.sendStatus(200);
    }

    if (buttonId === "VALORES") {
      await sendText(
        from,
        "Tenho conteúdos exclusivos 🔥\nValores disponíveis:\n\n💋 Acesso VIP\n\nQuer pagar no Pix?"
      );
      return res.sendStatus(200);
    }

    if (buttonId === "PIX") {
      await sendText(
        from,
        "💳 *Pagamento via Pix*\n\nChave: SUA_CHAVE_PIX\nNome: SEU_NOME\nValor: R$ XX,XX\n\nAssim que pagar, eu libero automaticamente 😘"
      );
      return res.sendStatus(200);
    }

    // ===== PRIMEIRA MENSAGEM (LEAD DIGITOU QUALQUER COISA) =====
    if (msg.text?.body) {
      await sendImage(from);
      // pequeno delay pra ficar natural
      await new Promise((resolve) => setTimeout(resolve, 600));
      await sendButtons(from);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.sendStatus(200);
  }
});

// ===== TESTE RENDER =====
app.get("/", (req, res) => res.status(200).send("ok"));

app.listen(process.env.PORT || 3000, () => {
  console.log("🤖 Bot rodando");
});
