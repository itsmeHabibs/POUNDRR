// app/(tabs)/socials/reels/styles.ts
import { StyleSheet, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

export default StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  reelContainer: {
    width,
    height,
    justifyContent: 'flex-end',
  },
  video: {
    width,
    height,
  },
  overlay: {
    position: 'absolute',
    bottom: 80,
    left: 20,
  },
  username: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
    marginBottom: 8,
  },
  description: {
    color: '#ddd',
    fontSize: 14,
    marginBottom: 12,
  },
  actions: {
    position: 'absolute',
    right: 20,
    bottom: 100,
    alignItems: 'center',
  },
  actionBtn: {
    marginVertical: 10,
    alignItems: 'center',
  },
  actionText: {
    color: '#fff',
    fontSize: 14,
    marginTop: 4,
  },
  commentContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  commentInputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 40,
  },
  sendBtn: {
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#007bff',
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  sendBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  uploadContainer: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  uploadBtn: {
    backgroundColor: '#007bff',
    padding: 14,
    borderRadius: 8,
    marginTop: 20,
    alignItems: 'center',
  },
  uploadBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
