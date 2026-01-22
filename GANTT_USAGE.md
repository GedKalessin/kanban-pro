# Gantt View - Guida all'Utilizzo

## Panoramica

Il Gantt View è stato migliorato per offrire un'esperienza simile a ClickUp, con supporto completo per:

- **Barre colorate personalizzate** basate su priorità, assegnati e tipo di task
- **Dipendenze tra task** con frecce curve
- **Popup informativi** con tutti i dettagli del task
- **Drag & drop** per modificare date e durata
- **Progress tracking** basato su checklist

## Utilizzo Base

### 1. Visualizzare il Gantt

Per visualizzare le tue card nel Gantt:

1. Aggiungi **date di inizio** (`startDate`) e **date di scadenza** (`dueDate`) alle tue card
2. Seleziona la vista "Gantt" dalla toolbar
3. Le card appariranno come barre colorate sulla timeline

### 2. Modalità di Visualizzazione

Il Gantt supporta diverse modalità di visualizzazione:

- **Quarter Day** - Vista a 6 ore
- **Half Day** - Vista a 12 ore
- **Day** - Vista giornaliera (default)
- **Week** - Vista settimanale
- **Month** - Vista mensile
- **Year** - Vista annuale

Usa i pulsanti nella toolbar per cambiare modalità.

## Colorazione delle Barre

Le barre del Gantt sono colorate automaticamente in base a:

### Priorità (più alta precedenza)
- **Blocked** 🚫 - Rosso intenso (se la card è bloccata)
- **Completed** ✓ - Verde (se la card è completata)
- **Critical** ⚠️ - Rosso pulsante
- **High** - Arancione scuro
- **Medium** - Arancione chiaro
- **Low** - Blu

### Assegnato (se non c'è priorità)
Le card vengono colorate in base all'assegnato con 6 colori diversi:
- **Assignee 0** - Salmone (#FF8E76)
- **Assignee 1** - Viola (#87576A)
- **Assignee 2** - Azzurro (#86AAAD)
- **Assignee 3** - Rosa (#F35C75)
- **Assignee 4** - Verde pastello (#A8E6CF)
- **Assignee 5** - Pesca (#FFD3B6)

### Tipo di Task (se non c'è assegnato)
- **Feature** ✨ - Viola
- **Bug** 🐛 - Rosso
- **Epic** 🎯 - Magenta
- **Default** - Indaco

## Dipendenze tra Task

### Come funzionano

Puoi creare dipendenze tra task per mostrare che un task dipende dal completamento di un altro.

### Aggiungere Dipendenze tramite UI

1. Apri i dettagli della card (click sulla card)
2. Nella sezione laterale destra, trova "Dependencies"
3. Click su "Edit"
4. Seleziona le card da cui questa dipende
5. Click su "Apply"

La descrizione mostrerà: "2 tasks: Task 1, Task 2" se ci sono dipendenze.

### Formato dei dati

Le dipendenze sono memorizzate nel campo `dependencies` della card come array di ID:

```json
{
  "id": "card-123",
  "title": "Deploy to Production",
  "startDate": "2026-01-25",
  "dueDate": "2026-01-26",
  "dependencies": ["card-120", "card-121"]
}
```

Questo significa che "Deploy to Production" dipende dal completamento di due task precedenti.

### Visualizzazione

Le dipendenze vengono mostrate come **frecce curve** che collegano i task nel Gantt. L'arrow_curve è impostato a 14 (come nell'esempio Vue) per una visualizzazione elegante.

## Interazioni

### Click sul Task
- Apre il popup con i dettagli completi del task
- Mostra: titolo, priorità, colonna, date, durata, progress, assegnati, tags, dipendenze

### Drag & Drop orizzontale
- Sposta il task in avanti o indietro nel tempo
- Mantiene la durata invariata

### Resize delle barre
- Passa il mouse sui bordi della barra per vedere le maniglie
- Trascina per modificare la data di inizio o fine

### Progress Bar
- Trascina la barra del progress per aggiornare il completamento
- Il progress viene sincronizzato automaticamente con la checklist

## Popup Informativo

Il popup mostra:

```
┌─────────────────────────────────┐
│ Task Title            [PRIORITY]│
│ ┌────────────────────┐          │
│ │ Column Name        │          │
│ └────────────────────┘          │
│                                 │
│ Start: 25/01/2026               │
│ End: 28/01/2026                 │
│ Duration: 3 days                │
│                                 │
│ Progress: 50% (2/4 items)       │
│                                 │
│ 👤 Assignee: John, Mary         │
│ 🏷️ Tags: urgent, backend        │
│ Dependencies: 2 tasks           │
└─────────────────────────────────┘
```

## Esempio Completo

Ecco un esempio di struttura dati per un progetto con dipendenze:

```json
{
  "cards": [
    {
      "id": "design-1",
      "title": "[Design] Homepage v2",
      "startDate": "2026-01-20",
      "dueDate": "2026-01-22",
      "assignee": ["Alice"],
      "priority": "high",
      "dependencies": []
    },
    {
      "id": "dev-1",
      "title": "[Dev] Implement Homepage",
      "startDate": "2026-01-23",
      "dueDate": "2026-01-28",
      "assignee": ["Bob"],
      "priority": "medium",
      "dependencies": ["design-1"]
    },
    {
      "id": "test-1",
      "title": "[QA] Test Homepage",
      "startDate": "2026-01-29",
      "dueDate": "2026-01-30",
      "assignee": ["Charlie"],
      "priority": "medium",
      "dependencies": ["dev-1"]
    },
    {
      "id": "deploy-1",
      "title": "[Deploy] Launch Homepage",
      "startDate": "2026-01-31",
      "dueDate": "2026-01-31",
      "assignee": ["Bob"],
      "priority": "critical",
      "dependencies": ["test-1"]
    }
  ]
}
```

Nel Gantt, vedrai:
1. Design → Dev (freccia curva)
2. Dev → QA (freccia curva)
3. QA → Deploy (freccia curva)

Ogni task sarà colorato in base all'assegnato (Alice, Bob, Charlie avranno colori diversi).

## Stile ClickUp

Il Gantt è stato stilizzato per assomigliare a ClickUp:

- **Barre arrotondate** con corner radius di 6px
- **Altezza barre** di 32px per maggiore leggibilità
- **Frecce curve** (arrow_curve: 14) per le dipendenze
- **Transizioni smooth** con hover effects
- **Popup moderni** con badge colorati per le priorità
- **Colori vivaci** ispirati all'esempio Vue fornito

## Fallback

Se frappe-gantt non è disponibile, il plugin mostrerà automaticamente una vista lista semplice con le stesse informazioni.

## Note Tecniche

- Le date vengono normalizzate a mezzanotte locale
- Le task con startDate uguale a endDate vengono automaticamente estese di 1 giorno
- Il progress è calcolato dalla percentuale di checklist items completati
- Le custom classes sono applicate in ordine di priorità (blocked > completed > priority > assignee > taskType)

## Configurazione Frappe Gantt

```javascript
{
  header_height: 50,
  column_width: 30,
  step: 24,
  bar_height: 32,
  bar_corner_radius: 6,
  arrow_curve: 14,
  padding: 20,
  view_modes: ['Quarter Day', 'Half Day', 'Day', 'Week', 'Month', 'Year'],
  view_mode: 'Day',
  date_format: 'YYYY-MM-DD',
  popup_trigger: 'click'
}
```

---

**Nota**: Assicurati che frappe-gantt sia installato con `npm install frappe-gantt` per utilizzare tutte le funzionalità.
