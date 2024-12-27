import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { getDatabase, ref, get, set, push, remove, update} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyAiFcWBrqP02_g3Hp3ESbnICMIn3LZQf7Y",
    authDomain: "gathurup2.firebaseapp.com",
    projectId: "gathurup2",
    storageBucket: "gathurup2.firebasestorage.app",
    messagingSenderId: "662651678876",
    appId: "1:662651678876:web:048d46d2df83369d983d59",
    databaseURL: "https://gathurup2-default-rtdb.firebaseio.com"
};
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

let selectedName = '';
let selectedFullName = '';
let votes = {};
let locationVotes = {};
let currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
let eventData = null;
let eventTimezoneCache = {};
let currentEventData = null;
let currentEditingActivity = null; // added for activity support
let currentEditingPacking = null;
let currentEditingAssignment = null;
let showingPastActivities = true;

// Timezone Management
async function initializeEventTimezone() {
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    const userId = urlParams.get('user');
    
    if (eventId && userId) {
        try {
            const eventRef = ref(database, `users/${userId}/events/${eventId}`);
            const eventSnap = await get(eventRef);
            const data = eventSnap.val();
            if (data && data.createdInTimezone) {
                eventTimezoneCache[`${userId}-${eventId}`] = data.createdInTimezone;
                currentTimezone = data.createdInTimezone;
                eventData = data;  // Store the event data globally
                return data.createdInTimezone;
            }
        } catch (error) {
            console.error('Error initializing event timezone:', error);
        }
    }
    return currentTimezone;
}

// function to initialize activities
async function initializeActivities() {
    if (!eventData.includeActivityDetails) {
        document.getElementById('activitiesCard').style.display = 'none';
        return;
    }

    document.getElementById('activitiesCard').style.display = 'block';
    await loadActivities();
}
//  functions for activity management
async function loadActivities() {
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    const userId = urlParams.get('user');

    const activitiesRef = ref(database, `users/${userId}/events/${eventId}/activities`);
    const snapshot = await get(activitiesRef);
    const activities = snapshot.val() || {};

    renderActivities(activities);
}
window.populateAssigneeSelect = async function() {
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    const userId = urlParams.get('user');

    console.log('Fetching tribe data for event:', eventId, 'user:', userId); // Debug log

    // Get the tribeId for the event
    const eventRef = ref(database, `users/${userId}/events/${eventId}`);
    const eventSnapshot = await get(eventRef);
    const eventData = eventSnapshot.val();
    const tribeId = eventData.tribeId;

    console.log('Tribe ID:', tribeId); // Debug log

    // Get the members of the tribe
    const tribeRef = ref(database, `users/${userId}/tribes/${tribeId}/members`);
    const tribeSnapshot = await get(tribeRef);
    const memberIds = tribeSnapshot.val() || [];

    console.log('Member IDs:', memberIds); // Debug log

    // Get the details of each member
    const memberPromises = memberIds.map(memberId => get(ref(database, `users/${userId}/people/${memberId}`)));
    const memberSnapshots = await Promise.all(memberPromises);
    const members = memberSnapshots.map(snapshot => snapshot.val());

    console.log('Members:', members); // Debug log

    const assigneeSelect = document.getElementById('assignedTo');
    assigneeSelect.innerHTML = '<option value="">Select Person</option>' +
        members.map(member => 
            `<option value="${member.firstName} ${member.lastName}">${member.firstName} ${member.lastName}</option>`
        ).join('');

    console.log('Assignee select populated:', assigneeSelect.innerHTML); // Debug log
}

// Ensure populateAssigneeSelect is called before showing modal
window.showAssignmentModal = function(editing = false) {
    const modal = document.getElementById('assignmentModal');
    const modalTitle = document.getElementById('assignmentModalTitle');
    modalTitle.textContent = editing ? 'Edit Assignment' : 'Add Assignment';
    populateAssigneeSelect(); // Ensure this is called
    modal.style.display = 'flex';
}

