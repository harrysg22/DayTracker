export type IdGenerator = () => string;

/**
 * UUID v4 vía expo-crypto. Nunca autoincrement: los IDs se generan en
 * cliente para dejar la puerta abierta a sync futuro sin colisiones.
 */
export function expoRandomUUID(): string {
  // Import perezoso: expo-crypto es un módulo nativo y no debe cargarse
  // en el entorno de test (Jest/Node), donde se inyecta otro IdGenerator.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Crypto = require("expo-crypto");
  return Crypto.randomUUID();
}
