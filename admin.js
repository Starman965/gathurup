import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);

// Function to load admin data
async function loadAdminData() {
    try {
        const usersRef = ref(database, 'users');
        const usersSnapshot = await get(usersRef);
        const usersData = usersSnapshot.val() || {};

        const totalUsers = Object.keys(usersData).length;
        const totalUsersElement = document.getElementById('totalUsers');
        if (totalUsersElement) {
            totalUsersElement.textContent = totalUsers;
        }

        let totalEvents = 0;
        let totalPeople = 0;

        Object.entries(usersData).forEach(([uid, userData]) => {
            totalEvents += Object.keys(userData.events || {}).length;
            totalPeople += Object.keys(userData.people || {}).length;
        });

        const totalEventsElement = document.getElementById('totalEvents');
        if (totalEventsElement) {
            totalEventsElement.textContent = totalEvents;
        }

        const totalPeopleElement = document.getElementById('totalPeople');
        if (totalPeopleElement) {
            totalPeopleElement.textContent = totalPeople;
        }
    } catch (error) {
        console.error('Error loading admin data:', error);
    }
}

// Initialize auth state observer
onAuthStateChanged(auth, (user) => {
    if (user && user.uid === 'kC82SNBlA8eeutg3JjpfPSSbjvs1') {
        loadAdminData();
    } else {
        window.location.href = 'login.html';
    }
});
