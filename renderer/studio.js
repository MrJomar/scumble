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

/** Image context toolbar, independent of the native tool-specific options. */
function attachImageToolbar(ed, openEdit) {
    const bar = make("div", "studio-imagebar");
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Editar imagen seleccionada");
    bar.hidden = true;
    const actions = make("div", "studio-imagebar-actions");
    bar.appendChild(actions);
    ed.viewEl.appendChild(bar);
    const active = () => ed.activeLayer();
    const canEditLayer = () => {
        const l = active();
        return !!(l && l.px && l.kind !== "filter" && l.kind !== "text" && !ed.isReference(l) && !ed.isLocked(l) && !ed.activeGroupId && !ed.multiSelected());
    };
    const add = (label, glyph, fn) => {
        const b = button(label, glyph, fn);
        actions.appendChild(b);
        return b;
    };
    const divider = () => actions.appendChild(make("span", "studio-imagebar-divider"));
    const replaceInput = document.createElement("input");
    replaceInput.type = "file";
    replaceInput.accept = "image/png,image/jpeg,image/webp,image/bmp,image/gif";
    replaceInput.hidden = true;
    bar.appendChild(replaceInput);
    let replaceTarget = null;
    const replace = add("Reemplazar", null, () => {
        if (!active()) {
            if (ed.base) ed.fileInput.click();
            return;
        }
        if (!canEditLayer()) return;
        replaceTarget = active();
        if (replaceTarget.maskPx) {
            say(ed, "Quita o aplica la máscara antes de reemplazar esta capa; así no pierdes el recorte.");
            return;
        }
        replaceInput.value = "";
        replaceInput.click();
    });
    replaceInput.addEventListener("change", async () => {
        const file = replaceInput.files && replaceInput.files[0];
        const target = replaceTarget;
        replaceTarget = null;
        if (!file || !target || !ed.layers.includes(target)) return;
        let bitmap;
        try {
            bitmap = await createImageBitmap(file);
            if (ed._destroyed || active() !== target || !canEditLayer() || target.maskPx || !ed.layers.includes(target)) return;
            ed.checkBaseSize(bitmap.width, bitmap.height);
            const canvas = document.createElement("canvas");
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            canvas.getContext("2d").drawImage(bitmap, 0, 0);
            const px = ed.pixels.Layer.fromCanvas(canvas);
            if (ed.pending) ed.cancelPending();
            ed.pushUndo({ kind: "layerfull", id: target.id, label: "Reemplazar imagen" });
            // Fit the replacement into the previous bounds, keeping its aspect ratio and centre.
            const scale = Math.min(target.w / bitmap.width, target.h / bitmap.height);
            const w = Math.max(1, Math.round(bitmap.width * scale));
            const h = Math.max(1, Math.round(bitmap.height * scale));
            target.x = Math.round(target.x + (target.w - w) / 2);
            target.y = Math.round(target.y + (target.h - h) / 2);
            target.w = w;
            target.h = h;
            target.px = px;
            ed.markLayerChanged(target);
            ed.renderLayers();
            ed.updateSubbar();
            ed.draw();
            say(ed, "Imagen reemplazada. Puedes deshacer el cambio.");
        } catch (err) { ed.setStatus("No se pudo reemplazar: " + String(err.message || err), "error"); }
        finally { if (bitmap) bitmap.close(); }
    });
    const edit = button("Editar", null, openEdit);
    actions.prepend(edit);
    divider();
    const removeBg = add("Quitafondos", null, () => cutout(ed));
    const erase = add("Borrador", null, () => {
        if (ed.toolGroupOf.remove) {
            ed.setTool("remove");
            say(ed, "Pinta sobre el objeto que quieres borrar. Necesita el modelo local LaMa.");
        } else say(ed, "El borrador inteligente no está disponible en esta instalación.");
    });
    divider();
    const crop = add("Recortar lienzo", "canvas", () => {
        ed.setTool("canvas");
        showSection(ed, "Canvas");
    });
    const select = (label, options, run) => {
        const wrap = make("label", "studio-imagebar-select");
        const el = document.createElement("select");
        el.setAttribute("aria-label", label);
        for (const [value, text] of [["", label], ...options]) {
            const opt = document.createElement("option");
            opt.value = value;
            opt.textContent = text;
            el.appendChild(opt);
        }
        el.addEventListener("change", () => {
            const v = el.value;
            el.value = "";
            if (v) run(v);
        });
        wrap.appendChild(el);
        actions.appendChild(wrap);
        return el;
    };
    const flip = select("Voltear", [["h", "Horizontal"], ["v", "Vertical"]], (v) => {
        if (canEditLayer()) ed.flipLayer(v);
    });
    const opacity = make("label", "studio-imagebar-opacity", "Transparencia");
    const opacityInput = document.createElement("input");
    opacityInput.type = "range";
    opacityInput.min = "0";
    opacityInput.max = "100";
    opacityInput.setAttribute("aria-label", "Opacidad de la imagen");
    const pct = make("span", "studio-opacity-value");
    opacity.append(opacityInput, pct);
    actions.appendChild(opacity);
    opacityInput.addEventListener("input", () => { pct.textContent = opacityInput.value + "%"; });
    opacityInput.addEventListener("change", () => {
        if (!canEditLayer()) { sync(); return; }
        const layer = active();
        const value = Number(opacityInput.value) / 100;
        if (value === layer.opacity) return;
        ed.pushUndo({ kind: "layers", label: "Transparencia" });
        layer.opacity = value;
        ed.layersRestacked();
    });
    divider();
    const pos = select("Posición", [["move", "Mover / escalar"], ["center", "Centrar"], ["up", "Adelantar"], ["down", "Retroceder"], ["top", "Al frente"], ["bottom", "Al fondo"]], (v) => {
        if (!canEditLayer()) return;
        const layer = active();
        if (v === "move") ed.setTool("transform");
        else if (v === "center") ed.centerLayer();
        else if (v === "up" || v === "down") ed.moveLayer(layer.id, v === "up" ? 1 : -1, { undo: true });
        else ed.moveLayer(layer.id, 0, { undo: true, to: v });
    });
    add("Estilo", "fx", openEdit);
    function sync() {
        const l = active();
        const shown = !!ed.width && (l ? !!l.px && l.kind !== "filter" && l.kind !== "text" && !ed.isReference(l) : !!ed.base?.px);
        bar.hidden = !shown;
        ed.root.classList.toggle("studio-imagebar-visible", shown);
        const editable = canEditLayer();
        const base = shown && !l;
        replace.disabled = !(editable || base);
        removeBg.disabled = !(editable || base);
        erase.disabled = !(editable || base);
        crop.disabled = !shown;
        flip.disabled = !editable;
        opacityInput.disabled = !editable;
        pos.disabled = !editable;
        opacityInput.value = String(Math.round((l?.opacity ?? 1) * 100));
        pct.textContent = opacityInput.value + "%";
    }
    // Rebuilt by native selection, loading, undo, and layer edits. Observe only that list.
    const observer = new MutationObserver(sync);
    observer.observe(ed.layerList, { childList: true });
    sync();
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
    attachImageToolbar(ed, () => choose(4));
}
