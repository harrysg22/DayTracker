/** @type {import('jest').Config} */
module.exports = {
  // La capa de datos (Fase 0) corre sobre better-sqlite3 en Node puro,
  // sin necesidad del entorno RN de jest-expo.
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/**/__tests__/**/*.test.ts"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  transform: {
    "^.+\\.(t|j)sx?$": "babel-jest",
  },
};
