// js/drag-drop.js — Drag & Drop context unifié (WI-010 AC3).
// Phase WI-010 : extraction modulaire bornée (≤ 3 modules ES natifs sans framework).
//
// Avant ce module, le shell utilisait 3 `let` globaux :
//   - dragItemId (DnD backlog/board)
//   - calendarDragItem (DnD calendrier multi-projets, payload { clientId, itemId })
//   - dragJustHappened (flag anti-cross-feature, suppression du click post-drop)
//
// Ce module unifie en un seul `_dragContext = { source, itemId, clientId, payload, startedAt }`
// avec helpers explicites pour lecture/écriture (`startDrag`/`endDrag`/`get*`/`didDragJustHappen`).
// Pas de getter magique sur les anciens noms (les `let` shell ne peuvent pas être remplacés
// proprement par des getters à scope identique — cf. PLAN_REVIEW#2 P1 #2). Migration par
// remplacement explicite des call-sites dans le shell.

let _dragContext = null;
let _dragJustHappened = false;
let _dragJustHappenedTimer = null;

// startDrag(ctx) — démarre un drag en posant le contexte unifié.
// ctx : { source: 'backlog'|'board'|'calendar', itemId, clientId?, payload? }
// Refinement Checkpoint #2 Codex : reset défensif `_dragJustHappened` + timer pour rendre l'état
// plus prédictible si un nouveau drag démarre avant l'expiration du flag anti-click précédent.
export function startDrag(ctx) {
  _dragContext = { ...ctx, startedAt: Date.now() };
  _dragJustHappened = false;
  if (_dragJustHappenedTimer) {
    clearTimeout(_dragJustHappenedTimer);
    _dragJustHappenedTimer = null;
  }
}

// endDrag() — termine un drag (au dragend), clear le contexte et arme le flag anti-click.
// Le flag `_dragJustHappened` reste true pendant 100ms pour bloquer le click post-drop.
export function endDrag() {
  _dragContext = null;
  _dragJustHappened = true;
  if (_dragJustHappenedTimer) clearTimeout(_dragJustHappenedTimer);
  _dragJustHappenedTimer = setTimeout(() => { _dragJustHappened = false; }, 100);
}

// getDragItemId() — itemId du drag courant si source backlog/board, null sinon.
// Comportement compat ancien `dragItemId` (n'inclut pas les drag calendrier).
export function getDragItemId() {
  if (!_dragContext) return null;
  if (_dragContext.source === 'calendar') return null;
  return _dragContext.itemId || null;
}

// getCalendarDragItem() — payload du drag courant si source calendar, null sinon.
// Comportement compat ancien `calendarDragItem` ({ clientId, itemId }).
export function getCalendarDragItem() {
  if (!_dragContext || _dragContext.source !== 'calendar') return null;
  return { clientId: _dragContext.clientId, itemId: _dragContext.itemId };
}

// didDragJustHappen() — true si un drag s'est terminé dans les 100ms (anti-click post-drop).
export function didDragJustHappen() {
  return _dragJustHappened;
}

// peekDragContext() — retourne le contexte interne (lecture seule, pour debug/tests).
export function peekDragContext() {
  return _dragContext ? { ..._dragContext } : null;
}

// _resetDragState() — reset complet (test-only, gated mode test au bridge).
export function _resetDragState() {
  _dragContext = null;
  _dragJustHappened = false;
  if (_dragJustHappenedTimer) clearTimeout(_dragJustHappenedTimer);
  _dragJustHappenedTimer = null;
}
