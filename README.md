# Atelier — Backlog & Sprints

Application web statique de gestion de backlog/sprints multi-clients pour consultant Salesforce. Pas de backend, données dans un GitHub Gist privé, hébergement gratuit sur GitHub Pages.

## Workflow VS Code

```
[VS Code local] ──→ commit/push (UI) ──→ [GitHub repo]
                                              │
                                              ↓ auto-deploy
                                         [GitHub Pages]
                                              │
                                              ↓
                              [Tes machines via URL https]
                                              │
                                              ↓ sync API
                                       [Gist privé = données]
```

## Setup initial (à faire une fois, ~15 min)

### 1. Mettre le projet sous git dans VS Code

1. Ouvre le dossier `atelier-project/` dans VS Code (**File → Open Folder**)
2. Onglet **Source Control** dans la barre latérale gauche (icône branche)
3. Clique sur **Initialize Repository**
4. Tous les fichiers apparaissent en "Changes" → bouton **+** à côté de "Changes" pour les stager tous
5. Tape un message de commit : `Initial commit` → bouton **Commit**

### 2. Publier sur GitHub depuis VS Code

1. Dans le panneau Source Control, après le commit, bouton **Publish Branch**
2. VS Code te demande si tu veux publier en repo **public ou privé** → choisis **privé** (le code peut rester privé, GitHub Pages fonctionne quand même sur les repos privés avec un compte gratuit)
3. Le repo est créé automatiquement sur ton compte GitHub

### 3. Activer GitHub Pages

1. Va sur ton repo dans le navigateur : `github.com/<toi>/atelier-project`
2. **Settings → Pages** (menu latéral)
3. **Source** : `Deploy from a branch`
4. **Branch** : `main` / `(root)` → **Save**
5. Attends 1-2 min, l'URL apparaît en haut de la page : `https://<toi>.github.io/atelier-project/`

### 4. Créer le Gist privé pour stocker tes données

1. Va sur [gist.github.com](https://gist.github.com)
2. **Filename** : `atelier-data.json`
3. **Content** : `{}`
4. Clique sur **Create secret gist** (bouton de droite, **PAS** "public")
5. Copie l'ID du Gist depuis l'URL :
   `https://gist.github.com/<toi>/`**`a1b2c3d4e5f6...`**

### 5. Créer un Personal Access Token (PAT)

1. [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta)
2. **Generate new token**
3. **Token name** : `atelier-sync`
4. **Expiration** : 1 an
5. **Repository access** : `Public Repositories (read-only)` (le Gist est indépendant)
6. **Permissions → Account permissions → Gists** : `Read and write`
7. **Generate token** → **copie-le immédiatement** (visible une seule fois)

### 6. Connecter l'app

1. Ouvre `https://<toi>.github.io/atelier-project/`
2. Clique sur **"Local"** en haut à droite (à côté de la recherche)
3. Colle ton **PAT** et l'**ID du Gist** → **Connecter**
4. L'indicateur passe à **"GitHub" en vert** ✓

Sur les autres machines : mêmes credentials → tes données apparaissent.

## Développement local

### Preview avec Live Server

1. Installe l'extension **Live Server** (Ritwick Dey) — recommandée automatiquement à l'ouverture du projet
2. Clique-droit sur `index.html` → **Open with Live Server**
3. L'app s'ouvre sur `http://localhost:5500/` et se recharge automatiquement à chaque modification du fichier

### Modifier l'app

L'app est un seul fichier `index.html` qui contient :
- Le HTML (≈ lignes 1-1280)
- Le CSS dans `<style>` (≈ lignes 8-1080)
- Le JS dans `<script>` (≈ lignes 1280 à la fin)

Sections CSS principales (chercher `=== NOM ===` en commentaire) :
- LAYOUT, TOPBAR, SIDEBAR, MAIN
- BUTTONS, FILTERS BAR
- BOARD VIEW, BACKLOG VIEW
- MODAL, SETTINGS MODAL
- SYNC INDICATOR

Sections JS principales :
- `STATE` — variables d'état globales
- `SYNC LAYER` — sauvegarde IndexedDB + push Gist
- `SETTINGS MODAL` — config sync GitHub
- `RENDER` — fonctions de rendu de chaque vue
- `ACTIONS` — handlers d'événements
- `DRAG & DROP` — kanban interactions

### Workflow de modification

1. Modifie `index.html` dans VS Code
2. Live Server recharge automatiquement → tu vois le résultat
3. Tu testes en local (les données locales restent en IndexedDB du browser)
4. Quand c'est OK, dans Source Control :
   - Stage les changements (bouton **+**)
   - Tape un message de commit
   - **Commit** puis **Sync Changes** (push)
5. GitHub Pages se met à jour en 1-2 min, accessible sur l'URL publique

## Données et sauvegardes

- **Source de vérité** : ton Gist privé GitHub
- **Cache local** : IndexedDB de chaque navigateur (l'app marche offline)
- **Sync** : à chaque modification, sauvegarde IndexedDB instantanée + push Gist en debounce 2,5s
- **Conflits** : last-write-wins (timestamp `lastSavedAt`). Ne saisis pas en parallèle sur deux machines.
- **Export JSON** : bouton dans la topbar — fais-en de temps en temps comme filet de sécurité supplémentaire.

## Sécurité du PAT

- Stocké dans `localStorage` du navigateur. Configure-le seulement sur tes machines de confiance.
- Si tu perds une machine : révoque le token sur [github.com/settings/tokens](https://github.com/settings/tokens). Les autres machines gardent leur copie.
- L'app n'appelle que `api.github.com`. Aucune donnée ne quitte ton navigateur ailleurs.

## Architecture du projet

```
atelier-project/
├── .vscode/
│   ├── extensions.json    # Recommande Live Server à l'ouverture
│   └── settings.json      # Config Live Server (port 5500)
├── .gitignore             # Exclut .DS_Store, fichiers temp, etc.
├── index.html             # L'app complète (HTML + CSS + JS)
└── README.md              # Ce fichier
```

## Limites assumées

- Single-user (pas de multi-utilisateur, pas de partage)
- Last-write-wins en cas de modification simultanée sur deux machines
- PAT à reconfigurer sur chaque navigateur (par sécurité)
- Limite API GitHub : 5000 requêtes/heure par PAT — largement au-dessus de tout usage perso réaliste

## Mises à jour de l'app

Quand tu reçois une nouvelle version de `index.html` :
1. Remplace le fichier dans VS Code
2. Source Control → Commit → Sync Changes
3. GitHub Pages redéploie automatiquement
4. Recharge la page sur tes machines — tes données dans le Gist restent intactes
