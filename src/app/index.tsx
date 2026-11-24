import { StyleSheet, Text, View } from 'react-native';

// Pantalla provisional hasta la Fase 4 (login y navegación por rol).
export default function Inicio() {
  return (
    <View style={styles.contenedor}>
      <Text style={styles.titulo}>Control Electoral</Text>
      <Text style={styles.texto}>Configuración inicial lista.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  titulo: { fontSize: 24, fontWeight: '700' },
  texto: { fontSize: 18, marginTop: 8 },
});
