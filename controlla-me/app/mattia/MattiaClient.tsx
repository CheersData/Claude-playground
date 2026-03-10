"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useShallow } from "zustand/react/shallow";
import {
  Plus,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Package,
  Camera,
  RotateCcw,
  Eye,
  DollarSign,
  HandCoins,
  ShoppingBag,
  Tag,
  Clock,
  Loader2,
  Settings,
  CheckCircle,
  AlertCircle,
  Info,
} from "lucide-react";
import {
  useStore,
  CATEGORIES,
  CONDITIONS,
  STATUS_CONFIG,
  selectFilteredItems,
  selectCounts,
  selectBrokerEarnings,
  selectSellerEarnings,
  selectTotalRevenue,
  type ItemCategory,
  type ItemCondition,
  type SvuotaloItem,
  type TabFilter,
} from "./store";

// ─── Palette ────────────────────────────────────────────
const C = {
  bg: "#0F0F1A",
  surface: "#1A1A2E",
  surfaceHover: "#252540",
  border: "#2D2D44",
  borderLight: "#3D3D5C",
  text: "#F0F0F0",
  textMuted: "#8888AA",
  textDim: "#555577",
  primary: "#6C5CE7",
  primaryLight: "#A29BFE",
  success: "#00C48C",
  accent: "#FF6B6B",
  gold: "#FFC832",
  white: "#FFFFFF",
};

// ─── Image compression ─────────────────────────────────
async function compressImage(file: File, maxW = 800, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = document.createElement("img");
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > maxW) {
        h = Math.round((h * maxW) / w);
        w = maxW;
      }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Errore caricamento immagine"));
    };
    img.src = url;
  });
}