function formatDateHeader(dateStr) {
    // Parse date parts directly from YYYY-MM-DD format
    const [year, month, day] = dateStr.split('-');
    
    // Create date object without timezone conversion
    const date = new Date(year, month - 1, day);
    const monthAbbr = date.toLocaleDateString('en-US', { month: 'short' });
    const dayOfMonth = date.getDate();
    const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
    
    return `
        <div class="date-header-container">
            <div class="date-header-left">
                <div class="date-header-month">${monthAbbr.toUpperCase()}</div>
                <div class="date-header-day">${dayOfMonth}</div>
            </div>
            <div class="date-header-right">${weekday}</div>
        </div>
    `;
}
function renderActivities(activities) {
    const activitiesList = document.getElementById('activitiesList');
    
    // Sort dates using Luxon for consistent handling
    const sortedDates = Object.keys(activities).sort((a, b) => {
        const dateA = luxon.DateTime.fromISO(activities[a].date);
        const dateB = luxon.DateTime.fromISO(activities[b].date);
        return dateA.valueOf() - dateB.valueOf();
    });

 // Create grouped activities using sorted dates
 const activitiesByDate = sortedDates.reduce((acc, id) => {
    const activity = activities[id];
    const date = activity.date;
    if (!acc[date]) {
        acc[date] = [];
    }
    acc[date].push({ id, activity });
    return acc;
}, {});

    // Convert time to 24-hour format for sorting
    function convertTo24Hour(time, period) {
        if (!time) return '00:00';
        let [hours, minutes] = time.split(':');
        hours = parseInt(hours);
        if (period === 'PM' && hours !== 12) {
            hours += 12;
        }
        if (period === 'AM' && hours === 12) {
            hours = 0;
        }
        return `${hours.toString().padStart(2, '0')}:${minutes}`;
    }

    // Sort activities within each date group
    Object.keys(activitiesByDate).forEach(date => {
        activitiesByDate[date].sort((a, b) => {
            const timeA = convertTo24Hour(a.activity.time, a.activity.period);
            const timeB = convertTo24Hour(b.activity.time, b.activity.period);
            return timeA.localeCompare(timeB);
        });
    });

        // Filter past dates if not showing past activities
        const today = luxon.DateTime.now().startOf('day');
        const filteredDates = Object.keys(activitiesByDate).filter(date => {
            if (showingPastActivities) return true;
            const dateTime = luxon.DateTime.fromISO(date);
            return dateTime >= today;
        });
    

    // Render activities grouped by date
    activitiesList.innerHTML = filteredDates.map(date => `
        <div class="date-group">
            <h3 class="date-header" data-date="${date}">${formatDateHeader(date)}</h3>
            ${activitiesByDate[date].map(({ id, activity }) => `
                <div class="activity-card">
                    <div class="activity-actions">
                        <button onclick="editActivity('${id}')" class="action-button edit">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                            </svg>
                        </button>
                        <button onclick="deleteActivity('${id}')" class="action-button delete">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6l-2 14H7L5 6"></path>
                                <path d="M10 11v6"></path>
                                <path d="M14 11v6"></path>
                                <path d="M5 6l1-3h12l1 3"></path>
                            </svg>
                        </button>
                    </div>
                    <div class="activity-content">
                        <div class="activity-time">
                            ${activity.time ? formatActivityTime(activity.time, activity.period, activity.timezone) : ''}
                        </div>
                        <div class="activity-header">
                            <div class="activity-title">${activity.title}</div>
                        </div>
                        <div class="activity-details">
                            ${activity.location ? `<div>Location: ${activity.location}</div>` : ''}
                            ${activity.info ? `<div>Additional Info: ${activity.info}</div>` : ''}
                        </div>
                        <div class="activity-creator">Added by ${activity.creator}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `).join('');
}


// Add activity modal functions
function showActivityModal(editing = false) {
    const modal = document.getElementById('activityModal');
    const modalTitle = document.getElementById('activityModalTitle');
    modalTitle.textContent = editing ? 'Edit Activity' : 'Add Activity';
    modal.style.display = 'flex';  // Changed from block to flex
}
// Helper function to format time in 12-hour format with timezone
function formatActivityTime(time, period, timezone) {
    if (!time || !period) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const hour12 = hour % 12 || 12;
    const timeStr = `${hour12}:${minutes} ${period}`;
    const tzAbbr = getTimezoneAbbreviation(timezone);
    return `${timeStr} ${tzAbbr}`;
}

// Define getTimezoneAbbreviation function
const timezoneAbbreviations = {
    'America/Los_Angeles': 'PT',
    'America/New_York': 'ET',
    'America/Chicago': 'CT',
    'America/Denver': 'MT',
    'America/Phoenix': 'MST',
    'America/Anchorage': 'AKT',
    'America/Honolulu': 'HAT',
    'Europe/London': 'GMT',
    'Europe/Berlin': 'CET',
    'Europe/Paris': 'CET',
    'Europe/Moscow': 'MSK',
    'Australia/Sydney': 'AET',
    'Australia/Perth': 'AWT',
    'Pacific/Auckland': 'NZT',
    'America/Toronto': 'ET',
    'America/Vancouver': 'PT',
    'America/Mexico_City': 'CT',
    'America/Sao_Paulo': 'BRT',
    'Africa/Johannesburg': 'SAST',
};
function getTimezoneAbbreviation(timezone) {
    return timezoneAbbreviations[timezone] || timezone.split('/').pop().match(/[A-Z]/g).join('');
}

window.closeActivityModal = function () {
    const modal = document.getElementById('activityModal');
    modal.style.display = 'none';
    document.getElementById('activityForm').reset();
    currentEditingActivity = null;
}

async function handleActivitySubmit(e) {
    e.preventDefault();
    
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    const userId = urlParams.get('user');
    
    const activityTitle = document.getElementById('activityTitle').value;
    const activityDate = document.getElementById('activityDate').value || null;
    const activityTimeHour = document.getElementById('activityTimeHour').value;
    const activityTimeMinute = document.getElementById('activityTimeMinute').value;
    const activityTimePeriod = document.getElementById('activityTimePeriod').value;
    const activityLocation = document.getElementById('activityLocation').value || null;
    const activityInfo = document.getElementById('activityInfo').value || null;
    const activityTimezone = document.getElementById('activityTimezone').value;

    const activityTime = activityTimeHour && activityTimeMinute && activityTimePeriod 
        ? `${activityTimeHour}:${activityTimeMinute}` 
        : null;

    const activity = {
        title: activityTitle,
        date: activityDate,
        time: activityTime,
        period: activityTimePeriod,
        timezone: activityTimezone,
        location: activityLocation,
        info: activityInfo,
        creator: selectedFullName,
        createdAt: new Date().toISOString()
    };

    try {
        const activitiesRef = ref(database, `users/${userId}/events/${eventId}/activities`);
        if (currentEditingActivity) {
            await update(ref(database, `users/${userId}/events/${eventId}/activities/${currentEditingActivity}`), activity);
        } else {
            const newActivityRef = push(activitiesRef);
            await set(newActivityRef, activity);
        }
        
        closeActivityModal();
        await loadActivities();
    } catch (error) {
        console.error('Error saving activity:', error);
        alert('Error saving activity');
    }
}
window.editActivity = async function(activityId) {
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    const userId = urlParams.get('user');

    const activityRef = ref(database, `users/${userId}/events/${eventId}/activities/${activityId}`);
    const snapshot = await get(activityRef);
    const activity = snapshot.val();

    if (activity) {
        document.getElementById('activityTitle').value = activity.title;
        document.getElementById('activityDate').value = activity.date || '';
        const [hour, minute] = activity.time ? activity.time.split(':') : ['', ''];
        document.getElementById('activityTimeHour').value = hour || '';
        document.getElementById('activityTimeMinute').value = minute || '';
        document.getElementById('activityTimePeriod').value = activity.period || '';
        document.getElementById('activityLocation').value = activity.location || '';
        document.getElementById('activityInfo').value = activity.info || '';
        document.getElementById('activityTimezone').value = activity.timezone || 'America/Los_Angeles';
        
        currentEditingActivity = activityId;
        showActivityModal(true);
    }
}

window.deleteActivity = async function(activityId) {
    if (!confirm('Are you sure you want to delete this activity?')) return;

    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    const userId = urlParams.get('user');

    try {
        await remove(ref(database, `users/${userId}/events/${eventId}/activities/${activityId}`));
        await loadActivities();
    } catch (error) {
        console.error('Error deleting activity:', error);
        alert('Error deleting activity');
    }
}
// Date Formatting Functions
function formatDateForDisplay(dateStr, timeStr = '', options = {}) {
    if (!dateStr) return '';

    const eventTimezone = eventData?.createdInTimezone || 'UTC';

    // Combine date and time into a single ISO string
    const dateTimeStr = timeStr ? `${dateStr}T${timeStr}` : `${dateStr}T00:00:00`;

    // Parse the date and time in the event's timezone
    const date = luxon.DateTime.fromISO(dateTimeStr, { zone: eventTimezone });

    let convertedDate;

    if (timeStr) {
        // If time is provided, convert to user's timezone
        convertedDate = date.setZone(currentTimezone);
    } else {
        // For date-only values, do not adjust timezone to avoid date shifts
        convertedDate = date; // Keep in event's timezone
    }

    // Determine format options
    const formatOptions = {
        ...options,
        // These options are compatible with Luxon's toLocaleString method
    };

    // Format the date for display
    return convertedDate.toLocaleString(formatOptions);
}
function formatTimeForDisplay(timeStr, dateStr) {
    if (!timeStr || !dateStr) return '';

    const eventTimezone = eventData?.createdInTimezone || 'UTC';

    // Combine date and time into a single ISO string
    const dateTimeStr = `${dateStr}T${timeStr}`;

    // Parse the date and time in the event's timezone
    const date = luxon.DateTime.fromISO(dateTimeStr, { zone: eventTimezone });

    // Convert to the user's selected timezone
    const convertedDate = date.setZone(currentTimezone);

    // Format the time for display
    return convertedDate.toLocaleString(luxon.DateTime.TIME_SIMPLE);
}
function renderDateWithTimes(dateObj) {
    console.log('renderDateWithTimes input:', dateObj);

    const formattedDate = formatDateForDisplay(dateObj.date);

    const badgeMonth = formatDateForDisplay(dateObj.date, '', { month: 'short' }).toUpperCase();
    const badgeDay = formatDateForDisplay(dateObj.date, '', { day: 'numeric' });

    return `
        <div class="date-card" data-date="${dateObj.date}">
            <div class="month-header" onclick="toggleDate('${dateObj.date}')">
                <div class="month-header-content">
                    <div class="date-info">
                        <div class="date-badge">
                            <span class="month">${badgeMonth}</span>
                            <span class="day">${badgeDay}</span>
                        </div>
                        <div class="date-details">
                            <h3>${formattedDate}</h3>
                            <span class="expand-hint">Click to expand and set your preferences for times provided</span>
                        </div>
                    </div>
                </div>
                <svg class="expand-icon" viewBox="0 0 24 24">
                    <path d="M19 9l-7 7-7-7" />
                </svg>
            </div>
            <div class="date-ranges" style="display: none;">
                ${dateObj.times.map(time => `
                    <div class="time-slot" data-time-id="${dateObj.date}T${time}" onclick="toggleVote('${dateObj.date}', '${time}')">
                        <div class="time-slot-content">
                            <div class="vote-indicator">
                                ${getVoteIndicator(`${dateObj.date}T${time}`)}
                            </div>
                            <div class="time-info">
                                <p class="time">${formatTimeForDisplay(time, dateObj.date)}</p>
                                <p class="votes">Click to set your preference</p>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}
// Rendering Functions for Different Event Types
function renderSingleDate(dateObj) {
    console.log('renderSingleDate input:', dateObj);

    const formattedDate = formatDateForDisplay(dateObj.date, '', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });

    const badgeMonth = formatDateForDisplay(dateObj.date, '', { 
        month: 'short' 
    }).toUpperCase();
    
    const badgeDay = formatDateForDisplay(dateObj.date, '', { 
        day: 'numeric' 
    });

    console.log('renderSingleDate output:', { formattedDate, badgeMonth, badgeDay });

    return `
        <div class="date-card single-date" data-date="${dateObj.date}" onclick="toggleVote('${dateObj.date}')">
            <div class="content-wrapper">
                <div class="date-info">
                    <div class="date-badge">
                        <span class="month">${badgeMonth}</span>
                        <span class="day">${badgeDay}</span>
                    </div>
                    <div class="date-details">
                        <h3>${formattedDate}</h3>
                        <p class="votes">Click anywhere to set your preference</p>
                    </div>
                </div>
                <div class="vote-indicator">
                    ${getVoteIndicator(dateObj.date)}
                </div>
            </div>
        </div>
    `;
}


function renderRangeDates(dates) {
    const monthGroups = {};
    dates.forEach(dateObj => {
        const startDate = formatDateForDisplay(dateObj.start, '', {
            month: 'long',
            year: 'numeric'
        });
        
        if (!monthGroups[startDate]) {
            monthGroups[startDate] = [];
        }
        monthGroups[startDate].push(dateObj);
    });

    return Object.entries(monthGroups).map(([month, ranges]) => `
        <div class="month-group">
            <div class="month-header" onclick="toggleMonth('${month}')">
                <div class="month-header-content">
                    <h3>${month}</h3>
                    <span class="expand-hint">Click to expand and set your preferences for the ${ranges.length} date range${ranges.length > 1 ? 's' : ''} provided</span>
                </div>
                <svg class="expand-icon" viewBox="0 0 24 24">
                    <path d="M19 9l-7 7-7-7" />
                </svg>
            </div>
            <div class="date-ranges" id="month-${month.replace(/\s+/g, '-')}" style="display: none;">
                ${ranges.map(dateObj => renderRangeDateCard(dateObj)).join('')}
            </div>
        </div>
    `).join('');
}

function renderRangeDateCard(dateObj) {
    const formattedStartDate = formatDateForDisplay(dateObj.start, '', {
        month: 'numeric',
        day: 'numeric',
        year: '2-digit'
    });
    
    const formattedEndDate = formatDateForDisplay(dateObj.end, '', {
        month: 'numeric',
        day: 'numeric',
        year: '2-digit'
    });

    return `
        <div class="range-card" data-date="${dateObj.start}" onclick="toggleSingleDateVote('${dateObj.start}')">
            <div class="time-slot-content">
                <div class="vote-indicator">
                    ${getVoteIndicator(dateObj.start)}
                </div>
                <div class="time-info">
                    <p class="time">${formattedStartDate} to ${formattedEndDate}</p>
                    <p class="votes">Click to set your preference</p>
                </div>
            </div>
        </div>
    `;
}

// Main Event Loading and Initialization
async function loadEventData() {
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    const userId = urlParams.get('user');

    if (!eventId || !userId) {
        console.error('Invalid event link');
        return;
    }

    try {
        // Use cached event data if available
        if (!eventData) {
            const eventRef = ref(database, `users/${userId}/events/${eventId}`);
            const eventSnap = await get(eventRef);
            eventData = eventSnap.val();
        }

        if (!eventData) {
            console.error('Event not found');
            return;
        }

        // Update UI with event data
        document.getElementById('eventTitleDisplay').textContent = eventData.title;
        document.getElementById('eventDescription').textContent = eventData.description;

        // Populate event details if they exist
        populateEventDetails(eventData);

        // Load tribe data
        const tribeRef = ref(database, `users/${userId}/tribes/${eventData.tribeId}`);
        const tribeSnap = await get(tribeRef);
        const tribe = tribeSnap.val();

        if (!tribe) {
            console.error('Tribe not found');
            return;
        }

        // Load people data
        const peopleRef = ref(database, `users/${userId}/people`);
        const peopleSnap = await get(peopleRef);
        const people = peopleSnap.val() || {};

        // Populate name select dropdown
        const membersList = tribe.members
            .map(memberId => people[memberId])
            .filter(Boolean);

        const nameSelect = document.getElementById('nameSelect');
        if (nameSelect) {
            nameSelect.innerHTML = '<option value="">Choose your name...</option>';
            membersList.forEach(person => {
                const option = document.createElement('option');
                option.value = person.firstName;
                option.textContent = `${person.firstName} ${person.lastName}`;
                nameSelect.appendChild(option);
            });

            // Hide loading text and show name select container
            document.getElementById('loadingText').style.display = 'none';
            document.getElementById('nameSelectContainer').style.display = 'block';
        }

        // Load and render dates based on event type
        if (eventData.includeDatePreferences) {
            document.getElementById('datePreferencesSection').style.display = 'block';
            document.getElementById('responseSummaryCard').style.display = 'block';
            if (!eventData.dates || eventData.dates.length === 0) {
                document.getElementById('datesList').innerHTML = '<p class="no-dates">No Dates Provided</p>';
            } else {
                const dates = consolidateAndSortDates(eventData.dates);
                await renderDatesList(dates, userId, eventId);
                await renderResponseSummary(membersList.length, userId, eventId);
            }
        }
  // Add new section initializations
  if (eventData.includePacking) {
    await initializePacking();
}
if (eventData.includeAssignments) {
    await initializeAssignments();
}
        // Handle location preferences if included
        if (eventData.includeLocationPreferences && eventData.locations) {
            document.getElementById('locationPreferencesSection').style.display = 'block';
            await renderLocationPreferences(eventData.locations, userId, eventId);
        }
// Hide poll instructions and poll responses if both preferences are false
if (!eventData.includeDatePreferences && !eventData.includeLocationPreferences) {
    document.querySelector('.instructions-card').style.display = 'none';
    document.getElementById('responseSummaryCard').style.display = 'none';
}
        // Load existing votes if any
        if (selectedFullName) {
            await loadUserVotes();
        }

    } catch (error) {
        console.error('Error loading event data:', error);
        document.getElementById('loadingText').textContent = 'Error loading event data. Please try again.';
    }
}

function consolidateAndSortDates(dates) {
    // Handle case when dates is undefined or empty
    if (!dates || dates.length === 0) {
        return [];
    }

    // Group dates by start date
    const datesMap = dates.reduce((acc, dateObj) => {
        if (!dateObj || !dateObj.start) return acc;
        
        const dateKey = dateObj.start;
        if (!acc[dateKey]) {
            acc[dateKey] = {
                date: dateObj.start,
                end: dateObj.end || dateObj.start,
                times: [],
                displayRange: dateObj.displayRange
            };
        }
        if (dateObj.time) {
            acc[dateKey].times.push(dateObj.time);
        }
        return acc;
    }, {});

    return Object.values(datesMap).sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function renderResponseSummary(totalMembers, userId, eventId) {
    try {
        const votesRef = ref(database, `users/${userId}/events/${eventId}/votes`);
        const votesSnap = await get(votesRef);
        const votesData = votesSnap.val() || {};

        const uniqueResponders = new Set(Object.keys(votesData));
        const responseCount = uniqueResponders.size;

        document.getElementById('responseSummaryText').textContent = `${responseCount} of ${totalMembers} people responded to the poll so far`;
    } catch (error) {
        console.error('Error loading response summary:', error);
    }
}

async function renderLocationPreferences(locations, userId, eventId) {
    const container = document.getElementById('locationPreferencesContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Early return if no locations
    if (!locations || !Array.isArray(locations) || locations.length === 0) {
        container.innerHTML = '<p class="no-locations">No Locations Provided</p>';
        return;
    }

    const votesRef = ref(database, `users/${userId}/events/${eventId}/votes/${selectedFullName}/locationPreferences`);
    const votesSnap = await get(votesRef);
    const userLocationVote = votesSnap.val() || {};

    locations.forEach((location) => {
        const locationCard = document.createElement('div');
        locationCard.className = 'location-card';
        locationCard.setAttribute('data-location', location.name);
        locationCard.onclick = () => handleLocationVote(location.name);

        const isSelected = location.name === userLocationVote.selectedLocation;
        const voteIcon = getLocationVoteIcon(location.name, userLocationVote.selectedLocation);
        const buttonClass = isSelected ? 'selected' : userLocationVote.selectedLocation ? 'not-selected' : '';

        locationCard.innerHTML = `
            ${location.imageUrl ? 
                `<img src="${location.imageUrl}" alt="${location.name}" class="location-image">` : 
                `<div class="no-image">NO IMAGE PROVIDED</div>`
            }
            <div class="location-details">
                <h3 class="location-title">${location.name}</h3>
                <p class="location-description">${location.description}</p>
                <div class="vote-buttons">
                    <button class="location-vote-button ${buttonClass}" data-location="${location.name}">
                        ${voteIcon}
                    </button>
                </div>
            </div>
        `;
        container.appendChild(locationCard);
    });
}

function getLocationVoteIcon(locationName, selectedLocation) {
    // If no vote yet, show question mark
    if (!selectedLocation) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.5 9a3 3 0 0 1 5 1c0 2-3 3-3 3"/>
        <circle cx="12" cy="17" r="1"/>
        </svg>`;
    }
    
    // If this location is selected, show thumbs up
    const isSelected = locationName === selectedLocation;
    if (isSelected) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
        </svg>`;
    }
    
    // If this location is not selected, show thumbs down
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
    </svg>`;
}

window.handleLocationVote = function(locationName) {
    // Update the UI immediately
    document.querySelectorAll('.location-vote-button').forEach(button => {
        const buttonLocation = button.dataset.location;
        button.classList.remove('selected', 'not-selected');
        if (buttonLocation === locationName) {
            button.classList.add('selected');
            button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
            </svg>`;
        } else {
            button.classList.add('not-selected');
            button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
            </svg>`;
        }
    });

    // Update the votes object
    locationVotes = { selectedLocation: locationName };
};

async function loadUserVotes() {
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    const userId = urlParams.get('user');

    try {
        const votesRef = ref(database, `users/${userId}/events/${eventId}/votes/${selectedFullName}`);
        const votesSnap = await get(votesRef);
        const userVotes = votesSnap.val() || {};

        votes = userVotes.datePreferences || {};
        locationVotes = userVotes.locationPreferences || {};

        for (const [timeSlotId, vote] of Object.entries(votes)) {
            const timeSlot = document.querySelector(`.time-slot[data-time-id="${timeSlotId}"] .vote-indicator`) || 
                             document.querySelector(`.date-card[data-date="${timeSlotId}"] .vote-indicator`);
            if (timeSlot) {
                updateVoteIndicatorDisplay(timeSlot, vote);
            }
        }

        // Ensure the event object is available
        const eventRef = ref(database, `users/${userId}/events/${eventId}`);
        const eventSnap = await get(eventRef);
        const event = eventSnap.val();

        // Only render location preferences if they exist
        if (event.includeLocationPreferences && event.locations) {
            await renderLocationPreferences(event.locations, userId, eventId);
        }
    } catch (error) {
        console.error('Error loading user votes:', error);
    }
}

window.toggleDate = function(date) {
    const dateCard = document.querySelector(`.date-card[data-date="${date}"]`);
    const dateRanges = dateCard.querySelector('.date-ranges');
    const expandIcon = dateCard.querySelector('.expand-icon');
    
    if (dateRanges) {
        const isExpanded = dateRanges.style.display === 'block';
        dateRanges.style.display = isExpanded ? 'none' : 'block';
        if (expandIcon) {
            expandIcon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
        }
    }
};

window.toggleVote = function(date, time) {
    const timeSlotId = time ? `${date}T${time}` : date;
    let indicator;

    // Updated selector logic to handle all card types
    if (time) {
        indicator = document.querySelector(`.time-slot[data-time-id="${timeSlotId}"] .vote-indicator`);
    } else {
        indicator = document.querySelector(`.date-card[data-date="${date}"] .vote-indicator`) ||
                   document.querySelector(`.range-card[data-date="${date}"] .vote-indicator`);
    }
    
    if (indicator) {
        const currentVote = votes[timeSlotId] || 'maybe';
        let newVote;
        
        switch (currentVote) {
            case 'maybe':
                newVote = 'yes';
                break;
            case 'yes':
                newVote = 'no';
                break;
            default:
                newVote = 'maybe';
        }
        
        votes[timeSlotId] = newVote;
        updateVoteIndicatorDisplay(indicator, newVote);
        
        event.stopPropagation();
    }
};

       async function submitPreferences() {
        const urlParams = new URLSearchParams(window.location.search);
        const eventId = urlParams.get('event');
        const userId = urlParams.get('user');
        const name = urlParams.get('name');
    
        if (!selectedFullName) {
            alert('Please select your name.');
            return;
        }
    
        // Convert all "maybe" votes to "no"
        const updatedVotes = {};
        for (const [key, value] of Object.entries(votes)) {
            updatedVotes[key] = value === 'maybe' ? 'no' : value;
        }
    
        // Check if RSVP is required
        const rsvpCard = document.getElementById('rsvpCard');
        let rsvpStatus = '';
        if (rsvpCard.style.display !== 'none') {
            rsvpStatus = document.getElementById('rsvpStatus').value;
            if (!rsvpStatus) {
                alert('Please select your RSVP status before continuing.');
                return;
            }
        }
    
        try {
            const votesRef = ref(database, `users/${userId}/events/${eventId}/votes/${selectedFullName}`);
            await set(votesRef, {
                datePreferences: updatedVotes,
                locationPreferences: locationVotes
            });
    
            // Store RSVP status if it exists
            if (rsvpStatus) {
                const rsvpRef = ref(database, `users/${userId}/events/${eventId}/rsvps/${selectedFullName}`);
                await set(rsvpRef, {
                   
                    status: rsvpStatus
                });
            }
    
            // Redirect to confirmation page
            window.location.href = `confirmation.html?event=${eventId}&user=${userId}&name=${name}`;
        } catch (error) {
            console.error('Error submitting preferences:', error);
            alert('Error submitting preferences.');
        }
    }

document.getElementById('submitButton').addEventListener('click', submitPreferences);


// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    await initializeEventTimezone();
    await loadEventData();
    populateTimezoneSelect();
    
    // Setup all event listeners
    setupEventListeners();
    
    // Initialize sections
    initializeActivities();
    if (eventData.includePacking) {
        initializePacking();
    }
    if (eventData.includeAssignments) {
        initializeAssignments();
    }
});

