#!/usr/bin/env node
// scripts/ticket-cli.mjs — CLI pour créer/animer les tickets du Gist Atelier
// depuis Claude Code (ou n'importe quel shell).
//
// Secrets hors source (repo public) : token GitHub PAT et Gist ID sont lus
// depuis des variables d'env Windows User/Machine via scripts/tcli.ps1.
// Voir scripts/README.md pour les noms attendus et la création des vars.
//
// Push-guard : avant chaque PATCH, re-GET du Gist pour vérifier que personne
// (toi sur l'app web ouverte en parallèle, autre instance) n'a écrit entre
// le GET initial et notre PATCH. Si conflit, abort sans écraser.
//
// Factory `buildItem()` inlinée ici car le package.json est "type":"commonjs"
// et l'app sert js/items.js via <script type="module"> HTML — pas compatible
// avec `import` Node. Source de vérité : js/items.js. Garder en sync à chaque
// évolution du schéma item (champ ajouté/retiré).

// ─────────────────────────────────────────────────────────────────────
// Constantes (en sync avec index.html shell)
// ─────────────────────────────────────────────────────────────────────

const GIST_FILENAME = 'atelier-data.json';
// Variables d'env attendues, lues dans cet ordre (premier trouvé gagne).
// Le Gist ID et le token NE SONT PAS dans le code : repo public, secrets
// hors source. Le wrapper scripts/tcli.ps1 les lit du registre Windows
// (vars User/Machine "Atelier Gist ID" et "GitHub Gist Token") et les
// injecte en scope Process avant de spawn Node.
const GIST_ID_ENV_VARS = ['ATELIER_GIST_ID', 'Atelier Gist ID'];
const TOKEN_ENV_VARS = ['ATELIER_GIST_TOKEN', 'GIST_TOKEN', 'GitHub Gist Token'];

const TYPE_VALUES = new Set(['story', 'task', 'bug']);
const STATUS_VALUES = new Set(['todo', 'doing', 'done']);
const PRIORITY_VALUES = new Set([1, 2, 3]);
const TRACKED_FIELDS = new Set([
  'title', 'type', 'status', 'priority', 'estimate', 'actualHours',
  'dueDate', 'sprintId', 'epicId'
]);
const MAX_ACTIVITY_TEXT_LEN = 2000;

// ─────────────────────────────────────────────────────────────────────
// Factory item (port de js/items.js — garder en sync)
// ─────────────────────────────────────────────────────────────────────

function itemDefaults() {
  return {
    type: 'task',
    priority: 2,
    status: 'todo',
    estimate: 0,
    actualHours: 0,
    dueDate: null,
    sprintId: null,
    epicId: null,
    description: '',
    activity: []
  };
}

function buildItem(partial = {}) {
  const d = itemDefaults();
  const now = Date.now();
  return {
    id: partial.id !== undefined ? partial.id : 'i' + now,
    num: partial.num !== undefined ? partial.num : 1,
    title: partial.title !== undefined ? partial.title : '',
    type: partial.type !== undefined ? partial.type : d.type,
    priority: partial.priority !== undefined ? partial.priority : d.priority,
    status: partial.status !== undefined ? partial.status : d.status,
    estimate: partial.estimate !== undefined ? partial.estimate : d.estimate,
    actualHours: partial.actualHours !== undefined ? partial.actualHours : d.actualHours,
    dueDate: partial.dueDate !== undefined ? partial.dueDate : d.dueDate,
    sprintId: partial.sprintId !== undefined ? partial.sprintId : d.sprintId,
    epicId: partial.epicId !== undefined ? partial.epicId : d.epicId,
    createdAt: partial.createdAt !== undefined ? partial.createdAt : now,
    description: partial.description !== undefined ? partial.description : d.description,
    activity: Array.isArray(partial.activity) ? partial.activity : d.activity.slice()
  };
}

// ─────────────────────────────────────────────────────────────────────
// Helpers Gist (GET / PATCH + push-guard)
// ─────────────────────────────────────────────────────────────────────

function readEnvFirst(names, what) {
  for (const name of names) {
    const v = process.env[name];
    if (v) return v;
  }
  console.error(
    `[FATAL] ${what} introuvable. Variables d'env cherchées : ${names.map(n => `"${n}"`).join(', ')}.\n` +
    `Lancer via le wrapper PowerShell : scripts/tcli.ps1 (lit les vars Windows et les injecte en Process).`
  );
  process.exit(2);
}

