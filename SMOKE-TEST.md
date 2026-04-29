# Plan de smoke test — Atelier

Plan de validation manuel pour vérifier que l'app fonctionne de bout en bout avant un déploiement. À exécuter en ~15 min, idéalement en mode test (bac à sable) pour ne pas polluer les vraies données.

## Setup

1. `npm test` doit passer (84/84 verts).
2. Ouvrir l'app via Live Server (`http://localhost:5500/`) ou la version déployée.
3. Recommandé : activer le **mode test** dès le départ (modale Paramètres → 🧪 Mode test → Activer). Le seed démo charge 4 projets / 25+ items, parfait pour tester sans rien casser.

Cocher au fur et à mesure ; le plan est conçu pour être linéaire (les sections ne se cassent pas mutuellement).

---

## 1. Projets (clients)

- [ ] **1.1** La sidebar liste les 4 projets du seed (Acme, Globex, Initech, Hooli) avec leurs avatars colorés et leurs stats (À faire / En cours / Terminé · jours à faire).
- [ ] **1.2** Cliquer sur un projet → la barre verticale bleue glisse vers le projet actif (animation 0.3 s), le breadcrumb et le contenu changent.
- [ ] **1.3** Survol d'un projet → l'avatar coloré scale légèrement.
- [ ] **1.4** **+** à côté du label *Projets* → modale, créer un projet `MonTest` avec clé `MTS`. Il apparaît dans la sidebar et devient actif.
- [ ] **1.5** Menu kebab `⋯` sur un projet → **Modifier** ouvre la modale pré-remplie. Renommer puis valider met à jour la sidebar.
- [ ] **1.6** Menu kebab → **Supprimer** sur un projet vide → modale de confirmation → confirmation → projet disparaît.
- [ ] **1.7** Menu kebab → **Supprimer** sur un projet avec items → toast "Impossible de supprimer".
- [ ] **1.8** Menu kebab → **Supprimer** sur un projet avec sprints (sans items) → toast "Impossible de supprimer".
- [ ] **1.9** Supprimer le projet actif → bascule automatique sur un autre projet existant.
- [ ] **1.10** Supprimer le dernier projet → empty state "Aucun projet".

## 2. Items

- [ ] **2.1** Vue Backlog → cliquer **+ Créer un item** dans la section *Backlog* d'Acme → formulaire inline visible. Remplir titre / type / priorité / estimation et valider. L'item apparaît avec une clé `ACM-X`.
- [ ] **2.2** Cliquer sur un item → modale détail. Modifier titre, ajouter une description rich text avec gras / italique / liste, ajouter une date d'échéance, sauvegarder. Vérifier que tout est conservé en re-ouvrant.
- [ ] **2.2-bis** (ATE-17) Coller le contenu d'un `.md` long (par ex. un PRD) dans la description : le rich-editor wrap proprement, **ni le rich-editor ni la modale ne débordent horizontalement** (pas de scroll horizontal sur la modale).
- [ ] **2.3** Sur une ligne de backlog, cliquer le badge de statut (à gauche du titre) : `À faire → En cours → Terminé → À faire`. Les pastilles de la sidebar pulsent à chaque changement.
- [ ] **2.4** Modale détail → bouton **Supprimer** → modale de confirmation → l'item disparaît.
- [ ] **2.5** Raccourci `Ctrl+C` (ou `Cmd+C`) avec focus hors input → ouvre directement le formulaire inline du backlog.
- [ ] **2.6** Date d'échéance dans le passé → la pastille est rouge avec mention `J+N`. Date proche (≤ 3 j) → orange avec `J-N`. Date "Aujourd'hui" → mention explicite.

## 3. Sprints

