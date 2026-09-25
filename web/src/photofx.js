// Photo mode's second half: what goes ON the picture before it is saved.
// Stickers (the Designsoup decal pack, tools/bake_stickers.py), a caption,
// and light effects (a light leak, a sun flare, a film border, a date
// stamp). They are edited as DOM elements over the canvas and drawn into the
// saved PNG at full resolution by compose().
//
// Stickers: click one in the panel to put it in the middle; drag to move,
// wheel to scale, shift+wheel to turn, double-click to flip, Delete to
// remove the selected one. The caption drags the same way.
import { tt } from "./i18n.js";

export function initPhotoFx(stage, picker) {
  const base = window.DATA_BASE || "data/";
  let meta = null, sheets = {};
  const placed = [];          // {el, it, x, y, s, r, flip}  x, y as fractions of the picture
  let selected = null;
  const fx = { leak: 0, flare: 0, border: 0, stamp: false, caption: "", capStyle: 0, capX: 0.5, capY: 0.9 };

  // ---- the picker: the sheets load the first time it is opened
  async function loadMeta() {
    if (meta) return meta;
    meta = await fetch(base + "stickers.json").then(r => r.json());
    for (const [k, s] of Object.entries(meta.sheets)) {
      const img = new Image(); img.src = base + s.file;
      await new Promise(res => { img.onload = res; img.onerror = res; });
      sheets[k] = img;
    }
    return meta;
  }
  const spriteCss = (it, px) => {
    const s = meta.sheets[it.s], k = px / Math.max(it.w, it.h);
    const cx = it.x + (meta.cell - it.w) / 2, cy = it.y + (meta.cell - it.h) / 2;
    return `background-image:url(${base + s.file});background-size:${s.w * k}px ${s.h * k}px;` +
           `background-position:${-cx * k}px ${-cy * k}px;width:${it.w * k}px;height:${it.h * k}px`;
  };
  async function fillPicker(kind) {
    await loadMeta();
    picker.innerHTML = "";
    meta.items.forEach((it, i) => {
      if (kind && !it.kind.startsWith(kind)) return;
      const d = document.createElement("div");
      d.className = "stk"; d.style.cssText = spriteCss(it, 38);
      d.title = it.kind;
      d.addEventListener("click", e => { e.stopPropagation(); add(i); });
      picker.appendChild(d);
    });
  }

  // ---- placed stickers
  const W = () => stage.clientWidth, H = () => stage.clientHeight;
  function layout(p) {
    const size = 160 * p.s;
    p.el.style.cssText = spriteCss(p.it, size) +
      `;position:absolute;left:${p.x * W()}px;top:${p.y * H()}px;` +
      `transform:translate(-50%,-50%) rotate(${p.r}rad) scaleX(${p.flip ? -1 : 1});` +
      `cursor:move;pointer-events:auto;outline:${p === selected ? "1px dashed #ffe08a" : "none"}`;
  }
  function select(p) { const old = selected; selected = p; if (old) layout(old); if (p) layout(p); }
  function add(i) {
    const p = { it: meta.items[i], x: 0.5, y: 0.5, s: 1, r: 0, flip: false, el: document.createElement("div") };
    stage.appendChild(p.el);
    placed.push(p);
    dragBind(p.el, (dx, dy) => { p.x += dx / W(); p.y += dy / H(); layout(p); }, () => select(p));
    p.el.addEventListener("wheel", e => {
      e.preventDefault(); e.stopPropagation();
      if (e.shiftKey) p.r += e.deltaY * 0.004; else p.s = Math.max(0.15, Math.min(6, p.s * Math.exp(-e.deltaY * 0.0015)));
      layout(p);
    }, { passive: false });
    p.el.addEventListener("dblclick", e => { e.stopPropagation(); p.flip = !p.flip; layout(p); });
    select(p);
  }
  function dragBind(el, move, down) {
    el.addEventListener("pointerdown", e => {
      e.preventDefault(); e.stopPropagation(); down && down();
      el.setPointerCapture(e.pointerId);
      let last = [e.clientX, e.clientY];
      const mv = ev => { move(ev.clientX - last[0], ev.clientY - last[1]); last = [ev.clientX, ev.clientY]; };
      const up = () => { el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); };
      el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up);
    });
  }
  addEventListener("keydown", e => {
    if (!stage.classList.contains("on") || !selected) return;
    if (e.code === "Delete" || e.code === "Backspace") {
      e.preventDefault(); e.stopImmediatePropagation();
      selected.el.remove(); placed.splice(placed.indexOf(selected), 1); selected = null;
    }
  }, true);

  // ---- caption and light effects, previewed as DOM
  const cap = document.createElement("div"); cap.className = "phcap"; stage.appendChild(cap);
  const leak = document.createElement("div"); leak.className = "phleak"; stage.appendChild(leak);
  const border = document.createElement("div"); border.className = "phborder"; stage.appendChild(border);
  const stamp = document.createElement("div"); stamp.className = "phstamp"; stage.appendChild(stamp);
  dragBind(cap, (dx, dy) => { fx.capX += dx / W(); fx.capY += dy / H(); refresh(); });
  const CAP_FONTS = ['700 {s}px "Archivo", sans-serif', 'italic 600 {s}px Georgia, serif', '600 {s}px "IBM Plex Mono", monospace'];
  function refresh() {
    cap.textContent = fx.caption;
    // written on a print's white margin, the caption is dark ink
    const onMargin = fx.border === 1 && fx.capY > 0.86;
    cap.style.cssText = `left:${fx.capX * 100}%;top:${fx.capY * 100}%;font:${CAP_FONTS[fx.capStyle].replace("{s}", Math.round(H() * 0.045))};` +
      `display:${fx.caption ? "block" : "none"}` + (onMargin ? ";color:#2b2a28;text-shadow:none" : "");
    leak.style.opacity = fx.leak;
    leak.style.background = `radial-gradient(circle at 12% 18%, rgba(255,150,60,${0.85}), rgba(255,80,40,.35) 30%, transparent 62%),` +
      `radial-gradient(circle at 92% 88%, rgba(255,200,120,${0.5 * fx.flare}), transparent 40%)`;
    border.style.display = fx.border ? "block" : "none";
    border.dataset.kind = fx.border;
    stamp.style.display = fx.stamp ? "block" : "none";
    const d = new Date();
    stamp.textContent = `'${String(d.getFullYear()).slice(2)} ${String(d.getMonth() + 1).padStart(2, " ")} ${String(d.getDate()).padStart(2, " ")}`;
  }

  // ---- the saved picture: the GL canvas, then the effects, the stickers,
  // the border and the caption, at the canvas's own resolution
  function compose(glCanvas) {
    const c = document.createElement("canvas");
    c.width = glCanvas.width; c.height = glCanvas.height;
    const g = c.getContext("2d");
    g.drawImage(glCanvas, 0, 0);
    const sx = c.width / W(), sy = c.height / H();
    if (fx.leak > 0) {
      g.save(); g.globalAlpha = fx.leak; g.globalCompositeOperation = "screen";
      let gr = g.createRadialGradient(c.width * 0.12, c.height * 0.18, 0, c.width * 0.12, c.height * 0.18, c.width * 0.6);
      gr.addColorStop(0, "rgba(255,150,60,0.85)"); gr.addColorStop(0.5, "rgba(255,80,40,0.35)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
      if (fx.flare > 0) {
        gr = g.createRadialGradient(c.width * 0.92, c.height * 0.88, 0, c.width * 0.92, c.height * 0.88, c.width * 0.4);
        gr.addColorStop(0, `rgba(255,200,120,${0.5 * fx.flare})`); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
      }
      g.restore();
    }
    for (const p of placed) {
      const it = p.it, img = sheets[it.s]; if (!img) continue;
      const size = 160 * p.s * sx, k = size / Math.max(it.w, it.h);
      const cx = it.x + (meta.cell - it.w) / 2, cy = it.y + (meta.cell - it.h) / 2;
      g.save();
      g.translate(p.x * c.width, p.y * c.height); g.rotate(p.r); g.scale(p.flip ? -1 : 1, 1);
      g.drawImage(img, cx, cy, it.w, it.h, -it.w * k / 2, -it.h * k / 2, it.w * k, it.h * k);
      g.restore();
    }
    if (fx.border) {
      const b = Math.round(c.height * 0.04);
      g.save();
      if (fx.border === 1) {            // a white print border, wider at the foot
        g.fillStyle = "#f4f1ea";
        g.fillRect(0, 0, c.width, b); g.fillRect(0, 0, b, c.height); g.fillRect(c.width - b, 0, b, c.height);
        g.fillRect(0, c.height - b * 3, c.width, b * 3);
      } else {                          // film: black frame and sprocket holes
        g.fillStyle = "#0b0b0b";
        g.fillRect(0, 0, c.width, b * 1.6); g.fillRect(0, c.height - b * 1.6, c.width, b * 1.6);
        g.fillStyle = "#e9e2cf";
        for (let x = b * 0.5; x < c.width; x += b * 1.4) {
          g.fillRect(x, b * 0.45, b * 0.7, b * 0.6); g.fillRect(x, c.height - b * 1.05, b * 0.7, b * 0.6);
        }
      }
      g.restore();
    }
    if (fx.stamp) {
      g.save();
      g.font = `600 ${Math.round(c.height * 0.035)}px "IBM Plex Mono", monospace`;
      g.fillStyle = "rgba(255,150,40,0.92)"; g.shadowColor = "rgba(255,90,0,.8)"; g.shadowBlur = c.height * 0.006;
      g.textAlign = "right"; g.fillText(stamp.textContent, c.width * 0.95, c.height * 0.93);
      g.restore();
    }
    if (fx.caption) {
      g.save();
      g.font = CAP_FONTS[fx.capStyle].replace("{s}", Math.round(c.height * 0.045));
      g.textAlign = "center"; g.textBaseline = "middle";
      const onMargin = fx.border === 1 && fx.capY > 0.86;
      g.lineWidth = c.height * 0.008; g.strokeStyle = "rgba(0,0,0,.65)"; g.fillStyle = onMargin ? "#2b2a28" : "#fff";
      if (!onMargin) g.strokeText(fx.caption, fx.capX * c.width, fx.capY * c.height);
      g.fillText(fx.caption, fx.capX * c.width, fx.capY * c.height);
      g.restore();
    }
    return c;
  }
  function clear() {
    for (const p of placed) p.el.remove();
    placed.length = 0; selected = null;
    Object.assign(fx, { leak: 0, flare: 0, border: 0, stamp: false, caption: "" });
    refresh();
  }
  refresh();
  return { fx, refresh, compose, clear, fillPicker, show: on => stage.classList.toggle("on", on),
           count: () => placed.length };
}
