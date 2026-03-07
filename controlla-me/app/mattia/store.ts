import { create } from "zustand";

// ─── Types ──────────────────────────────────────────────
export type ItemCategory =
  | "abbigliamento"
  | "scarpe"
  | "accessori"
  | "elettronica"
  | "casa"
  | "altro";

export type ItemCondition = "nuovo" | "come_nuovo" | "buono" | "usato";

export type ItemStatus = "disponibile" | "prenotato" | "in_vendita" | "venduto";

export type UserRole = "venditore" | "broker";

export type TabFilter = "tutti" | ItemStatus;

export interface SvuotaloItem {
  id: string;
  images: string[];
  name: string;
  description: string;
  category: ItemCategory;
  condition: ItemCondition;
  minPrice: number;
  askingPrice: number | null;
  soldPrice: number | null;
  status: ItemStatus;
  createdAt: number;
  claimedAt: number | null;
  listedAt: number | null;
  soldAt: number | null;
}

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

// ─── Config maps ────────────────────────────────────────
export const CATEGORIES: Record<ItemCategory, { label: string; emoji: string }> = {
  abbigliamento: { label: "Abbigliamento", emoji: "👕" },
  scarpe: { label: "Scarpe", emoji: "👟" },
  accessori: { label: "Accessori", emoji: "👜" },
  elettronica: { label: "Elettronica", emoji: "📱" },
  casa: { label: "Casa", emoji: "🏠" },
  altro: { label: "Altro", emoji: "📦" },
};

export const CONDITIONS: Record<ItemCondition, { label: string; color: string }> = {
  nuovo: { label: "Nuovo con cartellino", color: "#00C48C" },
  come_nuovo: { label: "Come nuovo", color: "#6C5CE7" },
  buono: { label: "Buone condizioni", color: "#FFC832" },
  usato: { label: "Usato", color: "#FF6B6B" },
};

export const STATUS_CONFIG: Record<ItemStatus, { label: string; color: string; bg: string }> = {
  disponibile: { label: "Disponibile", color: "#00C48C", bg: "rgba(0,196,140,0.15)" },
  prenotato: { label: "Prenotato", color: "#6C5CE7", bg: "rgba(108,92,231,0.15)" },
  in_vendita: { label: "In vendita", color: "#FFC832", bg: "rgba(255,200,50,0.15)" },
  venduto: { label: "Venduto", color: "#FF6B6B", bg: "rgba(255,107,107,0.15)" },
};

// ─── Placeholder SVG images for demo items ──────────────
function makePlaceholder(emoji: string, bg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect fill="${bg}" width="400" height="400" rx="12"/><text x="200" y="210" fill="white" font-size="80" text-anchor="middle">${emoji}</text></svg>`
  )}`;
}