- [ ] **3.1** Bouton **+** à côté du label *Sprints* → modale, créer `Sprint X` avec dates → apparaît dans la sidebar avec dot vert (actif si premier sprint du projet).
- [ ] **3.2** Header du sprint dans la vue Backlog → format `reste X j sur Y` aligné avec la vue Sprint actif. Tooltip au survol précise livrés / total.
- [ ] **3.3** Vue **Sprint actif** → kanban 3 colonnes À faire / En cours / Terminé. Drag d'un item entre colonnes change son statut.
- [ ] **3.4** Vue Sprint actif → barre de progression : si tous les items à 0.25 done, doit afficher `reste 0 / 0.25 j · 100% terminé`. Si rien fait, `reste 0.25 / 0.25 j · 0% terminé`.
- [ ] **3.5** Bouton **Terminer le sprint** → modale confirm. Items à `Terminé` partent en Archive, items non-terminés reviennent au backlog (sans rattachement de sprint).
- [ ] **3.6** Sprint terminé visible dans la sidebar avec suffixe `(terminé)` et apparence barrée.
- [ ] **3.7** Suppression sprint **actif** → toast "actif" (refus).
- [ ] **3.8** Suppression sprint **future avec items** → toast (refus).
- [ ] **3.9** Suppression sprint **future vide** → modale confirm → suppression OK.
- [ ] **3.10** Suppression sprint **terminé sans items livrés** → modale confirm simple → suppression OK.
- [ ] **3.11** Suppression sprint **terminé avec items livrés** → modale avec warning fort mentionnant l'archive → confirmation → items restent dans Archive.

## 4. Epics

- [ ] **4.1** Bouton **+** à côté du label *Epics* → modale, créer `MonEpic` avec couleur → apparaît dans la sidebar avec carré coloré.
- [ ] **4.2** Cliquer sur un epic dans la sidebar → filtre actif, le backlog ne montre que les items de cet epic. Cliquer à nouveau → filtre retiré.
- [ ] **4.3** Bouton **Grouper par epic** dans le backlog → bascule vers une organisation par sections d'epic. Chaque section a son propre formulaire inline qui force l'epic.
- [ ] **4.4** Item ouvert → assigner un epic via la modale → un chip coloré apparaît sur la ligne de l'item.
- [ ] **4.5** Menu kebab sur un epic → **Modifier** → renommer + changer couleur → mise à jour partout.
- [ ] **4.6** Menu kebab → **Supprimer** sur un epic vide → suppression OK.
- [ ] **4.7** Menu kebab → **Supprimer** sur un epic avec items → refus / toast.

## 5. Glisser-déposer

- [ ] **5.1** Vue Backlog → glisser un item d'une section à une autre (sprint actif → backlog, backlog → sprint future) → l'item change de section.
- [ ] **5.2** Vue Backlog → glisser un item dans une même section pour le réordonner → l'ordre est conservé après reload.
- [ ] **5.3** Glisser un item depuis le backlog sur la ligne d'un sprint dans la sidebar → l'item est assigné au sprint.
- [ ] **5.4** Glisser un item sur la ligne d'un epic dans la sidebar → l'item est assigné à l'epic.
- [ ] **5.5** Vue Sprint actif → glisser un item entre les colonnes À faire / En cours / Terminé → le statut est mis à jour.
- [ ] **5.6** Vue Sprint actif → glisser pour réordonner dans une même colonne → ordre conservé.

## 6. Filtres et recherche

- [ ] **6.1** Champ de recherche en haut → tape un mot d'un titre d'item → seuls les items correspondants restent.
- [ ] **6.2** Chips de type (Build / TMA / Bug) → filtre par type d'item.
- [ ] **6.3** Liste déroulante priorité → filtre P1 / P2 / P3.
- [ ] **6.4** Filtres combinés → l'intersection est respectée.
- [ ] **6.5** Vider tous les filtres → tous les items reviennent.

## 7. Vues

- [ ] **7.1** Sidebar nav → Backlog / Sprint actif / Archive switchent la vue. La barre verticale bleue glisse vers la vue active.
- [ ] **7.2** Vue Archive → liste les items terminés par date de complétion descendante.
- [ ] **7.3** Vue Archive → titre de section indique nombre d'items et jours livrés.

