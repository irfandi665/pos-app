import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Store, Check, MapPin, Lock } from 'lucide-react';
import { useSession } from '../context/SessionContext';

export default function OutletSwitcher() {
  const { outlets, activeOutlet, activeOutletId, canSwitchOutlet, switchOutlet } = useSession();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (!outlets.length) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
        <Store className="w-3.5 h-3.5 text-slate-400" />
        Belum ada outlet
      </span>
    );
  }

  const selected = activeOutlet || outlets.find((outlet) => outlet.id === activeOutletId) || outlets[0];

  const handleSelect = (outlet) => {
    if (outlet.id === selected.id) {
      setOpen(false);
      return;
    }
    if (outlet.is_active === false) return;

    const confirmed = window.confirm(
      `Pindah ke ${outlet.name}? Data yang belum disimpan pada tampilan saat ini akan hilang.`
    );
    if (!confirmed) return;

    if (switchOutlet(outlet.id)) {
      setOpen(false);
    }
  };

  if (!canSwitchOutlet) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[11px] text-slate-500"
        title="Akun Anda hanya diotorisasi untuk satu outlet"
      >
        <Store className="w-3.5 h-3.5 text-slate-400" />
        <span className="font-medium text-slate-600">{selected.name}</span>
        <span className="font-mono text-[10px] text-slate-400">{selected.code}</span>
      </span>
    );
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Ganti outlet aktif"
        className="inline-flex items-center gap-2 max-w-[280px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[11px] text-slate-700 transition"
      >
        <Store className="w-3.5 h-3.5 text-brand-600 shrink-0" />
        <span className="font-semibold truncate">{selected.name}</span>
        <span className="font-mono text-[10px] text-slate-400 shrink-0">{selected.code}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Pilih outlet aktif"
          className="absolute left-0 mt-2 w-80 max-w-[85vw] bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Outlet yang dapat diakses ({outlets.length})
            </p>
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {outlets.map((outlet) => {
              const isActive = outlet.id === selected.id;
              const disabled = outlet.is_active === false;
              return (
                <li key={outlet.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    disabled={disabled}
                    onClick={() => handleSelect(outlet)}
                    className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition ${
                      disabled
                        ? 'opacity-50 cursor-not-allowed'
                        : isActive
                          ? 'bg-brand-50'
                          : 'hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                        isActive ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {disabled ? <Lock className="w-3.5 h-3.5" /> : <Store className="w-3.5 h-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-800 truncate">{outlet.name}</span>
                        {isActive && <Check className="w-3.5 h-3.5 text-brand-600 shrink-0" />}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400">
                        <span className="font-mono">{outlet.code}</span>
                        <span>•</span>
                        <MapPin className="w-3 h-3" />
                        <span className="truncate">{outlet.address || 'Alamat belum diisi'}</span>
                      </span>
                      {outlet.is_active === false && (
                        <span className="text-[10px] font-bold text-amber-600">Nonaktif</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
