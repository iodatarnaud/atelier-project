# Manuel utilisateur — Atelier

Atelier est une application web mono-utilisateur pour gérer un backlog et des sprints, conçue pour un consultant qui suit plusieurs clients en parallèle. Ce manuel décrit comment utiliser l'app au quotidien.

## Sommaire

1. [Premier lancement](#premier-lancement)
2. [Concepts](#concepts)
3. [Vues](#vues)
4. [Créer et gérer des items](#créer-et-gérer-des-items)
5. [Activité du WI (commentaires + historique)](#activité-du-wi-commentaires--historique)
6. [Sprints](#sprints)
7. [Epics](#epics)
8. [Filtres et recherche](#filtres-et-recherche)
9. [Glisser-déposer](#glisser-déposer)
10. [Vue Calendrier](#vue-calendrier)
10. [Synchronisation entre machines](#synchronisation-entre-machines)
11. [Mode test (bac à sable)](#mode-test-bac-à-sable)
12. [Sauvegarde manuelle (export / import)](#sauvegarde-manuelle-export--import)
13. [Raccourcis clavier](#raccourcis-clavier)
14. [Astuces](#astuces)

---

## Premier lancement

À la première ouverture, l'app crée automatiquement deux projets de démonstration (`Acme`, `Globex`) pour ne pas montrer une interface vide. Tu peux les supprimer dès que tu as créé tes propres projets.

L'indicateur en haut à droite affiche **`● Local`** : tes données sont stockées dans le navigateur (IndexedDB), aucune connexion réseau. Pour synchroniser entre machines, voir [Synchronisation entre machines](#synchronisation-entre-machines).

## Concepts

| Élément | Description |
|---|---|
| **Projet** (ou client) | Un workspace isolé. Toutes les autres entités (items, sprints, epics) appartiennent à un projet. Identifié par un nom et une clé de 2-5 lettres (ex: `ACM`). |
| **Item** | Unité de travail. Type (Build / TMA / Bug), priorité (P1 / P2 / P3), statut (À faire / En cours / Terminé), estimation en jours, date d'échéance optionnelle, description rich text. |
| **Sprint** | Itération avec dates de début et de fin. Lifecycle : *future* (créé) → *actif* (un seul à la fois par projet) → *terminé*. |
| **Epic** | Grand chantier transverse, avec une couleur. Permet de regrouper des items autour d'un thème (ex: "Refonte UI"). |
| **Backlog** | Liste de tous les items non terminés du projet, organisée par sprint et par epic. |
| **Archive** | Liste des items terminés (`Terminé`). |

Les items ont une clé visible de la forme `ACM-12` (clé du projet + numéro auto-incrémenté).

## Vues

Trois vues principales, accessibles dans la barre latérale :

- **Backlog** — vue de planification. Toutes les sections (sprint actif, sprints futurs, backlog général, sections par epic) avec leurs items. C'est ici qu'on déplace les items entre sprints.
- **Sprint actif** — vue d'exécution kanban (colonnes À faire / En cours / Terminé). Affiche le sprint en cours du projet actif. Permet de suivre la progression jour après jour.
- **Archive** — historique des items terminés.

Le breadcrumb en haut indique le projet actif et la vue. Le titre de la vue est cliquable pour revenir au backlog.

## Créer et gérer des items

### Créer un item

- **Inline** : cliquer **+ Créer un item** dans n'importe quelle section (backlog, sprint actif, epic). Le formulaire inline demande titre, type, priorité, estimation, date d'échéance optionnelle.
- **Quick add** : raccourci `Ctrl+C` (ou `Cmd+C` sur Mac) ouvre directement le formulaire inline du backlog.

### Modifier / archiver / supprimer un item

Cliquer sur la ligne d'un item ouvre la modale de détail. Deux onglets :

**Détails** (par défaut) :
- Titre, type, priorité, statut, estimation, date d'échéance
- **Sprint** : assigner / retirer d'un sprint
- **Epic** : assigner / retirer d'un epic
- **Description** : éditeur rich text (gras, italique, listes)
- Bouton **Supprimer** en pied de modale

**Activité** : commentaires + historique des changes du WI. Voir [Activité du WI](#activité-du-wi-commentaires--historique).

Le badge de statut (à gauche du titre dans la liste) est cliquable pour cycler `À faire → En cours → Terminé → À faire`.

### Description rich text

L'éditeur supporte gras (`Ctrl+B`), italique (`Ctrl+I`), listes à puces et numérotées via la barre d'outils. Tout est sauvegardé en HTML.

## Activité du WI (commentaires + historique)

Chaque item a un onglet **Activité** dans la modale détail (à côté de l'onglet **Détails**). Il rassemble deux choses :

### Commentaires

- Champ de saisie en haut de l'onglet : tape ton message, clique **Commenter**.
- Texte brut (les sauts de ligne sont préservés). Pas de markdown, mais les URLs `http(s)://` sont auto-cliquables (ouverture dans un nouvel onglet).
- Limite : 2000 caractères par commentaire.
- **Modifier** un commentaire posté → édition inline. Une mention `· modifié` apparaît à côté de la date.
- **Supprimer** un commentaire → confirmation puis le commentaire devient un slot grisé *"Commentaire supprimé le …"* dans la timeline. La trace reste pour ne pas créer de trous dans l'historique.

### Timeline des changes

Chaque modification d'un champ tracké de l'item génère automatiquement un event dans la timeline (chrono inverse, le plus récent en haut). Les champs trackés sont :

- Titre, type, statut, priorité, estimation, échéance, sprint, epic.

Affichage type : *"Statut : À faire → En cours"*, *"Sprint : aucun → Sprint 3"*. Toutes les actions utilisateur sont couvertes : édition via la modale, drag & drop entre colonnes du board ou entre sprints, cycle du badge de statut, clôture d'un sprint, suppression d'un sprint/epic. Modifier la **description** ne génère **aucun event** (volontairement : trop verbeux).

L'historique vit avec l'item : il est synchronisé via le Gist comme le reste, avec la même politique *last-write-wins*. Les items créés avant cette feature ont une timeline vide qui se remplit au fur et à mesure des modifications.

## Sprints

### Créer un sprint

Bouton **+** à côté du label **Sprints** dans la sidebar → modale qui demande un nom et des dates de début/fin optionnelles. Si aucun sprint n'est actif, le sprint vient d'être créé devient automatiquement actif.

### Activer un sprint

Plusieurs sprints peuvent coexister. Un seul est actif à la fois. Pour activer un sprint *future*, cliquer **Activer** dans son header de section, vue Backlog. Le sprint précédemment actif (s'il y en avait un) ne change pas — il faut le clôturer explicitement.

### Clôturer un sprint

Vue **Sprint actif** → bouton **Terminer le sprint** :
- Items à `Terminé` → vont dans **Archive** (avec leur historique de rattachement au sprint).
- Items non terminés → reviennent au **Backlog** (sans rattachement de sprint).
- Le sprint passe en état *terminé* (visible barré dans la sidebar).

### Supprimer un sprint

Menu kebab `⋯` à droite du sprint dans la sidebar → **Supprimer**. Le comportement dépend du lifecycle :

- **Sprint actif** : refus avec un toast (il faut le clôturer d'abord).
- **Sprint future avec items** : refus avec un toast (le vider ou le clôturer d'abord).
- **Sprint future vide** : modale de confirmation, suppression simple.
- **Sprint terminé sans items livrés** : modale de confirmation, suppression simple.
- **Sprint terminé avec items livrés** : modale avec warning. Les items livrés restent dans l'Archive mais perdent l'info "ce sprint".

## Epics

### Créer un epic

Bouton **+** à côté du label **Epics** dans la sidebar → modale qui demande un nom et une couleur (palette de 6 couleurs prédéfinies).

### Renommer / changer la couleur

Menu kebab `⋯` sur la ligne de l'epic → **Modifier**.

### Filtrer par epic

Cliquer sur un epic dans la sidebar filtre le backlog pour ne montrer que les items de cet epic. Cliquer à nouveau retire le filtre. Le bouton **Grouper par epic** (en haut du backlog) bascule en mode où chaque epic a sa propre section avec son propre formulaire de création inline.

### Assigner un item à un epic

- Glisser-déposer un item sur la ligne de l'epic dans la sidebar
- Ou ouvrir le détail de l'item → sélectionner l'epic dans la liste déroulante
- Ou créer l'item directement dans une section epic (mode "Grouper par epic")

### Supprimer un epic

Menu kebab `⋯` → **Supprimer**. Refuse si l'epic contient encore des items (il faut désassigner d'abord).

## Filtres et recherche

- **Recherche plein-texte** : champ en haut, filtre sur les titres d'items du projet actif.
- **Filtre type** : chips `Tous / Build / TMA / Bug` au-dessus du backlog.
- **Filtre priorité** : liste déroulante au-dessus du backlog.
- **Filtre epic** : clic sur un epic dans la sidebar.
- **Groupement** : `Sprint` (par défaut) ou `Epic`.

Les filtres se combinent (intersection). Pour tout retirer, cliquer sur les chips actives ou sélectionner "Toutes priorités".

## Glisser-déposer

- **Vue Backlog** : déplacer un item d'une section à l'autre (sprint → backlog, sprint → autre sprint, etc.).
- **Vue Sprint actif** : déplacer un item entre les colonnes À faire / En cours / Terminé. Le statut est mis à jour.
- **Vue Calendrier** : déplacer un item entre cellules pour replanifier sa `dueDate`, depuis la section "Non planifiés" vers une cellule pour planifier en 1 geste, ou depuis une cellule vers "Non planifiés" pour dé-planifier. Voir [Vue Calendrier](#vue-calendrier).
- **Sur la sidebar** : déposer un item sur un sprint l'assigne à ce sprint, sur un epic l'assigne à cet epic.
- **Réordonnement manuel** : dans une même section ou colonne, glisser pour changer l'ordre. L'ordre est persisté.

## Vue Calendrier

Vue mensuelle multi-projets pour visualiser ta charge à venir et replanifier vite. Accessible via la 4ème entrée de la nav sidebar (📅 Calendrier).

### Affichage
- **Section "⚠ En retard"** en haut : items dont la `dueDate` est passée et qui ne sont pas terminés. Toujours visible si > 0.
- **Grille mensuelle** 7 colonnes (semaine commence lundi). Aujourd'hui est highlighted.
- **Section "Non planifiés"** en bas (repliable) : items sans `dueDate`. Affiche les 10 premiers + bouton "Afficher tout".
- **Cellule "+N autres"** : si une journée a > 3 items, clic pour expand la cellule.
- **Items terminés exclus** : le calendrier est une vue de charge à venir, pas l'archive.
- **Items hors mois** : pas affichés dans les cellules grisées (other-month).

### Filtres
- **Projet** : "Tous les projets" ou un projet spécifique.
- **Type** : tous / Build / TMA / Bug.
- **Priorité** : toutes / P1 / P2 / P3.
- **Epic** : actif uniquement quand un projet est sélectionné (cohérence multi-projets).

### Drag & drop
- Drag un item entre cellules pour changer sa `dueDate`.
- Drag depuis "Non planifiés" vers une cellule pour planifier.
- Drag depuis une cellule vers "Non planifiés" pour dé-planifier (`dueDate = null`).
- Drag depuis "En retard" vers une cellule future pour replanifier.
- Drop sur une cellule grisée du mois adjacent ou sur "En retard" : ignoré.
- Le projet d'un item n'est jamais modifié par un D&D calendrier (immuable).
- Chaque change de `dueDate` génère un event dans la timeline d'activité de l'item.

### Click vs drag
- Click court sur un item : ouvre la modale détail (avec switch projet si nécessaire, vue Calendrier conservée).
- Drag : modifie la `dueDate` sans ouvrir la modale (pattern `dragJustHappened` empêche l'ouverture intempestive après un drop).

## Synchronisation entre machines

Sans configuration, les données restent dans l'IndexedDB du navigateur local. Pour les partager entre plusieurs machines (bureau / portable), connecter un Gist privé GitHub :

1. Créer un Gist **privé** sur [gist.github.com](https://gist.github.com) avec un fichier `atelier-data.json` contenant `{}`. Récupérer l'ID dans l'URL du Gist.
2. Créer un **Personal Access Token** sur [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta) :
   - Type **Fine-grained**
   - Permission **Account → Gists: Read and write**
   - Aucune autre permission n'est nécessaire
3. Dans l'app, cliquer sur l'indicateur **`● Local`** en haut à droite → modale Paramètres → coller le PAT et l'ID du Gist → **Connecter**.

L'indicateur passe à **`● GitHub`**. Toute modif est sauvegardée localement (IndexedDB) puis poussée vers le Gist en arrière-plan (debounce 2,5 s). Sur une autre machine, configurer le même PAT + Gist ID : l'app récupère les dernières données au boot.

⚠ **Politique de conflit** : last-write-wins. Si tu modifies en parallèle sur deux machines, la dernière écriture écrase l'autre. **Éviter d'éditer simultanément**.

## Mode test (bac à sable)

Pour expérimenter sans risque (présenter l'app, tester un workflow, jouer avec un jeu de données plus riche) :

1. Cliquer sur l'indicateur de sync (Local / GitHub) → modale Paramètres
2. Section **🧪 Mode test** → **Activer le mode test** → confirmer
3. La page recharge avec un banner jaune permanent et un seed de 4 projets / 6 epics / 5 sprints / ~25 items mixés.
4. Tu peux créer / modifier / supprimer librement. Mais **rien n'est sauvegardé** : aucune écriture en local ni vers le Gist. Refresh = retour au seed propre.
5. Pour sortir : bouton **Sortir du mode test** dans le banner ou re-cliquer dans la modale Paramètres.

C'est sécurisé par construction : trois garde-fous techniques empêchent toute écriture vers les vraies données pendant que le mode test est actif.

## Sauvegarde manuelle (export / import)

- **Export** : bouton **⬇ Export** dans le topbar → télécharge un JSON contenant tous les projets / items / sprints / epics. Pratique avant un changement risqué ou pour archiver.
- **Import** : bouton **⬆ Import** → choisir un JSON exporté précédemment. **L'import écrase l'état actuel** (modale de confirmation préalable).

L'export/import fonctionne aussi en mode test (l'import remplace le seed en mémoire, mais reste volatile).

## Raccourcis clavier

| Raccourci | Action |
|---|---|
| `Ctrl+C` (ou `Cmd+C`) | Quick add : ouvre le formulaire inline du backlog |
| `Ctrl+Entrée` (ou `Cmd+Entrée`) | Valide / enregistre le formulaire ou la modale active (équivalent au clic sur le bouton primary) |
| `Échap` | Ferme le modal ouvert |

Les raccourcis qui pourraient gêner la saisie sont **désactivés quand le focus est sur un input/textarea/contenteditable** : `Ctrl+C` laisse passer la copie native, `Échap` ne ferme pas la modale tant que tu édites un champ. Seul `Ctrl/Cmd+Entrée` est volontairement actif depuis les inputs (c'est tout son intérêt).

`Ctrl/Cmd+Entrée` cible le bouton "Enregistrer" / "Créer" / "Commenter" du formulaire ou de la modale courante — y compris dans le rich-editor de description, dans le champ commentaire de l'onglet Activité, et lors de l'édition d'un commentaire. Une exception de sécurité : la modale de **confirmation de suppression** ne se valide jamais au clavier, il faut cliquer (anti-suppression accidentelle).

## Astuces

- **Sidebar redimensionnable** : tirer la bordure droite de la sidebar (curseur `↔`). La largeur est persistée par navigateur.
- **Dark theme** : automatique selon le réglage de ton OS. Pas de toggle manuel.
- **Stats par projet dans la sidebar** : trois pastilles colorées par projet (À faire / En cours / Terminé en nombre d'items) + jours à faire.
- **Compteur de sprint** : `reste X j sur Y` dans le header du sprint, basé sur les estimations des items non-terminés. Tooltip au survol pour le détail (livrés / total).
- **Drag & drop multi-cible** : un item peut être glissé en une seule action vers un sprint, un epic, ou une autre section.
- **Le sprint actif a un badge vert** dans le backlog pour le repérer immédiatement.
- **Suppression de projet** : menu kebab `⋯` sur le projet dans la sidebar. Bloqué si le projet a encore des items ou des sprints (videz-le d'abord).
