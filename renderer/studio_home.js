// Local start page for Studio. Native tabs and .scumble documents remain the source of truth.
const formats = [
    ["Miniatura YouTube",1280,720,"#e74b57","YT"],
    ["Foto de perfil YouTube",800,800,"#e74b57","YT"],
    ["Banner YouTube",2560,1440,"#e74b57","YT"],
    ["Publicación Facebook",1080,1080,"#3276db","f"],
    ["Portada Facebook",820,360,"#3276db","f"],
    ["Foto de perfil Facebook",1080,1080,"#3276db","f"],
    ["Publicación Instagram",1080,1350,"#b642a8","IG"],
    ["Historia / Reel / TikTok",1080,1920,"#7246ce","▶"],
    ["Video Full HD",1920,1080,"#138c97","HD"]
];
let ctx, page, recent, search, status, generation = 0;
let urls = [];
let working = false;
function el(tag, cls, text) {
    const n = document.createElement(tag);
    n.className = cls || "";
    if (text) n.textContent = text;
    return n;
}
function action(label, run, cls = "") {
    const b = el("button", "studio-home-action " + cls, label);
    b.type = "button";
    b.addEventListener("click", () => Promise.resolve(run()).catch((err) => { status.textContent = String(err.message || err); }));
    return b;
}
function revoke() { for (const u of urls) URL.revokeObjectURL(u); urls = []; }
export function hideStudioHome() {
    generation++;
    document.body.classList.remove("studio-home-open");
    if (page) page.hidden = true;
    revoke();
}
async function create(name, w, h) {
    if (working) return;
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 16 || h < 16 || w > 16384 || h > 16384) {
        status.textContent = "Escribe medidas enteras entre 16 y 16384 píxeles.";
        return;
    }
    working = true;
    status.textContent = "Creando lienzo…";
    try {
        const ed = await ctx.createCanvas(name, w, h);
        if (ed && ed.width === w && ed.height === h) hideStudioHome();
        else status.textContent = "No se pudo crear el lienzo. Revisa las medidas.";
    } finally { working = false; }
}
function card(name, meta, open) {
    const b = action("", open, "studio-recent-card");
    const preview = el("div", "studio-recent-preview");
    preview.appendChild(el("span", "studio-recent-placeholder", "▧"));
    b.append(preview, el("strong", "studio-recent-name", name), el("span", "studio-recent-meta", meta));
    recent.appendChild(b);
    return preview;
}
async function renderRecents() {
    const seq = ++generation;
    revoke();
    recent.replaceChildren();
    const filter = search.value.trim().toLocaleLowerCase();
    const matches = (s) => !filter || s.toLocaleLowerCase().includes(filter);
    const docs = ctx.host.editors().filter((ed) => ed.base && ed.width);
    const paths = new Set(docs.map((ed) => ed.docFile?.path?.toLowerCase()).filter(Boolean));
    const pending = [];
    for (const ed of docs.slice().reverse()) {
        const name = ctx.host.documentName(ed);
        if (!matches(name)) continue;
        const preview = card(name, ed.width + " × " + ed.height + " · Diseño abierto", () => { ctx.activate(ed); hideStudioHome(); });
        pending.push({ ed, preview });
    }
    try {
        const settings = await window.scumble.settings.get();
        if (seq !== generation) return;
        for (const r of (settings.recentDocuments || [])) {
            if (!r.path || paths.has(r.path.toLowerCase())) continue;
            const name = String(r.name || r.path).replace(/\.scumble$/i, "");
            if (!matches(name)) continue;
            const date = r.time ? new Date(r.time).toLocaleDateString("es-MX") : "";
            card(name, "Proyecto guardado" + (date ? " · " + date : ""), async () => {
                const result = await ctx.openDocument(r.path);
                if (result) hideStudioHome();
                else status.textContent = "No se pudo abrir el proyecto. Comprueba que sigue en su ubicación.";
            });
        }
    } catch (err) { console.warn("Studio recent documents", err); }
    if (seq !== generation) return;
    if (!recent.childElementCount) recent.appendChild(el("p", "studio-home-empty", filter ? "No hay diseños que coincidan." : "Tus diseños abiertos y proyectos .scumble guardados aparecerán aquí."));
    // Preview only live, restored tabs; saved-only entries use a document icon without loading their pixels.
    for (const {ed, preview} of pending) {
        if (seq !== generation) break;
        try {
            const bytes = await ctx.host.documentThumbnail(ed);
            if (!bytes || seq !== generation) continue;
            const u = URL.createObjectURL(new Blob([bytes], {type:"image/png"}));
            urls.push(u);
            const img = el("img", "studio-recent-image");
            img.alt = "";
            img.src = u;
            preview.replaceChildren(img);
        } catch (err) { console.warn("Studio thumbnail", err); }
    }
}
export function showStudioHome() {
    if (!page || !document.body.classList.contains("studio-simple")) return;
    page.hidden = false;
    document.body.classList.add("studio-home-open");
    status.textContent = "";
    renderRecents();
}
export function initStudioHome(opts) {
    ctx = opts;
    page = el("section", "studio-home");
    page.hidden = true;
    const nav = el("nav", "studio-home-nav");
    nav.append(action("＋ Crear", () => page.querySelector(".studio-format-grid").scrollIntoView({block:"start"}), "studio-home-create"),
        action("⌂ Inicio", () => page.scrollTo(0,0)), action("▧ Proyectos", () => recent.scrollIntoView({block:"start"})),
        action("Volver al editor", () => hideStudioHome()));
    const main = el("div", "studio-home-content");
    const hero = el("div", "studio-home-hero");
    hero.append(el("h1", "", "¿Qué vamos a diseñar hoy?"), el("p", "", "Crea un diseño a medida o continúa tus proyectos locales."));
    search = el("input", "studio-home-search");
    search.type = "search"; search.placeholder = "Buscar en tus diseños"; search.setAttribute("aria-label", "Buscar diseños");
    search.addEventListener("input", renderRecents);
    hero.appendChild(search);
    const grid = el("div", "studio-format-grid");
    for (const [name,w,h,color,mark] of formats) {
        const b = action("", () => create(name,w,h), "studio-format-card");
        const icon = el("span", "studio-format-icon", mark);
        icon.style.background = color;
        b.append(icon, el("strong","",name),el("span","studio-format-dim",w+" × "+h+" px"));
        grid.appendChild(b);
    }
    const custom = el("form","studio-home-custom");
    const width = el("input"), height = el("input");
    for (const [n,label,value] of [[width,"Ancho",1920],[height,"Alto",1080]]) {
        n.type="number"; n.min="16"; n.max="16384"; n.required=true; n.value=String(value); n.setAttribute("aria-label",label);
        const wrap=el("label","",label+" (px)"); wrap.appendChild(n); custom.appendChild(wrap);
    }
    const createBtn=el("button","studio-home-action studio-home-create","Crear tamaño personalizado"); createBtn.type="submit";
    custom.appendChild(createBtn);
    custom.addEventListener("submit",(e)=>{e.preventDefault();create("Diseño personalizado",Number(width.value),Number(height.value)).catch((err)=>{status.textContent=String(err.message||err);});});
    status=el("p","studio-home-status"); status.setAttribute("role","status");
    recent=el("div","studio-recent-grid");
    main.append(hero,grid,custom,status,el("h2","","Seguir diseñando"),recent);
    page.append(nav,main);
    document.getElementById("shell-main").appendChild(page);
}
