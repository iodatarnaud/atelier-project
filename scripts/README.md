# scripts/ — CLI dev tools

Outils CLI hors application (l'app web reste mono-fichier `index.html`). Ces scripts ne sont **pas** chargés par l'app, ils servent à manipuler le Gist depuis un shell (Claude Code, terminal, automation).

## `ticket-cli.mjs` — manipulation tickets via Gist

### Prérequis

- Node.js ≥ 18 (fetch natif).
- Deux variables d'env Windows à créer une fois via *Settings → System → Advanced → Environment Variables* (scope User **ou** Machine, peu importe — le wrapper teste les deux) :
  - **`GitHub Gist Token`** : un PAT GitHub avec scope `gist`.
  - **`Atelier Gist ID`** : l'id du Gist privé contenant `atelier-data.json`.

Aucun secret n'est versionné dans le repo — c'est un repo public, les secrets restent dans le registre Windows.

### Lancement (wrapper PowerShell)

```powershell
.\scripts\tcli.ps1 <command> [opts]
```

Le wrapper relit les vars d'env du registre Windows à chaque appel et les injecte en `ATELIER_GIST_TOKEN` / `ATELIER_GIST_ID` (Process scope) avant d'appeler Node — utile parce que les shells ouverts avant la création des vars n'en héritent pas.

### Commandes

```
clients                                Liste les clients du Gist
list      --client <key|name>          Items du client (hors done par défaut)
          [--status todo|doing|done] [--type story|task|bug]
          [--epic <id|name>] [--sprint <id|name>] [--all]
show      --client <key> --id <id|KEY-NUM>
create    --client <key> --title "..."
          [--type task|story|bug] [--priority 1|2|3] [--status todo|doing|done]
          [--estimate <h>] [--due YYYY-MM-DD]
          [--sprint <id|name>] [--epic <id|name>] [--desc "..."]
update    --client <key> --id <id|KEY-NUM> [n'importe quel champ create]
          Clear : --due null  --sprint null  --epic null
move      Alias d'update pour --sprint et/ou --epic
comment   --client <key> --id <id|KEY-NUM> --text "..."
delete    --client <key> --id <id|KEY-NUM> --confirm

sprint list   --client <key>
sprint create --client <key> --name "..." --start YYYY-MM-DD --end YYYY-MM-DD
              [--color #...] [--active true]
epic list     --client <key>
epic create   --client <key> --name "..." [--color #...]
```

### Identifiants item

Trois formes acceptées : id complet (`i1716...`), `KEY-NUM` (`VVO-42`), `NUM` seul (`42`).

### Push-guard

Avant chaque PATCH Gist, un GET de vérification compare `lastSavedAt` au baseline du GET initial. Si quelqu'un (toi sur l'app web ouverte en parallèle, autre instance) a écrit entre les deux, le CLI **abort sans écraser** et te demande de fermer l'app ou de relancer.

### Sync avec la factory `js/items.js`

`buildItem()` est inlinée dans le CLI car le `package.json` est `"type": "commonjs"` et `js/items.js` est servi par l'app via `<script type="module">` HTML — pas compatible avec un `import` Node direct. Garder en sync à chaque évolution du schéma item (champ ajouté/retiré).
