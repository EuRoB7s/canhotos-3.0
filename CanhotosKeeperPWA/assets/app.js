/* Canhotos Keeper (PWA) - 100% front-end
 * - IndexedDB para persistência local
 * - Tesseract.js para OCR (CDN no index.html)
 * - Busca por número + data
 * - Navegação por data + loja
 * - Backup (export/import JSON)
 */

// ========================= PWA: registra service worker =========================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  });
}

// ========================= Helpers =========================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const fmtDateISO = (d) => d ? new Date(d).toISOString().slice(0,10) : "";

function sanitizeNumber(s) {
  // pega sequência de 5 a 10 dígitos como candidato a "número do canhoto"
  const m = String(s || "").match(/(?<!\d)(\d{5,10})(?!\d)/);
  return m ? m[1] : "";
}

function parseStore(text) {
  // procura "loja 5" / "LOJA 5" / "store 5"
  const m = String(text || "").toLowerCase().match(/loja\s*(\d{1,4})|store\s*(\d{1,4})/);
  return m ? (m[1] || m[2] || "").trim() : "";
}

function parseDateAny(text) {
  // aceita: dd/mm/yyyy, dd.mm.yyyy, dd-mm-yyyy, mm.dd.yyyy, yyyy-mm-dd
  const t = String(text || "");

  // ISO first
  let m = t.match(/(\d{4})[-/.](\d{2})[-/.](\d{2})/);
  if (m) {
    const [_, y, a, b] = m;
    const iso = `${y}-${a}-${b}`;
    if (!Number.isNaN(Date.parse(iso))) return iso;
  }

  // dd[./-]mm[./-]yyyy or mm[./-]dd[./-]yyyy — decide by >12 heuristic
  m = t.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) {
    let d = parseInt(m[1],10), mth = parseInt(m[2],10), y = parseInt(m[3],10);
    if (d > 31 || mth > 31) return "";
    // Se o primeiro é >12, interpretamos como dia; se o segundo é >12, interpretamos como mês
    if (d > 12 && mth <= 12) {
      // dd.mm.yyyy
    } else if (mth > 12 && d <= 12) {
      // mm.dd.yyyy (US) -> inverter
      let tmp = d; d = mth; mth = tmp;
    } else {
      // Ambos <=12 -> padrão BR: dd.mm.yyyy
    }
    const iso = `${y}-${String(mth).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    if (!Number.isNaN(Date.parse(iso))) return iso;
  }
  return "";
}

function detectFromOCR(text) {
  const num = sanitizeNumber(text);
  const date = parseDateAny(text);
  const store = parseStore(text);
  return { num, date, store };
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, sub);
  }
  return btoa(binary);
}

function fileToUint8(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(new Uint8Array(fr.result));
    fr.onerror = reject;
    fr.readAsArrayBuffer(file);
  });
}

function blobFromBase64(b64, type="image/jpeg") {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

// ========================= IndexedDB =========================
const DB_NAME = "canhotos-keeper";
const DB_VERSION = 1;
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      const store = db.createObjectStore("canhotos", { keyPath: "id" });
      store.createIndex("by_date", "date", { unique: false });
      store.createIndex("by_store", "store", { unique: false });
      store.createIndex("by_num", "num", { unique: false });
      store.createIndex("by_date_store", ["date","store"], { unique: false });
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function txStore(mode="readonly") {
  const tx = db.transaction("canhotos", mode);
  return [tx, tx.objectStore("canhotos")];
}

async function putCanhoto(item) {
  const [tx, store] = txStore("readwrite");
  store.put(item);
  return new Promise((res, rej) => {
    tx.oncomplete = () => res(true);
    tx.onerror = () => rej(tx.error);
  });
}

async function queryByNumDate(num, dateISO) {
  const [tx, store] = txStore("readonly");
  const idx = store.index("by_num");
  const out = [];
  idx.openCursor(IDBKeyRange.only(num)).onsuccess = (ev) => {
    const cur = ev.target.result;
    if (cur) {
      if (!dateISO || cur.value.date === dateISO) out.push(cur.value);
      cur.continue();
    }
  };
  return new Promise((res, rej) => {
    tx.oncomplete = () => res(out);
    tx.onerror = () => rej(tx.error);
  });
}

async function queryByDateStore(dateISO, storeNum) {
  const [tx, store] = txStore("readonly");
  const idx = store.index("by_date_store");
  const out = [];
  const key = storeNum ? [dateISO, String(storeNum)] : [dateISO];
  // Se loja não foi informada, varre by_date (mais eficiente).
  if (!storeNum) {
    const idxDate = store.index("by_date");
    idxDate.openCursor(IDBKeyRange.only(dateISO)).onsuccess = (ev) => {
      const cur = ev.target.result;
      if (cur) { out.push(cur.value); cur.continue(); }
    };
  } else {
    idx.openCursor(IDBKeyRange.only([dateISO, String(storeNum)])).onsuccess = (ev) => {
      const cur = ev.target.result;
      if (cur) { out.push(cur.value); cur.continue(); }
    };
  }

  return new Promise((res, rej) => {
    tx.oncomplete = () => res(out);
    tx.onerror = () => rej(tx.error);
  });
}

async function exportAll() {
  const [tx, store] = txStore("readonly");
  const all = [];
  store.openCursor().onsuccess = (ev) => {
    const cur = ev.target.result;
    if (cur) { all.push(cur.value); cur.continue(); }
  };
  return new Promise((res, rej) => {
    tx.oncomplete = () => res(all);
    tx.onerror = () => rej(tx.error);
  });
}

// ========================= UI Navigation =========================
function showPage(id) {
  $$(".page").forEach(p => p.classList.remove("active"));
  $(id).classList.add("active");
}

$("#nav-upload").addEventListener("click", () => showPage("#page-upload"));
$("#nav-search").addEventListener("click", () => showPage("#page-search"));
$("#nav-browse").addEventListener("click", () => showPage("#page-browse"));
$("#nav-backup").addEventListener("click", () => showPage("#page-backup"));

// ========================= RENDER HELPERS =========================
function cardHTML(item) {
  const { id, num, date, store, path, thumbB64 } = item;
  const meta = [
    `Nº: ${num || "—"}`,
    `Data: ${date || "—"}`,
    `Loja: ${store || "—"}`,
    `Pasta: ${path || "—"}`
  ].join(" • ");
  const imgSrc = thumbB64 ? `data:image/jpeg;base64,${thumbB64}` : "";
  return `
    <div class="card-item" data-id="${id}">
      <img src="${imgSrc}" alt="Canhoto">
      <div class="content">
        <div class="meta">${meta}</div>
        <div style="margin-top:8px; display:flex; gap:8px;">
          <button class="btn btn-open" data-id="${id}">Abrir</button>
          <button class="btn btn-del" data-id="${id}">Excluir</button>
        </div>
      </div>
    </div>
  `;
}

function renderList(el, items) {
  el.innerHTML = items.map(cardHTML).join("");
  // attach listeners
  el.querySelectorAll(".btn-open").forEach(btn => btn.addEventListener("click", onOpenItem));
  el.querySelectorAll(".btn-del").forEach(btn => btn.addEventListener("click", onDeleteItem));
}

function dataURLFromBlob(blob) {
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(blob);
  });
}

async function onOpenItem(e) {
  const id = e.currentTarget.dataset.id;
  const [tx, store] = txStore("readonly");
  const req = store.get(id);
  req.onsuccess = async () => {
    const item = req.result;
    if (!item) return;
    const blob = blobFromBase64(item.imageB64, item.mime || "image/jpeg");
    const url = await dataURLFromBlob(blob);
    $("#modal-img").src = url;
    $("#modal-meta").textContent = `Nº ${item.num || "—"} • Data ${item.date || "—"} • Loja ${item.store || "—"} • Pasta ${item.path || "—"}`;
    $("#photo-modal").showModal();
  };
}

function onDeleteItem(e) {
  const id = e.currentTarget.dataset.id;
  if (!confirm("Excluir este canhoto?")) return;
  const [tx, store] = txStore("readwrite");
  store.delete(id);
  tx.oncomplete = () => {
    // Remove do DOM
    const card = document.querySelector(`.card-item[data-id="${id}"]`);
    if (card) card.remove();
  };
}

$("#btn-close-modal").addEventListener("click", () => $("#photo-modal").close());

// ========================= OCR + PROCESSING =========================
async function ocrImage(file) {
  // Usa Tesseract.js com 'por+eng' (melhor para números e termos em PT).
  const worker = await Tesseract.createWorker("por+eng");
  const ret = await worker.recognize(file);
  await worker.terminate();
  return ret.data.text || "";
}

function makeThumb(imgBlob, maxW=600, quality=0.8) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(imgBlob);
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      const b64 = c.toDataURL("image/jpeg", quality).split(",")[1];
      URL.revokeObjectURL(url);
      resolve(b64);
    };
    img.src = url;
  });
}

async function handleProcess() {
  const files = $("#inp-files").files;
  if (!files || !files.length) {
    alert("Selecione ao menos uma imagem.");
    return;
  }

  const lojaManual = $("#inp-loja").value.trim();
  const dataManual = $("#inp-data").value ? fmtDateISO($("#inp-data").value) : "";
  const useOCR = $("#chk-ocr").checked;

  const total = files.length;
  $("#progress").classList.remove("hidden");
  let done = 0;

  const processed = [];

  for (const file of files) {
    let text = "";
    if (useOCR) {
      try {
        text = await ocrImage(file);
      } catch (err) {
        console.warn("OCR falhou para um arquivo:", err);
      }
    }

    // Extração
    const guess = detectFromOCR(text);
    const num = sanitizeNumber(guess.num) || sanitizeNumber(file.name);
    const store = (lojaManual || guess.store || "").replace(/^0+/, "");
    const dateISO = dataManual || guess.date || "";

    // Monta "pasta" virtual: Loja/AAAA-MM-DD/NUMERO.jpg
    const path = `${store || "Loja?"}/${dateISO || "Data?"}/${num || file.name}`;

    // Salva no IndexedDB
    const bytes = await fileToUint8(file);
    const imageB64 = bytesToBase64(bytes);
    const thumbB64 = await makeThumb(new Blob([bytes], { type: file.type || "image/jpeg" }));

    const item = {
      id: crypto.randomUUID(),
      num: num || "",
      date: dateISO || "",
      store: store || "",
      path,
      mime: file.type || "image/jpeg",
      imageB64,
      thumbB64,
      ocrText: text || ""
    };
    await putCanhoto(item);
    processed.push(item);

    done++;
    const pct = Math.round(done * 100 / total);
    $("#progress-bar").style.width = pct + "%";
    $("#progress-label").textContent = pct + "%";
  }

  // Render prévia dos últimos adicionados
  renderList($("#preview-list"), processed);
  setTimeout(() => $("#progress").classList.add("hidden"), 600);
  $("#inp-files").value = "";
}

$("#btn-process").addEventListener("click", handleProcess);

// ========================= SEARCH =========================
async function doSearch() {
  const num = $("#q-num").value.trim();
  const dateISO = $("#q-date").value ? fmtDateISO($("#q-date").value) : "";
  if (!num && !dateISO) {
    alert("Digite ao menos o Nº do canhoto ou a Data.");
    return;
  }
  const items = num ? await queryByNumDate(num, dateISO) : await queryByDateStore(dateISO, null);
  renderList($("#search-results"), items);
}
$("#btn-search").addEventListener("click", doSearch);

// ========================= BROWSE =========================
async function doBrowse() {
  const dateISO = $("#b-date").value ? fmtDateISO($("#b-date").value) : "";
  if (!dateISO) { alert("Escolha uma data para navegar."); return; }
  const loja = $("#b-loja").value.trim();
  const items = await queryByDateStore(dateISO, loja || null);
  renderList($("#browse-results"), items);
}
$("#btn-browse").addEventListener("click", doBrowse);

// ========================= BACKUP =========================
$("#btn-export").addEventListener("click", async () => {
  const all = await exportAll();
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), items: all })], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `backup_canhotos_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

$("#btn-import").addEventListener("click", async () => {
  const f = $("#inp-import").files?.[0];
  if (!f) return alert("Escolha um arquivo de backup .json");
  try {
    const txt = await f.text();
    const data = JSON.parse(txt);
    if (!data || !Array.isArray(data.items)) throw new Error("Formato inválido.");
    for (const item of data.items) {
      // Simplesmente regrava (id incluso) — sobrescreve se existir
      await putCanhoto(item);
    }
    alert("Importado com sucesso!");
  } catch (e) {
    console.error(e);
    alert("Falha ao importar backup.");
  }
});

// ========================= INIT =========================
openDB().then(() => {
  // Nada por agora; DB pronto.
}).catch(err => {
  console.error("Erro ao abrir DB:", err);
  alert("Falha ao iniciar o banco local. Verifique permissões do navegador.");
});
