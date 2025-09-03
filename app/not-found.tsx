// app/+not-found.tsx
import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Oops!</Text>
      <Text style={styles.subtitle}>This screen does not exist.</Text>
      <Link href="/profile" style={styles.link}>
        Go to Profile
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  title: {
    fontSize: 32,
    color: '#B00020',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 24,
  },
  link: {
    fontSize: 16,
    color: '#1E88E5',
  },
});