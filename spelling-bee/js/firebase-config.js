const firebaseConfig = {
  apiKey: "AIzaSyCAuKEJiUebMERVgwnbnnMTeXOMz_krMJ8",
  authDomain: "student-portal-db-a7de2.firebaseapp.com",
  projectId: "student-portal-db-a7de2",
  storageBucket: "student-portal-db-a7de2.firebasestorage.app",
  messagingSenderId: "350750585839",
  appId: "1:350750585839:web:8ed101b8a94b4553cbc1a",
  databaseURL: "https://student-portal-db-a7de2-default-rtdb.firebaseio.com"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const spellingRef = db.ref("spelling_bee");