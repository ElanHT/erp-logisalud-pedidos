type Versioned = {
  vigenteDesde: string;
  vigenteHasta: string | null;
};

/**
 * Cierra la versión activa (vigenteHasta null) el día antes de que
 * empiece la nueva, y agrega la nueva como versión activa. Nunca
 * elimina la versión anterior. Refleja el mismo criterio que los
 * triggers de Postgres para product_tax_profiles, tax_configurations
 * y zone_assignments (ver supabase/migrations).
 */
export function applyNewVersion<T extends Versioned>(existing: T[], nueva: T): T[] {
  const cierre = dayBefore(nueva.vigenteDesde);
  const cerradas = existing.map((v) =>
    v.vigenteHasta === null ? { ...v, vigenteHasta: cierre } : v,
  );
  return [...cerradas, nueva];
}

function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
