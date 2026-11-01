/* Petit CMS local, servi par le serveur de développement Vite (npm run cms).

   Interface : /cms/
   API      : /__cms/…  (lecture/écriture de projects.json, envoi d'images dans data/,
                         optimisation des images, publication sur GitHub)

   Rien de tout cela n'existe dans le site construit : le plugin ne s'applique qu'en `vite dev`. */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CONTENT_FILE = "public/content/projects.json";
const MANIFEST_FILE = "public/content/images.json";
const PUBLISHED_PATHS = ["data", "public/content", "public/images"];
const STATIC_FILES = {
  "/cms/": ["index.html", "text/html"],
  "/cms/index.html": ["index.html", "text/html"],
  "/cms/cms.js": ["cms.js", "text/javascript"],
  "/cms/cms.css": ["cms.css", "text/css"]
};
const MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

const nfc = (value) => value.normalize("NFC");

// Un nom de fichier ou de dossier simple, sans chemin.
function safeName(value) {
  const name = nfc(String(value ?? "")).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim();
  if (!name || name === "." || name === "..") throw new Error(`Nom invalide : ${value}`);
  return name;
}

// Retrouve un fichier quelle que soit la normalisation Unicode (macOS écrit en NFD).
function findEntry(directory, name) {
  if (!fs.existsSync(directory)) return null;
  const target = nfc(name);
  const entry = fs.readdirSync(directory).find((candidate) => nfc(candidate) === target);
  return entry ? path.join(directory, entry) : null;
}

function run(command, args, cwd, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env } });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", (error) => resolve({ code: -1, output: output + error.message }));
    child.on("close", (code) => resolve({ code, output: output.trim() }));
  });
}

const git = (root, ...args) => run("git", ["-c", "core.quotepath=false", ...args], root);

function optimize(root) {
  const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  return run(python, ["scripts/optimize_images.py"], root, { PYTHONIOENCODING: "utf-8" });
}

async function status(root) {
  const [branch, changes, ahead] = await Promise.all([
    git(root, "rev-parse", "--abbrev-ref", "HEAD"),
    git(root, "status", "--porcelain", "--", ...PUBLISHED_PATHS),
    git(root, "rev-list", "--count", "@{upstream}..HEAD")
  ]);
  return {
    branch: branch.output,
    changes: changes.output ? changes.output.split("\n").map((line) => line.slice(3)) : [],
    ahead: ahead.code === 0 ? Number(ahead.output) : 0
  };
}

async function publish(root, message) {
  const log = [];
  const step = async (label, result) => {
    log.push(`$ ${label}\n${result.output}`);
    if (result.code !== 0) throw Object.assign(new Error(`Échec : ${label}`), { log });
    return result;
  };

  await step("python scripts/optimize_images.py", await optimize(root));
  await step("git add", await git(root, "add", "-A", "--", ...PUBLISHED_PATHS));
  const staged = await git(root, "diff", "--cached", "--quiet", "--", ...PUBLISHED_PATHS);
  if (staged.code === 1) {
    await step("git commit", await git(root, "commit", "-m", message, "--", ...PUBLISHED_PATHS));
  }
  const pushed = await git(root, "push");
  log.push(`$ git push\n${pushed.output}`);
  if (pushed.code !== 0) {
    // Le dépôt distant a avancé : on récupère ses commits puis on réessaie.
    await step("git pull --rebase", await git(root, "pull", "--rebase", "--autostash"));
    await step("git push", await git(root, "push"));
  }
  return log;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function validate(content) {
  if (!content || !Array.isArray(content.projects) || !content.site || !content.categories) {
    throw new Error("Contenu incomplet");
  }
  const slugs = new Set();
  for (const project of content.projects) {
    if (!project.title?.trim()) throw new Error("Un projet n’a pas de titre");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(project.slug ?? "")) throw new Error(`Identifiant invalide : « ${project.slug} »`);
    if (slugs.has(project.slug)) throw new Error(`Deux projets ont l’identifiant « ${project.slug} »`);
    slugs.add(project.slug);
  }
}

