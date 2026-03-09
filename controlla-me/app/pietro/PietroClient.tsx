"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  GraduationCap,
  TrendingUp,
  Brain,
  Sparkles,
  Building2,
  Euro,
  MapPin,
  Star,
  ChevronDown,
  ChevronUp,
  Zap,
  Target,
  Briefcase,
  Globe,
  BookOpen,
  Lightbulb,
  BarChart3,
  ShoppingBag,
  Palette,
  Bot,
  Rocket,
  Shield,
  CheckCircle2,
  ArrowRight,
  Home,
  Landmark,
  LineChart,
  Cpu,
  Leaf,
  Eye,
  Layers,
  DollarSign,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface University {
  name: string;
  city: string;
  program: string;
  type: "pubblica" | "privata";
  costRange: string;
  strengths: string[];
  aiReadiness: number; // 1-5
  fashionFocus: number; // 1-5
  marketingDepth: number; // 1-5
  jobPlacement: number; // 1-5
  recommended?: boolean;
  badge?: string;
}

interface CareerPath {
  title: string;
  icon: React.ReactNode;
  outlook: "eccellente" | "molto positivo" | "positivo" | "stabile";
  salaryEntry: string;
  salarySenior: string;
  aiImpact: string;
  description: string;
  skills: string[];
}

interface FutureSkill {
  name: string;
  category: "ai" | "digital" | "creative" | "strategic";
  importance: number; // 1-10
  description: string;
}

// ─── Data ────────────────────────────────────────────────────────────────────

const TRIENNALI: University[] = [
  {
    name: "IED Milano",
    city: "Milano",
    program: "Fashion Marketing and Communication",
    type: "privata",
    costRange: "8.800 - 17.200",
    strengths: [
      "Top 20 fashion school mondiale",
      "Project-based con aziende moda",
      "Specifico marketing + moda, non design",
      "Placement eccellente a Milano",
    ],
    aiReadiness: 3,
    fashionFocus: 5,
    marketingDepth: 4,
    jobPlacement: 5,
    recommended: true,
    badge: "Miglior rapporto qualita/prezzo",
  },
  {
    name: "Politecnico di Milano",
    city: "Milano",
    program: "Design della Moda",
    type: "pubblica",
    costRange: "890 - 3.900",
    strengths: [
      "Miglior universita tecnica d'Italia",
      "Design + tecnologie + comunicazione",
      "Magistrale Fashion System molto business",
      "Esenzione per ISEE < 30.000",
    ],
    aiReadiness: 4,
    fashionFocus: 5,
    marketingDepth: 3,
    jobPlacement: 5,
    recommended: true,
    badge: "Top pubblica",
  },
  {
    name: "Universita di Bologna",
    city: "Rimini",
    program: "Culture e Pratiche della Moda",
    type: "pubblica",
    costRange: "500 - 2.800",
    strengths: [
      "Unica triennale pubblica dedicata alla moda",
      "Approccio culturale e semiotico",
      "Magistrale Fashion Studies nello stesso ateneo",
      "Costo accessibilissimo",
    ],
    aiReadiness: 3,
    fashionFocus: 4,
    marketingDepth: 3,
    jobPlacement: 3,
  },
  {
    name: "IULM",
    city: "Milano",
    program: "Moda e Industrie Creative",
    type: "privata",
    costRange: "3.656 - 8.500",
    strengths: [
      "Comunicazione + moda integrati",
      "A Milano, cuore del sistema moda",
      "Magistrale Fashion Communication & Luxury",
      "Costi contenuti per una privata",
    ],
    aiReadiness: 3,
    fashionFocus: 4,
    marketingDepth: 4,
    jobPlacement: 4,
  },
  {
    name: "NABA Milano",
    city: "Milano",
    program: "Fashion Marketing Management",
    type: "privata",
    costRange: "18.200",
    strengths: [
      "Programma lanciato 2024, molto aggiornato",
      "Supply chain sostenibile + strategie omnicanale",
      "Product Manager, E-commerce, Fashion Buyer",
      "Focus su trend research e digital",
    ],
    aiReadiness: 4,
    fashionFocus: 4,
    marketingDepth: 5,
    jobPlacement: 4,
    badge: "Piu aggiornato",
  },
  {
    name: "Polimoda",
    city: "Firenze",
    program: "Fashion Marketing",
    type: "privata",
    costRange: "18.000+",
    strengths: [
      "Top 10 fashion school mondiale",
      "Stage obbligatorio nel curriculum",
      "Faculty di professionisti del settore",
      "Firenze = polo lusso e manifattura",
    ],
    aiReadiness: 3,
    fashionFocus: 5,
    marketingDepth: 4,
    jobPlacement: 5,
    badge: "Brand piu forte nel fashion",
  },
];

const MAGISTRALI: University[] = [
  {
    name: "Universita di Bologna",
    city: "Rimini",
    program: "Fashion Studies — Strategic Management",
    type: "pubblica",
    costRange: "500 - 2.800",
    strengths: [
      "Omnichannel Fashion Marketing",
      "Data Science for Fashion",
      "Insegnamento in inglese",
      "Costo bassissimo per il valore offerto",
    ],
    aiReadiness: 5,
    fashionFocus: 4,
    marketingDepth: 5,
    jobPlacement: 4,
    recommended: true,
    badge: "Best value + AI-ready",
  },
  {
    name: "Politecnico di Milano",
    city: "Milano",
    program: "Design for the Fashion System",
    type: "pubblica",
    costRange: "890 - 3.900",
    strengths: [
      "Orientamento forte al business",
      "Accesso al Milan Fashion Institute",
      "Network corporate fortissimo",
      "Brand Politecnico riconosciuto globalmente",
    ],
    aiReadiness: 4,
    fashionFocus: 5,
    marketingDepth: 4,
    jobPlacement: 5,
    recommended: true,
    badge: "Network + carriera",
  },
  {
    name: "IUAV Venezia",
    city: "Venezia",
    program: "Moda / Fashion (Fashion Ecologies)",
    type: "pubblica",
    costRange: "max 2.806",
    strengths: [
      "Sostenibilita e modelli innovativi",
      "Costo bassissimo",
      "Bilingue italiano/inglese",
      "Focus su futuro e circular economy",
    ],
    aiReadiness: 3,
    fashionFocus: 4,
    marketingDepth: 3,
    jobPlacement: 3,
  },
  {
    name: "SDA Bocconi",
    city: "Milano",
    program: "MAFED — Fashion, Experience & Design Mgmt",
    type: "privata",
    costRange: "40.000 (1 anno)",
    strengths: [
      "Master piu prestigioso in Italia",
      "Brand Bocconi globale",
      "Rete alumni nei top brand mondiali",
      "Borse di studio disponibili",
    ],
    aiReadiness: 4,
    fashionFocus: 4,
    marketingDepth: 5,
    jobPlacement: 5,
    badge: "Top assoluto",
  },
];

