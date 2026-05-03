// js/items.js — Item primitives (factory + defaults).
// Phase WI-010 : extraction modulaire bornée (≤ 3 modules ES natifs sans framework).
//
// Stratégie d'exposition (cf. docs/spike-modules.md verdict GO) :
//   - les modules exportent leurs primitives.
//   - un bridge dans index.html (<script type="module">) attache à window.* pour compat
//     avec le code inline historique (handlers UI restent dans le shell).
//   - les internals (factory, helpers) sont exposés via window.__atelierInternals
//     uniquement en mode test ou __SKIP_SEED__, jamais en prod.

// itemDefaults() — defaults seuls, partagés entre buildItem (création) et _normalizeItem (import).
// Ne retourne PAS id/num/title/createdAt qui sont dynamiques (générés par appelant).
// Garantie : tous les champs retournés sont définis (jamais undefined).
export function itemDefaults() {
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
    activity: [],
  };
}

// buildItem(partial) — factory canonique d'item.
// Garantie (PRD AC1) : tous les champs trackables ont une valeur définie (jamais undefined),
// ce qui empêche les phantom events d'activité (ex. undefined → 0) au premier saveItemEdit.
//
// Champs avec defaults dynamiques :
//   - id     : 'i' + Date.now() si non fourni.
//   - num    : 1 si non fourni (l'appelant pose normalement le compteur client).
//   - title  : '' si non fourni (rejet à la validation amont si requis).
//   - createdAt : Date.now() si non fourni.
//
// Champs avec defaults statiques (cf. itemDefaults) : type, priority, status,
// estimate, actualHours, dueDate, sprintId, epicId, description, activity.
export function buildItem(partial = {}) {
  const defaults = itemDefaults();
  const now = Date.now();
  const item = {
    id: partial.id !== undefined ? partial.id : ('i' + now),
    num: partial.num !== undefined ? partial.num : 1,
    title: partial.title !== undefined ? partial.title : '',
    type: partial.type !== undefined ? partial.type : defaults.type,
    priority: partial.priority !== undefined ? partial.priority : defaults.priority,
    status: partial.status !== undefined ? partial.status : defaults.status,
    estimate: partial.estimate !== undefined ? partial.estimate : defaults.estimate,
    actualHours: partial.actualHours !== undefined ? partial.actualHours : defaults.actualHours,
    dueDate: partial.dueDate !== undefined ? partial.dueDate : defaults.dueDate,
    sprintId: partial.sprintId !== undefined ? partial.sprintId : defaults.sprintId,
    epicId: partial.epicId !== undefined ? partial.epicId : defaults.epicId,
    createdAt: partial.createdAt !== undefined ? partial.createdAt : now,
    description: partial.description !== undefined ? partial.description : defaults.description,
    activity: Array.isArray(partial.activity) ? partial.activity : defaults.activity.slice(),
  };
  return item;
}

// Spike probe (conservé pour le test boot module ; sera retiré si tests/spike-modules.spec.js
// est fusionné/supprimé en fin d'IMPLEMENTATION).
export function spikeProbe() {
  return { ok: true, ts: Date.now(), source: 'js/items.js' };
}
