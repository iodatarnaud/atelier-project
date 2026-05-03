// js/calendar.js — Calendar view-model + helpers month/cell/today (WI-010 AC4).
// Phase WI-010 : extraction modulaire bornée (≤ 3 modules ES natifs sans framework).
//
// Ce module expose des fonctions PURES (sans accès au state global, sans mutations) :
//   - localDateKey(d) : YYYY-MM-DD timezone-safe (pas de toISOString !)
//   - buildMonthCells(year, month) : grille du mois (cellules in-month + adjacents)
//   - buildCalendarItems(state, filters) : view-model multi-projets annoté avec
//     clientId/clientName/clientColor/epicColor/epicName, exclusion done + filters appliqués.
//   - indexCalendarItems(items) : pré-indexation par dueDate (perf O(1) par cellule),
//     extraction unplanned + overdue, tri stable.

// Helper crucial : construit YYYY-MM-DD via getFullYear/getMonth/getDate (timezone locale)
// au lieu de toISOString() (qui retournerait UTC et casserait les comparaisons cross-timezones).
export function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// buildMonthCells — grille du mois (semaines lundi → dimanche).
// Cellules adjacentes (mois précédent/suivant) marquées `inMonth: false`.
export function buildMonthCells(year, month) {
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // Lundi = 0
  const cells = [];
  for (let i = offset; i > 0; i--) {
    cells.push({ date: new Date(year, month, 1 - i), inMonth: false });
  }
  for (let d = 1; d <= lastDay; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const next = cells.length - (offset + lastDay) + 1;
    cells.push({ date: new Date(year, month + 1, next), inMonth: false });
  }
  return cells;
}

// buildCalendarItems — view-model pur multi-projets.
// Combine l'ancien `getAllCalendarItems()` (flatMap clients × items + annotation epic)
// avec `filterCalendarItems(items)` (exclusion done + filtres state) en une fonction pure
// qui prend `state` et `filters` en arguments explicites.
//
// filters : { projectId?, type?, priority?, epicId? } — null/undefined = filtre désactivé.
// Retourne un nouveau tableau, sans mutation du state original (vérifié AC4 par test pureté).
export function buildCalendarItems(state, filters = {}) {
  const items = [];
  for (const c of (state.clients || [])) {
    for (const it of (c.items || [])) {
      const epic = it.epicId ? (c.epics || []).find(e => e.id === it.epicId) : null;
      items.push({
        ...it,
        clientId: c.id,
        clientName: c.name,
        clientColor: c.color,
        epicColor: epic ? epic.color : null,
        epicName: epic ? epic.name : null,
      });
    }
  }
  return items.filter(it => {
    // Le calendrier est une vue de charge à venir : on exclut les items terminés
    // (l'Archive existe déjà pour l'historique).
    if (it.status === 'done') return false;
    if (filters.projectId && it.clientId !== filters.projectId) return false;
    if (filters.type && it.type !== filters.type) return false;
    if (filters.priority && it.priority !== filters.priority) return false;
    // Epic appliqué seulement si on est sur un projet précis (sinon ambigu en multi-projets).
    if (filters.projectId && filters.epicId && it.epicId !== filters.epicId) return false;
    return true;
  });
}

// indexCalendarItems — pré-indexation pour lookup O(1) par cellule.
// Sort byDate Map + unplanned (sans dueDate) + overdue (dueDate < today, status !== done).
// Tri unplanned par priorité, overdue par dueDate ascending.
export function indexCalendarItems(items) {
  const byDate = new Map();
  const unplanned = [];
  const overdue = [];
  const todayKey = localDateKey(new Date());
  for (const it of items) {
    if (!it.dueDate) { unplanned.push(it); continue; }
    if (it.dueDate < todayKey && it.status !== 'done') overdue.push(it);
    if (!byDate.has(it.dueDate)) byDate.set(it.dueDate, []);
    byDate.get(it.dueDate).push(it);
  }
  overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  unplanned.sort((a, b) => a.priority - b.priority);
  return { byDate, unplanned, overdue };
}
