module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // Permite `import sql from './0000_init.sql'` como string plano,
    // requerido por el runner de migraciones de drizzle-orm/expo-sqlite.
    plugins: [["inline-import", { extensions: [".sql"] }]],
  };
};