## 8. Persistance

(à faire **hors mode test** pour vérifier l'écriture en IndexedDB)

- [ ] **8.1** Désactiver le mode test → les vraies données reviennent.
- [ ] **8.2** Créer un projet, un sprint, un item dans une vraie session → reload de la page → tout est encore là.
- [ ] **8.3** Modifier le statut d'un item → reload → statut conservé.
- [ ] **8.4** Save pill en haut à droite : passe en jaune "Sauvegarde…" puis vert "✓ Sauvegardé" puis s'estompe.

## 9. Synchronisation Gist (optionnel — si tu as configuré le PAT)

- [ ] **9.1** Indicateur de sync passe à **`● GitHub`** quand connecté.
- [ ] **9.2** Modifier un item → après ~3 s, le push Gist est silencieux mais visible dans les Network tools du navigateur.
- [ ] **9.3** Sur une autre machine avec le même PAT/Gist → reload → les modifs apparaissent.
- [ ] **9.4** Bouton **Déconnecter** → l'indicateur revient à **`● Local`**.

## 10. Mode test

- [ ] **10.1** Activer le mode test → confirm → reload → banner jaune visible et persistant.
- [ ] **10.2** Banner contient "Mode test actif" et bouton "Sortir du mode test".
- [ ] **10.3** Sidebar : 4 projets démo (Acme, Globex, Initech, Hooli) avec stats peuplées.
- [ ] **10.4** Vérifier qu'au moins un sprint *actif*, un *future*, un *terminé* sont visibles dans le seed.
- [ ] **10.5** Créer un nouvel item ou un nouveau projet → reload → la modif disparaît, le seed propre revient.
- [ ] **10.6** Indicateur de sync affiche "Mode test" (pas Local ni GitHub).
- [ ] **10.7** Tenter de configurer la sync Gist → toast "Désactive le mode test d'abord".
- [ ] **10.8** Désactiver le mode test (banner ou modale) → reload → banner disparu, vraies données intactes.

## 10-bis. Activité du WI (commentaires + historique)

- [ ] **10b.1** Ouvrir un item → la modale détail a 2 onglets : **Détails** (actif) et **Activité**.
- [ ] **10b.2** Onglet Activité → champ "Ajouter un commentaire…" + timeline (vide pour un item neuf : "Aucune activité pour le moment.").
- [ ] **10b.3** Saisir un commentaire avec une URL `https://example.com/foo, suite` → cliquer **Commenter** → le commentaire apparaît avec l'URL auto-linkée (target=_blank) et la virgule reste hors du lien. Le textarea se vide après envoi.
- [ ] **10b.4** Cliquer **Modifier** sur un commentaire → textarea inline avec le contenu pré-rempli + boutons **Annuler / Enregistrer**. Modifier puis enregistrer → le commentaire affiche la mention `· modifié` à côté de la date.
- [ ] **10b.5** Cliquer **Supprimer** sur un commentaire → confirm natif → le commentaire devient un slot grisé italique *"Commentaire supprimé le …"*. Le texte original ne réapparaît plus.
- [ ] **10b.6** Onglet Détails → modifier le statut + la priorité + l'estimation en bloc → enregistrer. Re-ouvrir → onglet Activité montre **3 events change** (1 par champ), format "Statut : À faire → En cours", chrono inverse.
- [ ] **10b.7** Modifier seulement la description d'un item → enregistrer → onglet Activité reste vide (description n'est volontairement pas trackée).
- [ ] **10b.8** Drag & drop d'une carte sur le board → re-ouvrir → un event "Statut" apparaît dans Activité.
- [ ] **10b.9** Coller dans un commentaire un texte hostile type `<img src=x onerror="alert(1)">` → aucun popup, le texte s'affiche tel quel (chevrons visibles).
- [ ] **10b.10** Refresh → tous les commentaires et changes survivent (persistance IndexedDB / Gist).

## 11. Polish UI

