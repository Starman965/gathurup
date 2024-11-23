// app_enhanced.js
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { 
    getDatabase,
    ref, 
    set,
    push,
    get,
    onValue,
    remove
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-database.js";
import { 
    getAuth, 
    signInWithPopup, 
    GoogleAuthProvider, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut,
    updateProfile,
    updateEmail,
    deleteUser,
    reauthenticateWithCredential,
    EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import { 
    getStorage, 
    ref as storageRef,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-storage.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);
const storage = getStorage(app);

// Global State
let currentUser = null;
let editingEventId = null;
let currentEditingTribeId = null;
let selectedDates = [];
let lastSelectedDate = null;
let selectedImages = {
    header: null,
    locations: {}
};

// Event Type Management
let currentEventType = 'standard';
const eventTypes = {
    standard: {
        sections: ['dates'],
        template: 'standardEventForm'
    },
    special: {
        sections: ['dates', 'budget', 'location', 'activities', 'packing'],
        template: 'specialEventForm'
    }
};

// Firebase Reference Helpers
function getUserRef() {
    if (!currentUser) throw new Error('No user logged in');
    return `users/${currentUser.uid}`;
}

async function uploadEventImage(file, path) {
    const fileRef = storageRef(storage, `${getUserRef()}/events/${path}`);
    await uploadBytes(fileRef, file);
    return getDownloadURL(fileRef);
}

// Event Type Switching
function initializeEventTypeSwitcher() {
    document.querySelectorAll('.event-type-btn').forEach(btn => {
        btn.addEventListener('click', () => switchEventType(btn.dataset.type));
    });
}

function switchEventType(type) {
    currentEventType = type;
    // Update UI
    document.querySelectorAll('.event-type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
    
    // Show/hide appropriate form
    document.getElementById('eventForm').style.display = type === 'standard' ? 'block' : 'none';
    document.getElementById('specialEventForm').style.display = type === 'special' ? 'block' : 'none';
    
    // Reset forms
    resetEventForms();
}

function resetEventForms() {
    document.getElementById('eventForm').reset();
    document.getElementById('specialEventForm').reset();
    selectedDates = [];
    selectedImages = {
        header: null,
        locations: {}
    };
    renderDates();
    // Reset all image previews
    document.querySelectorAll('.image-preview').forEach(preview => {
        preview.style.display = 'none';
        preview.src = '';
    });
}

// Enhanced Event Creation
async function createEvent(e) {
    e.preventDefault();
    if (!currentUser) {
        alert('Please login first');
        return;
    }

    const eventData = await buildEventData();
    
    try {
        let eventRef;
        if (editingEventId) {
            eventRef = ref(database, `${getUserRef()}/events/${editingEventId}`);
            const existingEvent = (await get(eventRef)).val();
            eventData.created = existingEvent.created;
            eventData.participants = existingEvent.participants || {};
            
            await set(eventRef, eventData);
        } else {
            eventRef = push(ref(database, `${getUserRef()}/events`));
            await set(eventRef, {
                ...eventData,
                created: new Date().toISOString(),
                participants: {}
            });
        }
        
        handleEventCreationSuccess(eventRef.key);
    } catch (error) {
        console.error("Error managing event:", error);
        alert("Error saving event. Please try again.");
    }
}

async function buildEventData() {
    const isSpecialEvent = currentEventType === 'special';
    const formId = isSpecialEvent ? 'specialEventForm' : 'eventForm';
    const form = document.getElementById(formId);
    
    const baseData = {
        title: form.querySelector('#eventTitle').value,
        description: form.querySelector('#eventDescription').value,
        type: currentEventType,
        userId: currentUser.uid,
        tribeId: form.querySelector('#tribeSelect').value
    };

    if (isSpecialEvent) {
        // Add special event specific data
        const specialData = {
            headerImage: selectedImages.header ? await uploadEventImage(selectedImages.header, `${Date.now()}_header`) : null,
            enabledSections: getEnabledSections(),
            dates: selectedDates,
            budget: getBudgetOptions(),
            locations: await getLocationData(),
            activities: getActivityData(),
            packing: getPackingCategories()
        };
        return { ...baseData, ...specialData };
    }

    // Standard event data
    return {
        ...baseData,
        dates: selectedDates
    };
}

function getEnabledSections() {
    const enabled = {};
    document.querySelectorAll('.section-toggle input[type="checkbox"]').forEach(toggle => {
        enabled[toggle.name.replace('enable', '').toLowerCase()] = toggle.checked;
    });
    return enabled;
}

function getBudgetOptions() {
    const budgetItems = [];
    document.querySelectorAll('#budgetItems .budget-item').forEach(item => {
        budgetItems.push({
            range: item.querySelector('input[placeholder="Amount range"]').value,
            description: item.querySelector('input[placeholder="Description"]').value
        });
    });
    return budgetItems;
}

async function getLocationData() {
    const locations = [];
    const locationItems = document.querySelectorAll('.location-item');
    
    for (const item of locationItems) {
        const imageInput = item.querySelector('input[type="file"]');
        let imageUrl = null;
        
        if (imageInput.files[0]) {
            imageUrl = await uploadEventImage(imageInput.files[0], `locations/${Date.now()}_${imageInput.files[0].name}`);
        }
        
        locations.push({
            name: item.querySelector('input[placeholder="Location Name"]').value,
            description: item.querySelector('textarea').value,
            imageUrl: imageUrl
        });
    }
    
    return locations;
}

function getActivityData() {
    const activities = [];
    document.querySelectorAll('#activityItems .activity-item').forEach(item => {
        activities.push({
            title: item.querySelector('.activity-title').textContent,
            description: item.querySelector('.activity-description').textContent,
            duration: item.querySelector('span[data-duration]').dataset.duration,
            cost: item.querySelector('span[data-cost]').dataset.cost
        });
    });
    return activities;
}

function getPackingCategories() {
    const categories = [];
    document.querySelectorAll('#packingCategories .form-group').forEach(category => {
        categories.push({
            name: category.querySelector('input').value,
            suggestions: category.querySelector('textarea').value.split('\n').filter(item => item.trim())
        });
    });
    return categories;
}

// Event Load and Display
function loadEvents() {
    if (!currentUser) return;
    
    const eventsRef = ref(database, `${getUserRef()}/events`);
    onValue(eventsRef, async (snapshot) => {
        const events = snapshot.val() || {};
        const tribesRef = ref(database, `${getUserRef()}/tribes`);
        const tribesSnap = await get(tribesRef);
        const tribes = tribesSnap.val() || {};
        
        renderEventsList(events, tribes);
    });
}

function renderEventsList(events, tribes) {
    const eventsList = document.getElementById('eventsList');
    if (!eventsList) return;

    const eventsHtml = Object.entries(events).map(([eventId, event]) => {
        const tribe = tribes[event.tribeId] || { name: 'Unknown Group' };
        const isSpecialEvent = event.type === 'special';
        
        return `
            <div class="event-row" onclick="showEventDetail('${eventId}')">
                <div class="event-info">
                    <div class="event-icon">
                        ${isSpecialEvent ? getSpecialEventIcon() : getStandardEventIcon()}
                    </div>
                    <div class="event-name">
                        ${event.title}
                        ${isSpecialEvent ? '<span class="event-badge">Special</span>' : ''}
                    </div>
                </div>
                <div class="group-info">
                    <svg class="group-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    ${tribe.name}
                </div>
                <div class="event-actions">
                    <button class="action-button edit" onclick="editEvent('${eventId}', event)">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                        </svg>
                    </button>
                    <button class="action-button delete" onclick="deleteEvent('${eventId}', event)">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    eventsList.innerHTML = eventsHtml;
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    // Initialize event type switcher
    initializeEventTypeSwitcher();
    
    // Add form submission handlers
    document.getElementById('eventForm')?.addEventListener('submit', createEvent);
    document.getElementById('specialEventForm')?.addEventListener('submit', createEvent);
    
    // Initialize image upload handlers
    initializeImageUploads();
    
    // Initialize section toggles
    initializeSectionToggles();
    
    // Your existing initialization code...
});

// Helper Functions
function getSpecialEventIcon() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
    </svg>`;
}

function getStandardEventIcon() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>`;
}

// Add image upload handlers
function initializeImageUploads() {
    // Header image
    document.getElementById('headerImage')?.addEventListener('change', handleImageUpload);
    
    // Location images
    document.querySelectorAll('.location-image-upload input[type="file"]')
        .forEach(input => input.addEventListener('change', handleImageUpload));
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const preview = event.target.parentElement.querySelector('.image-preview');
        preview.src = e.target.result;
        preview.style.display = 'block';

        // Store the file for later upload
        if (event.target.id === 'headerImage') {
            selectedImages.header = file;
        } else {
            selectedImages.locations[event.target.id] = file;
        }
    };
    reader.readAsDataURL(file);
}

// Initialize section toggles
function initializeSectionToggles() {
    document.querySelectorAll('.section-toggle input[type="checkbox"]').forEach(toggle => {
        toggle.addEventListener('change', function() {
            const sectionId = this.name.replace('enable', '').toLowerCase() + 'Section';
            const section = document.getElementById(sectionId);
            if (section) {
                section.style.display = this.checked ? 'block' : 'none';
            }
        });
    });
}

// Export necessary functions for HTML access
window.createEvent = createEvent;
window.editEvent = editEvent;
window.deleteEvent = deleteEvent;
window.switchEventType = switchEventType;
