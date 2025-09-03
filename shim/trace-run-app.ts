import { AppRegistry } from "react-native";
const __orig = AppRegistry.runApplication;
AppRegistry.runApplication = (key, params) => {
  try { console.log("[RUNAPP]", key, new Error().stack); } catch {}
  return __orig(key, params);
};