const CAREER_PATHS: CareerPath[] = [
  {
    title: "AI Fashion Marketing Manager",
    icon: <Bot className="w-5 h-5" />,
    outlook: "eccellente",
    salaryEntry: "30.000 - 40.000",
    salarySenior: "65.000 - 90.000",
    aiImpact: "Questo ruolo NASCE dall'AI. Chi lo occupa ora sara il leader di domani.",
    description:
      "Integra AI generativa, predictive analytics e automazione nelle strategie marketing dei brand moda. Gestisce tool AI per content creation, trend forecasting e personalizzazione cliente.",
    skills: ["AI/ML tools", "Prompt engineering", "Data analytics", "Fashion sense"],
  },
  {
    title: "E-commerce & Digital Manager",
    icon: <ShoppingBag className="w-5 h-5" />,
    outlook: "eccellente",
    salaryEntry: "28.000 - 38.000",
    salarySenior: "55.000 - 140.000",
    aiImpact: "AI potenzia enormemente questo ruolo: personalizazione, raccomandazioni, pricing dinamico.",
    description:
      "Gestisce vendite online, marketplace (Farfetch, YNAP), strategie omnicanale. Il 21,7% dei ricavi luxury viene gia dall'e-commerce — e cresce.",
    skills: ["Shopify/Magento", "Analytics", "UX", "Omnichannel strategy"],
  },
  {
    title: "Brand Manager (Luxury/Fashion)",
    icon: <Sparkles className="w-5 h-5" />,
    outlook: "molto positivo",
    salaryEntry: "28.000 - 38.000",
    salarySenior: "55.000 - 100.000+",
    aiImpact: "AI aiuta nell'analisi sentiment e trend, ma la visione creativa resta insostituibile.",
    description:
      "I brand luxury stanno attraversando un 'creative reset'. Cercano figure che ricostruiscano fiducia attraverso storytelling e brand value. Ruolo sempre piu strategico.",
    skills: ["Brand strategy", "Storytelling", "Consumer insights", "Creative direction"],
  },
  {
    title: "Data-Driven Fashion Analyst",
    icon: <BarChart3 className="w-5 h-5" />,
    outlook: "eccellente",
    salaryEntry: "26.000 - 35.000",
    salarySenior: "48.000 - 85.000+",
    aiImpact: "Ruolo potenziato dall'AI: chi sa usare AI per analisi dati guadagna 20% in piu.",
    description:
      "Usa dati di vendita, web analytics e comportamento consumatore per guidare decisioni. I fashion buyer del futuro scelgono anche in base ai dati, non solo al gusto.",
    skills: ["Python/SQL", "BI tools", "Statistical analysis", "Fashion domain knowledge"],
  },
  {
    title: "Fashion Content & Social Strategist",
    icon: <Palette className="w-5 h-5" />,
    outlook: "positivo",
    salaryEntry: "21.000 - 27.000",
    salarySenior: "38.000 - 65.000",
    aiImpact: "AI abbassa la barriera di produzione content. Il valore si sposta sulla direzione creativa e strategia.",
    description:
      "Crea e gestisce contenuti multicanale per brand moda. Con AI il costo produzione scende, ma serve la direzione creativa. I profili solo 'content' si svalutano — servono analytics e strategia.",
    skills: ["Content creation", "Paid media", "Analytics", "Creative direction"],
  },
  {
    title: "Sustainability & Innovation Manager",
    icon: <Globe className="w-5 h-5" />,
    outlook: "molto positivo",
    salaryEntry: "25.000 - 35.000",
    salarySenior: "50.000 - 80.000",
    aiImpact: "AI monitora supply chain e impatto ambientale. Il Digital Product Passport EU sara obbligatorio.",
    description:
      "La sostenibilita non e piu un 'nice to have' — e legislazione EU (Green Deal, Digital Product Passport). Chi combina competenze fashion + sustainability + tech e rarissimo e richiestissimo.",
    skills: ["Circular economy", "EU regulations", "Supply chain", "ESG reporting"],
  },
];

const FUTURE_SKILLS: FutureSkill[] = [
  {
    name: "AI Literacy & Prompt Engineering",
    category: "ai",
    importance: 10,
    description:
      "Saper dirigere e collaborare con l'AI. Non serve programmare, ma capire come usare AI per design, trend forecasting, content e ottimizzazione. Entro il 2030 sara indispensabile.",
  },
  {
    name: "Data Analytics & Decision Making",
    category: "digital",
    importance: 9,
    description:
      "Excel avanzato, Google Analytics, SQL, BI tools. Leggere dati di vendita e comportamento consumatore. I marketer con skill quantitative guadagnano fino al 20% in piu.",
  },
  {
    name: "Digital Marketing Avanzato",
    category: "digital",
    importance: 9,
    description:
      "SEO, SEM, social ads (Meta, TikTok), CRM, marketing automation. La competenza 'social media' generica non basta: servono performance marketing e analytics.",
  },
  {
    name: "E-commerce & Omnichannel",
    category: "digital",
    importance: 8,
    description:
      "Shopify, marketplace fashion, strategie che integrano online/offline. L'e-commerce fashion cresce costantemente e sara dominante entro il 2030.",
  },
  {
    name: "Brand Strategy & Storytelling",
    category: "creative",
    importance: 8,
    description:
      "Costruire narrazioni di marca coerenti. I brand luxury stanno tornando a investire su creativita e storytelling dopo anni di crescita guidata dai prezzi.",
  },
  {
    name: "Sostenibilita & Circular Economy",
    category: "strategic",
    importance: 8,
    description:
      "Ethical sourcing, materiali sostenibili, Digital Product Passport EU. Non e opzionale — e legislazione europea con deadline 2027-2030.",
  },
  {
    name: "Content Creation con AI",
    category: "ai",
    importance: 7,
    description:
      "Produzione video, fotografia, copy con strumenti AI. Il costo produzione scende ma serve la direzione creativa umana. Chi sa dirigere l'AI crea 10x piu contenuti.",
  },
  {
    name: "Python & Automazione base",
    category: "ai",
    importance: 6,
    description:
      "Non per diventare sviluppatori, ma per automatizzare task ripetitivi e dialogare con i team tech. Un marketer che sa scrivere script ha un vantaggio enorme.",
  },
];

const SALARY_DATA = [
  { role: "Digital Marketing Manager", entry: "25-35k", mid: "35-50k", senior: "50-80k" },
  { role: "Brand Manager (Luxury)", entry: "28-38k", mid: "40-55k", senior: "55-100k+" },
  { role: "E-commerce Manager", entry: "28-38k", mid: "40-55k", senior: "55-140k" },
  { role: "Data-Driven Marketing", entry: "26-35k", mid: "35-48k", senior: "48-85k+" },
  { role: "Fashion Marketing & Comm.", entry: "22-30k", mid: "30-42k", senior: "42-80k" },
  { role: "Social Media Manager", entry: "21-27k", mid: "27-38k", senior: "38-65k" },
  { role: "Fashion Buyer", entry: "22-30k", mid: "30-42k", senior: "42-70k+" },
  { role: "Visual Merchandiser", entry: "18-24k", mid: "24-32k", senior: "32-55k" },
];

// ─── Real Estate + AI Data ───────────────────────────────────────────────────

interface REMarketStat {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
}

interface REUseCase {
  title: string;
  icon: React.ReactNode;
  impact: string;
  description: string;
  metrics: string[];
}

interface RECareerPath {
  title: string;
  icon: React.ReactNode;
  outlook: "eccellente" | "molto positivo" | "positivo" | "stabile";
  salaryEntry: string;
  salarySenior: string;
  aiImpact: string;
  description: string;
  skills: string[];
}

