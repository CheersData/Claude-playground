/**
 * Blog article registry — static article data for the blog.
 *
 * Articles are stored as structured data so they can be:
 * - Rendered in the blog index with cards
 * - Rendered in detail with full content
 * - Used for SEO metadata generation
 * - Queried by slug for dynamic routing
 */

export interface BlogArticle {
  slug: string;
  title: string;
  subtitle: string;
  description: string; // SEO meta description (max ~160 chars)
  author: string;
  publishedAt: string; // ISO date
  updatedAt?: string;
  readingTime: string; // e.g. "8 min"
  category: string;
  tags: string[];
  coverColor: string; // gradient accent for card
  /** Structured article content — array of sections */
  sections: ArticleSection[];
}

export interface ArticleSection {
  type: "intro" | "heading" | "paragraph" | "list" | "callout" | "quote";
  content: string;
  items?: string[]; // for list type
  variant?: "warning" | "info" | "tip"; // for callout type
}

// ─── Article Registry ───

export const articles: BlogArticle[] = [
  {
    slug: "clausole-illegali-contratti-lavoro",
    title: "7 Clausole Illegali nel Contratto di Lavoro: Come Riconoscerle",
    subtitle: "Cosa dice la legge italiana e come difendersi dalle clausole nulle",
    description:
      "Guida completa alle 7 clausole illegali piu comuni nei contratti di lavoro in Italia: non concorrenza senza compenso, straordinari non pagati, periodo di prova eccessivo, demansionamento e come tutelarsi.",
    author: "Redazione controlla.me",
    publishedAt: "2026-03-14",
    readingTime: "12 min",
    category: "Diritto del Lavoro",
    tags: [
      "contratto di lavoro",
      "clausole illegali",
      "diritti lavoratori",
      "patto di non concorrenza",
      "straordinari",
      "demansionamento",
      "periodo di prova",
      "TFR",
    ],
    coverColor: "#FF6B35",
    sections: [
      {
        type: "intro",
        content:
          "Ogni anno migliaia di lavoratori italiani firmano contratti che contengono clausole illegittime, spesso senza saperlo. Queste clausole possono riguardare straordinari non retribuiti, patti di non concorrenza senza corrispettivo, rinunce a diritti irrinunciabili e molto altro. In questa guida analizziamo le clausole illegali piu comuni nei contratti di lavoro e spieghiamo come riconoscerle e difendersi.",
      },
      {
        type: "heading",
        content: "1. Cosa rende una clausola illegale",
      },
      {
        type: "paragraph",
        content:
          "Una clausola contrattuale e illegale quando viola norme imperative di legge, cioe norme che non possono essere derogate dalla volonta delle parti. Nel diritto del lavoro italiano, il principio fondamentale e quello di inderogabilita in peius: il contratto individuale non puo prevedere condizioni peggiori rispetto a quanto stabilito dalla legge e dal contratto collettivo nazionale (CCNL) applicabile.",
      },
      {
        type: "paragraph",
        content:
          "L'articolo 2113 del Codice Civile stabilisce che le rinunce e transazioni del lavoratore su diritti derivanti da norme inderogabili sono invalide. Questo significa che anche se hai firmato, la clausola illegittima puo essere impugnata entro 6 mesi dalla cessazione del rapporto di lavoro (o dalla data della rinuncia, se successiva).",
      },
      {
        type: "callout",
        content:
          "Firmare un contratto con clausole illegali non le rende valide. Una clausola nulla e nulla dalla nascita, indipendentemente dalla firma del lavoratore.",
        variant: "info",
      },
      {
        type: "heading",
        content: "2. Straordinari non retribuiti e clausole orario",
      },
      {
        type: "paragraph",
        content:
          'Una delle clausole illegali piu diffuse e quella che prevede un orario di lavoro superiore a quello contrattuale senza compenso aggiuntivo, spesso mascherata con formule come "disponibilita flessibile" o "orario comprensivo di eventuali necessita aziendali". L\'articolo 36 della Costituzione stabilisce il diritto a una retribuzione proporzionata alla quantita e qualita del lavoro. Il D.Lgs. 66/2003 regola l\'orario massimo (48 ore settimanali, straordinari inclusi) e impone maggiorazioni per il lavoro straordinario.',
      },
      {
        type: "list",
        content: "Segnali di allarme nelle clausole sull'orario:",
        items: [
          "\"Il lavoratore si impegna a garantire la propria disponibilita oltre l'orario ordinario senza ulteriore compenso\"",
          "\"La retribuzione e omnicomprensiva di ogni prestazione lavorativa, incluse ore aggiuntive\"",
          "\"L'azienda potra richiedere prestazioni straordinarie senza limiti temporali predefiniti\"",
          "Assenza di riferimento al CCNL applicabile per le maggiorazioni",
        ],
      },
      {
        type: "heading",
        content: "3. Patto di non concorrenza senza corrispettivo",
      },
      {
        type: "paragraph",
        content:
          "Il patto di non concorrenza (art. 2125 c.c.) e un accordo con cui il lavoratore si impegna a non svolgere attivita concorrenziale dopo la cessazione del rapporto. Per essere valido, il patto DEVE prevedere: un corrispettivo adeguato, un limite temporale (max 5 anni per dirigenti, 3 per gli altri), un limite di oggetto e di territorio.",
      },
      {
        type: "paragraph",
        content:
          "La Cassazione ha ripetutamente dichiarato nullo il patto privo di corrispettivo o con corrispettivo irrisorio. La sentenza n. 10062/2015 ha stabilito che il compenso deve essere proporzionato al sacrificio imposto al lavoratore. Un corrispettivo pari al 10-15% della retribuzione annua per una durata di 12 mesi e generalmente considerato inadeguato dalla giurisprudenza prevalente.",
      },
      {
        type: "callout",
        content:
          "Se il tuo contratto contiene un patto di non concorrenza senza compenso specifico, quel patto e nullo. Non sei vincolato al rispettarlo dopo la fine del rapporto di lavoro.",
        variant: "warning",
      },
      {
        type: "heading",
        content: "4. Clausole di demansionamento preventivo",
      },
      {
        type: "paragraph",
        content:
          "L'articolo 2103 del Codice Civile (come modificato dal D.Lgs. 81/2015, Jobs Act) disciplina il mutamento delle mansioni. La regola e che il lavoratore deve essere adibito alle mansioni per le quali e stato assunto o a mansioni riconducibili allo stesso livello e categoria legale. Il demansionamento unilaterale e ammesso solo in casi specifici previsti dalla legge.",
      },
      {
        type: "list",
        content: "Clausole di demansionamento illegittime:",
        items: [
          "\"L'azienda si riserva il diritto di modificare liberamente le mansioni del lavoratore\"",
          "\"Il lavoratore accetta fin d'ora qualsiasi variazione di ruolo e mansione\"",
          "\"In caso di riorganizzazione, il lavoratore potra essere assegnato a mansioni inferiori senza variazione retributiva\" (se non rientra nelle eccezioni dell'art. 2103)",
          "Clausole che prevedono il demansionamento come sanzione disciplinare",
        ],
      },
      {
        type: "heading",
        content: "5. Clausole penali sproporzionate",
      },
      {
        type: "paragraph",
        content:
          "Alcune aziende inseriscono clausole penali che prevedono risarcimenti sproporzionati in caso di dimissioni anticipate o violazione di obblighi contrattuali. L'articolo 1384 c.c. consente al giudice di ridurre equamente la penale manifestamente eccessiva. Inoltre, le clausole che vincolano il lavoratore a restare in azienda per un periodo minimo con penali elevate (cd. clausola di durata minima garantita) possono essere dichiarate nulle se il corrispettivo del vincolo e inadeguato.",
      },
      {
        type: "quote",
        content:
          "\"La clausola penale inserita nel contratto di lavoro deve rispettare il principio di proporzionalita. Una penale pari a 12 mensilita per dimissioni entro il primo anno e manifestamente eccessiva e suscettibile di riduzione giudiziale.\" — Cass. Sez. Lav., orientamento consolidato",
      },
      {
        type: "heading",
        content: "6. Periodo di prova eccessivo o ripetuto",
      },
      {
        type: "paragraph",
        content:
          "Il periodo di prova (art. 2096 c.c.) deve essere concordato per iscritto prima o contestualmente all'inizio del rapporto. La durata massima e stabilita dai CCNL di settore e non puo comunque superare i 6 mesi (art. 7 D.Lgs. 104/2022, in recepimento della Direttiva UE 2019/1152). Clausole che prevedono periodi di prova superiori ai limiti del CCNL o che impongono un nuovo periodo di prova per lo stesso ruolo in caso di rinnovo contrattuale sono illegittime.",
      },
      {
        type: "list",
        content: "Quando il periodo di prova e illegale:",
        items: [
          "Durata superiore a quanto previsto dal CCNL di riferimento",
          "Superiore a 6 mesi (limite massimo assoluto ex D.Lgs. 104/2022)",
          "Nuovo periodo di prova nello stesso ruolo dopo conversione da tempo determinato a indeterminato",
          "Patto di prova inserito dopo l'inizio effettivo della prestazione lavorativa",
          "Prova non proporzionata alla complessita delle mansioni affidate",
        ],
      },
      {
        type: "callout",
        content:
          "Se il tuo contratto prevede un periodo di prova di 12 mesi per un ruolo impiegatizio, e quasi certamente illegittimo. Verifica sempre il CCNL applicabile: la maggior parte prevede 1-3 mesi per impiegati e 3-6 mesi per quadri/dirigenti.",
        variant: "warning",
      },
      {
        type: "heading",
        content: "7. Rinuncia al TFR e altri diritti irrinunciabili",
      },
      {
        type: "paragraph",
        content:
          "Il TFR (Trattamento di Fine Rapporto) e un diritto irrinunciabile del lavoratore. Qualsiasi clausola che preveda la rinuncia totale o parziale al TFR e nulla. Lo stesso vale per ferie, tredicesima, quattordicesima (ove prevista dal CCNL), permessi retribuiti e indennita di malattia. L'art. 36 della Costituzione garantisce il diritto a ferie retribuite e il lavoratore non puo rinunciarvi.",
      },
      {
        type: "list",
        content: "Diritti a cui non si puo mai rinunciare per contratto:",
        items: [
          "TFR (Trattamento di Fine Rapporto)",
          "Ferie annuali retribuite (minimo 4 settimane, art. 10 D.Lgs. 66/2003)",
          "Retribuzione minima da CCNL applicabile",
          "Contributi previdenziali e assistenziali",
          "Tutele in caso di malattia, maternita e infortunio",
          "Periodo di preavviso (o relativa indennita sostitutiva)",
          "Tutele contro il licenziamento illegittimo",
        ],
      },
      {
        type: "heading",
        content: "8. Clausole sulla privacy e controllo a distanza",
      },
      {
        type: "paragraph",
        content:
          "L'articolo 4 dello Statuto dei Lavoratori (L. 300/1970, come modificato dal Jobs Act) disciplina i controlli a distanza. Clausole che autorizzano il datore a monitorare email personali, posizione GPS permanente, webcam accesa o installare keylogger sono illegittime se non rispettano le procedure previste (accordo sindacale o autorizzazione dell'Ispettorato del Lavoro). Il GDPR (Regolamento UE 2016/679) aggiunge ulteriori vincoli sul trattamento dei dati personali dei dipendenti.",
      },
      {
        type: "callout",
        content:
          "Un contratto che ti chiede di \"acconsentire a qualsiasi forma di monitoraggio aziendale\" e probabilmente in violazione sia dello Statuto dei Lavoratori sia del GDPR. Il consenso del lavoratore, essendo in posizione di subordinazione, non e considerato liberamente prestato.",
        variant: "warning",
      },
      {
        type: "heading",
        content: "9. Come difendersi: i passi concreti",
      },
      {
        type: "list",
        content: "Se hai individuato clausole sospette nel tuo contratto:",
        items: [
          "Non farti prendere dal panico: una clausola illegale e nulla di diritto, anche se l'hai firmata",
          "Conserva una copia integrale del contratto firmato",
          "Fai analizzare il contratto da un professionista o da uno strumento di analisi legale AI come controlla.me",
          "Contatta il sindacato di categoria o un consulente del lavoro",
          "In caso di violazione attiva, rivolgiti all'Ispettorato Territoriale del Lavoro",
          "Ricorda: hai 6 mesi dalla cessazione del rapporto per impugnare clausole invalide (art. 2113 c.c.)",
        ],
      },
      {
        type: "heading",
        content: "10. Il ruolo dell'intelligenza artificiale nell'analisi contrattuale",
      },
      {
        type: "paragraph",
        content:
          "Strumenti come controlla.me utilizzano agenti AI specializzati per analizzare i contratti di lavoro e identificare automaticamente clausole potenzialmente illegali. Il sistema incrocia il testo contrattuale con la normativa vigente (Codice Civile, Statuto dei Lavoratori, D.Lgs. 66/2003, D.Lgs. 81/2015, CCNL) e la giurisprudenza recente, fornendo un'analisi strutturata in meno di 60 secondi.",
      },
      {
        type: "paragraph",
        content:
          "L'AI non sostituisce il parere di un avvocato, ma permette a chiunque di capire rapidamente se un contratto contiene criticita prima di firmarlo. Questo e particolarmente utile per lavoratori che non hanno accesso immediato a consulenza legale specializzata.",
      },
      {
        type: "callout",
        content:
          "Vuoi verificare se il tuo contratto di lavoro contiene clausole illegali? Caricalo su controlla.me: l'analisi e gratuita per i primi 3 documenti.",
        variant: "tip",
      },
    ],
  },
];

// ─── Helpers ───

export function getArticleBySlug(slug: string): BlogArticle | undefined {
  return articles.find((a) => a.slug === slug);
}

export function getAllSlugs(): string[] {
  return articles.map((a) => a.slug);
}
