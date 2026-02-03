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

const VIDEO_URL =
  process.env.VIDEO_URL ||
  "https://raw.githubusercontent.com/digitalhats2-source/whatsapp-bot/main/Video.mp4";

// cache simples (evita upload toda hora)
let cachedVideoMediaId = null;
let cachedVideoMediaIdAt = 0;
const VIDEO_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${WHATSAPP_TOKEN}`, ...extra };
}

function graphUrl(path) {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}${path}`;
}

async function graphPost(path, data, extraConfig = {}) {
  return axios.post(graphUrl(path), data, {
    headers: authHeaders(extraConfig.headers || {}),
    timeout: 30000,
    ...extraConfig,
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

// Botões iniciais (2 apenas)
async function sendButtons(to) {
  const resp = await graphPost("/messages", {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "Oi amor 😘\nQuer ver algo exclusivo que não vai pro feed?" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "PREVIA", title: "🔥 Ver prévia" } },
          { type: "reply", reply: { id: "VALORES", title: "💰 Ver valores" } },
        ],
      },
    },
  });
  console.log("sendButtons OK:", resp.data);
}

// Upload do vídeo -> retorna media_id (padrão recomendado)
async function uploadVideoFromUrl(url) {
  const fileResp = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 30000,
  });

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "video/mp4");
  form.append("file", Buffer.from(fileResp.data), {
    filename: "Video.mp4",
    contentType: "video/mp4",
  });

  const up = await axios.post(
    graphUrl("/media"),
    form,
    {
      headers: authHeaders(form.getHeaders()),
      timeout: 60000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    }
  );

  console.log("uploadVideo OK:", up.data);
  return up.data.id;
}

async function getVideoMediaId() {
  const now = Date.now();
  if (cachedVideoMediaId && now - cachedVideoMediaIdAt < VIDEO_CACHE_TTL_MS) {
    return cachedVideoMediaId;
  }
  const id = await uploadVideoFromUrl(VIDEO_URL);
  cachedVideoMediaId = id;
  cachedVideoMediaIdAt = now;
  return id;
}

// Vídeo de prévia (via media id)
async function sendVideo(to) {
  const mediaId = await getVideoMediaId();

  try {
    const resp = await graphPost("/messages", {
      messaging_product: "whatsapp",
      to,
      type: "video",
      video: { id: mediaId, caption: "Só um gostinho do que tem no VIP 😈" },
    });
    console.log("sendVideo OK:", resp.data);
  } catch (err) {
    // Se o media_id morreu, tenta 1x reupload
    const data = err.response?.data || err.message;
    console.error("sendVideo FAIL:", data);

    cachedVideoMediaId = null;
    cachedVideoMediaIdAt = 0;

    const newId = await getVideoMediaId();
    const resp2 = await graphPost("/messages", {
      messaging_product: "whatsapp",
      to,
      type: "video",
      video: { id: newId, caption: "Só um gostinho do que tem no VIP 😈" },
    });
    console.log("sendVideo RETRY OK:", resp2.data);
  }
}

// Tabela de valores (texto)
async function sendPrices(to) {
  const resp = await graphPost("/messages", {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: {
      body: `💰 *VALORES VIP*

🔥 Acesso exclusivo
📸 Fotos + 🎥 vídeos

Pix disponível
Quer garantir o seu acesso? 😘`,
    },
  });
  console.log("sendPrices OK:", resp.data);
}

// ===== RECEBER MSG + STATUS =====
app.post("/webhook", async (req, res) => {
  try {
    const value = req.body.entry?.[0]?.changes?.[0]?.value;

    // 1) Status (sent/delivered/read/failed)
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

    // 🔥 VER PRÉVIA
    if (buttonId === "PREVIA") {
      await sendVideo(from);
      await new Promise((r) => setTimeout(r, 600));
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
