// // File: app/(tabs)/party/PartyParticipantList.tsx

// import { FlatList, Text, View } from 'react-native';
// import styles from './partyStyles';

// interface Props {
//   participants: string[];
// }

// export default function PartyParticipantList({ participants }: Props) {
//   return (
//     <View style={styles.participantCard}>
//       <Text style={styles.participantTitle}>Participants</Text>
//       <FlatList
//         data={participants}
//         keyExtractor={(item) => item}
//         renderItem={({ item, index }) => (
//           <Text style={styles.participantName}>
//             {index + 1}. {item}
//           </Text>
//         )}
//       />
//     </View>
//   );
// }


// import { FlatList, Text, View } from 'react-native';
// import styles from './partyStyles';

// export default function PartyParticipantList({ participants }: { participants: string[] }) {
//   return (
//     <View style={styles.participantCard}>
//       <Text style={styles.participantTitle}>👥 Participants</Text>
//       <FlatList
//         data={participants}
//         keyExtractor={(item, idx) => `${item}-${idx}`}
//         renderItem={({ item }) => <Text style={styles.participantName}>{item}</Text>}
//       />
//     </View>
//   );
// }


// File: app/(tabs)/party/PartyParticipantList.tsx

import { FlatList, Text, View } from "react-native";
import styles from "./partyStyles";

type Props = {
  participants: string[];
};

export default function PartyParticipantList({ participants }: Props) {
  return (
    <View style={styles.participantBox}>
      <Text style={styles.subTitle}>👥 Participants</Text>
      <FlatList
        data={participants}
        keyExtractor={(item, index) => `${item}-${index}`}
        renderItem={({ item }) => (
          <Text style={styles.participantItem}>{item}</Text>
        )}
      />
    </View>
  );
}