const DEMO_ITEMS: SvuotaloItem[] = [
  {
    id: "demo-1",
    images: [makePlaceholder("🧥", "#2D2D44"), makePlaceholder("🏷️", "#3D3D5C")],
    name: "Giacca North Face Nuptse",
    description: "Taglia M, nera, usata 2 inverni. Imbottitura perfetta, nessuno strappo.",
    category: "abbigliamento",
    condition: "buono",
    minPrice: 85,
    askingPrice: 130,
    soldPrice: 120,
    status: "venduto",
    createdAt: Date.now() - 86400000 * 5,
    claimedAt: Date.now() - 86400000 * 4,
    listedAt: Date.now() - 86400000 * 3,
    soldAt: Date.now() - 86400000 * 1,
  },
  {
    id: "demo-2",
    images: [makePlaceholder("👟", "#1A1A2E")],
    name: "Nike Air Max 90",
    description: "Numero 43, bianche/grigie, ottime condizioni. Scatola originale inclusa.",
    category: "scarpe",
    condition: "come_nuovo",
    minPrice: 45,
    askingPrice: 65,
    soldPrice: null,
    status: "in_vendita",
    createdAt: Date.now() - 86400000 * 3,
    claimedAt: Date.now() - 86400000 * 2,
    listedAt: Date.now() - 86400000 * 1,
    soldAt: null,
  },
  {
    id: "demo-3",
    images: [makePlaceholder("🎒", "#2D2D44")],
    name: "Zaino Eastpak Padded",
    description: "Nero classico, usato 1 anno. Nessun difetto, zip funzionanti.",
    category: "accessori",
    condition: "buono",
    minPrice: 15,
    askingPrice: null,
    soldPrice: null,
    status: "prenotato",
    createdAt: Date.now() - 86400000 * 2,
    claimedAt: Date.now() - 86400000 * 1,
    listedAt: null,
    soldAt: null,
  },
  {
    id: "demo-4",
    images: [makePlaceholder("👕", "#6C5CE7"), makePlaceholder("📐", "#4834D4")],
    name: "Felpa Champion Reverse Weave",
    description: "Taglia L, logo grande ricamato, vintage anni 90. Bordeaux intenso, cotone pesante.",
    category: "abbigliamento",
    condition: "buono",
    minPrice: 30,
    askingPrice: null,
    soldPrice: null,
    status: "disponibile",
    createdAt: Date.now() - 86400000,
    claimedAt: null,
    listedAt: null,
    soldAt: null,
  },
  {
    id: "demo-5",
    images: [makePlaceholder("👖", "#1A1A2E")],
    name: "Jeans Levi's 501",
    description: "W32 L32, lavaggio chiaro, slim fit. Indossati 5 volte, come nuovi.",
    category: "abbigliamento",
    condition: "come_nuovo",
    minPrice: 22,
    askingPrice: null,
    soldPrice: null,
    status: "disponibile",
    createdAt: Date.now() - 3600000,
    claimedAt: null,
    listedAt: null,
    soldAt: null,
  },
  {
    id: "demo-6",
    images: [makePlaceholder("🎧", "#2D2D44"), makePlaceholder("🔋", "#3D3D5C")],
    name: "AirPods Pro 2",
    description: "Custodia USB-C, usati 6 mesi. Batteria 92%. Punte di ricambio originali.",
    category: "elettronica",
    condition: "buono",
    minPrice: 120,
    askingPrice: null,
    soldPrice: null,
    status: "disponibile",
    createdAt: Date.now(),
    claimedAt: null,
    listedAt: null,
    soldAt: null,
  },
];

// ─── Store interface ────────────────────────────────────
interface SvuotaloStore {
  // Data
  items: SvuotaloItem[];
  role: UserRole;
  commissionRate: number;

  // UI
  activeTab: TabFilter;
  searchQuery: string;
  categoryFilter: ItemCategory | "tutti";
  showAddModal: boolean;
  showInspector: boolean;
  showSoldModal: string | null;
  showPriceModal: string | null;
  showDetailModal: string | null;
  toasts: Toast[];

  // Item actions
  addItem: (data: {
    images: string[];
    name: string;
    description: string;
    category: ItemCategory;
    condition: ItemCondition;
    minPrice: number;
  }) => void;
  removeItem: (id: string) => void;
  claimItem: (id: string) => void;
  unclaimItem: (id: string) => void;
  setAskingPrice: (id: string, price: number) => void;
  markInVendita: (id: string) => void;
  markVenduto: (id: string, soldPrice: number) => void;

  // UI actions
  setRole: (role: UserRole) => void;
  setActiveTab: (tab: TabFilter) => void;
  setSearchQuery: (q: string) => void;
  setCategoryFilter: (c: ItemCategory | "tutti") => void;
  toggleAddModal: () => void;
  toggleInspector: () => void;
  setShowSoldModal: (id: string | null) => void;
  setShowPriceModal: (id: string | null) => void;
  setShowDetailModal: (id: string | null) => void;
  addToast: (message: string, type: Toast["type"]) => void;
  removeToast: (id: string) => void;
  resetDemo: () => void;
}

