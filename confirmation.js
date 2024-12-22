import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyAiFcWBrqP02_g3Hp3ESbnICMIn3LZQf7Y",
    authDomain: "gathurup2.firebaseapp.com",
    projectId: "gathurup2",
    storageBucket: "gathurup2.firebasestorage.app",
    messagingSenderId: "662651678876",
    appId: "1:662651678876:web:048d46d2df83369d983d59",
    databaseURL: "https://gathurup2-default-rtdb.firebaseio.com"
};

const { DateTime } = luxon;
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    const userId = urlParams.get('user');
    const name = urlParams.get('name');
    const updateLink = document.getElementById('updatePreferencesLink');
    updateLink.href = `event.html?event=${eventId}&user=${userId}&name=${name}`;

    // Fetch event details from the database
    const eventRef = ref(database, `users/${userId}/events/${eventId}`);
    const eventSnap = await get(eventRef);
    const eventData = eventSnap.val();

    if (eventData) {
        const timezoneSelect = document.getElementById('timezoneSelect');
        const calendarContainer = document.getElementById('calendarContainer');
        const timezones = [
            "America/Los_Angeles", "America/New_York", "America/Chicago", "America/Denver",
            "America/Phoenix", "America/Anchorage", "Pacific/Honolulu"
        ];

        // Populate timezone dropdown
        timezoneSelect.innerHTML = '<option value="">Select Time Zone</option>';
        timezones.forEach(tz => {
            const option = document.createElement('option');
            option.value = tz;
            option.textContent = tz.split('/')[1].replace('_', ' ');
            timezoneSelect.appendChild(option);
        });

        // Conditionally render the "Add to Calendar" button
        if (eventData.includeEventDetails !== false && eventData.eventDetails) {
            // Detect user's timezone
            const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const timezone = eventData.eventDetails.timezone || userTimezone || 'UTC';
            timezoneSelect.value = timezone;

            // Show the calendar container
            calendarContainer.style.display = 'block';

            // Update calendar button
            updateCalendarButton(eventData, timezone);

            // Add event listener to update calendar button on timezone change
            timezoneSelect.addEventListener('change', () => {
                const selectedTimezone = timezoneSelect.value;
                updateCalendarButton(eventData, selectedTimezone);
            });
        } else {
            // Hide the calendar container if includeEventDetails is false
            calendarContainer.style.display = 'none';
        }
    }
});

function updateCalendarButton(eventData, timezone) {
    const startDateTime = DateTime.fromISO(
        `${eventData.eventDetails.startDate}T${eventData.eventDetails.startTime || '00:00'}`
    ).setZone(timezone);
    
    const endDateTime = DateTime.fromISO(
        `${eventData.eventDetails.endDate || eventData.eventDetails.startDate}T${eventData.eventDetails.endTime || eventData.eventDetails.startTime || '00:00'}`
    ).setZone(timezone);

    const calendarContainer = document.getElementById('addToCalendarContainer');
    calendarContainer.innerHTML = `
        <add-to-calendar-button
            name="${eventData.title}"
            description="${eventData.description}"
            startDate="${startDateTime.toFormat('yyyy-MM-dd')}"
            startTime="${startDateTime.toFormat('HH:mm')}"
            endDate="${endDateTime.toFormat('yyyy-MM-dd')}"
            endTime="${endDateTime.toFormat('HH:mm')}"
            timeZone="${timezone}"
            location="${eventData.eventDetails.location || ''}"
            options="'Apple','Google','iCal','Microsoft365','Outlook.com','Yahoo'"
            lightMode="dark"
        ></add-to-calendar-button>
    `;
}