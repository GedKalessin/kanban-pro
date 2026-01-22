# Changelog - Gantt View Improvements

## Versione Attuale

### ✨ Nuove Funzionalità

#### 1. **Gestione Dipendenze tra Task**
- Aggiunto campo `dependencies` al modello `KanbanCard`
- Nuovo UI nel `CardDetailModal` per gestire le dipendenze
- Modal multi-select per selezionare facilmente le dipendenze
- Le dipendenze vengono visualizzate come frecce curve nel Gantt
- Supporto completo per dipendenze multiple

**Come usarlo:**
1. Apri i dettagli della card
2. Trova la sezione "Dependencies" nella sidebar destra
3. Click su "Edit" → seleziona le card da cui dipende questa task
4. Le frecce appariranno automaticamente nel Gantt

#### 2. **Sistema di Colorazione Migliorato**
Implementato un sistema di colori simile a ClickUp con priorità gerarchica:

**Priorità 1 - Status della Card:**
- 🚫 **Blocked** → Rosso intenso
- ✅ **Completed** → Verde

**Priorità 2 - Livello di Priorità:**
- ⚠️ **Critical** → Rosso pulsante (animato)
- 🔥 **High** → Arancione scuro
- ⚡ **Medium** → Arancione chiaro
- 📘 **Low** → Blu

**Priorità 3 - Assegnato (colori come esempio Vue):**
- 6 colori diversi assegnati deterministicamente basati sul nome dell'assegnato
- Colori: Salmone, Viola, Azzurro, Rosa, Verde pastello, Pesca
- Ogni assegnato avrà sempre lo stesso colore

**Priorità 4 - Tipo di Task:**
- ✨ **Feature** → Viola
- 🐛 **Bug** → Rosso
- 🎯 **Epic** → Magenta
- 📋 **Default** → Indaco

#### 3. **Popup Informativo Migliorato**
- Design moderno in stile ClickUp
- Badge di priorità colorati
- Header flessibile con titolo e priorità affiancati
- Badge colonna con sfondo colorato
- Icone emoji per assignee (👤) e tags (🏷️)
- Mostra numero di dipendenze

#### 4. **Configurazione Gantt Ottimizzata**
```javascript
{
  bar_height: 32,           // Barre più alte
  bar_corner_radius: 6,     // Angoli arrotondati
  arrow_curve: 14,          // Frecce curve (come esempio Vue)
  padding: 20,              // Spaziatura generosa
}
```

### 🎨 Stile ClickUp Moderno

Il Gantt ora ha un aspetto professionale simile a ClickUp:
- Barre arrotondate con ombre sottili
- Transizioni smooth su hover
- Colori vivaci e accattivanti
- Frecce curve per le dipendenze
- Popup moderni con badge

### 📝 File Modificati

1. **src/models/types.ts**
   - Aggiunto campo `dependencies?: string[]` a `KanbanCard`

2. **src/views/renderers/GanttViewRenderer.ts**
   - Implementato supporto per dipendenze
   - Migliorata funzione `getCustomClass()` con sistema di priorità
   - Popup HTML migliorato con badge e layout moderno
   - Configurazione Gantt ottimizzata

3. **src/modals/CardDetailModal.ts**
   - Aggiunto Setting "Dependencies" nella sidebar
   - Metodi `getDependenciesDescription()` e `editDependencies()`

4. **src/modals/UtilityModals.ts**
   - Creato nuovo `MultiSelectModal` per selezione multipla

5. **styles.css**
   - Aggiunte classi CSS per tutte le varianti di colore
   - Stili per il MultiSelectModal
   - Miglioramenti al popup del Gantt

### 📚 Documentazione

1. **GANTT_USAGE.md**
   - Guida completa all'utilizzo del Gantt
   - Esempi pratici con JSON
   - Spiegazione dettagliata del sistema di colorazione

2. **CHANGELOG_GANTT.md** (questo file)
   - Elenco di tutte le modifiche

## Esempio Pratico

```json
{
  "cards": [
    {
      "id": "card-1",
      "title": "Design Homepage",
      "startDate": "2026-01-20",
      "dueDate": "2026-01-22",
      "assignee": ["Alice"],
      "priority": "high",
      "dependencies": []
    },
    {
      "id": "card-2",
      "title": "Develop Homepage",
      "startDate": "2026-01-23",
      "dueDate": "2026-01-28",
      "assignee": ["Bob"],
      "priority": "medium",
      "dependencies": ["card-1"]  // ← Dipende da card-1
    },
    {
      "id": "card-3",
      "title": "Deploy Homepage",
      "startDate": "2026-01-29",
      "dueDate": "2026-01-30",
      "assignee": ["Bob"],
      "priority": "critical",
      "dependencies": ["card-2"]  // ← Dipende da card-2
    }
  ]
}
```

Nel Gantt vedrai:
1. "Design Homepage" → Arancione scuro (high priority)
2. "Develop Homepage" → Arancione chiaro (medium priority)
3. "Deploy Homepage" → Rosso pulsante (critical priority)
4. Frecce curve che collegano: Design → Develop → Deploy

## Come Testare

1. **Compilare il plugin:**
   ```bash
   npm run build
   ```

2. **Creare card di test:**
   - Crea 3-4 card con date diverse
   - Assegna priorità diverse
   - Assegna persone diverse
   - Aggiungi dipendenze tramite UI

3. **Visualizzare il Gantt:**
   - Cambia vista a "Gantt"
   - Prova le diverse modalità (Day, Week, Month)
   - Click sulle card per vedere il popup
   - Verifica le frecce delle dipendenze

## Note Tecniche

- Le dipendenze sono opzionali e backward-compatible
- Il sistema di colorazione usa una gerarchia di priorità
- L'hash dell'assegnato garantisce colori consistenti
- frappe-gantt deve essere installato: `npm install frappe-gantt`

## Compatibilità

- ✅ Backward compatible con card senza dipendenze
- ✅ Funziona con frappe-gantt ^0.6.1
- ✅ Supporta tutti i browser moderni

---

**Versione:** 1.1.0
**Data:** 2026-01-22
**Autore:** Claudio Ricciardiello