function getToken() {
  return readEnvFirst(TOKEN_ENV_VARS, 'Token GitHub');
}

function getGistId() {
  return readEnvFirst(GIST_ID_ENV_VARS, 'Gist ID');
}

async function fetchGistRaw() {
  const r = await fetch(`https://api.github.com/gists/${getGistId()}`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  if (!r.ok) {
    throw new Error(`GET Gist HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  const data = await r.json();
  const content = data.files?.[GIST_FILENAME]?.content;
  if (!content) throw new Error(`Fichier "${GIST_FILENAME}" absent du Gist`);
  return { payload: JSON.parse(content) };
}

async function pushGist(payload, baselineRemoteTs) {
  // Push-guard : re-GET et compare lastSavedAt. Si remote a bougé depuis le
  // GET initial → conflit → abort. L'utilisateur retentera après resync.
  const { payload: current } = await fetchGistRaw();
  const currentTs = typeof current.lastSavedAt === 'number' ? current.lastSavedAt : 0;
  if (currentTs > baselineRemoteTs) {
    throw new Error(
      `Conflit sync : Gist modifié depuis le GET initial (baseline ${baselineRemoteTs}, courant ${currentTs}). ` +
      `Ferme ton app Atelier (ou attends qu'elle finisse de pull/push) puis relance.`
    );
  }

  payload.lastSavedAt = Date.now();
  const r = await fetch(`https://api.github.com/gists/${getGistId()}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({
      files: { [GIST_FILENAME]: { content: JSON.stringify(payload, null, 2) } }
    })
  });
  if (!r.ok) {
    throw new Error(`PATCH Gist HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────
// Resolvers (client / item / sprint / epic)
// ─────────────────────────────────────────────────────────────────────

function findClient(payload, keyOrName) {
  if (!keyOrName) throw new Error('--client requis (key ou name)');
  const k = String(keyOrName).toLowerCase();
  const c = payload.clients.find(
    c => c.key.toLowerCase() === k || c.name.toLowerCase() === k || c.id === keyOrName
  );
  if (!c) {
    throw new Error(
      `Client introuvable "${keyOrName}". Disponibles : ${payload.clients.map(c => c.key).join(', ')}`
    );
  }
  return c;
}

function findItem(client, idOrShortRef) {
  if (!idOrShortRef) throw new Error('--id requis (i... ou KEY-NUM)');
  const ref = String(idOrShortRef).toLowerCase();
  // Match par id direct
  let it = client.items.find(it => it.id === idOrShortRef);
  if (it) return it;
  // Match par KEY-NUM (ex VVO-42)
  const m = ref.match(/^([a-z]+)-(\d+)$/);
  if (m && m[1] === client.key.toLowerCase()) {
    const num = parseInt(m[2], 10);
    it = client.items.find(it => it.num === num);
    if (it) return it;
  }
  // Match par num seul si numérique
  if (/^\d+$/.test(ref)) {
    const num = parseInt(ref, 10);
    it = client.items.find(it => it.num === num);
    if (it) return it;
  }
  throw new Error(`Item introuvable "${idOrShortRef}" sur ${client.key}`);
}

function resolveSprint(client, value) {
  if (value === null || value === 'null') return null;
  if (value === undefined) return undefined;
  const v = String(value).toLowerCase();
  const s = client.sprints?.find(s => s.id === value || s.name.toLowerCase() === v);
  if (!s) throw new Error(`Sprint introuvable "${value}" sur ${client.key}`);
  return s.id;
}

function resolveEpic(client, value) {
  if (value === null || value === 'null') return null;
  if (value === undefined) return undefined;
  const v = String(value).toLowerCase();
  const e = client.epics?.find(e => e.id === value || e.name.toLowerCase() === v);
  if (!e) throw new Error(`Epic introuvable "${value}" sur ${client.key}`);
  return e.id;
}

function genId(prefix) {
  return prefix + Date.now() + Math.random().toString(36).slice(2, 10);
}

function recordChange(item, field, before, after) {
  if (!TRACKED_FIELDS.has(field)) return;
  if (before === after) return;
  if (!Array.isArray(item.activity)) item.activity = [];
  item.activity.push({
    id: genId('a'),
    type: 'change',
    at: Date.now(),
    field,
    before: before === undefined ? null : before,
    after: after === undefined ? null : after
  });
}

// ─────────────────────────────────────────────────────────────────────
// Mini arg parser (sans dep externe)
// ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out[k] = true;
      } else {
        out[k] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function shortRef(client, item) {
  return `${client.key}-${item.num}`;
}

// ─────────────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────────────

async function cmdList(args) {
  const { payload } = await fetchGistRaw();
  const client = findClient(payload, args.client);
  let items = client.items.slice();
  if (args.status) items = items.filter(it => it.status === args.status);
  if (args.type) items = items.filter(it => it.type === args.type);
  if (args.epic) {
    const eid = resolveEpic(client, args.epic);
    items = items.filter(it => it.epicId === eid);
  }
  if (args.sprint) {
    const sid = resolveSprint(client, args.sprint);
    items = items.filter(it => it.sprintId === sid);
  }
  if (!args.all) items = items.filter(it => it.status !== 'done');
  items.sort((a, b) => (a.priority - b.priority) || (a.num - b.num));

  console.log(`${items.length} item(s) sur ${client.key} ${client.name}${args.all ? '' : ' (hors done)'}`);
  for (const it of items) {
    const epicName = it.epicId ? (client.epics?.find(e => e.id === it.epicId)?.name ?? '?') : '-';
    const sprintName = it.sprintId ? (client.sprints?.find(s => s.id === it.sprintId)?.name ?? '?') : '-';
    const due = it.dueDate ? ` due ${it.dueDate}` : '';
    console.log(`  ${shortRef(client, it).padEnd(8)} [${it.status.padEnd(5)}] P${it.priority} ${it.type.padEnd(5)} | ${epicName} / ${sprintName}${due} | ${it.title}`);
  }
}

async function cmdShow(args) {
  const { payload } = await fetchGistRaw();
  const client = findClient(payload, args.client);
  const item = findItem(client, args.id);
  console.log(JSON.stringify(item, null, 2));
}

async function cmdCreate(args) {
  const { payload } = await fetchGistRaw();
  const baselineTs = payload.lastSavedAt ?? 0;
  const client = findClient(payload, args.client);
  if (!args.title) throw new Error('--title requis');

  const sprintId = args.sprint !== undefined ? resolveSprint(client, args.sprint) : null;
  const epicId = args.epic !== undefined ? resolveEpic(client, args.epic) : null;

  client.counter = (client.counter ?? 0) + 1;
  const priority = args.priority ? parseInt(args.priority, 10) : 2;
  const type = args.type ?? 'task';
  const status = args.status ?? 'todo';

  if (!TYPE_VALUES.has(type)) throw new Error(`type invalide "${type}" (attendu ${[...TYPE_VALUES].join('|')})`);
  if (!STATUS_VALUES.has(status)) throw new Error(`status invalide "${status}"`);
  if (!PRIORITY_VALUES.has(priority)) throw new Error(`priority invalide ${priority} (attendu 1|2|3)`);

  const item = buildItem({
    id: genId('i'),
    num: client.counter,
    title: args.title,
    type,
    priority,
    status,
    estimate: args.estimate ? parseFloat(args.estimate) : 0,
    dueDate: args.due ?? null,
    sprintId,
    epicId,
    description: args.desc ?? ''
  });
  if (status === 'done') item.completedAt = Date.now();

  client.items.push(item);
  await pushGist(payload, baselineTs);
  console.log(`✓ Créé ${shortRef(client, item)} — ${item.title} (id ${item.id})`);
}

async function cmdUpdate(args) {
  const { payload } = await fetchGistRaw();
  const baselineTs = payload.lastSavedAt ?? 0;
  const client = findClient(payload, args.client);
  const item = findItem(client, args.id);

  const changes = [];

  if (args.title !== undefined) {
    recordChange(item, 'title', item.title, args.title);
    item.title = args.title;
    changes.push('title');
  }
  if (args.type !== undefined) {
    if (!TYPE_VALUES.has(args.type)) throw new Error(`type invalide "${args.type}"`);
    recordChange(item, 'type', item.type, args.type);
    item.type = args.type;
    changes.push('type');
  }
  if (args.priority !== undefined) {
    const p = parseInt(args.priority, 10);
    if (!PRIORITY_VALUES.has(p)) throw new Error('priority invalide (1|2|3)');
    recordChange(item, 'priority', item.priority, p);
    item.priority = p;
    changes.push('priority');
  }
  if (args.status !== undefined) {
    if (!STATUS_VALUES.has(args.status)) throw new Error(`status invalide "${args.status}"`);
    recordChange(item, 'status', item.status, args.status);
    if (args.status === 'done' && item.status !== 'done') item.completedAt = Date.now();
    item.status = args.status;
    changes.push('status');
  }
  if (args.estimate !== undefined) {
    const v = parseFloat(args.estimate);
    recordChange(item, 'estimate', item.estimate, v);
    item.estimate = v;
    changes.push('estimate');
  }
  if (args.actualHours !== undefined) {
    const v = parseFloat(args.actualHours);
    recordChange(item, 'actualHours', item.actualHours, v);
    item.actualHours = v;
    changes.push('actualHours');
  }
  if (args.due !== undefined) {
    const v = args.due === 'null' ? null : args.due;
    recordChange(item, 'dueDate', item.dueDate, v);
    item.dueDate = v;
    changes.push('dueDate');
  }
  if (args.sprint !== undefined) {
    const sid = resolveSprint(client, args.sprint);
    recordChange(item, 'sprintId', item.sprintId, sid);
    item.sprintId = sid;
    changes.push('sprintId');
  }
  if (args.epic !== undefined) {
    const eid = resolveEpic(client, args.epic);
    recordChange(item, 'epicId', item.epicId, eid);
    item.epicId = eid;
    changes.push('epicId');
  }
  if (args.desc !== undefined) {
    item.description = args.desc;
    changes.push('description');
  }

  if (!changes.length) {
    console.log('Aucune modification fournie. (utilise --help pour la liste des champs)');
    return;
  }
  await pushGist(payload, baselineTs);
  console.log(`✓ Update ${shortRef(client, item)} — ${changes.join(', ')}`);
}

async function cmdComment(args) {
  const { payload } = await fetchGistRaw();
  const baselineTs = payload.lastSavedAt ?? 0;
  const client = findClient(payload, args.client);
  const item = findItem(client, args.id);

  if (!args.text) throw new Error('--text requis');
  const text = String(args.text).trim();
  if (!text) throw new Error('--text vide après trim');
  if (text.length > MAX_ACTIVITY_TEXT_LEN) {
    throw new Error(`Commentaire trop long (${text.length} > max ${MAX_ACTIVITY_TEXT_LEN})`);
  }

  if (!Array.isArray(item.activity)) item.activity = [];
  item.activity.push({
    id: genId('a'),
    type: 'comment',
    at: Date.now(),
    text
  });

  await pushGist(payload, baselineTs);
  console.log(`✓ Commentaire ajouté sur ${shortRef(client, item)}`);
}

async function cmdDelete(args) {
  if (!args.confirm) {
    throw new Error('Suppression nécessite --confirm pour éviter accident');
  }
  const { payload } = await fetchGistRaw();
  const baselineTs = payload.lastSavedAt ?? 0;
  const client = findClient(payload, args.client);
  const item = findItem(client, args.id);
  const idx = client.items.indexOf(item);
  client.items.splice(idx, 1);
  await pushGist(payload, baselineTs);
  console.log(`✓ Supprimé ${shortRef(client, item)} (id ${item.id})`);
}

async function cmdSprintList(args) {
  const { payload } = await fetchGistRaw();
  const client = findClient(payload, args.client);
  const sprints = client.sprints ?? [];
  console.log(`${sprints.length} sprint(s) sur ${client.key}:`);
  for (const s of sprints) {
    const flag = s.active ? '●' : s.completed ? '✓' : '○';
    console.log(`  ${flag} ${s.id}  ${s.name.padEnd(20)} (${s.startDate} → ${s.endDate})`);
  }
}

async function cmdSprintCreate(args) {
  const { payload } = await fetchGistRaw();
  const baselineTs = payload.lastSavedAt ?? 0;
  const client = findClient(payload, args.client);
  if (!args.name || !args.start || !args.end) {
    throw new Error('--name --start YYYY-MM-DD --end YYYY-MM-DD requis');
  }
  const sprint = {
    id: genId('s'),
    name: args.name,
    startDate: args.start,
    endDate: args.end,
    active: args.active === true || args.active === 'true',
    completed: false,
    color: args.color ?? null
  };
  if (!client.sprints) client.sprints = [];
  client.sprints.push(sprint);
  await pushGist(payload, baselineTs);
  console.log(`✓ Sprint créé : ${sprint.id} ${sprint.name} (${sprint.startDate} → ${sprint.endDate})`);
}

async function cmdEpicList(args) {
  const { payload } = await fetchGistRaw();
  const client = findClient(payload, args.client);
  const epics = client.epics ?? [];
  console.log(`${epics.length} epic(s) sur ${client.key}:`);
  for (const e of epics) {
    console.log(`  ${e.id}  ${e.name.padEnd(20)} ${e.color ?? '-'}`);
  }
}

async function cmdEpicCreate(args) {
  const { payload } = await fetchGistRaw();
  const baselineTs = payload.lastSavedAt ?? 0;
  const client = findClient(payload, args.client);
  if (!args.name) throw new Error('--name requis');
  const epic = {
    id: genId('e'),
    name: args.name,
    color: args.color ?? null
  };
  if (!client.epics) client.epics = [];
  client.epics.push(epic);
  await pushGist(payload, baselineTs);
  console.log(`✓ Epic créé : ${epic.id} ${epic.name}`);
}

async function cmdClients() {
  const { payload } = await fetchGistRaw();
  console.log(`${payload.clients.length} client(s):`);
  for (const c of payload.clients) {
    console.log(`  ${c.key.padEnd(5)} ${c.name.padEnd(35)} ${c.items.length} items / ${c.sprints?.length ?? 0} sprints / ${c.epics?.length ?? 0} epics`);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────

const HELP = `
Atelier CLI — manipulation tickets via Gist (Token env "GitHub Gist Token")

Usage : node scripts/ticket-cli.mjs <command> [opts]

Commands :
  clients                                Liste les clients du Gist
  list      --client <key|name>          Liste les items (hors done par défaut)
            [--status todo|doing|done] [--type story|task|bug]
            [--epic <id|name>] [--sprint <id|name>] [--all]
  show      --client <key> --id <id|KEY-NUM>
  create    --client <key> --title "..."
            [--type task|story|bug] [--priority 1|2|3] [--status todo|doing|done]
            [--estimate <h>] [--due YYYY-MM-DD] [--sprint <id|name>] [--epic <id|name>]
            [--desc "..."]
  update    --client <key> --id <id|KEY-NUM> [n'importe quel champ create]
            Spécial pour clear : --due null  --sprint null  --epic null
  move      Alias d'update (--sprint et/ou --epic)
  comment   --client <key> --id <id|KEY-NUM> --text "..."
  delete    --client <key> --id <id|KEY-NUM> --confirm

  sprint list   --client <key>
  sprint create --client <key> --name "..." --start YYYY-MM-DD --end YYYY-MM-DD
                [--color #...] [--active true]
  epic list     --client <key>
  epic create   --client <key> --name "..." [--color #...]

Identifiants item acceptés : id complet (i1716...) OU KEY-NUM (VVO-42) OU NUM seul (42).
Push-guard actif : abort si l'app Atelier modifie le Gist en parallèle.
`;

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help') {
    console.log(HELP);
    return;
  }
  const cmd = argv[0];
  const sub = argv[1];
  const isCompound = (cmd === 'sprint' || cmd === 'epic');
  const args = parseArgs(argv.slice(isCompound ? 2 : 1));

  try {
    if (cmd === 'clients') return await cmdClients();
    if (cmd === 'list') return await cmdList(args);
    if (cmd === 'show') return await cmdShow(args);
    if (cmd === 'create') return await cmdCreate(args);
    if (cmd === 'update') return await cmdUpdate(args);
    if (cmd === 'move') return await cmdUpdate(args);
    if (cmd === 'comment') return await cmdComment(args);
    if (cmd === 'delete') return await cmdDelete(args);
    if (cmd === 'sprint' && sub === 'list') return await cmdSprintList(args);
    if (cmd === 'sprint' && sub === 'create') return await cmdSprintCreate(args);
    if (cmd === 'epic' && sub === 'list') return await cmdEpicList(args);
    if (cmd === 'epic' && sub === 'create') return await cmdEpicCreate(args);
    console.error(`Commande inconnue : ${cmd}${sub ? ' ' + sub : ''}`);
    console.log(HELP);
    process.exit(1);
  } catch (e) {
    console.error('[ERREUR]', e.message);
    process.exit(1);
  }
}

main();
