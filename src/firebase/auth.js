import { signInWithEmailAndPassword, signOut, setPersistence, browserSessionPersistence } from "firebase/auth";
import { auth } from "./config";

export const signIn = async (email, password) => {
  await setPersistence(auth, browserSessionPersistence);
  return await signInWithEmailAndPassword(auth, email, password);
};

export const signOutUser = async () => {
  return await signOut(auth);
};