// ─── Time formatting ────────────────────────────────────
function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ora";
  if (mins < 60) return `${mins}min fa`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h fa`;
  const days = Math.floor(hrs / 24);
  return `${days}g fa`;
}

// ═══════════════════════════════════════════════════════
// APP HEADER
// ═══════════════════════════════════════════════════════
function AppHeader() {
  const role = useStore((s) => s.role);
  const setRole = useStore((s) => s.setRole);
  const toggleAddModal = useStore((s) => s.toggleAddModal);
  const resetDemo = useStore((s) => s.resetDemo);

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-xl border-b"
      style={{ background: `${C.bg}ee`, borderColor: C.border }}
    >
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 shrink-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-bold"
            style={{ background: C.primary, color: C.white }}
          >
            S
          </div>
          <div className="hidden sm:block">
            <h1 className="text-base font-bold leading-tight" style={{ color: C.text }}>
              Svuotalo
            </h1>
            <p className="text-[11px] leading-tight" style={{ color: C.textMuted }}>
              Tu svuoti. Noi vendiamo.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            className="flex rounded-xl p-1"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
          >
            {(["venditore", "broker"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className="px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all"
                style={{
                  background: role === r ? C.primary : "transparent",
                  color: role === r ? C.white : C.textMuted,
                }}
              >
                {r === "venditore" ? "Venditore" : "Broker"}
              </button>
            ))}
          </div>

          <button
            onClick={resetDemo}
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: C.surface, color: C.textMuted, border: `1px solid ${C.border}` }}
            title="Reset demo"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {role === "venditore" && (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              onClick={toggleAddModal}
              className="h-9 px-4 rounded-xl flex items-center gap-1.5 text-sm font-semibold shrink-0"
              style={{ background: C.success, color: C.white }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Aggiungi</span>
            </motion.button>
          )}
        </div>
      </div>
    </header>
  );
}

// ═══════════════════════════════════════════════════════
// TAB BAR
// ═══════════════════════════════════════════════════════
function TabBar() {
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const counts = useStore(useShallow(selectCounts));

  const tabs: { key: TabFilter; label: string; count: number }[] = [
    { key: "tutti", label: "Tutti", count: counts.total },
    { key: "disponibile", label: "Disponibili", count: counts.disponibile },
    { key: "prenotato", label: "Prenotati", count: counts.prenotato },
    { key: "in_vendita", label: "In vendita", count: counts.in_vendita },
    { key: "venduto", label: "Venduti", count: counts.venduto },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto py-4 scrollbar-none">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => setActiveTab(t.key)}
          className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap transition-all"
          style={{
            background: activeTab === t.key ? C.primary : C.surface,
            color: activeTab === t.key ? C.white : C.textMuted,
            border: `1px solid ${activeTab === t.key ? C.primary : C.border}`,
          }}
        >
          {t.label}
          <span
            className="text-[10px] sm:text-xs px-1.5 py-0.5 rounded-md"
            style={{
              background: activeTab === t.key ? "rgba(255,255,255,0.2)" : C.border,
            }}
          >
            {t.count}
          </span>
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// SEARCH & FILTER BAR
// ═══════════════════════════════════════════════════════
function SearchFilterBar() {
  const searchQuery = useStore((s) => s.searchQuery);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const categoryFilter = useStore((s) => s.categoryFilter);
  const setCategoryFilter = useStore((s) => s.setCategoryFilter);

  return (
    <div className="flex gap-2 sm:gap-3 mb-4">
      <div className="flex-1 relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
          style={{ color: C.textDim }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Cerca oggetti..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-colors"
          style={{
            background: C.surface,
            color: C.text,
            border: `1px solid ${C.border}`,
          }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <X className="w-3.5 h-3.5" style={{ color: C.textDim }} />
          </button>
        )}
      </div>
      <select
        value={categoryFilter}
        onChange={(e) => setCategoryFilter(e.target.value as ItemCategory | "tutti")}
        className="px-3 py-2.5 rounded-xl text-sm outline-none cursor-pointer shrink-0"
        style={{ background: C.surface, color: C.text, border: `1px solid ${C.border}` }}
      >
        <option value="tutti">Tutte</option>
        {Object.entries(CATEGORIES).map(([k, v]) => (
          <option key={k} value={k}>
            {v.emoji} {v.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// IMAGE UPLOADER (within AddItemModal)
// ═══════════════════════════════════════════════════════
function ImageUploader({
  images,
  onChange,
  max = 4,
}: {
  images: string[];
  onChange: (imgs: string[]) => void;
  max?: number;
}) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const remaining = max - images.length;
      if (remaining <= 0) return;
      const valid = Array.from(files)
        .filter((f) => f.type.startsWith("image/"))
        .slice(0, remaining);
      if (valid.length === 0) return;
      setLoading(true);
      try {
        const compressed = await Promise.all(valid.map((f) => compressImage(f)));
        onChange([...images, ...compressed]);
      } catch {
        /* skip failed images */
      }
      setLoading(false);
    },
    [images, onChange, max]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const removeImage = (idx: number) => {
    onChange(images.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <div
        onClick={() => !loading && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className="rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all"
        style={{
          borderColor: dragging ? C.primary : C.border,
          background: dragging ? `${C.primary}10` : "transparent",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {loading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: C.primary }} />
            <p className="text-sm" style={{ color: C.textMuted }}>
              Comprimo le foto...
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Camera className="w-8 h-8" style={{ color: C.textDim }} />
            <p className="text-sm" style={{ color: C.textMuted }}>
              {images.length === 0
                ? "Trascina le foto qui o clicca per caricare"
                : `${images.length}/${max} foto \u2014 aggiungi altre`}
            </p>
            <p className="text-xs" style={{ color: C.textDim }}>
              JPG, PNG, WebP \u2014 max {max} foto
            </p>
          </div>
        )}
      </div>

      {images.length > 0 && (
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {images.map((src, i) => (
            <div key={i} className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeImage(i);
                }}
                className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: C.accent, color: C.white }}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ADD ITEM MODAL
// ═══════════════════════════════════════════════════════
function AddItemModal() {
  const showAddModal = useStore((s) => s.showAddModal);
  const toggleAddModal = useStore((s) => s.toggleAddModal);
  const addItem = useStore((s) => s.addItem);
  const addToast = useStore((s) => s.addToast);

  const [images, setImages] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ItemCategory | "">("");
  const [condition, setCondition] = useState<ItemCondition | "">("");
  const [minPrice, setMinPrice] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form state when modal closes — valid pattern for form cleanup.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!showAddModal) {
      setImages([]);
      setName("");
      setDescription("");
      setCategory("");
      setCondition("");
      setMinPrice("");
      setErrors({});
    }
  }, [showAddModal]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const validate = () => {
    const e: Record<string, string> = {};
    if (images.length === 0) e.images = "Aggiungi almeno una foto";
    if (name.trim().length < 3) e.name = "Min 3 caratteri";
    if (description.trim().length < 10) e.description = "Min 10 caratteri";
    if (!category) e.category = "Seleziona una categoria";
    if (!condition) e.condition = "Seleziona la condizione";
    const p = parseFloat(minPrice);
    if (!p || p <= 0) e.minPrice = "Inserisci un prezzo valido";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    addItem({
      images,
      name: name.trim(),
      description: description.trim(),
      category: category as ItemCategory,
      condition: condition as ItemCondition,
      minPrice: parseFloat(minPrice),
    });
    addToast("Oggetto pubblicato!", "success");
  };

  return (
    <AnimatePresence>
      {showAddModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-16 px-4 overflow-y-auto"
          onClick={toggleAddModal}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            className="relative z-10 rounded-2xl p-5 sm:p-6 w-full max-w-lg mb-16"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold" style={{ color: C.text }}>
                Nuovo oggetto
              </h2>
              <button
                onClick={toggleAddModal}
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: C.border, color: C.textMuted }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Photos */}
            <div className="mb-4">
              <label className="text-sm font-medium mb-2 block" style={{ color: C.text }}>
                Foto *
              </label>
              <ImageUploader images={images} onChange={setImages} />
              {errors.images && (
                <p className="text-xs mt-1" style={{ color: C.accent }}>
                  {errors.images}
                </p>
              )}
            </div>

            {/* Name */}
            <div className="mb-4">
              <label className="text-sm font-medium mb-1 block" style={{ color: C.text }}>
                Nome *
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="es. Giacca North Face Nuptse"
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{
                  background: C.bg,
                  color: C.text,
                  border: `1px solid ${errors.name ? C.accent : C.border}`,
                }}
              />
              {errors.name && (
                <p className="text-xs mt-1" style={{ color: C.accent }}>
                  {errors.name}
                </p>
              )}
            </div>

            {/* Description */}
            <div className="mb-4">
              <label className="text-sm font-medium mb-1 block" style={{ color: C.text }}>
                Descrizione *
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Taglia, colore, difetti, condizioni..."
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
                style={{
                  background: C.bg,
                  color: C.text,
                  border: `1px solid ${errors.description ? C.accent : C.border}`,
                }}
              />
              {errors.description && (
                <p className="text-xs mt-1" style={{ color: C.accent }}>
                  {errors.description}
                </p>
              )}
            </div>

            {/* Category chips */}
            <div className="mb-4">
              <label className="text-sm font-medium mb-2 block" style={{ color: C.text }}>
                Categoria *
              </label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(CATEGORIES).map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => setCategory(k as ItemCategory)}
                    className="px-3 py-1.5 rounded-lg text-sm transition-all"
                    style={{
                      background: category === k ? C.primary : C.bg,
                      color: category === k ? C.white : C.textMuted,
                      border: `1px solid ${category === k ? C.primary : C.border}`,
                    }}
                  >
                    {v.emoji} {v.label}
                  </button>
                ))}
              </div>
              {errors.category && (
                <p className="text-xs mt-1" style={{ color: C.accent }}>
                  {errors.category}
                </p>
              )}
            </div>

            {/* Condition chips */}
            <div className="mb-4">
              <label className="text-sm font-medium mb-2 block" style={{ color: C.text }}>
                Condizione *
              </label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(CONDITIONS).map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => setCondition(k as ItemCondition)}
                    className="px-3 py-1.5 rounded-lg text-sm transition-all"
                    style={{
                      background: condition === k ? v.color : C.bg,
                      color: condition === k ? C.white : C.textMuted,
                      border: `1px solid ${condition === k ? v.color : C.border}`,
                    }}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              {errors.condition && (
                <p className="text-xs mt-1" style={{ color: C.accent }}>
                  {errors.condition}
                </p>
              )}
            </div>

            {/* Min price */}
            <div className="mb-6">
              <label className="text-sm font-medium mb-1 block" style={{ color: C.text }}>
                Prezzo minimo *
              </label>
              <div className="relative">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold"
                  style={{ color: C.textDim }}
                >
                  &euro;
                </span>
                <input
                  type="number"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.50"
                  className="w-full pl-8 pr-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{
                    background: C.bg,
                    color: C.text,
                    border: `1px solid ${errors.minPrice ? C.accent : C.border}`,
                  }}
                />
              </div>
              {errors.minPrice && (
                <p className="text-xs mt-1" style={{ color: C.accent }}>
                  {errors.minPrice}
                </p>
              )}
              <p className="text-xs mt-1" style={{ color: C.textDim }}>
                Il prezzo minimo che accetti. Il broker vende a di pi&ugrave;.
              </p>
            </div>

            {/* Submit */}
            <motion.button
              onClick={handleSubmit}
              className="w-full py-3 rounded-xl font-bold text-sm"
              style={{ background: C.success, color: C.white }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
            >
              Pubblica oggetto
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════
// ITEM CARD
// ═══════════════════════════════════════════════════════
function ItemCard({ item }: { item: SvuotaloItem }) {
  const role = useStore((s) => s.role);
  const claimItem = useStore((s) => s.claimItem);
  const unclaimItem = useStore((s) => s.unclaimItem);
  const markInVendita = useStore((s) => s.markInVendita);
  const removeItem = useStore((s) => s.removeItem);
  const setShowSoldModal = useStore((s) => s.setShowSoldModal);
  const setShowPriceModal = useStore((s) => s.setShowPriceModal);
  const setShowDetailModal = useStore((s) => s.setShowDetailModal);
  const commissionRate = useStore((s) => s.commissionRate);

  const [imgIdx, setImgIdx] = useState(0);
  const statusCfg = STATUS_CONFIG[item.status];
  const catCfg = CATEGORIES[item.category];
  const condCfg = CONDITIONS[item.condition];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{ background: C.surface, border: `1px solid ${C.border}` }}
    >
      {/* Image area */}
      <div
        className="relative aspect-[4/3] overflow-hidden cursor-pointer group"
        onClick={() => setShowDetailModal(item.id)}
      >
        {item.images.length > 0 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.images[imgIdx]}
            alt={item.name}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: C.border }}
          >
            <Camera className="w-10 h-10" style={{ color: C.textDim }} />
          </div>
        )}

        {/* Image navigation arrows */}
        {item.images.length > 1 && (
          <>
            {imgIdx > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setImgIdx((i) => i - 1);
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "rgba(0,0,0,0.6)", color: C.white }}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            {imgIdx < item.images.length - 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setImgIdx((i) => i + 1);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "rgba(0,0,0,0.6)", color: C.white }}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
              {item.images.map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full transition-all"
                  style={{
                    background: i === imgIdx ? C.white : "rgba(255,255,255,0.4)",
                    transform: i === imgIdx ? "scale(1.3)" : "scale(1)",
                  }}
                />
              ))}
            </div>
          </>
        )}

        {/* Photo count badge */}
        {item.images.length > 1 && (
          <div
            className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md flex items-center gap-1 text-[10px] font-bold"
            style={{ background: "rgba(0,0,0,0.6)", color: C.white }}
          >
            <Camera className="w-3 h-3" />
            {item.images.length}
          </div>
        )}

        {/* Status badge */}
        <div
          className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
          style={{ background: statusCfg.bg, color: statusCfg.color }}
        >
          {statusCfg.label}
        </div>
      </div>

      {/* Info section */}
      <div className="p-3 flex flex-col flex-1">
        <h3 className="text-sm font-bold mb-1 line-clamp-1" style={{ color: C.text }}>
          {item.name}
        </h3>
        <p
          className="text-xs mb-2 line-clamp-2 flex-1"
          style={{ color: C.textMuted, lineHeight: 1.5 }}
        >
          {item.description}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mb-2">
          <span
            className="text-[10px] px-2 py-0.5 rounded-md"
            style={{ background: `${C.primary}20`, color: C.primaryLight }}
          >
            {catCfg.emoji} {catCfg.label}
          </span>
          <span
            className="text-[10px] px-2 py-0.5 rounded-md"
            style={{ background: `${condCfg.color}20`, color: condCfg.color }}
          >
            {condCfg.label}
          </span>
        </div>

        {/* Prices */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-bold" style={{ color: C.gold }}>
            &euro;{item.minPrice}
          </span>
          {item.askingPrice && (
            <span className="text-xs" style={{ color: C.textMuted }}>
              &rarr; &euro;{item.askingPrice}
            </span>
          )}
          {item.soldPrice && (
            <span className="text-xs font-bold" style={{ color: C.success }}>
              Venduto &euro;{item.soldPrice}
            </span>
          )}
        </div>

        {/* Timestamp */}
        <div className="flex items-center gap-1 mb-3">
          <Clock className="w-3 h-3" style={{ color: C.textDim }} />
          <span className="text-[10px]" style={{ color: C.textDim }}>
            {timeAgo(item.createdAt)}
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-auto">
          {/* SELLER actions */}
          {role === "venditore" && item.status === "disponibile" && (
            <>
              <button
                onClick={() => setShowDetailModal(item.id)}
                className="flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1"
                style={{ background: C.bg, color: C.textMuted, border: `1px solid ${C.border}` }}
              >
                <Eye className="w-3.5 h-3.5" /> Dettagli
              </button>
              <button
                onClick={() => removeItem(item.id)}
                className="py-2 px-3 rounded-lg text-xs"
                style={{ background: `${C.accent}20`, color: C.accent }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {role === "venditore" && item.status !== "disponibile" && (
            <button
              onClick={() => setShowDetailModal(item.id)}
              className="flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1"
              style={{ background: C.bg, color: C.textMuted, border: `1px solid ${C.border}` }}
            >
              <Eye className="w-3.5 h-3.5" /> Vedi stato
            </button>
          )}

          {/* BROKER actions */}
          {role === "broker" && item.status === "disponibile" && (
            <motion.button
              onClick={() => claimItem(item.id)}
              className="flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1"
              style={{ background: C.primary, color: C.white }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <HandCoins className="w-3.5 h-3.5" /> Prendi in carico
            </motion.button>
          )}

          {role === "broker" && item.status === "prenotato" && (
            <>
              {!item.askingPrice ? (
                <button
                  onClick={() => setShowPriceModal(item.id)}
                  className="flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1"
                  style={{ background: C.gold, color: C.bg }}
                >
                  <Tag className="w-3.5 h-3.5" /> Imposta prezzo
                </button>
              ) : (
                <button
                  onClick={() => markInVendita(item.id)}
                  className="flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1"
                  style={{ background: C.success, color: C.white }}
                >
                  <ShoppingBag className="w-3.5 h-3.5" /> Metti in vendita
                </button>
              )}
              <button
                onClick={() => unclaimItem(item.id)}
                className="py-2 px-3 rounded-lg text-xs"
                style={{ background: `${C.accent}20`, color: C.accent }}
                title="Rilascia"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {role === "broker" && item.status === "in_vendita" && (
            <motion.button
              onClick={() => setShowSoldModal(item.id)}
              className="flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1"
              style={{ background: C.success, color: C.white }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <CheckCircle className="w-3.5 h-3.5" /> Venduto!
            </motion.button>
          )}

          {role === "broker" && item.status === "venduto" && item.soldPrice && (
            <div
              className="flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2"
              style={{ background: `${C.success}15`, color: C.success }}
            >
              <HandCoins className="w-3.5 h-3.5" />
              Commissione: &euro;{(item.soldPrice * commissionRate).toFixed(2)}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════
// EMPTY STATE
// ═══════════════════════════════════════════════════════
function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Package className="w-12 h-12 mb-4" style={{ color: C.textDim }} />
      <p className="text-base font-medium mb-1" style={{ color: C.textMuted }}>
        {message}
      </p>
      {sub && (
        <p className="text-sm" style={{ color: C.textDim }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ITEM GRID
// ═══════════════════════════════════════════════════════
function ItemGrid() {
  const items = useStore(useShallow(selectFilteredItems));
  const role = useStore((s) => s.role);
  const toggleAddModal = useStore((s) => s.toggleAddModal);

  if (items.length === 0) {
    return (
      <EmptyState
        message="Nessun oggetto trovato"
        sub="Prova a cambiare i filtri o aggiungi un nuovo oggetto"
      />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {role === "venditore" && (
        <motion.button
          onClick={toggleAddModal}
          className="rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 min-h-[280px] transition-colors"
          style={{ borderColor: C.border, color: C.textDim }}
          whileHover={{ borderColor: C.primary, color: C.primary } as Record<string, string>}
        >
          <Plus className="w-10 h-10" />
          <span className="text-sm font-medium">Aggiungi oggetto</span>
        </motion.button>
      )}

      <AnimatePresence mode="popLayout">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} />
        ))}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// PRICE MODAL (broker sets asking price)
// ═══════════════════════════════════════════════════════
function PriceModal() {
  const showPriceModal = useStore((s) => s.showPriceModal);
  const setShowPriceModal = useStore((s) => s.setShowPriceModal);
  const setAskingPrice = useStore((s) => s.setAskingPrice);
  const item = useStore((s) =>
    showPriceModal ? s.items.find((i) => i.id === showPriceModal) : null
  );

  const [price, setPrice] = useState("");
  const [error, setError] = useState("");

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!showPriceModal) {
      setPrice("");
      setError("");
    }
  }, [showPriceModal]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSubmit = () => {
    const p = parseFloat(price);
    if (!p || p <= 0) {
      setError("Inserisci un prezzo valido");
      return;
    }
    if (item && p < item.minPrice) {
      setError(`Minimo \u20AC${item.minPrice} (richiesta venditore)`);
      return;
    }
    if (showPriceModal) setAskingPrice(showPriceModal, p);
  };

  return (
    <AnimatePresence>
      {showPriceModal && item && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          onClick={() => setShowPriceModal(null)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            className="relative z-10 rounded-2xl p-6 w-full max-w-sm"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold mb-1" style={{ color: C.text }}>
              Imposta prezzo di vendita
            </h3>
            <p className="text-xs mb-4" style={{ color: C.textMuted }}>
              {item.name} &mdash; Minimo: &euro;{item.minPrice}
            </p>

            <div className="relative mb-2">
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold"
                style={{ color: C.textDim }}
              >
                &euro;
              </span>
              <input
                type="number"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value);
                  setError("");
                }}
                placeholder={`min ${item.minPrice}`}
                min={item.minPrice}
                step="0.50"
                className="w-full pl-8 pr-4 py-3 rounded-xl text-sm outline-none"
                style={{
                  background: C.bg,
                  color: C.text,
                  border: `1px solid ${error ? C.accent : C.border}`,
                }}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              />
            </div>
            {error && (
              <p className="text-xs mb-3" style={{ color: C.accent }}>
                {error}
              </p>
            )}
            {price && parseFloat(price) > 0 && (
              <p className="text-xs mb-3" style={{ color: C.textMuted }}>
                Commissione: &euro;{(parseFloat(price) * 0.25).toFixed(2)} &mdash; Venditore: &euro;
                {(parseFloat(price) * 0.75).toFixed(2)}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowPriceModal(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: C.bg, color: C.textMuted, border: `1px solid ${C.border}` }}
              >
                Annulla
              </button>
              <motion.button
                onClick={handleSubmit}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                style={{ background: C.gold, color: C.bg }}
                whileTap={{ scale: 0.98 }}
              >
                Conferma
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════
// SOLD MODAL (broker enters sold price)
// ═══════════════════════════════════════════════════════
function SoldModal() {
  const showSoldModal = useStore((s) => s.showSoldModal);
  const setShowSoldModal = useStore((s) => s.setShowSoldModal);
  const markVenduto = useStore((s) => s.markVenduto);
  const item = useStore((s) =>
    showSoldModal ? s.items.find((i) => i.id === showSoldModal) : null
  );

  const [price, setPrice] = useState("");
  const [error, setError] = useState("");

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!showSoldModal) {
      setPrice("");
      setError("");
    } else if (item?.askingPrice) {
      setPrice(String(item.askingPrice));
    }
  }, [showSoldModal, item?.askingPrice]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSubmit = () => {
    const p = parseFloat(price);
    if (!p || p <= 0) {
      setError("Inserisci il prezzo di vendita");
      return;
    }
    if (showSoldModal) markVenduto(showSoldModal, p);
  };

  return (
    <AnimatePresence>
      {showSoldModal && item && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          onClick={() => setShowSoldModal(null)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            className="relative z-10 rounded-2xl p-6 w-full max-w-sm"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold mb-1" style={{ color: C.text }}>
              Conferma vendita
            </h3>
            <p className="text-xs mb-4" style={{ color: C.textMuted }}>
              {item.name}
              {item.askingPrice ? ` \u2014 Listino: \u20AC${item.askingPrice}` : ""}
            </p>

            <div className="relative mb-2">
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold"
                style={{ color: C.textDim }}
              >
                &euro;
              </span>
              <input
                type="number"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value);
                  setError("");
                }}
                placeholder="Prezzo vendita effettivo"
                min="0"
                step="0.50"
                className="w-full pl-8 pr-4 py-3 rounded-xl text-sm outline-none"
                style={{
                  background: C.bg,
                  color: C.text,
                  border: `1px solid ${error ? C.accent : C.border}`,
                }}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              />
            </div>
            {error && (
              <p className="text-xs mb-3" style={{ color: C.accent }}>
                {error}
              </p>
            )}
            {price && parseFloat(price) > 0 && (
              <div
                className="rounded-xl p-3 mb-3 space-y-1"
                style={{ background: C.bg, border: `1px solid ${C.border}` }}
              >
                <div className="flex justify-between text-xs">
                  <span style={{ color: C.textMuted }}>Prezzo vendita</span>
                  <span style={{ color: C.text }}>&euro;{parseFloat(price).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: C.textMuted }}>Commissione (25%)</span>
                  <span style={{ color: C.success }}>
                    &euro;{(parseFloat(price) * 0.25).toFixed(2)}
                  </span>
                </div>
                <div
                  className="flex justify-between text-xs font-bold pt-1 border-t"
                  style={{ borderColor: C.border }}
                >
                  <span style={{ color: C.textMuted }}>Al venditore (75%)</span>
                  <span style={{ color: C.gold }}>
                    &euro;{(parseFloat(price) * 0.75).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowSoldModal(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: C.bg, color: C.textMuted, border: `1px solid ${C.border}` }}
              >
                Annulla
              </button>
              <motion.button
                onClick={handleSubmit}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                style={{ background: C.success, color: C.white }}
                whileTap={{ scale: 0.98 }}
              >
                Conferma vendita
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════
// DETAIL MODAL (full item view)
// ═══════════════════════════════════════════════════════
function DetailModal() {
  const showDetailModal = useStore((s) => s.showDetailModal);
  const setShowDetailModal = useStore((s) => s.setShowDetailModal);
  const item = useStore((s) =>
    showDetailModal ? s.items.find((i) => i.id === showDetailModal) : null
  );
  const commissionRate = useStore((s) => s.commissionRate);
  const [imgIdx, setImgIdx] = useState(0);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setImgIdx(0);
  }, [showDetailModal]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <AnimatePresence>
      {showDetailModal && item && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-8 sm:pt-12 px-4 overflow-y-auto"
          onClick={() => setShowDetailModal(null)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            className="relative z-10 rounded-2xl w-full max-w-lg mb-16 overflow-hidden"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Images */}
            <div className="relative aspect-[4/3]">
              {item.images.length > 0 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.images[imgIdx]}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ background: C.border }}
                >
                  <Camera className="w-16 h-16" style={{ color: C.textDim }} />
                </div>
              )}

              <button
                onClick={() => setShowDetailModal(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.6)", color: C.white }}
              >
                <X className="w-4 h-4" />
              </button>

              {item.images.length > 1 && (
                <>
                  {imgIdx > 0 && (
                    <button
                      onClick={() => setImgIdx((i) => i - 1)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(0,0,0,0.6)", color: C.white }}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                  )}
                  {imgIdx < item.images.length - 1 && (
                    <button
                      onClick={() => setImgIdx((i) => i + 1)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(0,0,0,0.6)", color: C.white }}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  )}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {item.images.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setImgIdx(i)}
                        className="w-2 h-2 rounded-full transition-all"
                        style={{
                          background: i === imgIdx ? C.white : "rgba(255,255,255,0.4)",
                          transform: i === imgIdx ? "scale(1.4)" : "scale(1)",
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Details */}
            <div className="p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <h2 className="text-lg font-bold" style={{ color: C.text }}>
                  {item.name}
                </h2>
                <span
                  className="px-2 py-0.5 rounded-md text-xs font-bold uppercase shrink-0"
                  style={{
                    background: STATUS_CONFIG[item.status].bg,
                    color: STATUS_CONFIG[item.status].color,
                  }}
                >
                  {STATUS_CONFIG[item.status].label}
                </span>
              </div>

              <p className="text-sm mb-4" style={{ color: C.textMuted, lineHeight: 1.7 }}>
                {item.description}
              </p>

              <div className="flex flex-wrap gap-2 mb-4">
                <span
                  className="text-xs px-2.5 py-1 rounded-lg"
                  style={{ background: `${C.primary}20`, color: C.primaryLight }}
                >
                  {CATEGORIES[item.category].emoji} {CATEGORIES[item.category].label}
                </span>
                <span
                  className="text-xs px-2.5 py-1 rounded-lg"
                  style={{
                    background: `${CONDITIONS[item.condition].color}20`,
                    color: CONDITIONS[item.condition].color,
                  }}
                >
                  {CONDITIONS[item.condition].label}
                </span>
              </div>

              {/* Price breakdown */}
              <div
                className="rounded-xl p-4 space-y-2"
                style={{ background: C.bg, border: `1px solid ${C.border}` }}
              >
                <div className="flex justify-between text-sm">
                  <span style={{ color: C.textMuted }}>Prezzo minimo</span>
                  <span className="font-bold" style={{ color: C.gold }}>
                    &euro;{item.minPrice}
                  </span>
                </div>
                {item.askingPrice && (
                  <div className="flex justify-between text-sm">
                    <span style={{ color: C.textMuted }}>Prezzo in vendita</span>
                    <span className="font-bold" style={{ color: C.text }}>
                      &euro;{item.askingPrice}
                    </span>
                  </div>
                )}
                {item.soldPrice && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: C.textMuted }}>Venduto a</span>
                      <span className="font-bold" style={{ color: C.success }}>
                        &euro;{item.soldPrice}
                      </span>
                    </div>
                    <div
                      className="border-t pt-2 mt-2 space-y-1"
                      style={{ borderColor: C.border }}
                    >
                      <div className="flex justify-between text-xs">
                        <span style={{ color: C.textMuted }}>Commissione broker (25%)</span>
                        <span style={{ color: C.success }}>
                          &euro;{(item.soldPrice * commissionRate).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span style={{ color: C.textMuted }}>Incasso venditore (75%)</span>
                        <span style={{ color: C.gold }}>
                          &euro;{(item.soldPrice * (1 - commissionRate)).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Timeline */}
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium" style={{ color: C.textMuted }}>
                  Timeline
                </p>
                {[
                  { label: "Pubblicato", ts: item.createdAt, always: true },
                  { label: "Preso in carico", ts: item.claimedAt, always: false },
                  { label: "Messo in vendita", ts: item.listedAt, always: false },
                  { label: "Venduto", ts: item.soldAt, always: false },
                ]
                  .filter((step) => step.always || step.ts)
                  .map((step, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: step.ts ? C.success : C.textDim }}
                      />
                      <span
                        className="text-xs"
                        style={{ color: step.ts ? C.text : C.textDim }}
                      >
                        {step.label}
                      </span>
                      {step.ts && (
                        <span className="text-[10px] ml-auto" style={{ color: C.textDim }}>
                          {timeAgo(step.ts)}
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════
// STATS SECTION
// ═══════════════════════════════════════════════════════
function StatsSection() {
  const counts = useStore(useShallow(selectCounts));
  const brokerEarnings = useStore(selectBrokerEarnings);
  const sellerEarnings = useStore(selectSellerEarnings);
  const totalRevenue = useStore(selectTotalRevenue);
  const role = useStore((s) => s.role);

  const stats =
    role === "broker"
      ? [
          { label: "Oggetti totali", value: String(counts.total), icon: Package, color: C.primary },
          { label: "In vendita", value: String(counts.in_vendita), icon: ShoppingBag, color: C.gold },
          { label: "Venduti", value: String(counts.venduto), icon: CheckCircle, color: C.success },
          { label: "Commissioni", value: `\u20AC${brokerEarnings.toFixed(2)}`, icon: HandCoins, color: C.success },
        ]
      : [
          { label: "I miei oggetti", value: String(counts.total), icon: Package, color: C.primary },
          { label: "Disponibili", value: String(counts.disponibile), icon: Tag, color: C.primaryLight },
          { label: "Venduti", value: String(counts.venduto), icon: CheckCircle, color: C.success },
          { label: "Incassato", value: `\u20AC${sellerEarnings.toFixed(2)}`, icon: DollarSign, color: C.gold },
        ];

  return (
    <section className="mt-8 mb-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="rounded-xl p-4"
              style={{ background: C.surface, border: `1px solid ${C.border}` }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4" style={{ color: s.color }} />
                <span className="text-[11px]" style={{ color: C.textMuted }}>
                  {s.label}
                </span>
              </div>
              <p className="text-xl font-bold" style={{ color: s.color }}>
                {s.value}
              </p>
            </div>
          );
        })}
      </div>
      {totalRevenue > 0 && (
        <div
          className="mt-3 rounded-xl p-3 flex items-center justify-between"
          style={{ background: `${C.success}10`, border: `1px solid ${C.success}30` }}
        >
          <span className="text-xs" style={{ color: C.textMuted }}>
            Revenue totale
          </span>
          <span className="text-sm font-bold" style={{ color: C.success }}>
            &euro;{totalRevenue.toFixed(2)}
          </span>
        </div>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════
// TOAST CONTAINER
// ═══════════════════════════════════════════════════════
function ToastContainer() {
  const toasts = useStore((s) => s.toasts);
  const removeToast = useStore((s) => s.removeToast);
  const scheduled = useRef(new Set<string>());

  useEffect(() => {
    toasts.forEach((t) => {
      if (!scheduled.current.has(t.id)) {
        scheduled.current.add(t.id);
        setTimeout(() => {
          removeToast(t.id);
          scheduled.current.delete(t.id);
        }, 3000);
      }
    });
  }, [toasts, removeToast]);

  const iconMap = {
    success: <CheckCircle className="w-4 h-4" style={{ color: C.success }} />,
    error: <AlertCircle className="w-4 h-4" style={{ color: C.accent }} />,
    info: <Info className="w-4 h-4" style={{ color: C.primaryLight }} />,
  };

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-xs">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 80, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80, scale: 0.9 }}
            className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm shadow-lg"
            style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text }}
          >
            {iconMap[t.type]}
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ZUSTAND INSPECTOR
// ═══════════════════════════════════════════════════════
function ZustandInspector() {
  const showInspector = useStore((s) => s.showInspector);
  const toggleInspector = useStore((s) => s.toggleInspector);
  const storeState = useStore();
  const counts = useStore(useShallow(selectCounts));
  const earnings = useStore(selectBrokerEarnings);

  const snapshot = {
    role: storeState.role,
    commissionRate: storeState.commissionRate,
    activeTab: storeState.activeTab,
    searchQuery: storeState.searchQuery || "(vuoto)",
    categoryFilter: storeState.categoryFilter,
    counts,
    brokerEarnings: `\u20AC${earnings.toFixed(2)}`,
    itemCount: storeState.items.length,
    items: storeState.items.map((i) => ({
      id: i.id.slice(0, 12),
      name: i.name,
      status: i.status,
      minPrice: i.minPrice,
      askingPrice: i.askingPrice,
      soldPrice: i.soldPrice,
      images: `${i.images.length} foto`,
    })),
    modals: {
      addModal: storeState.showAddModal,
      priceModal: storeState.showPriceModal,
      soldModal: storeState.showSoldModal,
      detailModal: storeState.showDetailModal,
    },
  };

  return (
    <>
      <motion.button
        onClick={toggleInspector}
        className="fixed bottom-4 left-4 z-[60] w-10 h-10 rounded-full flex items-center justify-center shadow-lg"
        style={{
          background: showInspector ? C.primary : C.surface,
          color: showInspector ? C.white : C.textMuted,
          border: `1px solid ${showInspector ? C.primary : C.border}`,
        }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        title="Zustand Inspector"
      >
        <Settings className="w-5 h-5" />
      </motion.button>

      <AnimatePresence>
        {showInspector && (
          <motion.div
            initial={{ opacity: 0, x: -300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -300 }}
            className="fixed left-4 bottom-16 z-[60] w-80 max-h-[70vh] overflow-y-auto rounded-2xl shadow-2xl"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
          >
            <div
              className="sticky top-0 p-3 border-b flex items-center justify-between"
              style={{ background: C.surface, borderColor: C.border }}
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: C.success }} />
                <span className="text-xs font-bold" style={{ color: C.text }}>
                  Zustand Store (live)
                </span>
              </div>
              <span className="text-[10px]" style={{ color: C.textDim }}>
                Poimandres
              </span>
            </div>
            <pre
              className="p-3 text-[11px] leading-relaxed overflow-x-auto"
              style={{ color: C.primaryLight }}
            >
              {JSON.stringify(snapshot, null, 2)}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════
export default function MattiaClient() {
  return (
    <div className="min-h-screen" style={{ background: C.bg }}>
      <AppHeader />

      <main className="max-w-6xl mx-auto px-4 pb-24">
        {/* Hero mini */}
        <div className="text-center py-8 sm:py-12">
          <h1
            className="text-3xl sm:text-4xl font-bold mb-2"
            style={{
              background: `linear-gradient(135deg, ${C.primary}, ${C.primaryLight}, ${C.gold})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Svuotalo
          </h1>
          <p className="text-sm sm:text-base" style={{ color: C.textMuted }}>
            Tu svuoti l&apos;armadio. Il broker lo vende su Vinted. Tu incassi.
          </p>
          <p className="text-xs mt-1" style={{ color: C.textDim }}>
            75% a te, 25% al broker. Zero sbatta.
          </p>
        </div>

        <TabBar />
        <SearchFilterBar />
        <ItemGrid />
        <StatsSection />
      </main>

      {/* Modals */}
      <AddItemModal />
      <PriceModal />
      <SoldModal />
      <DetailModal />

      {/* Overlay UI */}
      <ToastContainer />
      <ZustandInspector />
    </div>
  );
}
