import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { ensureDbReady } from './src/db';

export default function App() {
  const [dbError, setDbError] = useState<Error | null>(null);
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    ensureDbReady()
      .then(() => setDbReady(true))
      .catch(setDbError);
  }, []);

  return (
    <View style={styles.container}>
      {dbError ? (
        <Text>Error abriendo la base de datos: {dbError.message}</Text>
      ) : (
        <Text>
          {dbReady
            ? 'Base de datos lista (Fase 0). UI llega en Fase 1.'
            : 'Abriendo base de datos…'}
        </Text>
      )}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