const RE_MARKET_STATS: REMarketStat[] = [
  {
    label: "Mercato AI Real Estate",
    value: "$303 mld",
    sub: "2025, +36% YoY",
    icon: <TrendingUp className="w-5 h-5" />,
  },
  {
    label: "Proiezione 2029",
    value: "$989 mld",
    sub: "CAGR 34.4%",
    icon: <LineChart className="w-5 h-5" />,
  },
  {
    label: "Investimenti Italia",
    value: "12.5 mld",
    sub: "+23% nel 2025",
    icon: <Landmark className="w-5 h-5" />,
  },
  {
    label: "Agenti RE che usano AI",
    value: "82%",
    sub: "adozione 2025",
    icon: <Bot className="w-5 h-5" />,
  },
];

const RE_USE_CASES: REUseCase[] = [
  {
    title: "Valutazione Immobiliare AI",
    icon: <Home className="w-5 h-5" />,
    impact: "altissimo",
    description:
      "I modelli AVM (Automated Valuation Models) forniscono stime di prezzo istantanee con il 95% di accuratezza, contro il 70% dei metodi tradizionali. Portfolio mark-to-market in tempo reale.",
    metrics: ["95% accuratezza", "Stime in secondi vs giorni", "Portfolio screening istantaneo"],
  },
  {
    title: "Virtual Tour & Visualizzazione",
    icon: <Eye className="w-5 h-5" />,
    impact: "alto",
    description:
      "Tour virtuali guidati da AI con ricostruzione 3D. Il 77% degli acquirenti preferisce visitare gli immobili in realta virtuale prima di persona. Engagement 3-5x superiore.",
    metrics: ["77% preferisce VR", "3-5x engagement", "Tempi di vendita ridotti"],
  },
  {
    title: "Smart Building & Energia",
    icon: <Cpu className="w-5 h-5" />,
    impact: "altissimo",
    description:
      "Ottimizzazione energetica con IoT + AI: riduzione 15-30% dei consumi, -25% costi riparazione, -50% downtime manutenzione. Monitoraggio HVAC, occupazione e accessi in real-time.",
    metrics: ["-30% consumi energia", "-25% costi riparazione", "-50% downtime"],
  },
  {
    title: "Digital Twin degli Edifici",
    icon: <Layers className="w-5 h-5" />,
    impact: "emergente",
    description:
      "Da repliche statiche a sistemi operativi AI-driven. Simulano leasing, upgrade ESG, efficienza energetica. L'AI generativa crea scenari futuri e configurazioni alternative.",
    metrics: ["Mercato GenAI arch: $5.85B entro 2029", "CAGR 41%", "120+ paper nel 2025"],
  },
  {
    title: "Predictive Analytics & Tenant Mgmt",
    icon: <BarChart3 className="w-5 h-5" />,
    impact: "alto",
    description:
      "Modelli predittivi per vacancy, screening inquilini con ML oltre il credit check, e tassi di conversione leasing migliorati del 15-20%. Il 40% delle aziende CRE gia lo usa.",
    metrics: ["+15-20% conversione leasing", "40% aziende CRE adottano", "Churn prediction attivo"],
  },
  {
    title: "AI + Sostenibilita (ESG)",
    icon: <Leaf className="w-5 h-5" />,
    impact: "strategico",
    description:
      "AI e sostenibilita convergono in un unico sistema di performance. Assets ESG da $18.4T (2021) a $34T (2026). Il 62% dei nuovi contratti commerciali include clausole green.",
    metrics: ["$34T asset ESG 2026", "62% contratti con clausole green", "Digital Product Passport EU"],
  },
];

const RE_CAREER_PATHS: RECareerPath[] = [
  {
    title: "PropTech Product Manager",
    icon: <Rocket className="w-5 h-5" />,
    outlook: "eccellente",
    salaryEntry: "35.000 - 45.000",
    salarySenior: "70.000 - 120.000",
    aiImpact: "Ruolo in esplosione: i PropTech unicorn (EliseAI, Bilt) cercano PM che capiscano sia immobiliare che AI.",
    description:
      "Gestisce prodotti digitali per il settore immobiliare: piattaforme di valutazione, tour virtuali, gestione proprietari/inquilini. Combina competenze tech, UX e conoscenza del mercato RE.",
    skills: ["Product management", "UX/UI", "Real estate domain", "AI/ML literacy"],
  },
  {
    title: "AI Real Estate Analyst",
    icon: <LineChart className="w-5 h-5" />,
    outlook: "eccellente",
    salaryEntry: "30.000 - 40.000",
    salarySenior: "60.000 - 100.000",
    aiImpact: "Chi sa combinare modelli predittivi e conoscenza immobiliare guadagna significativamente di piu.",
    description:
      "Usa modelli AI per valutazione immobili, previsione prezzi, analisi di mercato. I fondi di investimento e le REIT cercano disperatamente profili che uniscano data science e real estate.",
    skills: ["Python/SQL", "Machine learning", "Financial modeling", "Real estate valuation"],
  },
  {
    title: "Smart Building Manager",
    icon: <Building2 className="w-5 h-5" />,
    outlook: "molto positivo",
    salaryEntry: "28.000 - 38.000",
    salarySenior: "55.000 - 85.000",
    aiImpact: "AI riduce i costi operativi fino al 30%. Chi sa gestire sistemi IoT + AI negli edifici e rarissimo.",
    description:
      "Gestisce l'infrastruttura smart degli edifici: sensori IoT, ottimizzazione energetica, manutenzione predittiva. Con la direttiva EU sugli edifici green, la domanda esplode.",
    skills: ["IoT/BMS", "Energy management", "Data analytics", "Sustainability"],
  },
  {
    title: "Real Estate Digital Marketing Manager",
    icon: <Target className="w-5 h-5" />,
    outlook: "molto positivo",
    salaryEntry: "26.000 - 35.000",
    salarySenior: "50.000 - 80.000",
    aiImpact: "AI personalizza le campagne immobiliari: targeting iper-preciso, contenuti generativi, virtual staging.",
    description:
      "Marketing digitale specializzato nel settore immobiliare: lead generation, virtual staging con AI generativa, campagne geolocalizzate. Il real estate marketing sta vivendo la stessa rivoluzione del fashion marketing.",
    skills: ["Digital marketing", "Virtual staging AI", "Lead generation", "CRM immobiliare"],
  },
  {
    title: "ESG & Sustainability Consultant (RE)",
    icon: <Leaf className="w-5 h-5" />,
    outlook: "eccellente",
    salaryEntry: "30.000 - 40.000",
    salarySenior: "60.000 - 100.000+",
    aiImpact: "L'EU AI Act e le direttive green rendono questo ruolo obbligatorio per ogni grande operatore RE.",
    description:
      "Consulenza ESG specializzata nel real estate: certificazioni green, compliance EU, ottimizzazione energetica con AI. I fondi immobiliari devono rendicontare l'impatto ambientale — serve chi lo sa fare.",
    skills: ["ESG reporting", "EU regulations", "Energy audit", "AI for sustainability"],
  },
];

const RE_SALARY_DATA = [
  { role: "PropTech Product Manager", entry: "35-45k", mid: "45-70k", senior: "70-120k" },
  { role: "AI Real Estate Analyst", entry: "30-40k", mid: "40-60k", senior: "60-100k" },
  { role: "Smart Building Manager", entry: "28-38k", mid: "38-55k", senior: "55-85k" },
  { role: "RE Digital Marketing Mgr", entry: "26-35k", mid: "35-50k", senior: "50-80k" },
  { role: "ESG Consultant (RE)", entry: "30-40k", mid: "40-60k", senior: "60-100k+" },
  { role: "Property Manager (AI tools)", entry: "24-32k", mid: "32-45k", senior: "45-70k" },
  { role: "RE Data Engineer", entry: "32-42k", mid: "42-60k", senior: "60-90k" },
  { role: "Digital Twin Specialist", entry: "35-45k", mid: "45-65k", senior: "65-100k+" },
];