export default function cms() {
  let root;

  async function handle(req, res, next) {
    const url = new URL(req.url, "http://localhost");
    const route = decodeURIComponent(url.pathname);

    if (route === "/cms") {
      res.writeHead(302, { Location: "/cms/" });
      return res.end();
    }
    // Servi directement (sans le client Vite) : l'interface ne se recharge pas pendant une saisie.
    if (STATIC_FILES[route]) {
      const [file, type] = STATIC_FILES[route];
      res.setHeader("Content-Type", `${type}; charset=utf-8`);
      res.setHeader("Cache-Control", "no-store");
      return res.end(fs.readFileSync(path.join(root, "cms", file)));
    }
    if (!route.startsWith("/__cms/")) return next();

    const action = route.slice("/__cms/".length);
    try {
      if (req.method === "GET" && action === "content") {
        const read = (file) => (fs.existsSync(path.join(root, file)) ? JSON.parse(fs.readFileSync(path.join(root, file), "utf8")) : {});
        return send(res, 200, { content: read(CONTENT_FILE), images: read(MANIFEST_FILE) });
      }

      if (req.method === "PUT" && action === "content") {
        const content = JSON.parse(await readBody(req));
        validate(content);
        fs.writeFileSync(path.join(root, CONTENT_FILE), `${JSON.stringify(content, null, 2)}\n`, "utf8");
        return send(res, 200, { ok: true });
      }

      // Original d'une image (aperçu avant optimisation).
      if (req.method === "GET" && action.startsWith("data/")) {
        const [folder, name] = action.slice(5).split("/");
        const directory = findEntry(path.join(root, "data"), safeName(folder));
        const file = directory && findEntry(directory, safeName(name));
        if (!file) return send(res, 404, { error: "Introuvable" });
        res.setHeader("Content-Type", MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream");
        return fs.createReadStream(file).pipe(res);
      }

      // Envoi d'un original dans data/<dossier>/ ; renvoie le nom retenu (sans écraser l'existant).
      if (req.method === "POST" && action === "upload") {
        const folder = safeName(url.searchParams.get("folder"));
        const directory = findEntry(path.join(root, "data"), folder) ?? path.join(root, "data", folder);
        fs.mkdirSync(directory, { recursive: true });
        const original = safeName(url.searchParams.get("name"));
        const { name: stem, ext } = path.parse(original);
        let name = original;
        for (let n = 2; findEntry(directory, name); n++) name = `${stem}-${n}${ext}`;
        await new Promise((resolve, reject) => {
          const out = fs.createWriteStream(path.join(directory, name));
          req.pipe(out);
          out.on("finish", resolve);
          out.on("error", reject);
          req.on("error", reject);
        });
        return send(res, 200, { name });
      }

      if (req.method === "POST" && action === "optimize") {
        const result = await optimize(root);
        const images = JSON.parse(fs.readFileSync(path.join(root, MANIFEST_FILE), "utf8"));
        return send(res, result.code === 0 ? 200 : 500, { ok: result.code === 0, output: result.output, images });
      }

      if (req.method === "GET" && action === "status") {
        return send(res, 200, await status(root));
      }

      if (req.method === "POST" && action === "publish") {
        const { message } = JSON.parse(await readBody(req));
        try {
          const log = await publish(root, message?.trim() || "Mise à jour du contenu");
          return send(res, 200, { ok: true, log: log.join("\n\n"), status: await status(root) });
        } catch (error) {
          return send(res, 500, { ok: false, error: error.message, log: (error.log ?? []).join("\n\n") });
        }
      }

      return send(res, 404, { error: "Action inconnue" });
    } catch (error) {
      return send(res, 400, { error: error.message });
    }
  }

  return {
    name: "portfolio-cms",
    apply: "serve",
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        handle(req, res, next).catch((error) => send(res, 500, { error: error.message }));
      });
    }
  };
}
