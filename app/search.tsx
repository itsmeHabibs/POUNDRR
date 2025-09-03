import { StyleSheet, Text, View } from 'react-native';

export default function GlobalSearch() {
  return (
    <View style={s.screen}>
      <Text style={s.txt}>SEARCH</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  txt: { color: '#777', fontWeight: '900', letterSpacing: 1 },
});
