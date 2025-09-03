import { StyleSheet, Text, View } from 'react-native';

const RED = '#f70000';
const BLACK = '#000';

export default function Placeholder() {
  return (
    <View style={s.screen}>
      <Text style={s.title}>COMING SOON</Text>
      <Text style={s.sub}>This screen hasn’t been built yet.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BLACK, alignItems: 'center', justifyContent: 'center', padding: 16 },
  title: { color: '#fff', fontWeight: '900', letterSpacing: 1, fontSize: 18 },
  sub: { color: '#aaa', fontWeight: '700', marginTop: 6 },
});