// helper function
function updateVoteIndicatorDisplay(indicator, vote) {
    // Update background colors along with the icons
    switch (vote) {
        case 'yes':
            indicator.classList.remove('no', 'maybe');
            indicator.classList.add('yes');
            indicator.style.backgroundColor = '#81D8D0';
            indicator.style.color = '#ffffff';
            indicator.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
            </svg>`;
            break;
        case 'no':
            indicator.classList.remove('yes', 'maybe');
            indicator.classList.add('no');
            indicator.style.backgroundColor = '#FEE2E2';
            indicator.style.color = '#DC2626';
            indicator.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
            </svg>`;
            break;
        default:
            indicator.classList.remove('yes', 'no');
            indicator.classList.add('maybe');
            indicator.style.backgroundColor = '#FEF3C7';
            indicator.style.color = '#D97706';
            indicator.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
        <path d="M9.5 9a3 3 0 0 1 5 1c0 2-3 3-3 3"/>
        <circle cx="12" cy="17" r="1"/>
            </svg>`;
    }
}

async function getTotalAvailableCount(times, date, userId, eventId) {
    const votesRef = ref(database, `users/${userId}/events/${eventId}/votes`);
    const votesSnap = await get(votesRef);
    const votesData = votesSnap.val() || {};

    let availableCount = 0;
    for (const time of times) {
        const timeSlotId = `${date}T${time}`;
        for (const voter in votesData) {
            if (votesData[voter].datePreferences && votesData[voter].datePreferences[timeSlotId] === 'yes') {
                availableCount++;
            }
        }
    }
    return availableCount;
}

async function renderTimeSlots(times, date, userId, eventId) {
    if (times.length === 0) {
        return `
            <div class="time-slot" 
                onclick="toggleVote('${date}', '')"
                data-time-id="${date}">
                <div class="time-slot-content">
                    <div class="vote-indicator" style="background-color: #FEF3C7; color: #D97706;">?</div>
                    <div class="time-info">
                        <p class="time">All Day</p>
                        <p class="votes">Click anywhere to set your preference</p>
                    </div>
                </div>
            </div>
        `;
    }

    const timesHtml = await Promise.all(times.map(async time => {
        const timeSlotId = `${date}T${time}`;
        const votesRef = ref(database, `users/${userId}/events/${eventId}/votes`);
        const votesSnap = await get(votesRef);
        const votesData = votesSnap.val() || {};

        let availableCount = 0;
        for (const voter in votesData) {
            if (votesData[voter].datePreferences && votesData[voter].datePreferences[timeSlotId] === 'yes') {
                availableCount++;
            }
        }

        return `
            <div class="time-slot" 
                onclick="toggleVote('${date}', '${time}')"
                data-time-id="${timeSlotId}">
                <div class="time-slot-content">
                    <div class="vote-indicator" style="background-color: #FEF3C7; color: #D97706;">?</div>
                    <div class="time-info">
                        <p class="time">${formatTimeForDisplay(time, date)}</p>
                        <p class="votes">Click anywhere to set your preference</p>
                    </div>
                </div>
            </div>
        `;
    }));
    return timesHtml.join('');
}

function formatTime(time) {
    try {
        const [hours, minutes] = time.split(':');
        const date = new Date();
        date.setHours(parseInt(hours), parseInt(minutes));
        return date.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
    } catch (e) {
        return time; // Fallback to original format if parsing fails
    }
}

// Update timezone change handler
function populateTimezoneSelect() {
    const timezoneSelect = document.getElementById('timezoneSelect');
    const timezoneNames = {
        "America/Los_Angeles": "Pacific Time",
        "America/New_York": "Eastern Time",
        "America/Chicago": "Central Time",
        "America/Denver": "Mountain Time",
        "America/Phoenix": "Mountain Time (no DST)",
        "America/Anchorage": "Alaska Time",
        "Pacific/Honolulu": "Hawaii-Aleutian Time"
    };
    const timezones = Object.keys(timezoneNames);
    
    timezoneSelect.innerHTML = '<option value="">Select Time Zone</option>';
    timezones.forEach(tz => {
        const option = document.createElement('option');
        option.value = tz;
        option.textContent = timezoneNames[tz];
        if (tz === currentTimezone) {
            option.selected = true;
        }
        timezoneSelect.appendChild(option);
    });

    // Single combined timezone change handler
    timezoneSelect.addEventListener('change', async function(e) {
        currentTimezone = e.target.value || Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (currentEventData) {
            currentEventData.eventDetails.timeZone = currentTimezone;
            populateEventDetails(currentEventData);
        }
        await loadEventData(); // Re-render dates with new timezone
    });
}

async function renderDatesList(dates, userId, eventId) {
    const container = document.getElementById('datesList');
    const eventRef = ref(database, `users/${userId}/events/${eventId}`);
    const eventSnap = await get(eventRef);
    const event = eventSnap.val();

    if (!event || !event.dates || event.dates.length === 0) {
        container.innerHTML = '<p class="no-dates">No valid dates found</p>';
        return;
    }

    let html = '';
    
    if (event.type === 'range') {
        html = renderRangeDates(event.dates);
    } else {
        const consolidatedDates = consolidateAndSortDates(event.dates);
        console.log('Consolidated dates:', consolidatedDates); // Debug log
        
        if (consolidatedDates.length === 0) {
            html = '<p class="no-dates">No valid dates found</p>';
        } else {
            html = consolidatedDates.map(dateObj => {
                if (dateObj.times && dateObj.times.length > 0) {
                    return renderDateWithTimes(dateObj);
                } else {
                    return renderSingleDate(dateObj);
                }
            }).join('');
        }
    }

    container.innerHTML = html;
}
// toggle month function
window.toggleMonth = function(month) {
    const monthContent = document.getElementById(`month-${month.replace(/\s+/g, '-')}`);
    const isExpanded = monthContent.style.display === 'block';
    monthContent.style.display = isExpanded ? 'none' : 'block';
    const icon = monthContent.parentElement.querySelector('.expand-icon');
    icon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
};

// Add this near the top with other window functions
window.confirmName = async function() {
    const nameSelect = document.getElementById('nameSelect');
    selectedFullName = nameSelect.options[nameSelect.selectedIndex].text;
    console.log('Selected name:', selectedFullName); // Debug log

    if (selectedFullName && selectedFullName !== 'Choose your name...') {
        document.getElementById('nameCaptureModal').style.display = 'none';
        await loadUserVotes();
        await loadEventData(); // Reload event data with selected name
    } else {
        alert('Please select your name to continue');
    }
};

window.toggleTimeSlotVote = function(date, time) {
    const timeSlotId = `${date}T${time}`;
    const indicator = document.querySelector(`.time-slot[data-time-id="${timeSlotId}"] .vote-indicator`);
    if (!indicator) return;

    const currentVote = votes[timeSlotId] || 'maybe';
    let newVote;
    
    switch (currentVote) {
        case 'maybe':
            newVote = 'yes';
            indicator.style.backgroundColor = '#81D8D0';
            indicator.style.color = '#ffffff';
            break;
        case 'yes':
            newVote = 'no';
            indicator.style.backgroundColor = '#FEE2E2';
            indicator.style.color = '#DC2626';
            break;
        default:
            newVote = 'maybe';
            indicator.style.backgroundColor = '#FEF3C7';
            indicator.style.color = '#D97706';
    }
    
    votes[timeSlotId] = newVote;
    updateVoteIndicatorDisplay(indicator, newVote);
    
    // Prevent event from bubbling up
    event.stopPropagation();
};


function getVoteIndicator(timeSlotId) {
    const vote = votes[timeSlotId] || 'maybe';
    switch (vote) {
        case 'yes':
            return `<div class="vote-indicator yes">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                </svg>
            </div>`;
        case 'no':
            return `<div class="vote-indicator no">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
                </svg>
            </div>`;
        default:
            return `<div class="vote-indicator maybe">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <circle cx="12" cy="12" r="10"/>
                <path d="M9.5 9a3 3 0 0 1 5 1c0 2-3 3-3 3"/>
                <circle cx="12" cy="17" r="1"/> 
                </svg>
            </div>`;
    }
}

window.toggleSingleDateVote = function(date) {
    const indicator = document.querySelector(`.range-card[data-date="${date}"] .vote-indicator`);
    if (!indicator) return;
    
    const currentVote = votes[date] || 'maybe';
    let newVote;
    
    switch (currentVote) {
        case 'maybe':
            newVote = 'yes';
            break;
        case 'yes':
            newVote = 'no';
            break;
        default:
            newVote = 'maybe';
    }
    
    votes[date] = newVote;
    updateVoteIndicatorDisplay(indicator, newVote);
    
    event.stopPropagation();
};

function formatTimeString(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${period}`;
}
async function populateRsvpStatus(eventData) {
    console.log('Populating RSVP status for:', selectedFullName); // Debug log

    if (!selectedFullName || selectedFullName === 'Choose your name...') {
        console.log('No valid name selected yet');
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    const userId = urlParams.get('user');

    try {
        const path = `users/${userId}/events/${eventId}/rsvps/${selectedFullName}`;
        console.log('Fetching RSVP status from path:', path); // Debug log
        
        const rsvpRef = ref(database, path);
        const rsvpSnap = await get(rsvpRef);
        const rsvpData = rsvpSnap.val();

        console.log('RSVP Data:', rsvpData); // Debug log

        if (rsvpData) {
            const rsvpStatus = rsvpData.status || '';
            const rsvpSelect = document.getElementById('rsvpStatus');
            if (rsvpSelect) {
                rsvpSelect.value = rsvpStatus;
                console.log('Set RSVP status to:', rsvpStatus); // Debug log
            }
        } else {
            console.log('No RSVP data found for the user.');
        }
    } catch (error) {
        console.error('Error fetching RSVP status:', error);
    }
}
async function populateEventDetails(eventData) {
    currentEventData = eventData;
    const rsvpCard = document.getElementById('rsvpCard');
    const eventDetailsCard = document.getElementById('eventDetailsCard');
    
    if (!eventData.includeEventDetails || !eventData.eventDetails) {
        eventDetailsCard.style.display = 'none';
        rsvpCard.style.display = 'none';
        updateCalendarButton(eventData, currentTimezone);
        return;
    }

    eventDetailsCard.style.display = 'block';
    updateCalendarButton(eventData, currentTimezone);

    // Show RSVP card if includeRsvpSection is true
    if (eventData.includeRsvpSection) {
        rsvpCard.style.display = 'block';
        await populateRsvpStatus(eventData); // Ensure this line is correct
    } else {
        rsvpCard.style.display = 'none';
    }

    // Get timezone once for all uses
    const timezone = eventData.eventDetails.timeZone || currentTimezone || 'America/Los_Angeles';
    const timeZoneAbbr = luxon.DateTime.now().setZone(timezone).toFormat('ZZZZ');

    // Location Details
    const locationDetails = document.getElementById('locationDetails');
    if (eventData.eventDetails.location) {
        locationDetails.style.display = 'flex';
        document.getElementById('eventLocationName').textContent = eventData.eventDetails.location;
        document.getElementById('eventLocationAddress').textContent = eventData.eventDetails.locationAddress || '';
        
        const locationUrl = document.getElementById('eventLocationUrl');
        if (eventData.eventDetails.locationUrl) {
            locationUrl.href = eventData.eventDetails.locationUrl;
            locationUrl.textContent = 'View Website';
            locationUrl.style.display = 'inline';
        } else {
            locationUrl.style.display = 'none';
        }

        const showOnMapUrl = document.getElementById('showOnMapUrl');
        if (eventData.eventDetails.locationAddress) {
            const encodedAddress = encodeURIComponent(eventData.eventDetails.locationAddress);
            showOnMapUrl.href = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
            showOnMapUrl.style.display = 'inline';
        } else {
            showOnMapUrl.style.display = 'none';
        }
    } else {
        locationDetails.style.display = 'none';
    }

    // Date and Time Details
    const dateDetails = document.getElementById('dateDetails');
    if (eventData.eventDetails.startDate) {
        dateDetails.style.display = 'flex';
        const dateContent = document.querySelector('#dateDetails .detail-content');
        
        const isDateRange = eventData.eventDetails.endDate && 
            eventData.eventDetails.endDate !== eventData.eventDetails.startDate;

        // Convert dates/times to selected timezone
        const startDateTime = luxon.DateTime.fromISO(
            `${eventData.eventDetails.startDate}T${eventData.eventDetails.startTime || '00:00'}`
        ).setZone(timezone);
        
        const endDateTime = luxon.DateTime.fromISO(
            `${eventData.eventDetails.endDate || eventData.eventDetails.startDate}T${eventData.eventDetails.endTime || eventData.eventDetails.startTime || '00:00'}`
        ).setZone(timezone);

        const startDate = startDateTime.toFormat('EEEE, MMMM d, yyyy');
        const startTime = eventData.eventDetails.startTime ? startDateTime.toFormat('h:mm a') : null;
        const endDate = isDateRange ? endDateTime.toFormat('EEEE, MMMM d, yyyy') : null;
        const endTime = eventData.eventDetails.endTime ? endDateTime.toFormat('h:mm a') : null;

        dateContent.innerHTML = `
        <h3>Date</h3>
        ${isDateRange ? 
            `<p>${startDate}</p>
             ${startTime ? `<p>Start Time: ${startTime} ${timeZoneAbbr}</p>` : ''}
             <br>
             <p>${endDate}</p>
             ${endTime ? `<p>End Time: ${endTime} ${timeZoneAbbr}</p>` : ''}` : 
            `<p>${startDate}</p>`}
        <input type="date" id="eventStartDate" value="${startDateTime.toFormat('yyyy-MM-dd')}" style="display: none;">
        <input type="date" id="eventEndDate" value="${endDateTime.toFormat('yyyy-MM-dd')}" style="display: none;">
    `;
    
    // Time Details for single date
    const timeDetails = document.getElementById('timeDetails');
    if (isDateRange) {
        timeDetails.style.display = 'none';
    } else if (eventData.eventDetails.startTime) {
        timeDetails.style.display = 'flex';
        const timeContent = document.querySelector('#timeDetails .detail-content');
        
        timeContent.innerHTML = `
            <h3>Time</h3>
            ${endTime ? 
                `<p>${startTime} - ${endTime} ${timeZoneAbbr}</p>` : 
                `<p>${startTime} ${timeZoneAbbr}</p>`}
            <input type="time" id="eventStartTime" value="${eventData.eventDetails.startTime}" style="display: none;">
            <input type="time" id="eventEndTime" value="${eventData.eventDetails.endTime || ''}" style="display: none;">
        `;
        } else {
            timeDetails.style.display = 'none';
        }
    } else {
        dateDetails.style.display = 'none';
    }

    // Attire Details
    const attireDetails = document.getElementById('attireDetails');
    if (eventData.eventDetails.attire) {
        attireDetails.style.display = 'flex';
        document.getElementById('eventAttire').textContent = 
            eventData.eventDetails.attire.charAt(0).toUpperCase() + 
            eventData.eventDetails.attire.slice(1);
        const attireComments = document.getElementById('eventAttireComments');
        if (eventData.eventDetails.attireComments) {
            attireComments.textContent = eventData.eventDetails.attireComments;
            attireComments.style.display = 'block';
        } else {
            attireComments.style.display = 'none';
        }
    } else {
        attireDetails.style.display = 'none';
    }

    // Food Details
    const foodDetails = document.getElementById('foodDetails');
    if (eventData.eventDetails.food) {
        foodDetails.style.display = 'flex';
        document.getElementById('eventFood').textContent = eventData.eventDetails.food;
    } else {
        foodDetails.style.display = 'none';
    }

    // Additional Comments
    const additionalDetails = document.getElementById('additionalDetails');
    if (eventData.eventDetails.additionalComments) {
        additionalDetails.style.display = 'flex';
        document.getElementById('eventAdditionalComments').textContent = 
            eventData.eventDetails.additionalComments;
    } else {
        additionalDetails.style.display = 'none';
    }
}

// Add this new function
function updateEventDetailsWithTimezone(timezone) {
    if (!eventData || !eventData.eventDetails) return;

    const dateDetails = document.getElementById('dateDetails');
    if (!dateDetails || !eventData.eventDetails.startDate) return;

    const dateContent = document.querySelector('#dateDetails .detail-content');
    const timeZoneAbbr = luxon.DateTime.now().setZone(timezone).toFormat('ZZZZ');
    
    const isDateRange = eventData.eventDetails.endDate && 
        eventData.eventDetails.endDate !== eventData.eventDetails.startDate;

    // Format start date and time in new timezone
    const startDate = luxon.DateTime.fromISO(eventData.eventDetails.startDate)
        .setZone(timezone)
        .toFormat('EEEE, MMMM d, yyyy');
    
    const startTime = eventData.eventDetails.startTime ? 
        luxon.DateTime.fromISO(`${eventData.eventDetails.startDate}T${eventData.eventDetails.startTime}`)
            .setZone(timezone)
            .toFormat('h:mm a') : 
        null;

    // Format end date and time if it's a range
    const endDate = isDateRange ? 
        luxon.DateTime.fromISO(eventData.eventDetails.endDate)
            .setZone(timezone)
            .toFormat('EEEE, MMMM d, yyyy') : 
        null;
    
    const endTime = eventData.eventDetails.endTime ? 
        luxon.DateTime.fromISO(`${eventData.eventDetails.endDate || eventData.eventDetails.startDate}T${eventData.eventDetails.endTime}`)
            .setZone(timezone)
            .toFormat('h:mm a') : 
        null;

}

// Initialize the packing section
async function initializePacking() {
    if (!eventData.includePacking) {
        document.getElementById('packingCard').style.display = 'none';
        return;
    }

    document.getElementById('packingCard').style.display = 'block';
    await loadPacking();
}

// Load packing items from database
async function loadPacking() {
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    const userId = urlParams.get('user');

    const packingRef = ref(database, `users/${userId}/events/${eventId}/packing`);
    const snapshot = await get(packingRef);
    const packing = snapshot.val() || {};

    renderPacking(packing);
}

// Render packing items
function getPackingIcon(category) {
    switch (category.toLowerCase()) {
        case 'clothing':
            return '👕'; // Gender-neutral icon for clothing (shirt)
        case 'essentials':
            return '🧳'; // Example icon for essentials
        case 'sports gear':
            return '🎾'; // Example icon for sports gear
        case 'equipment':
            return '💻'; // Example icon for equipment
        case 'documents':
            return '📄'; // Example icon for documents
        case 'food':
            return '🍎'; // Example icon for food
        case 'other':
            return '📦'; // Example icon for other
        default:
            return '📦'; // Default icon
    }
}

function renderPacking(packing) {
    const packingList = document.getElementById('packingList');
    
    const sortedPacking = Object.entries(packing).sort((a, b) => {
        return a[1].category.localeCompare(b[1].category);
    });
    
    packingList.innerHTML = sortedPacking.map(([id, item]) => `
        <div class="packing-card">
            <div class="packing-header">
                <div class="packing-icon">${getPackingIcon(item.category)}</div>
                <div class="packing-category">${item.category}</div>
                <div class="packing-actions">
                    <button onclick="editPacking('${id}')" class="action-button edit">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                        </svg>
                    </button>
                    <button onclick="deletePacking('${id}')" class="action-button delete">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="packing-title">${item.item}</div>
            ${item.description ? `<div class="packing-description">${item.description}</div>` : ''}
            ${item.quantity !== undefined ? `<div class="packing-quantity">Suggested Quantity: ${item.quantity}</div>` : ''}
            <div class="packing-creator">Suggested by ${item.suggestedBy}</div>
        </div>
    `).join('');
}

function showPackingModal(editing = false) {
    const modal = document.getElementById('packingModal');
    const modalTitle = document.getElementById('packingModalTitle');
    modalTitle.textContent = editing ? 'Edit Packing Item' : 'Add Packing Item';
    modal.style.display = 'flex';
}

window.closePackingModal = function() {
    const modal = document.getElementById('packingModal');
    const form = document.getElementById('packingForm');
    modal.style.display = 'none';
    form.reset();
    currentEditingPacking = null;
};

async function handlePackingSubmit(e) {
    e.preventDefault();
    
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    const userId = urlParams.get('user');
    
    const packingItem = {
        item: document.getElementById('packingItem').value,
        description: document.getElementById('packingDescription').value || null,
        category: document.getElementById('packingCategory').value,
        quantity: document.getElementById('packingQuantity').value || 1, // Default to 0 if empty
        suggestedBy: selectedFullName,
        createdAt: new Date().toISOString()
    };

    try {
        const packingRef = ref(database, `users/${userId}/events/${eventId}/packing`);
        if (currentEditingPacking) {
            await update(ref(database, `users/${userId}/events/${eventId}/packing/${currentEditingPacking}`), packingItem);
        } else {
            const newPackingRef = push(packingRef);
            await set(newPackingRef, packingItem);
        }
        
        closePackingModal();
        await loadPacking();
    } catch (error) {
        console.error('Error saving packing item:', error);
        alert('Error saving packing item');
    }
}

window.editPacking = async function(packingId) {
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    const userId = urlParams.get('user');

    const packingRef = ref(database, `users/${userId}/events/${eventId}/packing/${packingId}`);
    const snapshot = await get(packingRef);
    const packing = snapshot.val();

    if (packing) {
        document.getElementById('packingItem').value = packing.item;
        document.getElementById('packingDescription').value = packing.description || '';
        document.getElementById('packingCategory').value = packing.category;
        
        currentEditingPacking = packingId;
        showPackingModal(true);
    }
}

window.deletePacking = async function(packingId) {
    if (!confirm('Are you sure you want to delete this packing item?')) return;

    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    const userId = urlParams.get('user');

    try {
        await remove(ref(database, `users/${userId}/events/${eventId}/packing/${packingId}`));
        await loadPacking();
    } catch (error) {
        console.error('Error deleting packing item:', error);
        alert('Error deleting packing item');
    }
}

async function initializeAssignments() {
    if (!eventData.includeAssignments) {
        document.getElementById('assignmentsCard').style.display = 'none';
        return;
    }

    document.getElementById('assignmentsCard').style.display = 'block';
    await loadAssignments();
}

async function loadAssignments() {
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    const userId = urlParams.get('user');

    const assignmentsRef = ref(database, `users/${userId}/events/${eventId}/assignments`);
    const snapshot = await get(assignmentsRef);
    const assignments = snapshot.val() || {};

    renderAssignments(assignments);
}

function getTaskTypeIcon(taskType) {
    switch (taskType.toLowerCase()) {
        case 'to do':
            return '✅'; // Example icon for "to do"
        case 'to bring':
            return '🧺'; // Example icon for "to bring"
        default:
            return '✅'; // Default icon
    }
}
function renderAssignments(assignments) {
    const assignmentsList = document.getElementById('assignmentsList');
    
    const sortedAssignments = sortAssignments(assignments);

    assignmentsList.innerHTML = sortedAssignments.map(([id, assignment]) => {
        const formattedDueDate = assignment.dueDate ? formatDateForDisplay(assignment.dueDate) : '';
        let dueDateClass = '';

        if (assignment.dueDate) {
            const dueDate = new Date(assignment.dueDate);
            const now = new Date();
            const oneWeekFromNow = new Date();
            oneWeekFromNow.setDate(now.getDate() + 7);

            if (dueDate < now) {
                dueDateClass = 'past-due';
            } else if (dueDate < oneWeekFromNow) {
                dueDateClass = 'due-soon';
            }
        }

        const taskTypeIcon = getTaskTypeIcon(assignment.taskType); // Use the new function

        const priorityClass = assignment.priority.toLowerCase() === 'high' ? 'high-priority' : '';
        const statusClass = assignment.status.toLowerCase() === 'completed' ? 'completed-status' : '';

        // If the status is completed, override the due date class to be green
        if (assignment.status.toLowerCase() === 'completed') {
            dueDateClass = 'completed-status';
        }

        return `
            <div class="assignment-card ${assignment.priority.toLowerCase()}-priority">
                <div class="assignment-header">
                    <div class="priority ${priorityClass}">
                       ${assignment.priority} Priority
                    </div>
                    <div class="assignment-title">${assignment.task}</div>
                    <div class="assignment-actions">
                        <button onclick="editAssignment('${id}')" class="action-button edit">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                            </svg>
                        </button>
                        <button onclick="deleteAssignment('${id}')" class="action-button delete">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </button>
                    </div>
                </div>
                <div class="assignment-details">
                    <div class="task-type ${assignment.taskType.toLowerCase()}">
                        Type: ${taskTypeIcon} ${assignment.taskType}
                    </div>
                    <div>Assigned to: ${assignment.assignedTo}</div>
                    <div class="due-status-row">
                        ${formattedDueDate ? `<div class="due-date ${dueDateClass}">Due: ${formattedDueDate}</div>` : ''}
                        <div class="status ${statusClass}">Status: ${assignment.status}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}
window.editAssignment = async function(assignmentId) {
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    const userId = urlParams.get('user');

    const assignmentRef = ref(database, `users/${userId}/events/${eventId}/assignments/${assignmentId}`);
    const snapshot = await get(assignmentRef);
    const assignment = snapshot.val();

    if (assignment) {
        document.getElementById('assignmentTask').value = assignment.task;
        document.getElementById('taskType').value = assignment.taskType;
        document.getElementById('priority').value = assignment.priority;
        document.getElementById('dueDate').value = assignment.dueDate || '';
        document.getElementById('assignmentStatus').value = assignment.status || 'Assigned'; // Populate status field

        // Set the current owner in the dropdown
        const assignedToDropdown = document.getElementById('assignedTo');
        assignedToDropdown.value = assignment.assignedTo;

        currentEditingAssignment = assignmentId;
        showAssignmentModal(true);
    }
}


window.deleteAssignment = async function(assignmentId) {
    if (!confirm('Are you sure you want to delete this assignment?')) return;

    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    const userId = urlParams.get('user');

    try {
        await remove(ref(database, `users/${userId}/events/${eventId}/assignments/${assignmentId}`));
        await loadAssignments();
    } catch (error) {
        console.error('Error deleting assignment:', error);
        alert('Error deleting assignment');
    }
}

window.closeAssignmentModal = function() {
    const modal = document.getElementById('assignmentModal');
    const form = document.getElementById('assignmentForm');
    modal.style.display = 'none';
    form.reset();
    currentEditingAssignment = null;
};

async function handleAssignmentSubmit(e) {
    e.preventDefault();
    
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    const userId = urlParams.get('user');
    
    const assignment = {
        task: document.getElementById('assignmentTask').value,
        taskType: document.getElementById('taskType').value,
        assignedTo: document.getElementById('assignedTo').value,
        priority: document.getElementById('priority').value,
        dueDate: document.getElementById('dueDate').value || null,
        status: document.getElementById('assignmentStatus').value,
        createdAt: new Date().toISOString()
    };

    try {
        const assignmentsRef = ref(database, `users/${userId}/events/${eventId}/assignments`);
        if (currentEditingAssignment) {
            await update(ref(database, `users/${userId}/events/${eventId}/assignments/${currentEditingAssignment}`), assignment);
        } else {
            const newAssignmentRef = push(assignmentsRef);
            await set(newAssignmentRef, assignment);
        }
        
        closeAssignmentModal();
        await loadAssignments();
    } catch (error) {
        console.error('Error saving assignment:', error);
        alert('Error saving assignment');
    }
}

window.editAssignment = async function(assignmentId) {
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    const userId = urlParams.get('user');

    const assignmentRef = ref(database, `users/${userId}/events/${eventId}/assignments/${assignmentId}`);
    const snapshot = await get(assignmentRef);
    const assignment = snapshot.val();

    if (assignment) {
        document.getElementById('assignmentTask').value = assignment.task;
        document.getElementById('taskType').value = assignment.taskType;
        document.getElementById('assignedTo').value = assignment.assignedTo;
        document.getElementById('priority').value = assignment.priority;
        document.getElementById('dueDate').value = assignment.dueDate || '';
        document.getElementById('assignmentStatus').value = assignment.status || 'assigned'; // Populate status field
        
        currentEditingAssignment = assignmentId;
        showAssignmentModal(true);
    }
}

window.deleteAssignment = async function(assignmentId) {
    if (!confirm('Are you sure you want to delete this assignment?')) return;

    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    const userId = urlParams.get('user');

    try {
        await remove(ref(database, `users/${userId}/events/${eventId}/assignments/${assignmentId}`));
        await loadAssignments();
    } catch (error) {
        console.error('Error deleting assignment:', error);
        alert('Error deleting assignment');
    }
}

function sortAssignments(assignments) {
    return Object.entries(assignments).sort((a, b) => {
        const statusOrder = { 'assigned': 1, 'in progress': 2, 'completed': 3 };
        const statusA = statusOrder[a[1].status.toLowerCase()] || 4;
        const statusB = statusOrder[b[1].status.toLowerCase()] || 4;

        if (statusA !== statusB) {
            return statusA - statusB;
        }

        const dateA = a[1].dueDate || '9999-99-99';
        const dateB = b[1].dueDate || '9999-99-99';

        return dateA.localeCompare(dateB);
    });
}
function formatAssignmentDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

// Add section visibility toggle functions
function togglePackingSection(show) {
    const packingCard = document.getElementById('packingCard');
    packingCard.style.display = show ? 'block' : 'none';
}

function toggleAssignmentSection(show) {
    const assignmentCard = document.getElementById('assignmentsCard');
    assignmentCard.style.display = show ? 'block' : 'none';
}

// Setup event listeners function
function setupEventListeners() {
    // Activity listeners
    document.getElementById('addActivityBtn')?.addEventListener('click', () => showActivityModal(false));
    document.getElementById('activityForm')?.addEventListener('submit', handleActivitySubmit);
    document.querySelector('.modal .secondary-button')?.addEventListener('click', closeActivityModal);
    document.getElementById('addActivityBtnBottom')?.addEventListener('click', () => showActivityModal(false));
    // Packing listeners
    document.getElementById('addPackingBtn')?.addEventListener('click', () => showPackingModal(false));
    document.getElementById('packingForm')?.addEventListener('submit', handlePackingSubmit);
    document.querySelector('#packingModal .secondary-button')?.addEventListener('click', closePackingModal);

    // Assignment listeners
    document.getElementById('addAssignmentBtn')?.addEventListener('click', () => showAssignmentModal(false));
    document.getElementById('assignmentForm')?.addEventListener('submit', handleAssignmentSubmit);
    document.querySelector('#assignmentModal .secondary-button')?.addEventListener('click', closeAssignmentModal);

    // Show/hide past activities
    document.getElementById('hidePriorBtn').addEventListener('click', togglePastActivities);
   
}

// Add this function to save RSVP status
async function saveRsvpStatus() {
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    const userId = urlParams.get('user');
    const rsvpStatus = document.getElementById('rsvpStatus').value;

    try {
        const rsvpRef = ref(database, `users/${userId}/events/${eventId}/rsvps/${selectedFullName}`);
        await set(rsvpRef, { status: rsvpStatus });
        console.log('RSVP status saved:', rsvpStatus); // Debug log
    } catch (error) {
        console.error('Error saving RSVP status:', error);
        alert('Error saving RSVP status');
    }
}

// Add event listener to RSVP field
document.addEventListener('DOMContentLoaded', () => {
    const rsvpField = document.getElementById('rsvpStatus');
    if (rsvpField) {
        rsvpField.addEventListener('change', saveRsvpStatus);
    }
});

function toggleSection(sectionId, buttonId) {
    const section = document.getElementById(sectionId);
    const button = document.getElementById(buttonId);
    const parentCard = section.closest('.activities-card, .assignment-card, .packing-card');
    
    if (section.style.display === 'none') {
        section.style.display = 'block';
        button.textContent = 'Collapse Section';
        if (parentCard) {
            parentCard.classList.remove('collapsed');
        }
    } else {
        section.style.display = 'none';
        button.textContent = 'Expand Section';
        if (parentCard) {
            parentCard.classList.add('collapsed');
        }
    }
}

document.getElementById('toggleActivitiesBtn').addEventListener('click', () => toggleSection('activitiesList', 'toggleActivitiesBtn'));
document.getElementById('toggleAssignmentsBtn').addEventListener('click', () => toggleSection('assignmentsList', 'toggleAssignmentsBtn'));
document.getElementById('togglePackingBtn').addEventListener('click', () => toggleSection('packingList', 'togglePackingBtn'));
function updateCalendarButton(eventData, timezone) {
    console.log('Updating calendar button:', eventData, timezone); // Debug
    const calendarContainer = document.getElementById('addToCalendarContainer');
    if (!calendarContainer) {
        console.error('Calendar container not found');
        return;
    }

    if (!eventData.eventDetails || !eventData.eventDetails.startDate) {
        console.error('Event details or start date missing');
        return;
    }

    const startDateTime = luxon.DateTime.fromISO(
        `${eventData.eventDetails.startDate}T${eventData.eventDetails.startTime || '00:00'}`
    ).setZone(timezone);
    
    const endDateTime = luxon.DateTime.fromISO(
        `${eventData.eventDetails.endDate || eventData.eventDetails.startDate}T${eventData.eventDetails.endTime || eventData.eventDetails.startTime || '00:00'}`
    ).setZone(timezone);

    calendarContainer.innerHTML = `
        <add-to-calendar-button
            name="${eventData.title || ''}"
            description="${eventData.description || ''}"
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

function togglePastActivities() {
    const button = document.getElementById('hidePriorBtn');
    showingPastActivities = !showingPastActivities;
    button.textContent = showingPastActivities ? 'Hide Prior' : 'Show All';
    renderActivities(currentEventData.activities);
}