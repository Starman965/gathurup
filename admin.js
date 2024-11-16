import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);


async function loadAdminData() {
    try {
        const usersRef = ref(database, 'users');
        const usersSnapshot = await get(usersRef);
        const users = usersSnapshot.val() || {};

        // Calculate statistics
        const totalUsers = Object.keys(users).length;
        let totalEvents = 0;
        let totalPeople = 0;
        let activeThisWeek = 0;
        const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

        const recentUsers = [];
        
        for (const [uid, userData] of Object.entries(users)) {
            // Count events
            if (userData.events) {
                totalEvents += Object.keys(userData.events).length;
            }
            
            // Count people
            if (userData.people) {
                totalPeople += Object.keys(userData.people).length;
            }

            // Check last activity
            if (userData.lastActive && userData.lastActive > oneWeekAgo) {
                activeThisWeek++;
            }

            // Collect recent user data
            recentUsers.push({
                name: userData.displayName || 'Anonymous',
                email: userData.email || 'No email',
                joined: userData.joined || 'Unknown',
                eventCount: userData.events ? Object.keys(userData.events).length : 0
            });
        }

        // Update UI
        document.getElementById('totalUsers').textContent = totalUsers;
        document.getElementById('totalEvents').textContent = totalEvents;
        document.getElementById('totalPeople').textContent = totalPeople;
        document.getElementById('activeUsers').textContent = activeThisWeek;

        // Render recent users table
        const tbody = document.querySelector('#recentUsers tbody');
        tbody.innerHTML = recentUsers
            .sort((a, b) => b.joined - a.joined)
            .slice(0, 10)
            .map(user => `
                <tr>
                    <td>${user.name}</td>
                    <td>${user.email}</td>
                    <td>${new Date(user.joined).toLocaleDateString()}</td>
                    <td>${user.eventCount}</td>
                </tr>
            `).join('');

    } catch (error) {
        console.error('Error loading admin data:', error);
        alert('Error loading admin data');
    }
}
