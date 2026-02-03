import express from "express";
import axios from "axios";
import FormData from "form-data";

const app = express();
app.use(express.json());

// ===== VARIÁVEIS =====
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GRAPH_VERSION = "v20.0";

const MENU_IMAGE_URL =
  process.env.MENU_IMAGE_URL ||
  "https://raw.githubusercontent.com/digitalhats2-source/whatsapp-bot/main/Menu.jpeg";

const PREVIEW_VIDEO_URL =
  process.env.PREVIEW_VIDEO_URL ||
  "https://raw.githubusercontent.com/digitalhats2-source/whatsapp-bot/main/Video.mp4";

// Cache do media_id do vídeo (pra não fazer upload toda hora)
let cachedVideoMediaId = null;
let cachedVideoMediaIdAt = 0;
const VIDEO_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

function graphBaseUrl() {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}`;
}
function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${WHATSAPP_TOKEN}`, ...extra };
}
async function graphPost(path, data, config = {}) {
  return axios.post(`${graphBaseUrl()}${path}`, data, {
    headers: authHeaders(config.headers || {}),
    timeout: 30000,
    ...config,
  });
}

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
  const resp = await graphPost("/messages", {
    messaging_product: "whatsapp",
    to,
    type: "image",
    image: { link: MENU_IMAGE_URL },
  });
  console.log("sendImage OK:", resp.data);
}

// Botões iniciais (2)
async function sendButtons(to) {
  const resp = await graphPost("/messages", {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "Olá! Quer ver uma amostra ou os valores?" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "PREVIA", title: "🎬 Ver prévia" } },
          { type: "reply", reply: { id: "VALORES", title: "💰 Ver valores" } },
        ],
      },
    },
  });
  console.log("sendButtons OK:", resp.data);
}

// Upload do vídeo a partir de URL -> retorna media_id
async function uploadVideoFromUrl(url) {
  const fileResp = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 30000,
  });

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "video/mp4");
  form.append("file", Buffer.from(fileResp.data), {
    filename: "preview.mp4",
    contentType: "video/mp4",
  });

  const up = await axios.post(`${graphBaseUrl()}/media`, form, {
    headers: authHeaders(form.getHeaders()),
    timeout: 60000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  console.log("uploadVideo OK:", up.data);
  return up.data.id;
}

async function getPreviewVideoMediaId() {
  const now = Date.now();
  if (cachedVideoMediaId && now - cachedVideoMediaIdAt < VIDEO_CACHE_TTL_MS) {
    return cachedVideoMediaId;
  }
  const id = await uploadVideoFromUrl(PREVIEW_VIDEO_URL);
  cachedVideoMediaId = id;
  cachedVideoMediaIdAt = now;
  return id;
}

// Envia prévia (vídeo via media_id)
async function sendPreview(to) {
  try {
    const mediaId = await getPreviewVideoMediaId();

    const resp = await graphPost("/messages", {
      messaging_product: "whatsapp",
      to,
      type: "video",
      video: { id: mediaId, caption: "Amostra do conteúdo." },
    });

    console.log("sendPreview OK:", resp.data);
  } catch (err) {
    console.error("sendPreview FAIL:", err.response?.data || err.message);

    // reupload 1x se cache ficou inválido
    cachedVideoMediaId = null;
    cachedVideoMediaIdAt = 0;

    const mediaId = await getPreviewVideoMediaId();
    const resp2 = await graphPost("/messages", {
      messaging_product: "whatsapp",
      to,
      type: "video",
      video: { id: mediaId, caption: "Amostra do conteúdo." },
    });

    console.log("sendPreview RETRY OK:", resp2.data);
  }
}

// Tabela + 3 botões (quando clica em PRÉVIA ou VALORES)
async function sendPriceTableWithButtons(to) {
  const text = `💰 *Tabela de valores*

Qual você quer?`;

  const resp = await graphPost("/messages", {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text },
      action: {
        buttons: [
          { type: "reply", reply: { id: "BUY_OURO", title: "🏅 20 fotos + 15 vídeos por 17,99" } },
          { type: "reply", reply: { id: "BUY_PRATA", title: "🥈10 fotos + 8 vídeos por R$12,99" } },
          { type: "reply", reply: { id: "BUY_BRONZE", title: "🥉5 fotos + 4 vídeos por R$7,99" } },
        ],
      },
    },
  });

  console.log("sendPriceTable OK:", resp.data);
}

// Resposta simples quando escolhe um pacote
async function sendChoiceAck(to, label) {
  const resp = await graphPost("/messages", {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: `Fechado: ${label}. Me diga o e-mail/WhatsApp para envio e forma de pagamento.` },
  });
  console.log("sendChoiceAck OK:", resp.data);
}

// ===== RECEBER MSG + STATUS =====
app.post("/webhook", async (req, res) => {
  try {
    const value = req.body.entry?.[0]?.changes?.[0]?.value;

    // 1) Statuses (pra ver failed / motivo)
    const st = value?.statuses?.[0];
    if (st) {
      console.log("STATUS:", st.status, st.errors?.[0] || "");
      return res.sendStatus(200);
    }

    // 2) Mensagens
    const msg = value?.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const buttonId = msg.interactive?.button_reply?.id;

    // Clique em botões
    if (buttonId === "PREVIA") {
      await sendPreview(from);
      await new Promise((r) => setTimeout(r, 600));
      await sendPriceTableWithButtons(from);
      return res.sendStatus(200);
    }

    if (buttonId === "VALORES") {
      await sendPriceTableWithButtons(from);
      return res.sendStatus(200);
    }

    if (buttonId === "BUY_OURO") {
      await sendChoiceAck(from, "Pacote Ouro (R$ 17,99)");
      return res.sendStatus(200);
    }

    if (buttonId === "BUY_PRATA") {
      await sendChoiceAck(from, "Pacote Prata (R$ 12,99)");
      return res.sendStatus(200);
    }

    if (buttonId === "BUY_BRONZE") {
      await sendChoiceAck(from, "Pacote Bronze (R$ 7,99)");
      return res.sendStatus(200);
    }

    // Primeira mensagem do lead (texto)
    if (msg.text?.body) {
      await sendImage(from);
      await new Promise((r) => setTimeout(r, 600));
      await sendButtons(from);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("WEBHOOK ERROR:", err.response?.data || err.message);
    return res.sendStatus(200);
  }
});

// ===== TESTE =====
app.get("/", (req, res) => res.send("ok"));

app.listen(process.env.PORT || 3000, () => {
  console.log("🤖 Bot rodando");
});
