// Mismo proyecto de Firebase que el panel interno. Esta clave es pública (de cliente),
// no es secreta — lo que protege los datos son las reglas de Firestore, no esta clave.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app = initializeApp({
  apiKey:"AIzaSyBdw_kkoaFUKGl2HX4FfUEV-I-0SR0n1go",
  authDomain:"mi-stock-ropa.firebaseapp.com",
  projectId:"mi-stock-ropa",
  storageBucket:"mi-stock-ropa.firebasestorage.app",
  messagingSenderId:"517134595094",
  appId:"1:517134595094:web:f3ce949a1ef8d09d5db137"
});

export const db = getFirestore(app);
export { collection, doc, onSnapshot };
