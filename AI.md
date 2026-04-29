# AI SYSTEM ENTRYPOINT

## Mandatory

Before ANY action:

1. Read `/ai-system/00_AI_SYSTEM.md`
2. Read the current Work Item (WI)
3. Ignore conversation memory
4. Use repository as the ONLY source of truth

---

## Work Items

All work is defined in:

→ `/work-items/`

Each WI contains:
- current Status
- current Owner
- execution context

---

## Execution

User triggers execution with:

→ `next`

Agents must:
- detect current phase from WI
- execute exactly ONE phase
- update WI
- stop

---

## System boundaries

Do NOT:

- operate outside a WI
- invent context not present in the repo
- rely on previous messages
- skip phases
- mix responsibilities

---

## If system is unclear

→ STOP  
→ write BLOCKERS  
→ do NOT guess

---

## Rule

If you did not read `00_AI_SYSTEM.md`, your execution is invalid.