- [ ] **11.1** Toutes les transitions sont fluides (~0.18 s, easing soyeux), pas de saut visuel.
- [ ] **11.2** Hover sur une carte du board → carte se soulève légèrement avec ombre douce.
- [ ] **11.3** Active indicator dans la sidebar : la barre bleue glisse smoothly entre projets.
- [ ] **11.4** Save pill : 3 états distincts (idle estompé / saving jaune avec dot pulse / saved vert avec checkmark).
- [ ] **11.5** Compteurs sidebar pulsent quand un item change de statut ou est ajouté.

## 12. Stats et compteurs

- [ ] **12.1** Topbar : `N items · X j à faire` reflète tous les items non-terminés tous projets confondus.
- [ ] **12.2** Sidebar projet : 3 pastilles `À faire / En cours / Terminé` + `· X j` (jours à faire).
- [ ] **12.3** Pastilles utilisent la valeur exacte (`0.25` reste `0.25`, pas `0.3`).
- [ ] **12.4** Header de sprint : `reste X j sur Y` cohérent entre vue Backlog et vue Sprint actif.
- [ ] **12.5** Tooltip sur le compteur de sprint → "X j à faire sur Y j total · Z j livrés".

## 13. Sauvegarde manuelle

- [ ] **13.1** Bouton **⬇ Export** → JSON téléchargé. Ouvrir le fichier, vérifier la structure (clients[], activeClientId, lastSavedAt).
- [ ] **13.2** Bouton **⬆ Import** → choisir un JSON exporté → modale de confirmation → état remplacé → tout réapparaît correctement après import.

## 14. Sidebar / responsive

- [ ] **14.1** Tirer la bordure droite de la sidebar → largeur change (curseur `↔`). Reload → largeur conservée.
- [ ] **14.2** Dark theme : changer le réglage OS (clair / sombre) → l'app suit automatiquement (les couleurs s'adaptent).
- [ ] **14.3** Réduire la fenêtre sous 900 px → la sidebar est masquée, layout responsive.

## 15. Raccourcis clavier

- [ ] **15.1** `Ctrl+C` / `Cmd+C` (focus hors input) → quick add.
- [ ] **15.2** (ATE-14) `Ctrl+C` avec focus dans un input/textarea → **le copier natif fonctionne** (pas de quick add déclenché). Vérifier avec un `Ctrl+V` dans un autre champ.
- [ ] **15.3** `Échap` → ferme la modale ouverte (settings, item detail, confirm, sprint, client, epic).
- [ ] **15.4** (ATE-14) `Échap` avec focus dans un input de modale → la modale **ne se ferme pas** (anti-frappe accidentelle).
- [ ] **15.5** Avec une modale ouverte, cliquer en dehors → ferme la modale.
- [ ] **15.6** (ATE-14) `Ctrl/Cmd+Entrée` dans la modale détail item → équivalent au clic **Enregistrer** (sauvegarde + ferme).
- [ ] **15.7** (ATE-14) `Ctrl/Cmd+Entrée` dans le formulaire inline de création d'item → crée l'item (un seul, pas de double-submit).
- [ ] **15.8** (ATE-14) `Ctrl/Cmd+Entrée` dans le champ commentaire de l'onglet Activité → poste le commentaire.
- [ ] **15.9** (ATE-14) `Ctrl/Cmd+Entrée` pendant l'édition d'un commentaire → enregistre la modification.
- [ ] **15.10** (ATE-14) `Ctrl/Cmd+Entrée` sur la modale de confirmation de suppression → **NE supprime PAS** (garde anti-suppression accidentelle, il faut cliquer manuellement).

---

## Validation finale

- [ ] **Tests automatiques** : `npm test` → 84 passed.
- [ ] **Console JS** : pas d'erreur ni warning suspect.
- [ ] **Network** : si Gist actif, requêtes `api.github.com` propres (200/304). Si Local ou Mode test, **aucun** call sortant.

Si toutes les cases sont cochées, l'app est prête à merger sur `main` et déployer.
