import { describe, expect, it } from "vitest";
import { applyNewVersion } from "@/domain/versioning";

describe("applyNewVersion", () => {
  it("no elimina la versión anterior al versionar (ej. cambio de tratamiento tributario)", () => {
    const historial = [{ vigenteDesde: "2024-01-01", vigenteHasta: null, valor: "INAFECTO" }];

    const resultado = applyNewVersion(historial, {
      vigenteDesde: "2026-01-01",
      vigenteHasta: null,
      valor: "GRAVADO",
    });

    expect(resultado).toHaveLength(2);
    expect(resultado[0]).toMatchObject({ valor: "INAFECTO", vigenteHasta: "2025-12-31" });
    expect(resultado[1]).toMatchObject({ valor: "GRAVADO", vigenteHasta: null });
  });

  it("solo cierra la versión que estaba activa, no una ya cerrada", () => {
    const historial = [
      { vigenteDesde: "2020-01-01", vigenteHasta: "2023-12-31", valor: "GRAVADO" },
      { vigenteDesde: "2024-01-01", vigenteHasta: null, valor: "INAFECTO" },
    ];

    const resultado = applyNewVersion(historial, {
      vigenteDesde: "2026-01-01",
      vigenteHasta: null,
      valor: "GRAVADO",
    });

    expect(resultado).toHaveLength(3);
    expect(resultado[0].vigenteHasta).toBe("2023-12-31");
    expect(resultado[1].vigenteHasta).toBe("2025-12-31");
  });
});