// ─── Store ──────────────────────────────────────────────
export const useStore = create<SvuotaloStore>((set, get) => ({
  items: DEMO_ITEMS,
  role: "venditore",
  commissionRate: 0.25,
  activeTab: "tutti",
  searchQuery: "",
  categoryFilter: "tutti",
  showAddModal: false,
  showInspector: false,
  showSoldModal: null,
  showPriceModal: null,
  showDetailModal: null,
  toasts: [],

  addItem: (data) =>
    set((s) => ({
      items: [
        {
          ...data,
          id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          askingPrice: null,
          soldPrice: null,
          status: "disponibile" as const,
          createdAt: Date.now(),
          claimedAt: null,
          listedAt: null,
          soldAt: null,
        },
        ...s.items,
      ],
      showAddModal: false,
    })),

  removeItem: (id) => {
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    get().addToast("Oggetto rimosso", "info");
  },

  claimItem: (id) => {
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id ? { ...i, status: "prenotato" as const, claimedAt: Date.now() } : i
      ),
    }));
    get().addToast("Preso in carico!", "success");
  },

  unclaimItem: (id) => {
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id
          ? { ...i, status: "disponibile" as const, claimedAt: null, askingPrice: null }
          : i
      ),
    }));
    get().addToast("Oggetto rilasciato", "info");
  },

  setAskingPrice: (id, price) => {
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, askingPrice: price } : i)),
      showPriceModal: null,
    }));
    get().addToast(`Prezzo impostato: \u20AC${price}`, "success");
  },

  markInVendita: (id) => {
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id ? { ...i, status: "in_vendita" as const, listedAt: Date.now() } : i
      ),
    }));
    get().addToast("In vendita su Vinted!", "success");
  },

  markVenduto: (id, soldPrice) => {
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id ? { ...i, status: "venduto" as const, soldPrice, soldAt: Date.now() } : i
      ),
      showSoldModal: null,
    }));
    get().addToast(`Venduto a \u20AC${soldPrice}!`, "success");
  },

  setRole: (role) => set({ role }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setCategoryFilter: (categoryFilter) => set({ categoryFilter }),
  toggleAddModal: () => set((s) => ({ showAddModal: !s.showAddModal })),
  toggleInspector: () => set((s) => ({ showInspector: !s.showInspector })),
  setShowSoldModal: (showSoldModal) => set({ showSoldModal }),
  setShowPriceModal: (showPriceModal) => set({ showPriceModal }),
  setShowDetailModal: (showDetailModal) => set({ showDetailModal }),

  addToast: (message, type) =>
    set((s) => ({
      toasts: [...s.toasts, { id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, message, type }],
    })),
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  resetDemo: () =>
    set({
      items: DEMO_ITEMS,
      role: "venditore",
      activeTab: "tutti",
      searchQuery: "",
      categoryFilter: "tutti",
      showAddModal: false,
      showSoldModal: null,
      showPriceModal: null,
      showDetailModal: null,
    }),
}));

// ─── Selectors ──────────────────────────────────────────
export const selectFilteredItems = (s: SvuotaloStore) => {
  let items = s.items;
  if (s.activeTab !== "tutti") items = items.filter((i) => i.status === s.activeTab);
  if (s.categoryFilter !== "tutti") items = items.filter((i) => i.category === s.categoryFilter);
  if (s.searchQuery) {
    const q = s.searchQuery.toLowerCase();
    items = items.filter(
      (i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)
    );
  }
  return items;
};

export const selectCounts = (s: SvuotaloStore) => ({
  total: s.items.length,
  disponibile: s.items.filter((i) => i.status === "disponibile").length,
  prenotato: s.items.filter((i) => i.status === "prenotato").length,
  in_vendita: s.items.filter((i) => i.status === "in_vendita").length,
  venduto: s.items.filter((i) => i.status === "venduto").length,
});

export const selectBrokerEarnings = (s: SvuotaloStore) =>
  s.items
    .filter((i) => i.status === "venduto" && i.soldPrice)
    .reduce((sum, i) => sum + i.soldPrice! * s.commissionRate, 0);

export const selectSellerEarnings = (s: SvuotaloStore) =>
  s.items
    .filter((i) => i.status === "venduto" && i.soldPrice)
    .reduce((sum, i) => sum + i.soldPrice! * (1 - s.commissionRate), 0);

export const selectTotalRevenue = (s: SvuotaloStore) =>
  s.items
    .filter((i) => i.status === "venduto" && i.soldPrice)
    .reduce((sum, i) => sum + i.soldPrice!, 0);
