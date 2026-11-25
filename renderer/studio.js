// Desktop-only simple workspace; the original editor stays mounted.
import { icon } from "./editor/inpaint_dom.js";
import { availableCutoutBackends } from "./editor/inpaint_backends.js";
let context;
function make(tag, cls, text = "") {
    const node = document.createElement(tag);
    node.className = cls;
    if (text) node.textContent = text;
    return node;
}
function button(label, glyph, run, cls = "") {
    const b = make("button", "studio-button " + cls);
    b.type = "button";
    if (glyph) {
        const img = make("span", "studio-icon");
        img.innerHTML = icon(glyph, 21);
        img.setAttribute("aria-hidden", "true");
        b.appendChild(img);
    }
    b.appendChild(make("span", "", label));
    b.addEventListener("click", () => {
        Promise.resolve().then(run).catch((err) => {
            const ed = context.host.editor;
            if (ed) ed.setStatus(String(err.message || err), "error");
            console.warn("Studio", err);
        });
    });
    return b;
}
function say(ed, message) { ed.setStatus(message, "info"); }
function withEditor(run) {
    return () => { const ed = context.host.editor; if (ed) return run(ed); };
}
function setMode(simple) {
    document.body.classList.toggle("studio-simple", simple);
    try { localStorage.setItem("studio.simple", simple ? "1" : "0"); } catch (_) { /* optional */ }
    const toggle = document.getElementById("studio-mode");
    toggle.textContent = simple ? "Modo avanzado" : "Modo sencillo";
    toggle.setAttribute("aria-pressed", String(!simple));
    if (simple && context.host.editor) context.host.editor.showPane("image");
}
async function settings(section) {
    await context.openSettings();
    if (!section) return;
    const h = Array.from(document.querySelectorAll("#shell-settings h3")).find((n) => n.textContent.includes(section));
    if (h) h.scrollIntoView({ block: "start" });
}
function showSection(ed, name) {
    ed.showPane("image");
    const d = Array.from(ed.panes.image.children).find((n) => n.tagName === "DETAILS" && n.querySelector("summary")?.textContent.startsWith(name));
    if (d) {
        d.classList.add("studio-reveal");
        d.open = true;
        d.scrollIntoView({ block: "nearest" });
    }
}
function revealLayers(ed) {
    ed.showPane("image");
    ed.layerList.scrollIntoView({ block: "nearest" });
}
async function cutout(ed) {
    if (!ed.width) { ed.fileInput.click(); return; }
    const backends = availableCutoutBackends();
    const local = backends.find((b) => b.inApp && b.id === "app:birefnet_lite") || backends.find((b) => b.inApp && b.id === "app:birefnet");
    if (!local) {
        say(ed, "Descarga BiRefNet Lite o BiRefNet en Helpers para quitar fondos sin pagar.");
        await settings("Helpers");
        return;
    }
    if (ed.cutoutPending) { say(ed, "Ya se está quitando un fondo."); return; }
    let layer = ed.activeLayer();
    if (!layer && ed.base?.px) {
        ed.pushUndo({ kind: "layers", label: "Copia para quitar fondo" });
        layer = ed.addLayer({ name: "Recorte", kind: "image", ref: null, px: ed.base.px.clone(),
            x: 0, y: 0, w: ed.width, h: ed.height, dirty: true });
    }
    if (!layer || !layer.px || layer.kind === "filter" || ed.isReference(layer)) {
        say(ed, "Selecciona una capa de imagen antes de quitar su fondo."); return;
    }
    const old = ed.cutoutSettings.backend;
    ed.cutoutSettings.backend = local.id;
    try {
        const result = await ed.cutoutLayer(layer);
        if (result === "done") say(ed, "Recorte listo. Usa PNG transparente para guardar solo la capa recortada.");
    } finally {
        ed.cutoutSettings.backend = old;
        ed.refreshCutoutBackends();
    }
    revealLayers(ed);
}
function filter(ed, id) {
    if (!ed.width) { say(ed, "Abre una imagen o crea un diseño primero."); return; }
    const active = ed.activeLayer();
    if (!(active && active.kind === "filter" && active.filter === id)) ed.addFilterLayer(id);
    revealLayers(ed);
}
export function initStudio(opts) {
    context = opts;
    const bar = document.getElementById("shell-bar");
    const group = make("div", "studio-top");
    const add = (label, glyph, fn, cls) => group.appendChild(button(label, glyph, withEditor(fn), cls));
    add("Nuevo diseño", "newfile", (ed) => ed.newCanvasTab());
    add("Abrir", "load", (ed) => ed.fileInput.click());
    add("Deshacer", "undo", (ed) => ed.undoStep());
    add("Rehacer", "redo", (ed) => ed.redoStep());
    add("Ajustar vista", "fit", (ed) => ed.fitView());
    group.appendChild(button("Configuración", "fx", () => settings()));
    add("Exportar", "download", (ed) => ed.exportImage({ download: true }), "studio-primary");
    bar.insertBefore(group, document.getElementById("shell-recipe").parentElement);
    const toggle = button("Modo avanzado", null, () => setMode(!document.body.classList.contains("studio-simple")));
    toggle.id = "studio-mode";
    bar.appendChild(toggle);
    let simple = true;
    try { simple = localStorage.getItem("studio.simple") !== "0"; } catch (_) { /* default */ }
    setMode(simple);
}
export function attachStudio(ed) {
    const root = ed.root;
    const body = root.querySelector(".ipc-body");
    if (!body || root.querySelector(".studio-rail")) return;
    const rail = make("nav", "studio-rail");
    rail.setAttribute("aria-label", "Herramientas de diseño");
    const panel = make("section", "studio-panel");
    const heading = make("h2", "studio-title");
    const description = make("p", "studio-description");
    const grid = make("div", "studio-actions");
    panel.append(heading, description, grid);
    ed.panes.image.prepend(panel);
    body.prepend(rail);
    const pages = [
        { title: "Diseño", icon: "newfile", desc: "Crea un lienzo o ajusta sus dimensiones.", actions: [
            ["Nuevo diseño", "newfile", () => ed.newCanvasTab()],
            ["Tamaño y formato", "canvas", () => showSection(ed, "Canvas")],
            ["Ajustar a pantalla", "fit", () => ed.fitView()]
        ] },
        { title: "Elementos", icon: "shape", desc: "Añade formas y rellenos editables.", actions: [
            ["Formas", "shape", () => ed.setTool("shape")],
            ["Fondo de color", "fill", () => filter(ed, "fill")],
            ["Mover / escalar", "transform", () => ed.setTool("transform")]
        ] },
        { title: "Texto", icon: "text", desc: "Añade texto y edítalo en el panel de capas.", actions: [
            ["Añadir texto", "text", () => { if (ed.width) { ed.setTool("text"); return ed.addTextLayer(ed.width * .2, ed.height * .3); } say(ed, "Crea un lienzo primero."); }],
            ["Importar fuente", "load", () => ed.fontInput.click()],
            ["Mover / escalar", "transform", () => ed.setTool("transform")]
        ] },
        { title: "Imágenes", icon: "image", desc: "Abre una foto o importa otras como capas.", actions: [
            ["Abrir imagen", "load", () => ed.fileInput.click()],
            ["Añadir imágenes", "image", () => ed.imageInput.click()],
            ["Mover / escalar", "transform", () => ed.setTool("transform")]
        ] },
        { title: "Editar", icon: "fx", desc: "Herramientas rápidas y ajustes no destructivos.", actions: [
            ["Quitar fondo", "scissors", () => cutout(ed)],
            ["PNG transparente", "download", () => ed.exportLayerPng()],
            ["Brillo / contraste", "fx", () => filter(ed, "brightness_contrast")],
            ["Tono / saturación", "fx", () => filter(ed, "hue_sat")],
            ["Granulado", "fx", () => filter(ed, "grain")],
            ["Recortar / ampliar", "canvas", () => { ed.setTool("canvas"); showSection(ed, "Canvas"); say(ed, "Arrastra el marco y pulsa Enter. Para rellenar con IA, abre el modo avanzado."); }],
            ["Borrador de objetos", "erase", () => { if (ed.toolGroupOf.remove) ed.setTool("remove"); else say(ed, "El borrador inteligente no está disponible en esta instalación."); }],
            ["Modelos IA locales", "magic", () => settings("Helpers")]
        ] },
        { title: "Capas", icon: "flatten", desc: "Selecciona, ordena y ajusta los elementos.", actions: [
            ["Mover / escalar", "transform", () => ed.setTool("transform")],
            ["Duplicar capa", "image", () => ed.duplicateLayer()],
            ["Guardar capa PNG", "download", () => ed.exportLayerPng()]
        ] }
    ];
    const tabs = [];
    const choose = (i, show = true) => {
        if (show) ed.showPane("image");
        for (const d of ed.panes.image.querySelectorAll(".studio-reveal")) d.classList.remove("studio-reveal");
        const p = pages[i];
        heading.textContent = p.title;
        description.textContent = p.desc;
        grid.replaceChildren(...p.actions.map(([label, glyph, run]) => button(label, glyph, run)));
        tabs.forEach((b, k) => { b.classList.toggle("studio-active", k === i); b.setAttribute("aria-pressed", String(k === i)); });
        ed.panes.image.scrollTop = 0;
    };
    pages.forEach((p, i) => { const b = button(p.title, p.icon, () => choose(i)); tabs.push(b); rail.appendChild(b); });
    choose(4, document.body.classList.contains("studio-simple"));
}