const RE_KEY_PLAYERS = [
  { name: "EliseAI", desc: "Lead conversion, tour AI, tenant management", funding: "$250M Series E", geo: "US" },
  { name: "Bilt Rewards", desc: "Pagamenti affitto + rewards", funding: "$13B valuation", geo: "US" },
  { name: "Orbital", desc: "AI per diritto immobiliare", funding: "€50M Series B", geo: "UK" },
  { name: "Buena", desc: "Automazione property management", funding: "€49M totali", geo: "Germania" },
  { name: "Dwelly", desc: "Agenzia immobiliare AI", funding: "$93M", geo: "UK" },
  { name: "Cambio", desc: "Asset management CRE con AI", funding: "$100M valuation", geo: "US" },
];

// ─── Helper Components ───────────────────────────────────────────────────────

function OutlookBadge({ outlook }: { outlook: string }) {
  const colors: Record<string, string> = {
    eccellente: "bg-emerald-50 text-emerald-700 border-emerald-200",
    "molto positivo": "bg-blue-50 text-blue-700 border-blue-200",
    positivo: "bg-amber-50 text-amber-700 border-amber-200",
    stabile: "bg-gray-100 text-gray-600 border-gray-200",
  };
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${colors[outlook] || colors.stabile}`}>
      {outlook}
    </span>
  );
}

function SkillBar({ value, max = 5, color }: { value: number; max?: number; color: string }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={`h-2 w-5 rounded-full transition-colors ${i < value ? color : "bg-gray-100"}`}
        />
      ))}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="text-center p-5 rounded-2xl bg-white border border-[var(--border-subtle)] hover:border-[var(--border)] transition-colors">
      <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--accent)]/[0.06] text-[var(--accent)] mb-3">
        {icon}
      </div>
      <div className="text-2xl font-bold text-[var(--foreground)]">{value}</div>
      <div className="text-sm text-[var(--foreground-secondary)] mt-1">{label}</div>
      {sub && <div className="text-xs text-[var(--foreground-tertiary)] mt-0.5">{sub}</div>}
    </div>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--accent)]/[0.06] text-[var(--accent)]">
          {icon}
        </div>
        <h2 className="font-serif text-2xl md:text-3xl text-[var(--foreground)]">{title}</h2>
      </div>
      <p className="text-[var(--foreground-secondary)] ml-12">{subtitle}</p>
    </div>
  );
}

// ─── University Card ─────────────────────────────────────────────────────────

function UniCard({ uni, index }: { uni: University; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * index, duration: 0.4 }}
      className={`rounded-2xl border p-6 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] ${
        uni.recommended
          ? "border-[var(--accent)]/40 bg-[var(--accent)]/[0.03]"
          : "border-[var(--border)] bg-white"
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-[var(--foreground)]">{uni.name}</h3>
            {uni.recommended && <Star className="w-4 h-4 text-[var(--accent)] fill-[var(--accent)]" />}
          </div>
          <div className="flex items-center gap-2 text-sm text-[var(--foreground-secondary)]">
            <MapPin className="w-3.5 h-3.5" />
            <span>{uni.city}</span>
            <span className="text-[var(--foreground-tertiary)]">•</span>
            <span className={uni.type === "pubblica" ? "text-emerald-600" : "text-blue-600"}>
              {uni.type}
            </span>
          </div>
        </div>
        {uni.badge && (
          <span className="text-[10px] font-medium uppercase tracking-wider px-2.5 py-1 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] whitespace-nowrap">
            {uni.badge}
          </span>
        )}
      </div>

      <p className="text-sm font-medium text-[var(--foreground)] mb-3">{uni.program}</p>

      <div className="flex items-center gap-1.5 text-sm text-[var(--foreground-secondary)] mb-4">
        <Euro className="w-3.5 h-3.5" />
        <span>{uni.costRange} EUR/anno</span>
      </div>

      {/* Skill bars */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-4">
        <div>
          <div className="text-xs text-[var(--foreground-tertiary)] mb-1">AI Readiness</div>
          <SkillBar value={uni.aiReadiness} color="bg-violet-400" />
        </div>
        <div>
          <div className="text-xs text-[var(--foreground-tertiary)] mb-1">Fashion Focus</div>
          <SkillBar value={uni.fashionFocus} color="bg-pink-400" />
        </div>
        <div>
          <div className="text-xs text-[var(--foreground-tertiary)] mb-1">Marketing Depth</div>
          <SkillBar value={uni.marketingDepth} color="bg-[var(--accent)]" />
        </div>
        <div>
          <div className="text-xs text-[var(--foreground-tertiary)] mb-1">Job Placement</div>
          <SkillBar value={uni.jobPlacement} color="bg-emerald-400" />
        </div>
      </div>

      {/* Toggle details */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-[var(--foreground-tertiary)] hover:text-[var(--accent)] transition-colors"
      >
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {open ? "Nascondi dettagli" : "Vedi punti di forza"}
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden mt-3 space-y-1.5"
          >
            {uni.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[var(--foreground-secondary)]">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                <span>{s}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function PietroClient() {
  const [activeTab, setActiveTab] = useState<"triennali" | "magistrali">("triennali");
  const [showAllCareers, setShowAllCareers] = useState(false);
  const [showAllRECareers, setShowAllRECareers] = useState(false);
  const [showAllUseCases, setShowAllUseCases] = useState(false);

  const visibleCareers = showAllCareers ? CAREER_PATHS : CAREER_PATHS.slice(0, 3);
  const visibleRECareers = showAllRECareers ? RE_CAREER_PATHS : RE_CAREER_PATHS.slice(0, 3);
  const visibleUseCases = showAllUseCases ? RE_USE_CASES : RE_USE_CASES.slice(0, 3);

  return (
    <div className="min-h-screen relative overflow-hidden bg-white">
      {/* Background orbs */}
      <div
        className="floating-orb"
        style={{
          width: 350,
          height: 350,
          top: "5%",
          right: "-5%",
          animationDelay: "0s",
        }}
      />
      <div
        className="floating-orb"
        style={{
          width: 250,
          height: 250,
          bottom: "15%",
          left: "-3%",
          animationDelay: "3s",
        }}
      />

      {/* Content */}
      <div className="relative z-10 px-6 pt-12 pb-20 max-w-[1100px] mx-auto">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-[var(--foreground-tertiary)] hover:text-[var(--accent)] transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Torna a Controlla.me
        </Link>

        {/* ═══ HERO ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            Guida personalizzata per Pietro
          </div>

          <h1 className="font-serif text-4xl md:text-6xl text-[var(--foreground)] mb-4 leading-tight">
            Marketing + Moda
            <br />
            <span className="bg-gradient-to-r from-[var(--accent)] to-amber-400 bg-clip-text text-transparent">
              + Real Estate nell&apos;era dell&apos;AI
            </span>
          </h1>

          <p className="text-lg md:text-xl text-[var(--foreground-secondary)] max-w-[680px] mx-auto leading-relaxed">
            Una guida completa per esplorare le opportunita di carriera in due settori in piena
            trasformazione AI — moda e immobiliare — con le competenze che il mercato cerchera nei prossimi 10 anni.
          </p>
        </motion.div>

        {/* ═══ KEY STATS ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-20"
        >
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="Mercato moda IT"
            value="38.6 mld"
            sub="previsto 2030"
          />
          <StatCard
            icon={<Briefcase className="w-5 h-5" />}
            label="Nuove assunzioni"
            value="94.000"
            sub="entro 2026"
          />
          <StatCard
            icon={<Brain className="w-5 h-5" />}
            label="Reskilling richiesto"
            value="59%"
            sub="forza lavoro entro 2030"
          />
          <StatCard
            icon={<Zap className="w-5 h-5" />}
            label="Premium AI skills"
            value="+20%"
            sub="stipendio vs non-AI"
          />
        </motion.div>

        {/* ═══ LA TESI: PERCHE MARKETING + MODA + AI ═══ */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-20"
        >
          <SectionTitle
            icon={<Lightbulb className="w-5 h-5" />}
            title="La tesi"
            subtitle="Perche questo incrocio e il piu potente che puoi scegliere oggi"
          />

          <div className="rounded-2xl border border-[var(--accent)]/20 bg-gradient-to-br from-[var(--accent)]/[0.03] to-amber-50/30 p-8 md:p-10">
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-pink-50 flex items-center justify-center mx-auto mb-4">
                  <Palette className="w-7 h-7 text-pink-500" />
                </div>
                <h3 className="font-semibold mb-2">Moda</h3>
                <p className="text-sm text-[var(--foreground-secondary)]">
                  Il gusto estetico, il senso per i trend, la comprensione del consumatore fashion.
                  Questo e il tuo <strong>DNA creativo</strong> — e l&apos;AI non lo puo replicare.
                </p>
              </div>
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center mx-auto mb-4">
                  <Target className="w-7 h-7 text-[var(--accent)]" />
                </div>
                <h3 className="font-semibold mb-2">Marketing</h3>
                <p className="text-sm text-[var(--foreground-secondary)]">
                  Strategia, dati, performance. Il marketing ti da il <strong>linguaggio del business</strong>
                  — senza non puoi parlare con chi decide i budget.
                </p>
              </div>
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-4">
                  <Bot className="w-7 h-7 text-violet-500" />
                </div>
                <h3 className="font-semibold mb-2">AI & Tech</h3>
                <p className="text-sm text-[var(--foreground-secondary)]">
                  Chi sa usare l&apos;AI nel marketing fashion guadagna <strong>+20% in piu</strong>.
                  Entro il 2030 non sara un vantaggio — sara un prerequisito.
                </p>
              </div>
            </div>

            <div className="section-divider mx-auto my-8" />

            <p className="text-center text-[var(--foreground-secondary)] max-w-[700px] mx-auto">
              <strong className="text-[var(--foreground)]">Il profilo vincente del 2030-2036</strong> tiene insieme
              tre dimensioni: pensiero creativo (moda), competenza operativa (marketing digital),
              e visione analitica (AI + dati). Chi ha solo una di queste sara facilmente sostituibile
              — dalla concorrenza umana o dall&apos;AI stessa.
            </p>
          </div>
        </motion.section>

        {/* ═══ UNIVERSITA ═══ */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-20"
        >
          <SectionTitle
            icon={<GraduationCap className="w-5 h-5" />}
            title="Le universita"
            subtitle="Facolta che combinano marketing, moda e preparazione al futuro"
          />

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            {(["triennali", "magistrali"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  activeTab === tab
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface-hover)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)]"
                }`}
              >
                {tab === "triennali" ? "Triennali (3 anni)" : "Magistrali & Master"}
              </button>
            ))}
          </div>

          {/* Cards grid */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid md:grid-cols-2 gap-4"
            >
              {(activeTab === "triennali" ? TRIENNALI : MAGISTRALI).map((uni, i) => (
                <UniCard key={uni.name + uni.program} uni={uni} index={i} />
              ))}
            </motion.div>
          </AnimatePresence>

          {/* Budget guide */}
          <div className="mt-8 rounded-2xl bg-[var(--background-secondary)] border border-[var(--border-subtle)] p-6">
            <h3 className="font-semibold text-sm text-[var(--foreground)] mb-4 flex items-center gap-2">
              <Euro className="w-4 h-4 text-[var(--accent)]" />
              Guida per budget
            </h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-emerald-600 mb-1.5">
                  Budget contenuto
                </div>
                <p className="text-sm text-[var(--foreground-secondary)]">
                  <strong>500 - 3.900 EUR/anno</strong>
                  <br />
                  Bologna (Rimini) + magistrale Fashion Studies, oppure Politecnico Milano.
                  Qualita altissima a costi pubblici.
                </p>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-blue-600 mb-1.5">
                  Budget medio
                </div>
                <p className="text-sm text-[var(--foreground-secondary)]">
                  <strong>3.600 - 10.000 EUR/anno</strong>
                  <br />
                  IULM triennale + magistrale Fashion Communication. Oppure Cattolica + Milan Fashion
                  Institute.
                </p>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-[var(--accent)] mb-1.5">
                  Budget alto
                </div>
                <p className="text-sm text-[var(--foreground-secondary)]">
                  <strong>8.800 - 25.000+ EUR/anno</strong>
                  <br />
                  IED (miglior rapporto), NABA (piu aggiornato), Polimoda (brand piu forte),
                  Marangoni (lusso puro).
                </p>
              </div>
            </div>
          </div>
        </motion.section>

        {/* ═══ CARRIERE DEL FUTURO ═══ */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-20"
        >
          <SectionTitle
            icon={<Rocket className="w-5 h-5" />}
            title="Carriere del futuro"
            subtitle="I ruoli che esisteranno (e pagheranno bene) nel 2030-2036"
          />

          <div className="space-y-4">
            {visibleCareers.map((career, i) => (
              <motion.div
                key={career.title}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.08 * i }}
                className="rounded-2xl border border-[var(--border)] bg-white p-6 hover:shadow-[var(--shadow-md)] transition-all"
              >
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  <div className="flex items-center gap-3 md:w-1/3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center shrink-0">
                      {career.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold text-[var(--foreground)] text-sm">{career.title}</h3>
                      <OutlookBadge outlook={career.outlook} />
                    </div>
                  </div>
                  <div className="md:w-2/3">
                    <p className="text-sm text-[var(--foreground-secondary)] mb-3">{career.description}</p>
                    <div className="flex flex-wrap gap-4 text-xs text-[var(--foreground-tertiary)] mb-3">
                      <span>
                        <strong className="text-[var(--foreground-secondary)]">Entry:</strong> {career.salaryEntry} EUR
                      </span>
                      <span>
                        <strong className="text-[var(--foreground-secondary)]">Senior:</strong> {career.salarySenior} EUR
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-xs bg-violet-50 text-violet-700 rounded-lg px-3 py-2">
                      <Bot className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{career.aiImpact}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {!showAllCareers && (
            <button
              onClick={() => setShowAllCareers(true)}
              className="mt-4 w-full py-3 rounded-xl bg-[var(--surface-hover)] text-sm text-[var(--foreground-secondary)] hover:text-[var(--accent)] transition-colors flex items-center justify-center gap-2"
            >
              Vedi tutti i {CAREER_PATHS.length} ruoli
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
        </motion.section>

        {/* ═══ COMPETENZE AI & FUTURO ═══ */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-20"
        >
          <SectionTitle
            icon={<Brain className="w-5 h-5" />}
            title="Competenze del futuro"
            subtitle="Le skill che faranno la differenza nei prossimi 10 anni"
          />

          <div className="space-y-3">
            {FUTURE_SKILLS.map((skill, i) => {
              const catColors: Record<string, { bg: string; text: string; bar: string }> = {
                ai: { bg: "bg-violet-50", text: "text-violet-600", bar: "bg-violet-400" },
                digital: { bg: "bg-blue-50", text: "text-blue-600", bar: "bg-blue-400" },
                creative: { bg: "bg-pink-50", text: "text-pink-600", bar: "bg-pink-400" },
                strategic: { bg: "bg-emerald-50", text: "text-emerald-600", bar: "bg-emerald-400" },
              };
              const cat = catColors[skill.category];

              return (
                <motion.div
                  key={skill.name}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.05 * i }}
                  className="rounded-xl border border-[var(--border-subtle)] p-4 hover:border-[var(--border)] transition-colors"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full ${cat.bg} ${cat.text}`}
                    >
                      {skill.category}
                    </span>
                    <h4 className="font-medium text-sm text-[var(--foreground)]">{skill.name}</h4>
                    <div className="ml-auto flex gap-0.5">
                      {Array.from({ length: 10 }).map((_, j) => (
                        <div
                          key={j}
                          className={`h-2 w-2 rounded-full ${j < skill.importance ? cat.bar : "bg-gray-100"}`}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-[var(--foreground-secondary)] ml-0">{skill.description}</p>
                </motion.div>
              );
            })}
          </div>
        </motion.section>

        {/* ═══ TABELLA STIPENDI ═══ */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-20"
        >
          <SectionTitle
            icon={<Euro className="w-5 h-5" />}
            title="Stipendi in Italia"
            subtitle="RAL (Retribuzione Annua Lorda) per livello di esperienza"
          />

          <div className="rounded-2xl border border-[var(--border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--background-secondary)]">
                    <th className="text-left px-5 py-3 font-medium text-[var(--foreground-secondary)]">Ruolo</th>
                    <th className="text-center px-4 py-3 font-medium text-[var(--foreground-secondary)]">
                      Entry (0-3 anni)
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-[var(--foreground-secondary)]">
                      Mid (3-5 anni)
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-[var(--foreground-secondary)]">
                      Senior (5-10 anni)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {SALARY_DATA.map((row, i) => (
                    <tr
                      key={row.role}
                      className={`border-t border-[var(--border-subtle)] ${
                        i % 2 === 0 ? "bg-white" : "bg-[var(--background-secondary)]/50"
                      }`}
                    >
                      <td className="px-5 py-3 font-medium text-[var(--foreground)]">{row.role}</td>
                      <td className="text-center px-4 py-3 text-[var(--foreground-secondary)]">{row.entry}</td>
                      <td className="text-center px-4 py-3 text-[var(--foreground-secondary)]">{row.mid}</td>
                      <td className="text-center px-4 py-3 font-medium text-[var(--foreground)]">{row.senior}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 bg-[var(--background-secondary)] border-t border-[var(--border-subtle)] text-xs text-[var(--foreground-tertiary)]">
              Milano paga +15-25% • Brand luxury internazionali +20-30% • Competenze AI +15-20% sulla RAL
            </div>
          </div>
        </motion.section>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* ═══ REAL ESTATE + AI — NUOVA SEZIONE ═══ */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-20"
        >
          <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-teal-50/30 p-8 md:p-10 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-700 text-sm font-medium mb-4">
              <Home className="w-4 h-4" />
              Nuovo settore per Pietro
            </div>
            <h2 className="font-serif text-3xl md:text-4xl text-[var(--foreground)] mb-3">
              Real Estate + AI
            </h2>
            <p className="text-[var(--foreground-secondary)] max-w-[600px] mx-auto">
              Il settore immobiliare sta vivendo la stessa rivoluzione che ha colpito la moda.
              L&apos;AI sta trasformando ogni aspetto: valutazione, gestione, sostenibilita.
              Un mercato da <strong>$303 miliardi</strong> che crescera a <strong>$989 miliardi entro il 2029</strong>.
            </p>
          </div>
        </motion.div>

        {/* ═══ RE KEY STATS ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-20"
        >
          {RE_MARKET_STATS.map((stat) => (
            <StatCard
              key={stat.label}
              icon={stat.icon}
              label={stat.label}
              value={stat.value}
              sub={stat.sub}
            />
          ))}
        </motion.div>

        {/* ═══ RE LA TESI ═══ */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-20"
        >
          <SectionTitle
            icon={<Lightbulb className="w-5 h-5" />}
            title="Perche Real Estate + AI"
            subtitle="Il settore immobiliare e il prossimo grande terreno di conquista dell'AI"
          />

          <div className="rounded-2xl border border-emerald-200/50 bg-gradient-to-br from-emerald-50/30 to-white p-8 md:p-10">
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                  <DollarSign className="w-7 h-7 text-emerald-600" />
                </div>
                <h3 className="font-semibold mb-2">Mercato gigantesco</h3>
                <p className="text-sm text-[var(--foreground-secondary)]">
                  Il PropTech ha raccolto <strong>$16.7 miliardi</strong> di investimenti nel 2025.
                  Le startup AI crescono al <strong>42% annuo</strong>, il doppio delle non-AI.
                </p>
              </div>
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center mx-auto mb-4">
                  <Cpu className="w-7 h-7 text-teal-600" />
                </div>
                <h3 className="font-semibold mb-2">Bassa maturita digitale</h3>
                <p className="text-sm text-[var(--foreground-secondary)]">
                  Il 60% delle aziende RE e <strong>impreparato</strong> per l&apos;AI.
                  Solo il 5% raggiunge i propri obiettivi AI. Chi entra ora ha un vantaggio enorme.
                </p>
              </div>
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                  <Landmark className="w-7 h-7 text-emerald-600" />
                </div>
                <h3 className="font-semibold mb-2">Italia in crescita</h3>
                <p className="text-sm text-[var(--foreground-secondary)]">
                  Investimenti RE Italia a <strong>12.5 miliardi</strong> (+23% YoY, secondo miglior risultato di sempre).
                  Milano hub data center europeo. Il 75% degli investitori italiani vede l&apos;AI come vantaggio pratico.
                </p>
              </div>
            </div>

            <div className="section-divider mx-auto my-8" />

            <p className="text-center text-[var(--foreground-secondary)] max-w-[700px] mx-auto">
              <strong className="text-[var(--foreground)]">L&apos;execution gap e l&apos;opportunita.</strong>{" "}
              Il 90% delle aziende RE sta testando AI, ma solo il 5% ottiene risultati concreti.
              Il problema non e la tecnologia — e la mancanza di persone che capiscano
              sia l&apos;immobiliare che l&apos;AI. Questo profilo ibrido e <strong>rarissimo e richiestissimo</strong>.
            </p>
          </div>
        </motion.section>

        {/* ═══ RE USE CASES ═══ */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-20"
        >
          <SectionTitle
            icon={<Cpu className="w-5 h-5" />}
            title="Come l'AI trasforma il Real Estate"
            subtitle="I 6 casi d'uso piu impattanti — e i numeri che li dimostrano"
          />

          <div className="space-y-4">
            {visibleUseCases.map((uc, i) => {
              const impactColors: Record<string, string> = {
                altissimo: "bg-emerald-50 text-emerald-700 border-emerald-200",
                alto: "bg-blue-50 text-blue-700 border-blue-200",
                emergente: "bg-violet-50 text-violet-700 border-violet-200",
                strategico: "bg-amber-50 text-amber-700 border-amber-200",
              };

              return (
                <motion.div
                  key={uc.title}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.08 * i }}
                  className="rounded-2xl border border-[var(--border)] bg-white p-6 hover:shadow-[var(--shadow-md)] transition-all"
                >
                  <div className="flex flex-col md:flex-row md:items-start gap-4">
                    <div className="flex items-center gap-3 md:w-1/3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                        {uc.icon}
                      </div>
                      <div>
                        <h3 className="font-semibold text-[var(--foreground)] text-sm">{uc.title}</h3>
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${impactColors[uc.impact] || impactColors.alto}`}>
                          {uc.impact}
                        </span>
                      </div>
                    </div>
                    <div className="md:w-2/3">
                      <p className="text-sm text-[var(--foreground-secondary)] mb-3">{uc.description}</p>
                      <div className="flex flex-wrap gap-2">
                        {uc.metrics.map((m) => (
                          <span key={m} className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full">
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {!showAllUseCases && (
            <button
              onClick={() => setShowAllUseCases(true)}
              className="mt-4 w-full py-3 rounded-xl bg-[var(--surface-hover)] text-sm text-[var(--foreground-secondary)] hover:text-emerald-600 transition-colors flex items-center justify-center gap-2"
            >
              Vedi tutti i {RE_USE_CASES.length} casi d&apos;uso
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
        </motion.section>

        {/* ═══ RE KEY PLAYERS ═══ */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-20"
        >
          <SectionTitle
            icon={<Globe className="w-5 h-5" />}
            title="Player e startup da seguire"
            subtitle="Le aziende che stanno ridefinendo il real estate con l'AI"
          />

          <div className="grid md:grid-cols-3 gap-4">
            {RE_KEY_PLAYERS.map((player, i) => (
              <motion.div
                key={player.name}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.05 * i }}
                className="rounded-2xl border border-[var(--border)] bg-white p-5 hover:shadow-[var(--shadow-md)] transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-[var(--foreground)]">{player.name}</h3>
                  <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                    {player.geo}
                  </span>
                </div>
                <p className="text-sm text-[var(--foreground-secondary)] mb-2">{player.desc}</p>
                <div className="text-xs font-medium text-emerald-600">{player.funding}</div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* ═══ RE CARRIERE ═══ */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-20"
        >
          <SectionTitle
            icon={<Rocket className="w-5 h-5" />}
            title="Carriere nel Real Estate + AI"
            subtitle="I ruoli emergenti piu richiesti nel PropTech"
          />

          <div className="space-y-4">
            {visibleRECareers.map((career, i) => (
              <motion.div
                key={career.title}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.08 * i }}
                className="rounded-2xl border border-[var(--border)] bg-white p-6 hover:shadow-[var(--shadow-md)] transition-all"
              >
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  <div className="flex items-center gap-3 md:w-1/3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                      {career.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold text-[var(--foreground)] text-sm">{career.title}</h3>
                      <OutlookBadge outlook={career.outlook} />
                    </div>
                  </div>
                  <div className="md:w-2/3">
                    <p className="text-sm text-[var(--foreground-secondary)] mb-3">{career.description}</p>
                    <div className="flex flex-wrap gap-4 text-xs text-[var(--foreground-tertiary)] mb-3">
                      <span>
                        <strong className="text-[var(--foreground-secondary)]">Entry:</strong> {career.salaryEntry} EUR
                      </span>
                      <span>
                        <strong className="text-[var(--foreground-secondary)]">Senior:</strong> {career.salarySenior} EUR
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-xs bg-emerald-50 text-emerald-700 rounded-lg px-3 py-2">
                      <Bot className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{career.aiImpact}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {!showAllRECareers && (
            <button
              onClick={() => setShowAllRECareers(true)}
              className="mt-4 w-full py-3 rounded-xl bg-[var(--surface-hover)] text-sm text-[var(--foreground-secondary)] hover:text-emerald-600 transition-colors flex items-center justify-center gap-2"
            >
              Vedi tutti i {RE_CAREER_PATHS.length} ruoli
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
        </motion.section>

        {/* ═══ RE TABELLA STIPENDI ═══ */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-20"
        >
          <SectionTitle
            icon={<Euro className="w-5 h-5" />}
            title="Stipendi Real Estate + AI in Italia"
            subtitle="RAL per livello di esperienza nei ruoli PropTech"
          />

          <div className="rounded-2xl border border-[var(--border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-emerald-50/50">
                    <th className="text-left px-5 py-3 font-medium text-[var(--foreground-secondary)]">Ruolo</th>
                    <th className="text-center px-4 py-3 font-medium text-[var(--foreground-secondary)]">
                      Entry (0-3 anni)
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-[var(--foreground-secondary)]">
                      Mid (3-5 anni)
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-[var(--foreground-secondary)]">
                      Senior (5-10 anni)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {RE_SALARY_DATA.map((row, i) => (
                    <tr
                      key={row.role}
                      className={`border-t border-[var(--border-subtle)] ${
                        i % 2 === 0 ? "bg-white" : "bg-emerald-50/20"
                      }`}
                    >
                      <td className="px-5 py-3 font-medium text-[var(--foreground)]">{row.role}</td>
                      <td className="text-center px-4 py-3 text-[var(--foreground-secondary)]">{row.entry}</td>
                      <td className="text-center px-4 py-3 text-[var(--foreground-secondary)]">{row.mid}</td>
                      <td className="text-center px-4 py-3 font-medium text-[var(--foreground)]">{row.senior}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 bg-emerald-50/30 border-t border-[var(--border-subtle)] text-xs text-[var(--foreground-tertiary)]">
              Milano paga +15-25% • REIT e fondi internazionali +20-40% • Competenze AI+PropTech +15-25% sulla RAL
            </div>
          </div>
        </motion.section>

        {/* ═══ RE SFIDE E BARRIERE ═══ */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-20"
        >
          <SectionTitle
            icon={<Shield className="w-5 h-5" />}
            title="Sfide e opportunita"
            subtitle="Cosa sapere prima di entrare nel PropTech"
          />

          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-red-100 bg-red-50/30 p-6">
              <h3 className="font-semibold text-red-700 mb-4 flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Barriere da conoscere
              </h3>
              <ul className="space-y-3">
                {[
                  { stat: "43%", text: "delle aziende RE manca di competenze AI interne" },
                  { stat: "44%", text: "dei comitati investimento non si fida dell'analisi AI" },
                  { stat: "60%", text: "delle aziende RE e impreparato per l'AI su larga scala" },
                  { stat: "5%", text: "raggiunge gli obiettivi AI dichiarati (execution gap)" },
                ].map((item) => (
                  <li key={item.stat} className="flex items-start gap-3 text-sm">
                    <span className="font-bold text-red-600 shrink-0 w-10 text-right">{item.stat}</span>
                    <span className="text-[var(--foreground-secondary)]">{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/30 p-6">
              <h3 className="font-semibold text-emerald-700 mb-4 flex items-center gap-2">
                <Rocket className="w-4 h-4" />
                Perche e un&apos;opportunita
              </h3>
              <ul className="space-y-3">
                {[
                  { stat: "82%", text: "degli agenti immobiliari gia usa strumenti AI" },
                  { stat: "72%", text: "delle aziende RE aumentera gli investimenti AI entro il 2026" },
                  { stat: "37%", text: "delle operazioni RE saranno automatizzabili ($34B di savings)" },
                  { stat: "42%", text: "di crescita annua per le PropTech AI-centered" },
                ].map((item) => (
                  <li key={item.stat} className="flex items-start gap-3 text-sm">
                    <span className="font-bold text-emerald-600 shrink-0 w-10 text-right">{item.stat}</span>
                    <span className="text-[var(--foreground-secondary)]">{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* EU Regulations callout */}
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/30 p-6">
            <h3 className="font-semibold text-amber-700 mb-2 flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Regolamentazione EU — da conoscere
            </h3>
            <div className="grid md:grid-cols-2 gap-4 text-sm text-[var(--foreground-secondary)]">
              <div>
                <strong className="text-[var(--foreground)]">EU AI Act (agosto 2026):</strong>{" "}
                I sistemi AI ad alto rischio (decisioni su credito, impiego, locazione) dovranno rispettare standard rigorosi.
                Sanzioni fino al 7% del fatturato globale — piu severe del GDPR.
              </div>
              <div>
                <strong className="text-[var(--foreground)]">Direttive ESG ed edifici green:</strong>{" "}
                Il 62% dei nuovi contratti commerciali include clausole green. Il Digital Product Passport EU sara obbligatorio.
                Chi combina RE + AI + compliance e il profilo piu ricercato.
              </div>
            </div>
          </div>
        </motion.section>

        {/* ═══ CONSIGLIO FINALE ═══ */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-16"
        >
          <SectionTitle
            icon={<Shield className="w-5 h-5" />}
            title="Il consiglio per Pietro"
            subtitle="La strategia concreta, dal primo anno alla carriera"
          />

          <div className="rounded-2xl border-2 border-[var(--accent)]/30 bg-gradient-to-br from-[var(--accent)]/[0.04] to-amber-50/40 p-8 md:p-10">
            <div className="space-y-8">
              {/* Percorso A */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-sm font-bold">
                    A
                  </div>
                  <h3 className="font-serif text-xl text-[var(--foreground)]">
                    Percorso Premium — Se il budget lo permette
                  </h3>
                </div>
                <div className="ml-10 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] flex items-center justify-center text-xs font-bold mt-0.5 shrink-0">
                      1
                    </div>
                    <div>
                      <p className="font-medium text-[var(--foreground)]">
                        Triennale: IED Milano — Fashion Marketing and Communication
                      </p>
                      <p className="text-sm text-[var(--foreground-secondary)]">
                        3 anni a Milano nel cuore del sistema moda. Project-based con aziende reali.
                        Miglior rapporto qualita/prezzo tra le private (da 8.800 EUR/anno).
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] flex items-center justify-center text-xs font-bold mt-0.5 shrink-0">
                      2
                    </div>
                    <div>
                      <p className="font-medium text-[var(--foreground)]">
                        Magistrale: Bologna — Fashion Studies (Strategic Management + Data Science)
                      </p>
                      <p className="text-sm text-[var(--foreground-secondary)]">
                        2 anni a Rimini, solo 500-2.800 EUR/anno. Include Omnichannel Marketing
                        e <strong>Data Science for Fashion</strong> — la competenza AI/tech che manca
                        ai profili puramente creativi.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] flex items-center justify-center text-xs font-bold mt-0.5 shrink-0">
                      3
                    </div>
                    <div>
                      <p className="font-medium text-[var(--foreground)]">
                        In parallelo: corsi AI e automazione (gratis o low-cost)
                      </p>
                      <p className="text-sm text-[var(--foreground-secondary)]">
                        Google AI Essentials, HubSpot Marketing Automation, Meta Blueprint.
                        Tutti gratuiti o sotto 50 EUR. Questo ti separa dal 90% dei competitor.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="section-divider mx-auto" />

              {/* Percorso B */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-bold">
                    B
                  </div>
                  <h3 className="font-serif text-xl text-[var(--foreground)]">
                    Percorso Smart — Massimo risultato, minimo costo
                  </h3>
                </div>
                <div className="ml-10 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center justify-center text-xs font-bold mt-0.5 shrink-0">
                      1
                    </div>
                    <div>
                      <p className="font-medium text-[var(--foreground)]">
                        Triennale: Bologna (Rimini) — Culture e Pratiche della Moda
                      </p>
                      <p className="text-sm text-[var(--foreground-secondary)]">
                        Unica triennale pubblica dedicata alla moda. Solo 500-2.800 EUR/anno.
                        Base culturale solida per capire il sistema moda.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center justify-center text-xs font-bold mt-0.5 shrink-0">
                      2
                    </div>
                    <div>
                      <p className="font-medium text-[var(--foreground)]">
                        Magistrale: stessa Bologna — Fashion Studies (Strategic Management)
                      </p>
                      <p className="text-sm text-[var(--foreground-secondary)]">
                        Continuita nello stesso ateneo, massima efficienza.
                        Data Science for Fashion + Omnichannel Marketing in inglese.
                        5 anni totali per meno del costo di 1 anno al Marangoni.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center justify-center text-xs font-bold mt-0.5 shrink-0">
                      3
                    </div>
                    <div>
                      <p className="font-medium text-[var(--foreground)]">
                        In parallelo: stesso stack AI + stage a Milano
                      </p>
                      <p className="text-sm text-[var(--foreground-secondary)]">
                        Lo stage in un brand o agenzia a Milano durante la magistrale
                        compensa il fatto di non aver studiato in una citta-moda.
                        Il pezzo di carta conta meno dell&apos;esperienza reale.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="section-divider mx-auto" />

              {/* Bottom line */}
              <div className="bg-white/80 rounded-xl p-6 border border-[var(--border-subtle)]">
                <h4 className="font-serif text-lg text-[var(--foreground)] mb-3 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-[var(--accent)]" />
                  Il punto chiave
                </h4>
                <p className="text-[var(--foreground-secondary)] leading-relaxed">
                  <strong className="text-[var(--foreground)]">Due settori, una strategia: competenze AI + dominio specifico.</strong>
                  {" "}Sia nella moda (38 miliardi in Italia) che nel real estate ($303 miliardi globali, +36% YoY),
                  il profilo piu ricercato e lo stesso: chi sa unire conoscenza di settore, pensiero strategico
                  e competenze AI. Il 59% della forza lavoro dovra fare reskilling entro il 2030.
                  L&apos;82% degli agenti immobiliari usa gia l&apos;AI, ma solo il 5% delle aziende RE raggiunge i propri obiettivi AI
                  — l&apos;execution gap e la tua opportunita. Che tu scelga moda, immobiliare o entrambi: la costante
                  e l&apos;AI. Fra 10 anni non sara un vantaggio — sara un prerequisito.
                </p>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Footer note */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center text-xs text-[var(--foreground-tertiary)] pb-8"
        >
          <p>
            Dati aggiornati a marzo 2026 — Fonti: McKinsey State of Fashion, PwC Emerging Trends RE,
            The Business Research Company, Cushman &amp; Wakefield Italy, Unioncamere, Glassdoor,
            Indeed, Michael Page, Crunchbase, siti ufficiali degli atenei.
          </p>
          <p className="mt-1">
            Realizzato con Controlla.me per Pietro
          </p>
        </motion.div>
      </div>
    </div>
  );
}
